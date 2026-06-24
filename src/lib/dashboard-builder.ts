// src/lib/dashboard-builder.ts
// Bridges the deterministic metric layer to the view layer.
//
// The LLM produces a column-role graph (src/lib/schemas.ts SheetGraphSchema);
// computeMetrics() turns that graph into exact numbers (src/lib/metrics.ts).
// This module: (1) reconciles an LLM graph against the real columns so the math
// can never reference a hallucinated column, (2) sanity-checks LLM-derived
// metrics against the heuristic baseline, (3) builds KPIs + charts from the
// computed metrics (the model never emits a number it had to compute), and
// (4) derives a MergePlan for the Sources audit panel.

import type { SheetSummary } from "./parser";
import type { MetricsResult, SheetGraph, SeriesPoint, ParetoItem, ParetoAnalysis } from "@/types/metrics";
import type { MergePlan } from "@/types/analysis";
import type { KPI, Chart } from "@/types/dashboard";

// ── 1. graph reconciliation ──────────────────────────────────────────────────
// Drop any column the model named that doesn't exist; back-fill any real column
// the model omitted from the heuristic graph. Guarantees full, exact coverage.

export function reconcileGraph(
  llm: SheetGraph,
  summary: SheetSummary,
  fallback: SheetGraph,
): SheetGraph {
  const realCols = summary.columns.map((c) => c.name);
  const realSet = new Set(realCols);
  const fallbackByCol = new Map(fallback.columns.map((m) => [m.column, m]));

  const kept = llm.columns.filter((m) => realSet.has(m.column));
  const keptSet = new Set(kept.map((m) => m.column));

  for (const name of realCols) {
    if (!keptSet.has(name)) {
      kept.push(fallbackByCol.get(name) ?? { column: name, role: "ignore", stage: null });
    }
  }

  // Derive stageOrder from the kept stage_checked columns so it can't reference
  // a stage that no longer has any data. Fall back to the heuristic order.
  const stageOrder: string[] = [];
  for (const m of kept) {
    if (m.role === "stage_checked" && m.stage && !stageOrder.includes(m.stage)) {
      stageOrder.push(m.stage);
    }
  }

  return {
    sheetKey: summary.name,
    reportType: llm.reportType ?? fallback.reportType,
    isSummary: typeof llm.isSummary === "boolean" ? llm.isSummary : fallback.isSummary,
    stageOrder: stageOrder.length > 0 ? stageOrder : fallback.stageOrder,
    columns: kept,
    notes: llm.notes ?? null,
  };
}

// ── 2. sanity gate ───────────────────────────────────────────────────────────
// Accept LLM-derived metrics only if they don't diverge wildly from the
// heuristic baseline. Guards against the model corrupting the headline numbers.

function metricValue(result: MetricsResult, id: string): number {
  return result.metrics.find((m) => m.id === id)?.value ?? 0;
}

export function metricsSane(candidate: MetricsResult, baseline: MetricsResult): boolean {
  const rate = metricValue(candidate, "rejection_rate");
  if (!Number.isFinite(rate) || rate < 0 || rate > 1) return false;

  const checked = metricValue(candidate, "checked_qty");
  const rejected = metricValue(candidate, "rejected_qty");
  if (checked < 0 || rejected < 0) return false;

  const baseChecked = metricValue(baseline, "checked_qty");
  if (baseChecked > 0 && (checked < baseChecked * 0.5 || checked > baseChecked * 1.5)) {
    return false;
  }
  const baseRejected = metricValue(baseline, "rejected_qty");
  if (baseRejected > 0 && (rejected < baseRejected * 0.5 || rejected > baseRejected * 1.5)) {
    return false;
  }
  return true;
}

// ── 3. metrics → KPIs ────────────────────────────────────────────────────────

// rejection_rate leads; quantity metrics follow. Drop zero-valued accepted/hold
// to avoid empty cards, but always keep checked/rejected/rate.
const KPI_ORDER = ["rejection_rate", "rejected_qty", "checked_qty", "accepted_qty", "hold_qty"];
const ALWAYS_SHOW = new Set(["rejection_rate", "rejected_qty", "checked_qty"]);

export function metricsToKpis(result: MetricsResult): KPI[] {
  const byId = new Map(result.metrics.map((m) => [m.id, m]));

  // Trend on the rate: compare last vs first month. A falling rate is good (1).
  let rateTrend = 0;
  let rateHistory: number[] | null = null;
  if (result.monthlyTrend.length >= 2) {
    const pts = result.monthlyTrend;
    const first = pts[0].value;
    const last = pts[pts.length - 1].value;
    rateTrend = last < first ? 1 : last > first ? -1 : 0;
    rateHistory = pts.map((p) => +(p.value * 100).toFixed(2));
  }

  const kpis: KPI[] = [];
  for (const id of KPI_ORDER) {
    const m = byId.get(id);
    if (!m) continue;
    if (!ALWAYS_SHOW.has(id) && m.value === 0) continue;

    kpis.push({
      label: m.label,
      value: m.display,
      unit: m.unit,
      trend: id === "rejection_rate" ? rateTrend : 0,
      context: m.formula,
      sourceColumn: m.sourceColumns[0] ?? null,
      source: m.sourceSheets[0] ?? null,
      delta: null,
      history: id === "rejection_rate" ? rateHistory : null,
    });
  }
  return kpis;
}

// ── 4. metrics → charts ──────────────────────────────────────────────────────

const STAGE_LABELS: Record<string, string> = {
  visual: "Visual Inspection",
  "eye-punching": "Eye Punching",
  balloon: "Balloon Testing",
  "valve-integrity": "Valve Integrity",
  final: "Final Inspection",
};

export function metricsToCharts(result: MetricsResult): Chart[] {
  const charts: Chart[] = [];

  const stages = result.stageBreakdown.filter((s) => s.checked > 0);
  if (stages.length >= 1) {
    charts.push({
      title: "Rejection rate by stage",
      type: "bar",
      description: "Where in the inspection funnel units are lost.",
      data: {
        labels: stages.map((s) => STAGE_LABELS[s.stage] || s.stage),
        datasets: [
          {
            label: "Rejection rate %",
            data: stages.map((s) => +(s.rate * 100).toFixed(2)),
          },
        ],
      },
    });
  }

  if (result.reasonPareto.length >= 1) {
    const top = result.reasonPareto.slice(0, 8);
    charts.push({
      title: "Top rejection reasons",
      type: "horizontalBar",
      description: "Defect reasons ranked by total count.",
      data: {
        labels: top.map((r) => r.label),
        datasets: [{ label: "Rejections", data: top.map((r) => Math.round(r.value)) }],
      },
    });
  }

  if (result.monthlyTrend.length >= 2) {
    charts.push({
      title: "Rejection rate trend",
      type: "line",
      description: "Monthly rejection rate across the reporting period.",
      data: {
        labels: result.monthlyTrend.map((p) => p.label),
        datasets: [
          {
            label: "Rejection rate %",
            data: result.monthlyTrend.map((p) => +(p.value * 100).toFixed(2)),
          },
        ],
      },
    });
  }

  return charts;
}

// ── 4b. reasonPareto → Lean Six Sigma 80/20 analysis ─────────────────────────
// Pure JS over the already-aggregated, descending reason series. Distinguishes
// the "vital few" (smallest subset crossing the 80% cumulative cut-off) from the
// "useful many". Numbers are exact; only criticalAreaText is prose, and it is
// templated here (not by the model) so it always traces to the computed values.

/** Collapse SCREAMING reason labels into a readable "Struck Balloon" form. */
function prettyLabel(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .trim();
}

export function calculatePareto(data: SeriesPoint[]): ParetoAnalysis | null {
  const sorted = data
    .filter((p) => p.value > 0)
    .sort((a, b) => b.value - a.value);
  if (sorted.length === 0) return null;

  const totalDefects = sorted.reduce((sum, p) => sum + p.value, 0);
  if (totalDefects <= 0) return null;

  let cumulative = 0;
  let prevCumulative = 0; // cumulative % of the element BEFORE this one
  const items: ParetoItem[] = sorted.map((p, i) => {
    const contribution = (p.value / totalDefects) * 100;
    cumulative += contribution;
    // Vital few = every element up to and including the first one that pushes
    // the running total past 80%. Gated on the PREVIOUS cumulative so the
    // crossing element is itself included.
    const isVitalFew = prevCumulative < 80;
    prevCumulative = cumulative;
    return { rank: i + 1, label: p.label, value: p.value, contribution, cumulative, isVitalFew };
  });

  const vitalFew = items.filter((it) => it.isVitalFew);
  const vitalFewCount = vitalFew.length;
  const vitalFewContribution = vitalFew.reduce((sum, it) => sum + it.contribution, 0);

  const names = vitalFew.map((v) => prettyLabel(v.label));
  const nameList =
    names.length <= 3 ? names.join(", ") : `${names.slice(0, 3).join(", ")}, +${names.length - 3} more`;
  const noun = vitalFewCount === 1 ? "category" : "categories";
  const criticalAreaText =
    `The top ${vitalFewCount} defect ${noun} (${nameList}) account for ` +
    `${vitalFewContribution.toFixed(1)}% of total quality rejects.`;

  return { items, totalDefects, vitalFewCount, vitalFewContribution, criticalAreaText };
}

// ── 5. graphs → MergePlan (Sources audit panel) ──────────────────────────────
// Non-summary sheets grouped by file; summary sheets recorded as excluded. The
// metric layer already excludes summaries from the math — this just surfaces
// that decision in the UI audit.

export function deriveMergePlan(summaries: SheetSummary[], graphs: SheetGraph[]): MergePlan {
  const graphByKey = new Map(graphs.map((g) => [g.sheetKey, g]));

  const byFile = new Map<string, string[]>();
  const excludedSheets: MergePlan["excludedSheets"] = [];

  for (const s of summaries) {
    const g = graphByKey.get(s.name);
    if (g?.isSummary) {
      excludedSheets.push({
        sheet: s.name,
        reason: "summary/rollup sheet — excluded to avoid double-counting",
      });
      continue;
    }
    const file = s.name.split(" - ")[0];
    if (!byFile.has(file)) byFile.set(file, []);
    byFile.get(file)!.push(s.name);
  }

  const fileGroups = [...byFile.entries()];
  const singleFile = fileGroups.length === 1;

  const groups: MergePlan["groups"] = fileGroups.map(([file, sheets]) => ({
    label: singleFile ? "All Data" : file,
    sheets,
    reason: singleFile
      ? "Single source — summed across its sheets"
      : "Distinct source — summed with the others",
  }));

  if (groups.length === 0) {
    groups.push({ label: "Data", sheets: [], reason: "no raw sheets detected" });
  }

  return { groups, excludedSheets, crossFileStrategy: "sum", warnings: [] };
}
