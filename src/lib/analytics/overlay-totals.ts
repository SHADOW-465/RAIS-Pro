// Merge a server totals payload onto a screen that already computed the same
// selectors locally. Local rows keep their order and any field the payload
// does not replace. A missing or failed payload is not passed in: the caller
// keeps the local object.

import type { PlantTotals } from "./plant-totals";
import type { DefectAnalysisRow } from "./defect";
import type {
  ReportViewModel,
  MetricDisplay,
  StageSection,
  DefectSection,
} from "@/lib/report/report-model";
import { fundamentalsPatterns } from "@/lib/report/report-patterns";

export interface StageNumbers {
  stageId: string;
  checked: number;
  good: number;
  rework: number;
  rejected: number;
  rejRate: number;
  yield: number;
  contributionPct: number;
}

/** Keep local order and labels. Copy the stage sums. Append stages only the server has. */
export function overlayStageRows<T extends StageNumbers>(local: T[], server: T[]): T[] {
  const byId = new Map(server.map((row) => [row.stageId, row]));
  const seen = new Set<string>();
  const merged = local.map((row) => {
    const next = byId.get(row.stageId);
    if (!next) return row;
    seen.add(row.stageId);
    return {
      ...row,
      checked: next.checked,
      good: next.good,
      rework: next.rework,
      rejected: next.rejected,
      rejRate: next.rejRate,
      yield: next.yield,
      contributionPct: next.contributionPct,
    };
  });
  for (const row of server) {
    if (!seen.has(row.stageId)) merged.push(row);
  }
  return merged;
}

/**
 * JSON has no NaN. The totals route stores a no-production rate as null.
 * Restore that to NaN before mean / UCL / LCL, which is what `trend()` returns.
 * A finite value is kept, including a COPQ zero — do not pass COPQ points here,
 * because an empty COPQ bucket is 0 with noProduction set.
 */
export function restoreTrend<T extends { value: number | null; noProduction?: boolean }>(
  points: T[],
): Array<Omit<T, "value"> & { value: number }> {
  return points.map((point) => ({
    ...point,
    value: point.value == null || point.noProduction ? Number.NaN : point.value,
  }));
}

/** COPQ buckets are 0 when there is nothing to cost. A null from JSON is that 0. */
export function restoreCopqTrend<T extends { value: number | null }>(
  points: T[],
): Array<Omit<T, "value"> & { value: number }> {
  return points.map((point) => ({
    ...point,
    value: typeof point.value === "number" && Number.isFinite(point.value) ? point.value : 0,
  }));
}

/** Dashboard headline block. Accepted is checked − rejected, matching that page. */
export function headlineFigures(headlines: PlantTotals["headlines"]): {
  rate: number;
  rejected: number;
  checked: number;
  accepted: number;
  acceptedRate: number;
  fpy: number;
  copq: number;
  savings: number;
} {
  const checked = headlines.totalChecked;
  const rejected = headlines.totalRejected;
  const rate = headlines.rejectionRate;
  return {
    rate,
    rejected,
    checked,
    accepted: Math.max(0, checked - rejected),
    acceptedRate: checked > 0 ? (checked - rejected) / checked : Math.max(0, 1 - rate),
    fpy: headlines.fpy,
    copq: headlines.copq ?? 0,
    savings: headlines.savings ?? 0,
  };
}

function withMetricValue<T extends MetricDisplay>(metric: T, value: number): T {
  if (metric.kind === "unavailable") return metric;
  return { ...metric, value };
}

function overlayStageSection(section: StageSection, totals: PlantTotals): StageSection {
  const analysis = totals.stageAnalysis;
  return {
    ...section,
    rows: analysis.rows,
    rejectedDenominator: analysis.rejectedDenominator,
    unmappedEventCount: analysis.unmappedEventCount,
  };
}

function overlayDefectSection(section: DefectSection, totals: PlantTotals): DefectSection {
  const rows = totals.defectAnalysis.rows;
  const n = section.topN.length;
  const topN: DefectAnalysisRow[] = rows.slice(0, n);
  const otherRejected = rows.slice(n).reduce((sum, row) => sum + row.rejected, 0);
  return {
    ...section,
    rows,
    topN,
    otherRejected,
    rejectedDenominator: totals.defectAnalysis.rejectedDenominator,
  };
}

/**
 * Replace report headline values and the stage / defect tables.
 * Monthly series, size, evidence, and an unavailable accepted metric stay.
 */
export function overlayReportModel(model: ReportViewModel, totals: PlantTotals): ReportViewModel {
  const stage = model.stage ? overlayStageSection(model.stage, totals) : model.stage;
  const defect = model.defect ? overlayDefectSection(model.defect, totals) : model.defect;
  const fundamentals = model.fundamentals
    ? {
        ...model.fundamentals,
        checked: withMetricValue(model.fundamentals.checked, totals.headlines.totalChecked),
        rejected: withMetricValue(model.fundamentals.rejected, totals.headlines.totalRejected),
        rejectionRate: withMetricValue(model.fundamentals.rejectionRate, totals.headlines.rejectionRate),
        fpy: withMetricValue(model.fundamentals.fpy, totals.headlines.fpy),
        patterns:
          model.size && stage && defect
            ? fundamentalsPatterns(model.fundamentals.monthly, stage.rows, defect.rows, model.size.rows)
            : model.fundamentals.patterns,
      }
    : model.fundamentals;
  return { ...model, fundamentals, stage, defect };
}
