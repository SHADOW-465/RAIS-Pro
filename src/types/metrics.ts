// src/types/metrics.ts
// Types for the deterministic semantic "column-role graph" + metrics layer.
//
// Pipeline contract: an upstream step (LLM or heuristic) produces a SheetGraph
// describing the ROLE of every column in a sheet. computeMetrics() then does ALL
// arithmetic in pure JS — the model never sums anything.

export type ReportType =
  | "assembly"
  | "balloon_valve"
  | "visual"
  | "shopfloor"
  | "cumulative"
  | "yearly_production"
  | "unknown";

export type ColumnRole =
  | "date"
  | "stage_checked"
  | "stage_accepted"
  | "stage_rejected"
  | "stage_hold"
  | "reason_count"
  | "derived_total"
  | "dimension"
  | "ignore";

export interface ColumnMapping {
  column: string; // normalized column name
  role: ColumnRole;
  stage: string | null; // e.g. "Visual", "Balloon", "Valve Integrity", "Eye Punching"; null for non-stage roles
}

/** The LLM-or-heuristic "graph understanding" of one sheet. */
export interface SheetGraph {
  sheetKey: string; // SheetSummary.name
  reportType: ReportType;
  isSummary: boolean; // rollup sheet to exclude from aggregation
  stageOrder: string[]; // funnel order of stage names; [] for non-funnel
  columns: ColumnMapping[];
  notes: string | null; // optional human-readable note about this sheet
}

/** A computed statistic with provenance for the verify panel. */
export interface Metric {
  id: string; // "rejection_rate"
  label: string;
  value: number; // exact, unrounded
  display: string; // formatted ("4.58%", "287,700")
  unit: string | null;
  formula: string; // "Σ rejected ÷ entry-stage checked"
  inputs: { field: string; total: number }[];
  sourceSheets: string[];
  sourceColumns: string[]; // columns that fed this metric (for beams)
}

export interface SeriesPoint {
  label: string;
  value: number;
}

export interface MetricsResult {
  metrics: Metric[];
  stageBreakdown: { stage: string; checked: number; rejected: number; rate: number }[];
  reasonPareto: SeriesPoint[]; // reason → total rejected qty, desc
  monthlyTrend: SeriesPoint[]; // month → rejection rate
}
