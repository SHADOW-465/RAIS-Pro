// src/lib/analysis-utils.ts
import type { DashboardConfig } from '@/types/dashboard';
import type { SheetManifest, MergePlan } from '@/types/analysis';
import type { SheetSummary } from './parser';
import { mergedResultToPromptText } from './merger';
import type { MergedResult } from '@/types/analysis';

// ── JSON extraction ──────────────────────────────────────────────────────────

export function extractJson(text: string): unknown {
  const t = text.trim();
  try { return JSON.parse(t); } catch { /* fall through */ }

  const fenced = t.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenced) {
    try { return JSON.parse(fenced[1].trim()); } catch { /* fall through */ }
  }

  const start = t.indexOf('{');
  const end = t.lastIndexOf('}');
  if (start !== -1 && end > start) {
    try { return JSON.parse(t.slice(start, end + 1)); } catch { /* fall through */ }
  }

  throw new Error('Could not extract valid JSON from AI response');
}

// ── Result normalizer ────────────────────────────────────────────────────────

export function normalizeResult(raw: any): DashboardConfig {
  return {
    dashboardTitle:    raw.dashboardTitle    ?? raw.dashboard_title ?? 'Data Analysis',
    executiveSummary:  raw.executiveSummary  ?? raw.executive_summary ?? raw.summary ?? 'Analysis complete.',
    kpis: Array.isArray(raw.kpis)
      ? raw.kpis.slice(0, 8).map((k: any) => ({
          label:        String(k.label        ?? 'Metric'),
          value:        k.value               ?? 'N/A',
          unit:         k.unit,
          trend:        ([-1, 0, 1].includes(Number(k.trend)) ? Number(k.trend) : 0) as -1 | 0 | 1,
          context:      String(k.context      ?? ''),
          sourceColumn: k.sourceColumn        ? String(k.sourceColumn) : undefined,
        }))
      : [],
    insights:        Array.isArray(raw.insights)        ? raw.insights.filter((s: unknown) => typeof s === 'string' && (s as string).trim())        : [],
    recommendations: Array.isArray(raw.recommendations) ? raw.recommendations.filter((s: unknown) => typeof s === 'string' && (s as string).trim()) : [],
    charts:          Array.isArray(raw.charts)          ? raw.charts.filter((c: any) => c?.title && c?.type && c?.data?.labels && c?.data?.datasets) : [],
    alerts:          Array.isArray(raw.alerts)          ? raw.alerts.filter((s: unknown) => typeof s === 'string' && (s as string).trim())           : [],
  };
}

export function normalizeMergePlan(raw: any): MergePlan {
  return {
    groups: Array.isArray(raw?.groups)
      ? raw.groups.map((g: any) => ({
          label:  String(g.label  ?? 'Data'),
          sheets: Array.isArray(g.sheets) ? g.sheets.map(String) : [],
          reason: String(g.reason ?? ''),
        }))
      : [],
    excludedSheets: Array.isArray(raw?.excludedSheets)
      ? raw.excludedSheets.map((e: any) => ({
          sheet:  String(e.sheet  ?? ''),
          reason: String(e.reason ?? ''),
        }))
      : [],
    crossFileStrategy: raw?.crossFileStrategy === 'separate' ? 'separate' : 'sum',
    warnings: Array.isArray(raw?.warnings) ? raw.warnings.map(String) : [],
  };
}

// ── Phase 1: Manifest prompt → AI → MergePlan ────────────────────────────────

export function buildManifestPrompt(manifests: SheetManifest[]): string {
  const sheetList = manifests.map(m => {
    const totals = Object.entries(m.numericTotals)
      .slice(0, 4)
      .map(([col, val]) => `${col}=${val.toLocaleString()}`)
      .join(', ');
    // One compact line per sheet
    return `"${m.sheetKey}": rows=${m.rowCount} stripped=${m.totalRowsStripped} granularity=${m.granularity} timeRange="${m.timeRange ?? 'unknown'}" summary=${m.isSummaryCandidate} cols=[${m.columns.slice(0, 6).join(',')}] totals={${totals}}`;
  }).join('\n');

  const allKeys = manifests.map(m => `"${m.sheetKey}"`).join(', ');

  return `You are a data engineer. Analyze these Excel sheet manifests and return a JSON merge plan.

SHEETS:
${sheetList}

TASK:
1. Identify which sheets contain the SAME underlying data at different granularities (e.g. a "Summary" sheet that totals the monthly sheets). Mark the higher-granularity (more rows) sheets as preferred; exclude summary/rollup sheets to avoid double-counting.
2. Group sheets that represent DIFFERENT sources of the same type of data (e.g. different plants, different time periods that should be SUMMED).
3. If multiple files cover different plants/locations, each file is its own group — sum them.
4. If a single file has both monthly sheets AND a yearly summary sheet, EXCLUDE the yearly summary (it would double-count).

Return ONLY this JSON — no markdown, no explanation:
{
  "groups": [
    {
      "label": "human-readable name for this source group (e.g. 'Plant A', 'Q1 2024', 'All Data')",
      "sheets": ["sheetKey values to INCLUDE in this group"],
      "reason": "one sentence explaining why these belong together"
    }
  ],
  "excludedSheets": [
    { "sheet": "sheetKey", "reason": "why excluded (e.g. 'summary of included sheets, would double-count')" }
  ],
  "crossFileStrategy": "sum",
  "warnings": ["any data quality concerns worth flagging to the analyst"]
}

RULES:
- Every sheetKey must appear in exactly one of: groups[].sheets OR excludedSheets[].sheet
- Available sheetKeys: [${allKeys}]
- When in doubt, prefer raw-data sheets over summary sheets
- crossFileStrategy is almost always "sum" unless sheets clearly cover the same time period AND same source`;
}

// ── Phase 2: Dashboard prompt → AI → DashboardConfig ─────────────────────────

// Hard character budget for the data section (~7k tokens ≈ 28k chars)
const DATA_CHAR_BUDGET = 20_000;

export function buildPrompt(mergedResult: MergedResult, _rawSummaries: SheetSummary[]): string {
  const hasMultipleGroups = mergedResult.groups.length > 1;
  const groupNames = mergedResult.groups.map(g => `"${g.label}"`).join(', ');

  // Compact schema — reduces fixed overhead by ~40%
  const schema = `{"dashboardTitle":"<8 words>","executiveSummary":"<2-3 sentences, use exact grand-total numbers${hasMultipleGroups ? `, mention sources: ${groupNames}` : ''}>","kpis":[{"label":"<name>","value":"<EXACT value from GRAND TOTALS>","unit":"<omit if in value>","trend":<-1|0|1>,"context":"<grand total|average|etc>","sourceColumn":"<exact col name>"}],"insights":["<5 items with real numbers>"],"recommendations":["<4 actionable items>"],"charts":[{"title":"<title>","type":"<line|bar|horizontalBar|area|pie|doughnut|radar>","data":{"labels":["<EXACT from PRE-COMPUTED>"],"datasets":[{"label":"<name>","data":[<EXACT values>],"borderColor":"#6366f1","backgroundColor":"rgba(99,102,241,0.1)","fill":true,"tension":0.4}]}}],"alerts":[]}`;

  // Data section — enforced character budget
  let dataSection = mergedResultToPromptText(mergedResult);
  if (dataSection.length > DATA_CHAR_BUDGET) {
    dataSection = dataSection.slice(0, DATA_CHAR_BUDGET) + '\n... [truncated for length]\n';
  }

  return `Senior data analyst. Return ONE valid JSON object matching the schema. No markdown, no preamble.

RULES:
1. KPI values MUST come verbatim from GRAND TOTALS${hasMultipleGroups ? ' or PER-SOURCE BREAKDOWN' : ''}. Never estimate.
2. Chart labels/data MUST come verbatim from PRE-COMPUTED CHART SERIES. Never invent numbers.
3. Use SUM for counts/totals. Use MEAN for rates/percentages.
4. kpis: 4-6 items. charts: 2-4 items. insights: exactly 5. recommendations: exactly 4.
5. trend: 1=improving 0=stable -1=declining. alerts: [] unless genuine anomaly.
${hasMultipleGroups ? `6. First KPI = grand total. Add per-source KPIs for ${groupNames}.` : ''}

SCHEMA: ${schema}

${dataSection}`;
}
