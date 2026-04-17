// src/types/analysis.ts
// Types for the two-phase intelligent aggregation pipeline

/** Structural summary of a single sheet, used for AI deduplication classification */
export interface SheetManifest {
  sheetKey: string;        // "filename.xlsx - Sheet1"
  fileName: string;
  sheetName: string;
  rowCount: number;        // after total-row stripping
  totalRowsStripped: number;
  granularity: 'daily' | 'weekly' | 'monthly' | 'quarterly' | 'annual' | 'unknown';
  timeRange: string | null;  // human-readable, e.g. "Jan–Jun 2024"
  isSummaryCandidate: boolean;
  columns: string[];
  numericTotals: Record<string, number>;   // column → SUM
  numericMeans:  Record<string, number>;   // column → MEAN
}

/** One logical source group (e.g. one plant, one time period) */
export interface SheetGroup {
  label: string;       // e.g. "Plant A", "Q1 2024"
  sheets: string[];    // sheetKey values to include
  reason: string;      // why these sheets belong together
}

/** AI-produced deduplication + merge strategy */
export interface MergePlan {
  groups: SheetGroup[];
  excludedSheets: Array<{ sheet: string; reason: string }>;
  crossFileStrategy: 'sum' | 'separate';
  warnings: string[];
}

/** Aggregates for one group, computed deterministically from raw data */
export interface MergedGroup {
  label: string;
  rowCount: number;
  sourceSheets: string[];
  /** column → { sum, mean, min, max } */
  numericAggregates: Record<string, {
    sum: number;
    mean: number;
    min: number;
    max: number;
  }>;
  groupedSeries: import('../lib/parser').GroupedSeries[];
}

/** Final merged result handed to the dashboard prompt */
export interface MergedResult {
  groups: MergedGroup[];
  /** Grand totals across all included groups */
  grandTotals: Record<string, { sum: number; mean: number }>;
  mergePlan: MergePlan;
}
