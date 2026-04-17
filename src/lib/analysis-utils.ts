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
      .slice(0, 5)
      .map(([col, val]) => `${col}=${val.toLocaleString()}`)
      .join(', ');
    return [
      `  sheetKey: "${m.sheetKey}"`,
      `  file: "${m.fileName}"  sheet: "${m.sheetName}"`,
      `  rows: ${m.rowCount}  totalRowsStripped: ${m.totalRowsStripped}`,
      `  granularity: ${m.granularity}  timeRange: ${m.timeRange ?? 'unknown'}`,
      `  isSummaryCandidate: ${m.isSummaryCandidate}`,
      `  columns: ${m.columns.slice(0, 8).join(', ')}`,
      `  numericTotals: { ${totals} }`,
    ].join('\n');
  }).join('\n\n');

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

export function buildPrompt(mergedResult: MergedResult, rawSummaries: SheetSummary[]): string {
  const dataSection = mergedResultToPromptText(mergedResult);

  // Column metadata for context (not for calculating values)
  let metaSection = '## COLUMN METADATA (context only — do NOT use for KPI values)\n';
  const includedKeys = new Set(
    mergedResult.mergePlan.groups.flatMap(g => g.sheets)
  );
  for (const s of rawSummaries) {
    if (!includedKeys.has(s.name)) continue;
    metaSection += `### ${s.name}\n`;
    for (const col of s.columns) {
      const extra = col.type === 'number'
        ? `type: number`
        : `type: ${col.type}, unique: ${col.uniqueCount}, samples: ${JSON.stringify(col.sampleData)}`;
      metaSection += `  - ${col.name} (${extra})\n`;
    }
    metaSection += '\n';
  }

  const hasMultipleGroups = mergedResult.groups.length > 1;
  const groupNames = mergedResult.groups.map(g => `"${g.label}"`).join(', ');
  const allSeriesNames = mergedResult.groups
    .flatMap(g => g.groupedSeries)
    .map(s => `"${s.metricColumn} by ${s.groupByColumn} [${s.aggregation}]"`)
    .join(', ');

  return `You are a senior data analyst. Analyze the dataset below and return a single JSON object.

CRITICAL RULES — READ CAREFULLY:
1. KPI values MUST come verbatim from GRAND TOTALS or PER-SOURCE BREAKDOWN. Never estimate.
2. Chart data arrays MUST use the exact labels/values from PRE-COMPUTED CHART SERIES. Never invent numbers.
3. For totals (rejection count, checked count), use the SUM value. For rates/percentages, use the MEAN.
4. sourceColumn must be the exact column name as it appears in the data.
5. Return ONLY the JSON object — no markdown, no explanation.

SCHEMA:
{
  "dashboardTitle": "Short descriptive title (max 8 words)",
  "executiveSummary": "2-3 sentences for a General Manager. Use exact grand-total numbers.${hasMultipleGroups ? ` Mention the ${mergedResult.groups.length} sources: ${groupNames}.` : ''}",
  "kpis": [
    {
      "label": "Human-readable metric name",
      "value": "EXACT value from GRAND TOTALS (formatted, e.g. '33.2k' or '0.82%')",
      "unit": "unit if not already in value, else omit",
      "trend": -1,
      "context": "e.g. 'grand total', 'overall average'",
      "sourceColumn": "exact column name"
    }
  ],
  "insights": ["5 specific insights with exact numbers from the aggregates", "...", "...", "...", "..."],
  "recommendations": ["4 actionable recommendations", "...", "...", "..."],
  "charts": [
    {
      "title": "Chart title",
      "type": "line",
      "description": "optional one-liner",
      "data": {
        "labels": ["EXACT labels from a PRE-COMPUTED CHART SERIES"],
        "datasets": [{ "label": "Series", "data": [EXACT values from matching series], "borderColor": "#6366f1", "backgroundColor": "rgba(99,102,241,0.1)", "fill": true, "tension": 0.4 }]
      }
    }
  ],
  "alerts": []
}

INSTRUCTIONS:
- kpis: 4–6 items. Include the grand total for the primary rejection metric as the first KPI.${hasMultipleGroups ? `\n- Consider adding a KPI for each source group to show the breakdown.` : ''}
- charts: 2–4. Available pre-computed series: ${allSeriesNames || '(none)'}.${hasMultipleGroups ? `\n  Also add a bar chart comparing ${groupNames} for the primary metric.` : ''}
- Chart type: line, bar, horizontalBar, area, pie, doughnut, or radar.
- insights: exactly 5 with real numbers. alerts: [] unless there is a genuine anomaly.
- trend: 1=improving, 0=stable, -1=declining.

${dataSection}
${metaSection}`;
}
