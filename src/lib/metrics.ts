// src/lib/metrics.ts
// Deterministic semantic graph inference + metric computation.
//
// NO AI, NO network. inferSheetGraph() is the heuristic fallback that mirrors
// what the LLM classifier is expected to produce; computeMetrics() does ALL the
// arithmetic in pure JS (the model never sums). See AGENTS.md "Pipeline
// invariants".

import type { SheetSummary } from "@/lib/parser";
import type {
  ColumnMapping,
  ColumnRole,
  Metric,
  MetricsResult,
  ReportType,
  SeriesPoint,
  SheetGraph,
} from "@/types/metrics";

// ─── calendar order (Apr → Mar fiscal) ──────────────────────────────────────────

const MONTH_ORDER = [
  "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec", "jan", "feb", "mar",
];

function monthIndex(label: string): number {
  const m = label.toLowerCase().slice(0, 3);
  return MONTH_ORDER.indexOf(m);
}

/** Pull a month token out of a sheet key, e.g. "...- APRIL 25" → "APRIL". */
function monthFromSheetKey(sheetKey: string): string | null {
  const tail = sheetKey.split(" - ").slice(1).join(" - ");
  const m = tail.match(
    /\b(january|february|march|april|may|june|july|august|september|october|november|december)\b/i
  );
  return m ? m[1].toUpperCase() : null;
}

// ─── report-type detection ──────────────────────────────────────────────────────

function detectReportType(summary: SheetSummary): ReportType {
  const fileName = summary.name.split(" - ")[0].toLowerCase();
  const names = summary.columns.map((c) => c.name.toLowerCase());
  const has = (re: RegExp) => names.some((n) => re.test(n));

  if (fileName.startsWith("assembly")) return "assembly";
  if (fileName.startsWith("balloon")) return "balloon_valve";
  if (fileName.startsWith("visual")) return "visual";
  if (fileName.startsWith("shopfloor")) return "shopfloor";
  if (fileName.startsWith("commulative") || fileName.startsWith("cumulative")) return "cumulative";
  if (fileName.startsWith("yearly")) return "yearly_production";

  // Header-signature fallback (synthetic / unknown-named files).
  if (has(/eye punching/) || (has(/visual.*qty/) && has(/balloon.*qty/))) return "assembly";
  if (has(/struck balloon/) || has(/balloom brust/)) return "balloon_valve";
  if (has(/no of trolley/) || (has(/^coag$/) && has(/raised wire/))) return "shopfloor";
  if (has(/production qty/) && has(/dispatch qty/)) return "yearly_production";
  if (has(/^coag$/) && has(/^sd$/)) return "visual";
  if (has(/rec\.?\s*qty/) && has(/reason for rejection/)) return "visual";
  return "unknown";
}

function detectIsSummary(summary: SheetSummary, reportType: ReportType): boolean {
  if (reportType === "cumulative" || reportType === "yearly_production") return true;
  const sheetTail = summary.name.split(" - ").slice(1).join(" - ");
  if (/yearly|cumul|commulative|summary|formate|format/i.test(sheetTail)) return true;
  if (summary.rowCount <= 3) return true;
  return false;
}

// ─── column-name classifiers ─────────────────────────────────────────────────────

const PERCENT_RE = /%/;
const DERIVED_RE = /^total\b|^total$|final (checked|rej)|final$|total rej|^final\b/i;

// Known reason tokens across shopfloor / balloon / visual matrices.
const REASON_TOKENS = new Set(
  [
    // shopfloor
    "coag", "raised wire", "surface defect", "overlaping", "black mark", "webbing",
    "missing formers", "missing former", "missing formers ", "others",
    // balloon
    "struck balloon", "balloom brust", "leakage", "90/10", "bubble", "thin spod",
    // visual matrix codes
    "sd", "tt", "bl", "ps", "sb", "pw", "fp", "rw", "bep", "dec", "bm", "web",
    "bt", "sf", "bic", "wk", "bmp", "tf", "ph", "bst", "pl",
  ].map((s) => s.trim().toLowerCase())
);

/** Strip a trailing " (2)"/" (3)" disambiguation suffix added by the parser. */
function baseName(name: string): string {
  return name.replace(/\s*\(\d+\)\s*$/, "").trim();
}

function isPercentCol(name: string): boolean {
  return PERCENT_RE.test(name);
}
function isDerivedCol(name: string): boolean {
  return DERIVED_RE.test(baseName(name));
}
function isReasonToken(name: string): boolean {
  return REASON_TOKENS.has(baseName(name).toLowerCase());
}

// Stage-checked openers. Order matters: VALVE before VISUAL because "VALVE INT
// CHKD QTY" contains neither, but we match on specific prefixes.
function stageNameFromChecked(name: string): string | null {
  const b = baseName(name).toLowerCase();
  if (/^eye punching qty/.test(b)) return "eye-punching";
  if (/^visual\s*qty/.test(b)) return "visual";
  if (/^valve int(y)?\s*chkd/.test(b) || /^valve int\s*chkd/.test(b)) return "valve-integrity";
  if (/^balloon chkd qty/.test(b)) return "balloon";
  if (/^rec\.?\s*qty/.test(b)) return "overall";
  return null;
}

const ACCEPT_RE = /\b(acpt|accept)\b|acpt$|accept$/i;
const REJ_QTY_RE = /\brej\b.*\bqty\b|rej\.?\s*qty|qty.*rej/i;
const HOLD_QTY_RE = /\bhold\b.*\bqty\b|hold\s*qty/i;

// ─── the inferrer ────────────────────────────────────────────────────────────────

export function inferSheetGraph(summary: SheetSummary): SheetGraph {
  const reportType = detectReportType(summary);
  const isSummary = detectIsSummary(summary, reportType);

  const mappings: ColumnMapping[] = [];
  const stageOrder: string[] = [];
  let currentStage: string | null = null; // open stage for trailing accept/rej/hold

  // For balloon, CHECKED QTY columns open generic stages.
  let balloonStageCounter = 0;

  // Once a TOTAL/FINAL aggregate column appears (assembly), every subsequent
  // numeric column is part of the trailing summary block (e.g. VISUAL CHECKED
  // QTY / VISUAL REJ QTY) — those are roll-ups, not raw stage data, so they
  // must be derived_total and excluded from sums. Percentages still → ignore.
  let sawDerived = false;

  for (const c of summary.columns) {
    const name = c.name;
    const lower = name.toLowerCase();

    // 1. date
    if (c.type === "date") {
      mappings.push({ column: name, role: "date", stage: null });
      continue;
    }

    // 2. percentages → ignore (never sum a percentage)
    if (isPercentCol(name)) {
      mappings.push({ column: name, role: "ignore", stage: null });
      continue;
    }

    // 3. string dimensions
    if (c.type === "string") {
      if (c.uniqueCount >= 2 && c.uniqueCount <= 50) {
        mappings.push({ column: name, role: "dimension", stage: null });
      } else {
        mappings.push({ column: name, role: "ignore", stage: null });
      }
      continue;
    }

    if (c.type !== "number") {
      mappings.push({ column: name, role: "ignore", stage: null });
      continue;
    }

    // 4. derived totals (TOTAL / FINAL aggregates)
    //    Exception: shopfloor "Total" is the per-row reason sum → derived_total too.
    if (isDerivedCol(name)) {
      sawDerived = true;
      mappings.push({ column: name, role: "derived_total", stage: null });
      continue;
    }

    // 4b. trailing summary block: any numeric column AFTER a TOTAL/FINAL column
    //     (assembly's VISUAL CHECKED QTY / VISUAL REJ QTY block). Reason matrices
    //     (shopfloor/visual/balloon) have no TOTAL/FINAL stage block before their
    //     reasons, so this latch never fires for them.
    if (sawDerived && reportType === "assembly") {
      mappings.push({ column: name, role: "derived_total", stage: null });
      continue;
    }

    // 5. stage opener (checked)
    const openedStage = stageNameFromChecked(name);
    if (openedStage) {
      let stageName = openedStage;
      if (reportType === "balloon_valve") {
        balloonStageCounter += 1;
        stageName = balloonStageCounter === 1 ? "balloon" : "valve-integrity";
      }
      currentStage = stageName;
      if (!stageOrder.includes(stageName)) stageOrder.push(stageName);
      mappings.push({ column: name, role: "stage_checked", stage: stageName });
      continue;
    }

    // 6. balloon generic "CHECKED QTY" opener (no descriptive prefix)
    if (reportType === "balloon_valve" && /^checked\s*qty/.test(lower)) {
      balloonStageCounter += 1;
      const stageName = balloonStageCounter === 1 ? "balloon" : "valve-integrity";
      currentStage = stageName;
      if (!stageOrder.includes(stageName)) stageOrder.push(stageName);
      mappings.push({ column: name, role: "stage_checked", stage: stageName });
      continue;
    }

    // 7. accepted / hold / rejected belong to the currently-open stage
    if (ACCEPT_RE.test(lower)) {
      mappings.push({ column: name, role: "stage_accepted", stage: currentStage });
      continue;
    }
    if (HOLD_QTY_RE.test(lower)) {
      mappings.push({ column: name, role: "stage_hold", stage: currentStage });
      continue;
    }
    if (REJ_QTY_RE.test(lower)) {
      mappings.push({ column: name, role: "stage_rejected", stage: currentStage });
      continue;
    }

    // 8. reason counts
    //    - known reason token, OR
    //    - shopfloor: any numeric column that isn't date/trolleys/total
    if (
      isReasonToken(name) ||
      (reportType === "shopfloor" && !/trolley|total/.test(lower))
    ) {
      mappings.push({ column: name, role: "reason_count", stage: null });
      continue;
    }

    // 9. numeric dimension (e.g. No of TROLLEYS) — small unique count, not a qty
    if (/trolley/.test(lower)) {
      mappings.push({ column: name, role: "dimension", stage: null });
      continue;
    }

    // 10. fallback
    mappings.push({ column: name, role: "ignore", stage: null });
  }

  return {
    sheetKey: summary.name,
    reportType,
    isSummary,
    stageOrder,
    columns: mappings,
    notes: null,
  };
}

// ─── metric computation ──────────────────────────────────────────────────────────

function sumOf(summary: SheetSummary, column: string): number {
  const c = summary.columns.find((x) => x.name === column);
  return c && c.type === "number" && typeof c.sum === "number" ? c.sum : 0;
}

interface SheetPair {
  summary: SheetSummary;
  graph: SheetGraph;
}

/** Columns of a given role belonging to a specific stage in one sheet. */
function colsForStage(graph: SheetGraph, role: ColumnRole, stage: string): string[] {
  return graph.columns.filter((m) => m.role === role && m.stage === stage).map((m) => m.column);
}
function colsForRole(graph: SheetGraph, role: ColumnRole): string[] {
  return graph.columns.filter((m) => m.role === role).map((m) => m.column);
}

const fmtCount = (n: number) => Math.round(n).toLocaleString("en-US");
const fmtRate = (n: number) => (n * 100).toFixed(2) + "%";

export function computeMetrics(summaries: SheetSummary[], graphs: SheetGraph[]): MetricsResult {
  const graphByKey = new Map(graphs.map((g) => [g.sheetKey, g]));
  const pairs: SheetPair[] = summaries
    .map((s) => ({ summary: s, graph: graphByKey.get(s.name)! }))
    .filter((p) => p.graph && !p.graph.isSummary);

  let checkedQty = 0,
    acceptedQty = 0,
    rejectedQty = 0,
    holdQty = 0;

  const checkedCols: string[] = [];
  const acceptedCols: string[] = [];
  const rejectedCols: string[] = [];
  const holdCols: string[] = [];
  const checkedSheets = new Set<string>();
  const acceptedSheets = new Set<string>();
  const rejectedSheets = new Set<string>();
  const holdSheets = new Set<string>();

  // stage breakdown accumulators (across sheets)
  const stageAgg = new Map<string, { checked: number; rejected: number }>();
  // reason pareto accumulator
  const reasonAgg = new Map<string, number>();
  // monthly accumulators: month → {checked, rejected}
  const monthAgg = new Map<string, { checked: number; rejected: number }>();

  for (const { summary, graph } of pairs) {
    const entryStage = graph.stageOrder[0] ?? null;

    // checked / accepted: ENTRY stage only (funnel — avoid counting a unit at
    // every stage).
    let sheetChecked = 0;
    if (entryStage) {
      for (const col of colsForStage(graph, "stage_checked", entryStage)) {
        sheetChecked += sumOf(summary, col);
        checkedCols.push(col);
        checkedSheets.add(summary.name);
      }
      for (const col of colsForStage(graph, "stage_accepted", entryStage)) {
        acceptedQty += sumOf(summary, col);
        acceptedCols.push(col);
        acceptedSheets.add(summary.name);
      }
    }
    checkedQty += sheetChecked;

    // rejected: ALL stage_rejected across stages (a reject anywhere is real).
    // For reason-only sheets with no stage_rejected, use Σ reason_count.
    const rejCols = colsForRole(graph, "stage_rejected");
    let sheetRejected = 0;
    if (rejCols.length > 0) {
      for (const col of rejCols) {
        sheetRejected += sumOf(summary, col);
        rejectedCols.push(col);
        rejectedSheets.add(summary.name);
      }
    } else {
      for (const col of colsForRole(graph, "reason_count")) {
        sheetRejected += sumOf(summary, col);
        rejectedCols.push(col);
        rejectedSheets.add(summary.name);
      }
    }
    rejectedQty += sheetRejected;

    // hold: all stage_hold
    for (const col of colsForRole(graph, "stage_hold")) {
      holdQty += sumOf(summary, col);
      holdCols.push(col);
      holdSheets.add(summary.name);
    }

    // stage breakdown: per stage, that stage's checked + that stage's rejected
    for (const stage of graph.stageOrder) {
      const sChecked = colsForStage(graph, "stage_checked", stage).reduce(
        (a, col) => a + sumOf(summary, col),
        0
      );
      const sRejected = colsForStage(graph, "stage_rejected", stage).reduce(
        (a, col) => a + sumOf(summary, col),
        0
      );
      const prev = stageAgg.get(stage) ?? { checked: 0, rejected: 0 };
      stageAgg.set(stage, { checked: prev.checked + sChecked, rejected: prev.rejected + sRejected });
    }

    // reason pareto (reason_count columns only — see limitation below)
    for (const col of colsForRole(graph, "reason_count")) {
      const reason = baseNameForReason(col);
      reasonAgg.set(reason, (reasonAgg.get(reason) ?? 0) + sumOf(summary, col));
    }

    // monthly trend
    const month = monthFromSheetKey(summary.name);
    if (month) {
      const prev = monthAgg.get(month) ?? { checked: 0, rejected: 0 };
      monthAgg.set(month, {
        checked: prev.checked + sheetChecked,
        rejected: prev.rejected + sheetRejected,
      });
    }
  }

  const rejectionRate = checkedQty === 0 ? 0 : rejectedQty / checkedQty;

  const metrics: Metric[] = [
    metric("checked_qty", "Checked Qty", checkedQty, fmtCount(checkedQty), "units",
      "Σ entry-stage checked across sheets",
      [{ field: "checked", total: checkedQty }],
      [...checkedSheets], uniq(checkedCols)),
    metric("accepted_qty", "Accepted Qty", acceptedQty, fmtCount(acceptedQty), "units",
      "Σ entry-stage accepted across sheets",
      [{ field: "accepted", total: acceptedQty }],
      [...acceptedSheets], uniq(acceptedCols)),
    metric("rejected_qty", "Rejected Qty", rejectedQty, fmtCount(rejectedQty), "units",
      "Σ rejected across all stages",
      [{ field: "rejected", total: rejectedQty }],
      [...rejectedSheets], uniq(rejectedCols)),
    metric("hold_qty", "Hold Qty", holdQty, fmtCount(holdQty), "units",
      "Σ hold across all stages",
      [{ field: "hold", total: holdQty }],
      [...holdSheets], uniq(holdCols)),
    metric("rejection_rate", "Rejection Rate", rejectionRate, fmtRate(rejectionRate), null,
      "Σ rejected ÷ entry-stage checked",
      [{ field: "rejected", total: rejectedQty }, { field: "checked", total: checkedQty }],
      [...new Set([...rejectedSheets, ...checkedSheets])], uniq([...rejectedCols, ...checkedCols])),
  ];

  const stageBreakdown = [...stageAgg.entries()].map(([stage, v]) => ({
    stage,
    checked: v.checked,
    rejected: v.rejected,
    rate: v.checked === 0 ? 0 : v.rejected / v.checked,
  }));

  const reasonPareto: SeriesPoint[] = [...reasonAgg.entries()]
    .map(([label, value]) => ({ label, value }))
    .filter((p) => p.value > 0)
    .sort((a, b) => b.value - a.value);

  const monthlyTrend: SeriesPoint[] = [...monthAgg.entries()]
    .map(([label, v]) => ({ label, value: v.checked === 0 ? 0 : v.rejected / v.checked }))
    .sort((a, b) => {
      const ai = monthIndex(a.label);
      const bi = monthIndex(b.label);
      return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
    });

  return { metrics, stageBreakdown, reasonPareto, monthlyTrend };
}

// Reason label: collapse the parser's " (2)" suffix so STRUCK BALLOON and
// "OTHERS (2)" etc. accumulate under their base reason name.
function baseNameForReason(name: string): string {
  return name.replace(/\s*\(\d+\)\s*$/, "").trim();
}

function uniq(arr: string[]): string[] {
  return [...new Set(arr)];
}

function metric(
  id: string,
  label: string,
  value: number,
  display: string,
  unit: string | null,
  formula: string,
  inputs: { field: string; total: number }[],
  sourceSheets: string[],
  sourceColumns: string[]
): Metric {
  return { id, label, value, display, unit, formula, inputs, sourceSheets, sourceColumns };
}
