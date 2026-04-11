// src/lib/analysis-utils.ts
import type { DashboardConfig } from '@/types/dashboard';
import type { SheetSummary, GroupedSeries } from './parser';

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
    dashboardTitle:
      raw.dashboardTitle ?? raw.dashboard_title ?? 'Data Analysis',

    executiveSummary:
      raw.executiveSummary ?? raw.executive_summary ?? raw.summary ?? 'Analysis complete.',

    kpis: Array.isArray(raw.kpis)
      ? raw.kpis.slice(0, 8).map((k: any) => ({
          label:        String(k.label        ?? 'Metric'),
          value:        k.value               ?? 'N/A',
          unit:         k.unit,
          trend:        ([-1, 0, 1].includes(Number(k.trend)) ? Number(k.trend) : 0) as -1 | 0 | 1,
          context:      String(k.context      ?? ''),
          sourceColumn: k.sourceColumn ? String(k.sourceColumn) : undefined,
        }))
      : [],

    insights: Array.isArray(raw.insights)
      ? raw.insights.filter((s: unknown) => typeof s === 'string' && s.trim())
      : [],

    recommendations: Array.isArray(raw.recommendations)
      ? raw.recommendations.filter((s: unknown) => typeof s === 'string' && s.trim())
      : [],

    charts: Array.isArray(raw.charts)
      ? raw.charts.filter(
          (c: any) => c?.title && c?.type && c?.data?.labels && c?.data?.datasets
        )
      : [],

    alerts: Array.isArray(raw.alerts)
      ? raw.alerts.filter((s: unknown) => typeof s === 'string' && s.trim())
      : [],
  };
}

// ── Formatting helpers ───────────────────────────────────────────────────────

function fmtNum(n: number): string {
  if (Math.abs(n) >= 1_000_000) return (n / 1_000_000).toFixed(2) + 'M';
  if (Math.abs(n) >= 1_000) return (n / 1_000).toFixed(1) + 'k';
  if (Math.abs(n) < 10) return n.toFixed(2);
  return n.toFixed(1);
}

function seriesKey(s: GroupedSeries): string {
  return `${s.metricColumn} by ${s.groupByColumn} [${s.aggregation}]`;
}

// ── Prompt builder ───────────────────────────────────────────────────────────

export function buildPrompt(rawSummaries: unknown): string {
  const summaries = rawSummaries as SheetSummary[];

  // ── Section 1: Pre-computed aggregates (ground truth) ─────────────────────
  let aggregateSection = '## PRE-COMPUTED AGGREGATES\n';
  aggregateSection += 'These are exact values computed from the raw data. KPI values MUST come from here verbatim.\n\n';

  for (const sheet of summaries) {
    aggregateSection += `### ${sheet.name} (${sheet.rowCount.toLocaleString()} rows)\n`;
    const numericCols = sheet.columns.filter(c => c.type === 'number');
    if (numericCols.length === 0) {
      aggregateSection += '  (no numeric columns)\n';
    } else {
      for (const col of numericCols) {
        aggregateSection += `  ${col.name}:\n`;
        if (col.sum !== undefined) aggregateSection += `    total (SUM) = ${fmtNum(col.sum)} (exact: ${col.sum})\n`;
        if (col.mean !== undefined) aggregateSection += `    average (MEAN) = ${fmtNum(col.mean)} (exact: ${col.mean})\n`;
        if (col.min !== undefined) aggregateSection += `    min = ${col.min}, max = ${col.max}\n`;
      }
    }
    aggregateSection += '\n';
  }

  // ── Section 2: Pre-computed chart series ──────────────────────────────────
  let seriesSection = '';
  const allSeries: GroupedSeries[] = summaries.flatMap(s => s.groupedSeries ?? []);

  if (allSeries.length > 0) {
    seriesSection = '## PRE-COMPUTED CHART SERIES\n';
    seriesSection += 'Use these exact label/value arrays for chart datasets. Do not invent chart data.\n\n';
    for (const s of allSeries) {
      seriesSection += `  ${seriesKey(s)}:\n`;
      seriesSection += `    labels: ${JSON.stringify(s.labels)}\n`;
      seriesSection += `    values: ${JSON.stringify(s.values)}\n\n`;
    }
  }

  // ── Section 3: Column metadata (for context only) ─────────────────────────
  let metaSection = '## COLUMN METADATA (context only — do NOT use for KPI values)\n';
  for (const sheet of summaries) {
    metaSection += `### ${sheet.name}\n`;
    for (const col of sheet.columns) {
      const extra = col.type === 'string' || col.type === 'date'
        ? `unique values: ${col.uniqueCount}, samples: ${JSON.stringify(col.sampleData)}`
        : `type: number`;
      metaSection += `  - ${col.name} (${col.type}): ${extra}\n`;
    }
    metaSection += '\n';
  }

  // ── Build series reference list for chart instructions ────────────────────
  const seriesNames = allSeries.map(s => `"${seriesKey(s)}"`).join(', ');

  return `You are a senior data analyst. Analyze the dataset below and return a single JSON object matching EXACTLY this schema.

CRITICAL RULES:
1. KPI values MUST be taken verbatim from the PRE-COMPUTED AGGREGATES section. Never estimate or recalculate.
2. Chart data arrays (labels and datasets.data) MUST come from the PRE-COMPUTED CHART SERIES section. Never invent chart numbers.
3. If a KPI represents a total, use the SUM value. If it's a rate or percentage, use the MEAN value.
4. sourceColumn must be the exact column name as it appears in the data.
5. Return ONLY the JSON object — no markdown, no explanation.

SCHEMA:
{
  "dashboardTitle": "Short descriptive title (max 8 words)",

  "executiveSummary": "2-3 sentences for a General Manager. Reference specific numbers from the aggregates.",

  "kpis": [
    {
      "label": "Human-readable metric name",
      "value": "EXACT value from PRE-COMPUTED AGGREGATES (formatted, e.g. '33.2k' or '0.82%')",
      "unit": "unit string if not already in value, else omit",
      "trend": -1,
      "context": "e.g. 'total', 'YTD average', 'this quarter'",
      "sourceColumn": "exact column name in source data"
    }
  ],

  "insights": [
    "Specific insight referencing exact numbers from the aggregates",
    "...", "...", "...", "..."
  ],

  "recommendations": [
    "Short actionable recommendation",
    "...", "...", "..."
  ],

  "charts": [
    {
      "title": "Chart title",
      "type": "line",
      "description": "Optional one-liner",
      "data": {
        "labels": ["EXACT labels from a PRE-COMPUTED CHART SERIES"],
        "datasets": [{
          "label": "Series name",
          "data": [EXACT values from the matching PRE-COMPUTED CHART SERIES],
          "borderColor": "#6366f1",
          "backgroundColor": "rgba(99,102,241,0.1)",
          "fill": true,
          "tension": 0.4
        }]
      }
    }
  ],

  "alerts": []
}

INSTRUCTIONS:
- kpis: 3–6 items. Pick the metrics that matter most. trend: 1=improving, 0=stable, -1=declining.
- charts: 2–4 charts. Available pre-computed series: ${seriesNames || '(none — omit charts if no series available)'}.
  Chart type must be one of: line, bar, horizontalBar, area, pie, doughnut, radar.
- insights: exactly 5. Reference real numbers.
- recommendations: exactly 4. Short and actionable.
- alerts: empty [] unless there is a genuine critical anomaly in the data.

${aggregateSection}
${seriesSection}
${metaSection}`;
}
