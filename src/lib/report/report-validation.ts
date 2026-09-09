import type { ReportCoverage } from "@/lib/analytics/report-coverage";
import type { ReportValidation } from "./report-model";

export function validateReportModel(args: {
  includedCount: number;
  coverage: ReportCoverage;
  acceptedUnavailable: boolean;
  missingEntryDateCount: number;
}): ReportValidation {
  const { includedCount, coverage, acceptedUnavailable, missingEntryDateCount } = args;
  const blockers: string[] = [];
  const warnings: string[] = [];

  if (includedCount === 0) {
    blockers.push("No qualifying records found for this Date of Entry range and source filter. The report cannot be exported as audit evidence.");
  }
  if (missingEntryDateCount > 0) {
    warnings.push(
      `${missingEntryDateCount} events have a missing or invalid Date of Entry (recordedAt) and were excluded.`,
    );
  }
  if (coverage.unresolvedStageRejectedQty > 0) {
    warnings.push("Some rejected quantity has no valid stage.");
  }
  if (coverage.unresolvedDefectRejectedQty + coverage.unclassifiedDefectRejectedQty > 0) {
    warnings.push("Some rejected quantity has an unresolved or missing defect code.");
  }
  if (coverage.missingSizeRejectedQty > 0) {
    warnings.push("Some rejected quantity has no size tag.");
  }
  if (acceptedUnavailable) {
    warnings.push("Accepted quantity: Needs company confirmation.");
  }
  if (coverage.monthsWithoutData > 0) {
    warnings.push(
      `${coverage.monthsWithoutData} of ${coverage.months.length} months contain no qualifying records. Coverage could not be established for those months.`,
    );
  }

  return {
    qualifyingEventCount: includedCount,
    earliestEntryDate: coverage.earliestEntryDate,
    latestEntryDate: coverage.latestEntryDate,
    monthsWithData: coverage.monthsWithData,
    monthsWithoutData: coverage.monthsWithoutData,
    unresolvedStages: coverage.unresolvedStageRejectedQty,
    unresolvedDefects: coverage.unresolvedDefectRejectedQty + coverage.unclassifiedDefectRejectedQty,
    missingSizes: coverage.missingSizeRejectedQty,
    acceptedUnavailable,
    missingEntryDateCount,
    blockers,
    warnings,
    canExport: blockers.length === 0,
    coverage: {
      months: coverage.months,
      statements: coverage.statements,
      sourceChannelBreakdown: coverage.sourceChannelBreakdown,
      includedFileCount: coverage.includedFileCount,
      includedBatchCount: coverage.includedBatchCount,
      correctionCount: coverage.correctionCount,
      resolvedDefectRejectedQty: coverage.resolvedDefectRejectedQty,
      unresolvedDefectRejectedQty: coverage.unresolvedDefectRejectedQty,
      unclassifiedDefectRejectedQty: coverage.unclassifiedDefectRejectedQty,
      sizeTaggedRejectedQty: coverage.sizeTaggedRejectedQty,
      missingSizeRejectedQty: coverage.missingSizeRejectedQty,
      resolvedStageRejectedQty: coverage.resolvedStageRejectedQty,
      unresolvedStageRejectedQty: coverage.unresolvedStageRejectedQty,
    },
  };
}
