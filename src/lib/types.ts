export interface KPIMetric {
  value: string | number;
  trend?: number;
  unit?: string;
  context?: string;
}

export interface ChartDataset {
  label?: string;
  data: number[];
  borderColor?: string;
  backgroundColor?: string | string[];
  fill?: boolean;
  tension?: number;
}

export interface ChartConfig {
  title: string;
  type: "line" | "bar" | "doughnut";
  data: {
    labels: string[];
    datasets: ChartDataset[];
  };
}

export interface AlertConfig {
  message: string;
  type: "danger" | "warning" | "info";
}

export interface AnalysisResult {
  id?: string;
  executiveSummary: string;
  kpis: {
    rejectionRate: KPIMetric;
    totalOutput: KPIMetric;
    downtime: KPIMetric;
    qualityScore: KPIMetric;
  };
  insights: string[];
  recommendations: string[];
  alerts: AlertConfig[];
  charts: ChartConfig[];
  sourceFiles?: string[];
}
