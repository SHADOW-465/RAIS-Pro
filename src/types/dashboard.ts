// src/types/dashboard.ts

export interface KPI {
  label: string;
  value: string | number;
  unit?: string;
  /** -1 = declining/bad, 0 = stable/neutral, 1 = improving/good */
  trend: -1 | 0 | 1;
  context: string;
  /** Column name in source data this KPI was derived from */
  sourceColumn?: string;
  // ── Editorial fields (optional) ────────────────────────────────────────────
  /** Pre-formatted delta string e.g. "+0.42 pt" or "-9 vs Aug" */
  delta?: string;
  /** History values for inline sparkline */
  history?: number[];
  /** Short source tag e.g. "rejection_log" — falls back to sourceColumn */
  source?: string;
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
  description?: string;
  data: {
    labels: string[];
    datasets: ChartDataset[];
  };
}

export interface DashboardConfig {
  dashboardTitle: string;
  executiveSummary: string;
  kpis: KPI[];
  charts: Chart[];
  insights: string[];
  recommendations: string[];
  alerts: string[];
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
