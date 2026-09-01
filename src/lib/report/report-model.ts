// Serializable deterministic report view model.
// Renderers must not recalculate KPIs; they display these fields.

import type { ReportType, ReportPeriodMode } from "./report-scope";
import type { ReportDateBasis } from "./date-basis";
import type { MonthCoverage } from "@/lib/analytics/report-coverage";
import type { StageAnalysisRow } from "@/lib/analytics/rejection";
import type { DefectAnalysisRow } from "@/lib/analytics/defect";
import type { SizeAnalysisRow } from "@/lib/analytics/size";

export type MetricDisplay =
  | { kind: "number"; value: number; sourceEventIds: string[] }
  | { kind: "ratio"; value: number; sourceEventIds: string[] }
  | { kind: "unavailable"; display: string; policyGap: string };

export type MonthPointStatus = "has-records" | "no-qualifying-records" | "confirmed-zero";

export interface MonthMetricPoint {
  key: string;
  label: string;
  shortLabel: string;
  status: MonthPointStatus;
  qualifyingEventCount: number;
  checked: number | null;
  rejected: number | null;
  rejectionRate: number | null;
}

export interface DeterministicPattern {
  id: string;
  title: string;
  value: string;
  period?: string;
  rule: string;
}

export interface ReportIdentity {
  reportType: ReportType;
  title: string;
  periodCaption: string;
  periodMode: ReportPeriodMode;
  dateFrom: string;
  dateTo: string;
  dateBasis: ReportDateBasis;
  dateBasisLabel: string;
  sourceSummary: string;
  batchSummary: string;
  plantWide: boolean;
  generatedAt: string;
  calculationBasis: string;
  policyReworkCountsAs: string;
  notes: string;
}

export interface FundamentalsSection {
  checked: MetricDisplay;
  rejected: MetricDisplay;
  rejectionRate: MetricDisplay;
  accepted: MetricDisplay;
  fpy: MetricDisplay;
  monthly: MonthMetricPoint[];
  patterns: DeterministicPattern[];
}

export interface StageSection {
  rows: StageAnalysisRow[];
  rejectedDenominator: number;
  rejectedDenominatorNote: string;
  monthly: { key: string; label: string; shortLabel: string; perStage: Record<string, number> }[];
  unmappedEventCount: number;
}

export interface DefectSection {
  rows: DefectAnalysisRow[];
  rejectedDenominator: number;
  denominatorNote: string;
  topN: DefectAnalysisRow[];
  otherRejected: number;
  monthly: { key: string; label: string; shortLabel: string; perDefect: Record<string, number> }[];
}

export interface SizeSection {
  rows: SizeAnalysisRow[];
  rejectedDenominator: number;
  rejectedDenominatorNote: string;
  checkedTaggedDenominator: number;
  checkedDenominatorNote: string;
  monthly: { key: string; label: string; shortLabel: string; perSize: Record<string, number> }[];
  sizeTaggedEventCount: number;
  missingSizeEventCount: number;
}

export interface EvidenceRow {
  eventId: string;
  entryDate: string | null;
  eventType: string;
  stageId: string | null;
  size: string | null;
  quantity: number | null;
  file: string | null;
}

export interface EvidenceSection {
  rows: EvidenceRow[];
  total: number;
  truncated: boolean;
  truncationNote: string | null;
}

export interface SignOffSection {
  label: string;
  fields: { id: string; label: string }[];
}

export interface ReportValidation {
  qualifyingEventCount: number;
  earliestEntryDate: string | null;
  latestEntryDate: string | null;
  monthsWithData: number;
  monthsWithoutData: number;
  unresolvedStages: number;
  unresolvedDefects: number;
  missingSizes: number;
  acceptedUnavailable: boolean;
  missingEntryDateCount: number;
  blockers: string[];
  warnings: string[];
  canExport: boolean;
  coverage: {
    months: MonthCoverage[];
    statements: string[];
    sourceChannelBreakdown: { excel: number; directEntry: number };
    includedFileCount: number;
    includedBatchCount: number;
    correctionCount: number;
    resolvedDefectRejectedQty: number;
    unresolvedDefectRejectedQty: number;
    unclassifiedDefectRejectedQty: number;
    sizeTaggedRejectedQty: number;
    missingSizeRejectedQty: number;
    resolvedStageRejectedQty: number;
    unresolvedStageRejectedQty: number;
  };
}

export interface ReportViewModel {
  identity: ReportIdentity;
  validation: ReportValidation;
  limitations: string[];
  fundamentals: FundamentalsSection | null;
  stage: StageSection | null;
  defect: DefectSection | null;
  size: SizeSection | null;
  evidence: EvidenceSection;
  signOff: SignOffSection;
}

export const CALCULATION_BASIS =
  "Headline rejection rate is the sum of each section’s rejected ÷ its own entry-gate checked. Checked is the sum of section entry gates (sequential gates inside a section are not added). Rejected is summed across gates. Date basis is Date of Entry (ledger recordedAt).";

export const SIGN_OFF_FIELDS: { id: string; label: string }[] = [
  { id: "prepared-by", label: "Prepared by" },
  { id: "reviewed-by", label: "Reviewed by" },
  { id: "approved-by", label: "Approved by" },
  { id: "signature", label: "Signature" },
  { id: "date", label: "Date" },
];
