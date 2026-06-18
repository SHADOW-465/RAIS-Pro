// src/lib/analysis-utils.ts
// Prompt builders for the two AI phases. Schema validation is handled by
// Zod via generateObject (see src/lib/schemas.ts), so we no longer carry an
// inline JSON shape in the prompt — the model receives the schema description
// directly from the SDK.

import type { SheetManifest } from "@/types/analysis";
import type { SheetSummary } from "./parser";
import { mergedResultToPromptText } from "./merger";
import type { MergedResult } from "@/types/analysis";
import type { MetricsResult } from "@/types/metrics";

// ── Phase 1: manifest prompt → MergePlan ─────────────────────────────────────

export function buildManifestPrompt(manifests: SheetManifest[]): string {
  const sheetList = manifests
    .map((m) => {
      const totals = Object.entries(m.numericTotals)
        .slice(0, 4)
        .map(([col, val]) => `${col}=${val.toLocaleString()}`)
        .join(", ");
      return `"${m.sheetKey}": rows=${m.rowCount} stripped=${m.totalRowsStripped} granularity=${m.granularity} timeRange="${m.timeRange ?? "unknown"}" summary=${m.isSummaryCandidate} cols=[${m.columns.slice(0, 6).join(",")}] totals={${totals}}`;
    })
    .join("\n");

  const allKeys = manifests.map((m) => `"${m.sheetKey}"`).join(", ");

  return `Analyze these Excel sheet manifests and produce a merge plan.

SHEETS:
${sheetList}

TASK:
1. Identify sheets that contain the SAME underlying data at different granularities (e.g. a "Summary" sheet totalling monthly sheets). Prefer higher-granularity (more rows) sheets; exclude summary/rollup sheets to avoid double-counting.
2. Group sheets that represent DIFFERENT sources of the same kind of data (e.g. different plants or time periods that should be SUMMED).
3. If multiple files cover different plants/locations, each file is its own group — sum them.
4. If a single file has both monthly sheets AND a yearly summary, EXCLUDE the yearly summary.

RULES:
- Every sheetKey must appear exactly once: either in a group or in excludedSheets.
- Available sheetKeys: [${allKeys}]
- Prefer raw-data sheets over summary sheets when in doubt.
- crossFileStrategy is almost always "sum" — only use "separate" if sheets clearly cover the same time period AND same source.`;
}

// ── Phase 2: dashboard prompt → DashboardConfig ──────────────────────────────

// Hard character budget for the data section (~7k tokens ≈ 28k chars).
const DATA_CHAR_BUDGET = 20_000;

export function buildPrompt(
  mergedResult: MergedResult,
): string {
  const hasMultipleGroups = mergedResult.groups.length > 1;
  const groupNames = mergedResult.groups.map((g) => `"${g.label}"`).join(", ");

  let dataSection = mergedResultToPromptText(mergedResult);
  if (dataSection.length > DATA_CHAR_BUDGET) {
    dataSection = dataSection.slice(0, DATA_CHAR_BUDGET) + "\n... [truncated for length]\n";
  }

  return `Build the dashboard for this dataset.

RULES:
1. KPI values MUST come verbatim from GRAND TOTALS${hasMultipleGroups ? " or PER-SOURCE BREAKDOWN" : ""}. Never estimate.
2. Chart labels and data MUST come verbatim from PRE-COMPUTED CHART SERIES. Never invent numbers.
3. Use SUM for counts/totals. Use MEAN for rates/percentages.
4. 4-6 KPIs · 2-4 charts · 5 insights · 4 recommendations.
5. trend: 1 = improving, 0 = stable, -1 = declining. alerts: [] unless a genuine anomaly was detected.
6. When a metric has a time series in PRE-COMPUTED CHART SERIES, populate that KPI's "history" with those values so the dashboard can render a sparkline.
${hasMultipleGroups ? `7. First KPI = grand total. Add per-source KPIs for ${groupNames}.\n` : ""}
${dataSection}`;
}

// ── Phase 3b: column-role graph prompt → SheetGraph[] ────────────────────────
// The model classifies every column into a semantic role. It does NO maths —
// computeMetrics() sums the columns it tags. Give it enough signal (type, a few
// sample values, the column sum) to tell a checked-qty column from a reason
// count from a percentage.

const GRAPH_CHAR_BUDGET = 14_000;

export function buildGraphPrompt(summaries: SheetSummary[]): string {
  const sheetBlocks = summaries.map((s) => {
    const cols = s.columns
      .map((c) => {
        const samples = c.sampleData
          .slice(0, 3)
          .map((v) => (typeof v === "string" ? `"${v.slice(0, 18)}"` : String(v)))
          .join(", ");
        const sum = typeof c.sum === "number" ? ` sum=${c.sum}` : "";
        return `    - "${c.name}" [${c.type}] uniq=${c.uniqueCount}${sum} samples=[${samples}]`;
      })
      .join("\n");
    return `SHEET "${s.name}" (rows=${s.rowCount}):\n${cols}`;
  });

  let body = sheetBlocks.join("\n\n");
  if (body.length > GRAPH_CHAR_BUDGET) {
    body = body.slice(0, GRAPH_CHAR_BUDGET) + "\n... [truncated]\n";
  }

  const allKeys = summaries.map((s) => `"${s.name}"`).join(", ");

  return `Read every sheet below and produce a semantic GRAPH of what each column represents. This is a quality-inspection / rejection-report dataset.

${body}

For EACH sheet emit one object with: sheetKey (echo verbatim), reportType, isSummary, stageOrder, columns (every column → a role), notes.

COLUMN ROLES:
- date            — a date/period column.
- stage_checked   — units inspected at an inspection stage (e.g. "VISUAL QTY", "REC. QTY", "CHECKED QTY").
- stage_accepted  — units that passed a stage (e.g. "ACPT QTY", "ACCEPT QTY").
- stage_rejected  — units rejected at a stage (e.g. "REJ QTY").
- stage_hold      — units put on hold (e.g. "HOLD QTY").
- reason_count    — a per-defect-reason tally (e.g. "COAG", "LEAKAGE", "SD", "STRUCK BALLOON"). Reason matrices have many of these.
- derived_total   — a TOTAL/FINAL/SUM column that is itself a roll-up of other columns in the SAME row (NEVER summed, would double-count).
- dimension       — a categorical/grouping column that isn't a quantity (e.g. "No of TROLLEYS", machine id).
- ignore          — percentages ("REJ %", "%"), blank, or anything not above. NEVER sum a percentage.

RULES:
- For stage_* roles, set "stage" to the stage name (reuse the same string across that stage's checked/accepted/rejected/hold). stageOrder lists those stage names earliest-first.
- isSummary = true for yearly/cumulative/rollup sheets that re-total OTHER sheets — they are excluded so we don't double-count.
- Classify EVERY column exactly once. Echo column names and sheetKeys verbatim.
- Available sheetKeys: [${allKeys}]`;
}

// ── Phase 3b: narrative prompt → Narrative (prose only) ──────────────────────
// Numbers are already computed. The model writes the story around them.

function fmtSeries(points: { label: string; value: number }[], asPct = false): string {
  return points
    .slice(0, 12)
    .map((p) => `${p.label}=${asPct ? (p.value * 100).toFixed(2) + "%" : Math.round(p.value).toLocaleString()}`)
    .join(", ");
}

export function buildNarrativePrompt(result: MetricsResult): string {
  const lines: string[] = [];

  lines.push("PRE-COMPUTED METRICS (use these EXACT figures — do not recompute or estimate):");
  for (const m of result.metrics) {
    lines.push(`  - ${m.label}: ${m.display}  [${m.formula}]`);
  }

  if (result.stageBreakdown.length > 0) {
    lines.push("\nPER-STAGE (checked → rejected → rate):");
    for (const s of result.stageBreakdown) {
      lines.push(
        `  - ${s.stage}: checked=${Math.round(s.checked).toLocaleString()}, ` +
          `rejected=${Math.round(s.rejected).toLocaleString()}, rate=${(s.rate * 100).toFixed(2)}%`,
      );
    }
  }

  if (result.reasonPareto.length > 0) {
    lines.push("\nTOP REJECTION REASONS (count): " + fmtSeries(result.reasonPareto, false));
  }

  if (result.monthlyTrend.length > 0) {
    lines.push("\nMONTHLY REJECTION RATE: " + fmtSeries(result.monthlyTrend, true));
  }

  return `Write the editorial narrative for this rejection-inspection dashboard. A pharma General Manager will read it.

${lines.join("\n")}

Write:
- dashboardTitle: 8 words or fewer, no numbers.
- executiveSummary: 2-3 sentences. Quote the exact figures above.
- insights: 4-6 findings, each naming a real number, stage, or reason from above.
- recommendations: 3-4 concrete actions, most-urgent first.
- alerts: [] unless a figure is genuinely alarming (e.g. a stage rate far above the overall rate).

NEVER invent a number that is not in the data above. The KPIs and charts are rendered separately — you only write prose.`;
}
