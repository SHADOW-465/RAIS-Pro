import type { Event } from "@/lib/store/types";
import {
  totalChecked,
  totalRejected,
  rejectionRate,
  fpy,
  stageAnalysis,
  DERIVED_REGISTRY,
  type Registry,
} from "@/lib/analytics/rejection";
import { plantAcceptedQuantity } from "@/lib/analytics/accepted";
import { defectAnalysis } from "@/lib/analytics/defect";
import { sizeAnalysis } from "@/lib/analytics/size";
import { reportCoverage } from "@/lib/analytics/report-coverage";
import { eventEntryDate } from "./date-basis";
import { monthsInInclusiveRange, monthLabel, monthShortLabel } from "./financial-year";
import {
  type ReportScopeInput,
  type ResolvedReportScope,
  resolveReportScope,
  qualifyingReportEvents,
} from "./report-scope";
import { fundamentalsPatterns } from "./report-patterns";
import {
  CALCULATION_BASIS,
  SIGN_OFF_FIELDS,
  type ReportViewModel,
  type MonthMetricPoint,
  type FundamentalsSection,
  type StageSection,
  type DefectSection,
  type SizeSection,
  type EvidenceSection,
  type MetricDisplay,
} from "./report-model";
import { validateReportModel } from "./report-validation";

const EVIDENCE_PRINT_CAP = 80;
const DEFECT_TOP_N = 8;

function metricNumber(value: number, sourceEventIds: string[]): MetricDisplay {
  return { kind: "number", value, sourceEventIds };
}

function metricRatio(value: number, sourceEventIds: string[]): MetricDisplay {
  return { kind: "ratio", value, sourceEventIds };
}

function bucketByEntryMonth(events: Event[]): Map<string, Event[]> {
  const map = new Map<string, Event[]>();
  for (const e of events) {
    const day = eventEntryDate(e);
    if (!day) continue;
    const key = day.slice(0, 7);
    const list = map.get(key);
    if (list) list.push(e);
    else map.set(key, [e]);
  }
  return map;
}

function monthlyFundamentals(
  included: Event[],
  resolved: ResolvedReportScope,
  registry: Registry,
): MonthMetricPoint[] {
  const keys = monthsInInclusiveRange(resolved.dateFrom, resolved.dateTo);
  const buckets = bucketByEntryMonth(included);
  const sub = resolved.analyticsScope;
  return keys.map((key) => {
    const bucket = buckets.get(key) ?? [];
    const label = monthLabel(key);
    const shortLabel = monthShortLabel(key);
    if (bucket.length === 0) {
      return {
        key,
        label,
        shortLabel,
        status: "no-qualifying-records",
        qualifyingEventCount: 0,
        checked: null,
        rejected: null,
        rejectionRate: null,
      };
    }
    const checked = totalChecked(bucket, sub, registry).value;
    const rejected = totalRejected(bucket, sub).value;
    const rate = rejectionRate(bucket, sub, registry).value;
    const confirmedZero = checked === 0 && rejected === 0;
    return {
      key,
      label,
      shortLabel,
      status: confirmedZero ? "confirmed-zero" : "has-records",
      qualifyingEventCount: bucket.length,
      checked,
      rejected,
      rejectionRate: checked > 0 || rate > 0 ? rate : confirmedZero ? 0 : null,
    };
  });
}

function buildFundamentals(
  included: Event[],
  resolved: ResolvedReportScope,
  registry: Registry,
  stages: StageSection,
  defects: DefectSection,
  sizes: SizeSection,
): FundamentalsSection {
  const scope = resolved.analyticsScope;
  const checked = totalChecked(included, scope, registry);
  const rejected = totalRejected(included, scope);
  const rate = rejectionRate(included, scope, registry);
  const yieldMetric = fpy(included, scope, registry);
  const accepted = plantAcceptedQuantity(included, scope);
  const monthly = monthlyFundamentals(included, resolved, registry);
  return {
    checked: metricNumber(checked.value, checked.sourceEventIds),
    rejected: metricNumber(rejected.value, rejected.sourceEventIds),
    rejectionRate: metricRatio(rate.value, rate.sourceEventIds),
    accepted: {
      kind: "unavailable",
      display: accepted.display,
      policyGap: accepted.policyGap,
    },
    fpy: metricRatio(yieldMetric.value, yieldMetric.sourceEventIds),
    monthly,
    patterns: fundamentalsPatterns(monthly, stages.rows, defects.rows, sizes.rows),
  };
}

function buildStage(included: Event[], resolved: ResolvedReportScope, registry: Registry): StageSection {
  const analysis = stageAnalysis(included, resolved.analyticsScope, registry);
  const keys = monthsInInclusiveRange(resolved.dateFrom, resolved.dateTo);
  const buckets = bucketByEntryMonth(included);
  const labels = analysis.rows.filter((r) => !r.unmapped).map((r) => r.stageId);
  const monthly = keys.map((key) => {
    const bucket = buckets.get(key) ?? [];
    const perStage: Record<string, number> = {};
    for (const id of labels) perStage[id] = 0;
    if (bucket.length > 0) {
      const rows = stageAnalysis(bucket, resolved.analyticsScope, registry).rows;
      for (const r of rows) {
        if (r.unmapped) continue;
        perStage[r.stageId] = r.rejected;
      }
    }
    return { key, label: monthLabel(key), shortLabel: monthShortLabel(key), perStage };
  });
  return {
    rows: analysis.rows,
    rejectedDenominator: analysis.rejectedDenominator,
    rejectedDenominatorNote: analysis.rejectedDenominatorNote,
    monthly,
    unmappedEventCount: analysis.unmappedEventCount,
  };
}

function buildDefect(included: Event[], resolved: ResolvedReportScope, registry: Registry): DefectSection {
  const analysis = defectAnalysis(included, resolved.analyticsScope, registry);
  const topN = analysis.rows.slice(0, DEFECT_TOP_N);
  const otherRejected = analysis.rows.slice(DEFECT_TOP_N).reduce((a, r) => a + r.rejected, 0);
  const keys = monthsInInclusiveRange(resolved.dateFrom, resolved.dateTo);
  const buckets = bucketByEntryMonth(included);
  const topLabels = topN.map((r) => r.label);
  const monthly = keys.map((key) => {
    const bucket = buckets.get(key) ?? [];
    const perDefect: Record<string, number> = {};
    for (const l of topLabels) perDefect[l] = 0;
    if (bucket.length > 0) {
      const rows = defectAnalysis(bucket, resolved.analyticsScope, registry).rows;
      for (const r of rows) {
        if (r.label in perDefect) perDefect[r.label] = r.rejected;
      }
    }
    return { key, label: monthLabel(key), shortLabel: monthShortLabel(key), perDefect };
  });
  return {
    rows: analysis.rows,
    rejectedDenominator: analysis.rejectedDenominator,
    denominatorNote: analysis.denominatorNote,
    topN,
    otherRejected,
    monthly,
  };
}

function buildSize(included: Event[], resolved: ResolvedReportScope): SizeSection {
  const analysis = sizeAnalysis(included, resolved.analyticsScope);
  const keys = monthsInInclusiveRange(resolved.dateFrom, resolved.dateTo);
  const buckets = bucketByEntryMonth(included);
  const sizeKeys = analysis.rows.map((r) => r.size);
  const monthly = keys.map((key) => {
    const bucket = buckets.get(key) ?? [];
    const perSize: Record<string, number> = {};
    for (const s of sizeKeys) perSize[s] = 0;
    if (bucket.length > 0) {
      const rows = sizeAnalysis(bucket, resolved.analyticsScope).rows;
      for (const r of rows) {
        if (r.size in perSize) perSize[r.size] = r.rejected;
      }
    }
    return { key, label: monthLabel(key), shortLabel: monthShortLabel(key), perSize };
  });
  return {
    rows: analysis.rows,
    rejectedDenominator: analysis.rejectedDenominator,
    rejectedDenominatorNote: analysis.rejectedDenominatorNote,
    checkedTaggedDenominator: analysis.checkedTaggedDenominator,
    checkedDenominatorNote: analysis.checkedDenominatorNote,
    monthly,
    sizeTaggedEventCount: analysis.sizeTaggedEventCount,
    missingSizeEventCount: analysis.missingSizeEventCount,
  };
}

function buildEvidence(included: Event[]): EvidenceSection {
  const total = included.length;
  const slice = included.slice(0, EVIDENCE_PRINT_CAP);
  const rows = slice.map((e) => ({
    eventId: e.eventId,
    entryDate: eventEntryDate(e),
    eventType: e.eventType,
    stageId: "stageId" in e ? ((e as { stageId?: string }).stageId ?? null) : null,
    size: "size" in e ? ((e as { size?: string | null }).size ?? null) : null,
    quantity: "quantity" in e ? Number((e as { quantity?: number }).quantity ?? 0) : null,
    file: e.provenance?.file ?? null,
  }));
  const truncated = total > EVIDENCE_PRINT_CAP;
  return {
    rows,
    total,
    truncated,
    truncationNote: truncated
      ? `Printable appendix shows ${EVIDENCE_PRINT_CAP} of ${total.toLocaleString("en-IN")} qualifying events. Download the evidence manifest for the complete list.`
      : null,
  };
}

export type BuildReportResult =
  | { ok: true; model: ReportViewModel; scope: ResolvedReportScope }
  | { ok: false; error: string };

/**
 * Build a serializable report view model. Preview and print must consume this
 * object — never recompute KPIs in JSX.
 */
export function buildReport(
  events: Event[],
  input: ReportScopeInput,
  registry: Registry = DERIVED_REGISTRY,
): BuildReportResult {
  const resolved = resolveReportScope(input);
  if (!resolved.ok) return resolved;

  const { included, missingEntryDate, outOfRange } = qualifyingReportEvents(events, resolved);
  const coverage = reportCoverage({
    included,
    missingEntryDate,
    outOfRange,
    dateFrom: resolved.dateFrom,
    dateTo: resolved.dateTo,
  });

  const wantsFund = resolved.reportType === "fy-audit-pack" || resolved.reportType === "fundamentals";
  const wantsStage = resolved.reportType === "fy-audit-pack" || resolved.reportType === "stage";
  const wantsDefect = resolved.reportType === "fy-audit-pack" || resolved.reportType === "defect";
  const wantsSize = resolved.reportType === "fy-audit-pack" || resolved.reportType === "size";

  const stage = wantsStage || wantsFund ? buildStage(included, resolved, registry) : null;
  const defect = wantsDefect || wantsFund ? buildDefect(included, resolved, registry) : null;
  const size = wantsSize || wantsFund ? buildSize(included, resolved) : null;

  const fundamentals =
    wantsFund && stage && defect && size
      ? buildFundamentals(included, resolved, registry, stage, defect, size)
      : null;

  const limitations: string[] = [];
  limitations.push(CALCULATION_BASIS);
  if (fundamentals?.accepted.kind === "unavailable") {
    limitations.push(fundamentals.accepted.policyGap);
  }
  limitations.push(
    "A second custom-range date basis has not been confirmed. This report uses Date of Entry only.",
  );
  if (coverage.missingEntryDateCount > 0) {
    limitations.push(
      `${coverage.missingEntryDateCount} events in the source/batch filter have a missing or invalid recordedAt and were excluded (not reassigned to lot date or occurredOn).`,
    );
  }
  if (coverage.monthsWithoutData > 0) {
    limitations.push(
      `${coverage.monthsWithoutData} of ${coverage.months.length} months have no qualifying records. That is not a completeness certificate.`,
    );
  }

  const model: ReportViewModel = {
    identity: {
      reportType: resolved.reportType,
      title: resolved.title,
      periodCaption: resolved.periodCaption,
      periodMode: resolved.periodMode,
      dateFrom: resolved.dateFrom,
      dateTo: resolved.dateTo,
      dateBasis: resolved.dateBasis,
      dateBasisLabel: resolved.dateBasisLabel,
      sourceSummary: resolved.plantWide ? "All plant data" : resolved.sourceSummary,
      batchSummary: resolved.batchSummary,
      plantWide: resolved.plantWide,
      generatedAt: resolved.generatedAt,
      calculationBasis: CALCULATION_BASIS,
      policyReworkCountsAs: resolved.policy.reworkCountsAs,
      notes: resolved.notes,
    },
    validation: validateReportModel({
      includedCount: included.length,
      coverage,
      acceptedUnavailable: true,
      missingEntryDateCount: missingEntryDate.length,
    }),
    limitations,
    fundamentals: wantsFund ? fundamentals : null,
    stage: wantsStage ? stage : null,
    defect: wantsDefect ? defect : null,
    size: wantsSize ? size : null,
    evidence: buildEvidence(included),
    signOff: {
      label: "Fields to be completed by authorized personnel. Identities are not prefilled.",
      fields: SIGN_OFF_FIELDS,
    },
  };

  return { ok: true, model, scope: resolved };
}

const FORBIDDEN_SNIPPETS = [
  "simulated leak",
  "COMPLIANT",
  "automatically escalated",
  "real-time monitoring",
  "tamper-evasion",
  "CAPA-P01-26",
  "CAPA-P17-26",
  "official validated",
];

/** True when the serialized model contains a prohibited forensic claim. */
export function modelContainsForbiddenClaim(model: ReportViewModel): string | null {
  const blob = JSON.stringify(model).toLowerCase();
  for (const s of FORBIDDEN_SNIPPETS) {
    if (blob.includes(s.toLowerCase())) return s;
  }
  return null;
}

export function sanitizeReportFilename(parts: string[]): string {
  const raw = parts.filter(Boolean).join("-");
  return (
    raw
      .replace(/[–—]/g, "-")
      .replace(/[^a-zA-Z0-9._-]+/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 120) || "moid-report"
  );
}

export function reportFilename(model: ReportViewModel): string {
  const type =
    model.identity.reportType === "fy-audit-pack"
      ? "FY-Audit-Pack"
      : model.identity.reportType === "fundamentals"
        ? "Fundamentals"
        : model.identity.reportType === "stage"
          ? "Stage-wise"
          : model.identity.reportType === "defect"
            ? "Defect-wise"
            : "Size-wise";
  const period =
    model.identity.periodMode === "financial-year"
      ? model.identity.periodCaption
      : `${model.identity.dateFrom}_to_${model.identity.dateTo}`;
  const day = model.identity.generatedAt.slice(0, 10);
  return `${sanitizeReportFilename(["MOID", type, period, day])}.pdf`;
}
