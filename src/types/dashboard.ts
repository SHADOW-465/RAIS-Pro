// src/types/dashboard.ts

export interface KPI {
  label: string;
  value: string | number;
  /** Unit suffix (e.g. "%", "units"). Null if encoded in value. */
  unit?: string | null;
  /** -1 = declining/bad, 0 = stable/neutral, 1 = improving/good. Schema sends int. */
  trend: number;
  context: string;
  /** Column name in source data this KPI was derived from. Null if synthesised. */
  sourceColumn?: string | null;
  /** Pre-formatted delta string e.g. "+0.42 pt" or "-9 vs Aug". Null if no comparison. */
  delta?: string | null;
  /** History values for inline sparkline (3-12 points). Null if no time series. */
  history?: number[] | null;
  /** Short source tag e.g. "rejection_log" — falls back to sourceColumn. */
  source?: string | null;
}

/** Raw spreadsheet data kept client-side for data verification */
export interface RawSheet {
  name: string;
  fileName: string;
  columns: string[];
  rows: Record<string, unknown>[];
}

export interface ChartDataset {
  label: string;
  data: number[];
  borderColor?: string;
  backgroundColor?: string | string[];
  fill?: boolean;
  tension?: number;
}

export interface Chart {
  title: string;
  type: 'line' | 'bar' | 'horizontalBar' | 'area' | 'pie' | 'doughnut' | 'radar';
  /** Short caption rendered below the chart. Null/undefined when not applicable. */
  description?: string | null;
  data: {
    labels: string[];
    datasets: ChartDataset[];
  };
}

/** A per-sheet slice of the dashboard (one section per data sheet, e.g. a month). */
export interface DashboardSection {
  /** stable id = the sheet key (e.g. "FILE.xlsx - APRIL 25") */
  id: string;
  /** human label, e.g. "April 2025" */
  label: string;
  kpis: KPI[];
  charts: Chart[];
}

export interface DashboardConfig {
  dashboardTitle: string;
  executiveSummary: string;
  kpis: KPI[];
  charts: Chart[];
  insights: string[];
  recommendations: string[];
  alerts: string[];
  /** Deterministic per-sheet breakdowns. The top-level kpis/charts are the combined view. */
  sections?: DashboardSection[];
}

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  isRefresh?: boolean;
  error?: boolean;
}

export interface InsightChart {
  title: string;
  type: 'bar' | 'line' | 'doughnut';
  data: {
    labels: string[];
    datasets: Array<{
      label: string;
      data: number[];
      backgroundColor?: string | string[];
      borderColor?: string;
    }>;
  };
}

export interface InsightSlide {
  id?: string;              // set after DB save
  sessionId: string;
  question: string;
  headline: string;
  charts: InsightChart[];   // 1-2 charts
  bullets: string[];        // 3-4 bullets
  createdAt: string;        // ISO timestamp
}
