// src/lib/schemas.ts
// Zod schemas for everything the AI returns. These replace the old
// extractJson + normalize* pipeline — generateObject validates against them
// and we get typed results back without manual coercion.

import { z } from "zod";

// ── MergePlan (Phase 1) ──────────────────────────────────────────────────────

export const MergePlanSchema = z.object({
  groups: z
    .array(
      z.object({
        label: z
          .string()
          .describe("Human-readable name for this source group (e.g. 'Plant A', 'Q1 2024', 'All Data')"),
        sheets: z
          .array(z.string())
          .describe("sheetKey values to INCLUDE in this group"),
        reason: z
          .string()
          .describe("One sentence explaining why these belong together"),
      }),
    )
    .min(1),
  excludedSheets: z.array(
    z.object({
      sheet: z.string().describe("The sheetKey being excluded"),
      reason: z
        .string()
        .describe("Why excluded (e.g. 'summary of included sheets, would double-count')"),
    }),
  ),
  crossFileStrategy: z
    .enum(["sum", "separate"])
    .describe("Almost always 'sum' unless sheets clearly cover the same time period AND same source"),
  warnings: z
    .array(z.string())
    .describe("Any data quality concerns worth flagging"),
});

export type MergePlanOutput = z.infer<typeof MergePlanSchema>;

// ── DashboardConfig (Phase 2) ────────────────────────────────────────────────

const ChartTypeSchema = z.enum([
  "line",
  "bar",
  "horizontalBar",
  "area",
  "pie",
  "doughnut",
  "radar",
]);

const ChartSchema = z.object({
  title: z.string(),
  type: ChartTypeSchema,
  description: z.string().optional(),
  data: z.object({
    labels: z
      .array(z.string())
      .describe("EXACT labels from PRE-COMPUTED CHART SERIES"),
    datasets: z
      .array(
        z.object({
          label: z.string(),
          data: z
            .array(z.number())
            .describe("EXACT values from PRE-COMPUTED CHART SERIES"),
        }),
      )
      .min(1),
  }),
});

const KpiSchema = z.object({
  label: z.string().describe("Short metric name"),
  value: z
    .union([z.string(), z.number()])
    .describe("EXACT value from GRAND TOTALS or PER-SOURCE BREAKDOWN — never estimate"),
  unit: z.string().optional().describe("Unit suffix (e.g. '%', 'units') — omit if already in value"),
  trend: z
    .union([z.literal(-1), z.literal(0), z.literal(1)])
    .describe("1 = improving, 0 = stable, -1 = declining"),
  context: z.string().describe("Short qualifier e.g. 'grand total', 'monthly avg'"),
  delta: z
    .string()
    .optional()
    .describe("Pre-formatted delta string e.g. '+0.42 pt' or '-9 vs Aug'"),
  history: z
    .array(z.number())
    .optional()
    .describe(
      "Recent values for inline sparkline (3-12 points). " +
        "Use the most-recent time series for this metric when available.",
    ),
  source: z
    .string()
    .optional()
    .describe("Short source tag e.g. file or sheet name"),
  sourceColumn: z
    .string()
    .optional()
    .describe("Exact column name this KPI was derived from — used for trace beams"),
});

export const DashboardConfigSchema = z.object({
  dashboardTitle: z.string().max(80).describe("8 words or fewer — used as the lead headline"),
  executiveSummary: z
    .string()
    .describe("2-3 sentences using exact grand-total numbers"),
  kpis: z.array(KpiSchema).min(1).max(8),
  charts: z.array(ChartSchema).max(6),
  insights: z
    .array(z.string())
    .max(7)
    .describe("Numbered findings with real numbers/IDs from the data"),
  recommendations: z
    .array(z.string())
    .max(6)
    .describe("Actionable items, time-ordered"),
  alerts: z
    .array(z.string())
    .describe("Empty [] unless a genuine anomaly was detected"),
});

export type DashboardConfigOutput = z.infer<typeof DashboardConfigSchema>;

// ── InsightSlide (chat) ──────────────────────────────────────────────────────

const InsightChartSchema = z.object({
  title: z.string(),
  type: z.enum(["bar", "line", "doughnut"]),
  data: z.object({
    labels: z.array(z.string()),
    datasets: z
      .array(
        z.object({
          label: z.string(),
          data: z.array(z.number()),
        }),
      )
      .min(1),
  }),
});

export const InsightSlideAnswerSchema = z.object({
  headline: z
    .string()
    .describe("One sentence finding that MUST contain a specific number from the data"),
  charts: z
    .array(InsightChartSchema)
    .min(0)
    .max(2)
    .describe("0 charts for text-only, 1 for simple, 2 for comparative questions"),
  bullets: z
    .array(z.string())
    .min(3)
    .max(4)
    .describe("3-4 supporting points, each referencing a specific data point"),
});

export type InsightSlideAnswer = z.infer<typeof InsightSlideAnswerSchema>;
