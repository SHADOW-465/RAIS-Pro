// src/lib/analysis-utils.ts
// Prompt builders for the two AI phases (graph classification + narrative).
// Schema validation is handled by Zod via generateObject (see src/lib/schemas.ts).
// The old phase-1 manifest/merge-plan prompts have been removed — they were
// superseded by inferSheetGraph (heuristic) + SheetMappingSetSchema (LLM).

import type { SheetSummary } from "./parser";
import type { MetricsResult } from "@/types/metrics";

// ── Phase 1: column-role graph prompt → SheetMappingSet ─────────────────────
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
