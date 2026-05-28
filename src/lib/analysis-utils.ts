// src/lib/analysis-utils.ts
// Prompt builders for the two AI phases. Schema validation is handled by
// Zod via generateObject (see src/lib/schemas.ts), so we no longer carry an
// inline JSON shape in the prompt — the model receives the schema description
// directly from the SDK.

import type { SheetManifest } from "@/types/analysis";
import type { SheetSummary } from "./parser";
import { mergedResultToPromptText } from "./merger";
import type { MergedResult } from "@/types/analysis";

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
  _rawSummaries: SheetSummary[],
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
