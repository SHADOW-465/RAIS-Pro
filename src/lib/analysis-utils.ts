// src/lib/analysis-utils.ts
import type { DashboardConfig } from '@/types/dashboard';

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
          label:   String(k.label   ?? 'Metric'),
          value:   k.value          ?? 'N/A',
          unit:    k.unit,
          trend:   ([-1, 0, 1].includes(Number(k.trend)) ? Number(k.trend) : 0) as -1 | 0 | 1,
          context: String(k.context ?? ''),
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

// ── Prompt builder ───────────────────────────────────────────────────────────

export function buildPrompt(summaries: unknown): string {
  const data = JSON.stringify(summaries, null, 2).slice(0, 12000);

  return `Analyze this dataset and return a JSON object matching EXACTLY this schema.

SCHEMA:
{
  "dashboardTitle": "Short descriptive title based on the data (max 8 words)",

  "executiveSummary": "2-3 sentence plain-language brief for a General Manager. Reference specific numbers.",

  "kpis": [
    {
      "label": "AI-chosen metric name relevant to this dataset",
      "value": "actual value from data (number or formatted string like '14.2k' or '4.2%')",
      "unit": "optional unit string — omit if value already contains it",
      "trend": 1,
      "context": "short label e.g. 'vs last month', 'YTD', 'target'"
    }
  ],

  "insights": [
    "Specific insight referencing actual data values",
    "...", "...", "...", "..."
  ],

  "recommendations": [
    "Short actionable recommendation",
    "...", "...", "..."
  ],

  "charts": [
    {
      "title": "Chart title from data",
      "type": "line",
      "data": {
        "labels": ["label1", "label2", "label3"],
        "datasets": [{
          "label": "Series name",
          "data": [10, 20, 30],
          "borderColor": "#00E5CC",
          "backgroundColor": "rgba(0, 229, 204, 0.1)",
          "fill": true,
          "tension": 0.4
        }]
      }
    }
  ],

  "alerts": []
}

RULES:
- kpis: 3-6 items. Choose the metrics that matter most for THIS specific dataset. Do not use hardcoded or domain-specific field names.
- trend must be exactly -1 (declining/bad), 0 (stable/neutral), or 1 (improving/good).
- All KPI values and chart data must come from the actual uploaded data — no invented numbers.
- Chart type must be one of: line, bar, horizontalBar, area, pie, doughnut, radar.
- alerts: empty array [] unless there is a genuine critical anomaly.
- Exactly 5 insights, exactly 4 recommendations.
- Return ONLY the JSON object. Nothing before or after it.

DATA:
${data}`;
}
