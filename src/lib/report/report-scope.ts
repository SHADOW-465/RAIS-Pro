// Report scope: explicit configuration, independent of dashboard tweaks.

import type { Event } from "@/lib/store/types";
import {
  type Scope,
  type SourceChannel,
  scopeEvents,
  eventSourceChannel,
  eventSourceFileLabel,
  eventBatchId,
  describeSourceFilter,
} from "@/lib/analytics/scope";
import { DEFAULT_POLICY, type CalculationPolicyT } from "@/core/policy/policy";
import {
  type FinancialYear,
  financialYear,
  fyContaining,
  financialYearsFromDates,
  validateCustomRange,
  isIsoDate,
} from "./financial-year";
import {
  REPORT_DATE_BASIS,
  REPORT_DATE_BASIS_LABEL,
  type ReportDateBasis,
  eventEntryDate,
  partitionByEntryDate,
} from "./date-basis";

export type ReportType =
  | "fy-audit-pack"
  | "fundamentals"
  | "stage"
  | "defect"
  | "size";

export const REPORT_TYPES: { id: ReportType; title: string; description: string }[] = [
  {
    id: "fy-audit-pack",
    title: "Financial Year Audit Pack",
    description: "Cumulative fundamentals plus stage, defect, and size analysis for the selected year.",
  },
  {
    id: "fundamentals",
    title: "Fundamentals Report",
    description: "Checked, rejected, rejection rate, monthly trend, and coverage.",
  },
  {
    id: "stage",
    title: "Stage-wise Analysis Report",
    description: "Authored-order stage table, rejected contribution, and monthly stage trend.",
  },
  {
    id: "defect",
    title: "Defect-wise Analysis Report",
    description: "Defect Pareto, unclassified codes, and coverage of rejected quantity.",
  },
  {
    id: "size",
    title: "Size-wise Analysis Report",
    description: "Size table, contribution, unclassified sizes, and size-tag coverage.",
  },
];

export type ReportPeriodMode = "financial-year" | "custom";

export interface ReportScopeInput {
  reportType: ReportType;
  periodMode: ReportPeriodMode;
  financialYearStartYear?: number;
  dateFrom?: string;
  dateTo?: string;
  /** Confirmed basis. A second basis requires company confirmation — do not add a UI option yet. */
  dateBasis: ReportDateBasis;
  sourceChannels?: SourceChannel[];
  sourceFiles?: string[];
  batchIds?: string[];
  notes?: string;
  title?: string;
  generatedAt: string;
  policy?: CalculationPolicyT;
}

export type ReportScopeError = {
  ok: false;
  error: string;
};

export type ResolvedReportScope = {
  ok: true;
  reportType: ReportType;
  title: string;
  periodMode: ReportPeriodMode;
  periodCaption: string;
  financialYear: FinancialYear | null;
  dateFrom: string;
  dateTo: string;
  dateBasis: ReportDateBasis;
  dateBasisLabel: typeof REPORT_DATE_BASIS_LABEL;
  sourceChannels?: SourceChannel[];
  sourceFiles?: string[];
  batchIds?: string[];
  notes: string;
  generatedAt: string;
  policy: CalculationPolicyT;
  /** Analytics scope with NO date window — dates already applied via Date of Entry. */
  analyticsScope: Scope;
  sourceSummary: string;
  batchSummary: string;
  plantWide: boolean;
};

export function reportTitleFor(type: ReportType, periodCaption: string): string {
  const name = REPORT_TYPES.find((t) => t.id === type)?.title ?? type;
  return `${name} · ${periodCaption}`;
}

export function listFinancialYearsFromEvents(events: Event[]): FinancialYear[] {
  const dates: string[] = [];
  for (const e of events) {
    const d = eventEntryDate(e);
    if (d) dates.push(d);
  }
  const listed = financialYearsFromDates(dates);
  if (listed.length > 0) return listed;
  // Empty ledger: still offer the FY containing today (UTC date floor).
  const today = new Date().toISOString().slice(0, 10);
  return isIsoDate(today) ? [fyContaining(today)] : [financialYear(new Date().getUTCFullYear())];
}

export function defaultFyStartYear(events: Event[]): number {
  const years = listFinancialYearsFromEvents(events);
  return years[0]?.startYear ?? fyContaining(new Date().toISOString().slice(0, 10)).startYear;
}

function channelsFromInput(input: ReportScopeInput): SourceChannel[] | undefined {
  const ch = input.sourceChannels;
  if (!ch) return undefined;
  if (ch.length === 0) return [];
  if (ch.includes("excel") && ch.includes("direct-entry")) return undefined;
  return ch;
}

export function resolveReportScope(input: ReportScopeInput): ResolvedReportScope | ReportScopeError {
  if (input.dateBasis !== REPORT_DATE_BASIS) {
    return { ok: false, error: "Only Date of Entry is a confirmed date basis." };
  }

  let from: string;
  let to: string;
  let fy: FinancialYear | null = null;
  let periodCaption: string;

  if (input.periodMode === "financial-year") {
    const startYear = input.financialYearStartYear;
    if (startYear == null || !Number.isInteger(startYear)) {
      return { ok: false, error: "Select a financial year." };
    }
    fy = financialYear(startYear);
    from = fy.from;
    to = fy.to;
    periodCaption = fy.label;
  } else {
    const checked = validateCustomRange(input.dateFrom ?? "", input.dateTo ?? "");
    if (!checked.ok) return { ok: false, error: checked.error };
    from = checked.from;
    to = checked.to;
    periodCaption = `Custom range ${from} to ${to}`;
  }

  const policy = input.policy ?? DEFAULT_POLICY;
  const sourceChannels = channelsFromInput(input);
  const sourceFiles = input.sourceFiles?.length ? input.sourceFiles : undefined;
  const batchIds = input.batchIds?.length ? input.batchIds.map((b) => b.toUpperCase()) : undefined;

  const analyticsScope: Scope = {
    grain: "month",
    sourceChannels,
    sourceFiles,
    batchIds,
    policy,
  };

  const sourceSummary = describeSourceFilter(analyticsScope);
  const plantWide = !sourceChannels && !sourceFiles && !batchIds;
  const batchSummary = batchIds
    ? batchIds.length === 1
      ? `Batch ${batchIds[0]}`
      : `${batchIds.length} batches`
    : "All batches";

  const title = input.title?.trim() || reportTitleFor(input.reportType, periodCaption);

  return {
    ok: true,
    reportType: input.reportType,
    title,
    periodMode: input.periodMode,
    periodCaption,
    financialYear: fy,
    dateFrom: from,
    dateTo: to,
    dateBasis: REPORT_DATE_BASIS,
    dateBasisLabel: REPORT_DATE_BASIS_LABEL,
    sourceChannels,
    sourceFiles,
    batchIds,
    notes: input.notes?.trim() ?? "",
    generatedAt: input.generatedAt,
    policy,
    analyticsScope,
    sourceSummary,
    batchSummary,
    plantWide,
  };
}

/**
 * Source/batch/channel filter + canonicalize, with no lot-calendar date window.
 * Date of Entry is applied separately via partitionByEntryDate.
 */
export function filterReportPopulation(events: Event[], analyticsScope: Scope): Event[] {
  return scopeEvents(events, analyticsScope);
}

export function qualifyingReportEvents(
  events: Event[],
  resolved: ResolvedReportScope,
): {
  population: Event[];
  included: Event[];
  missingEntryDate: Event[];
  outOfRange: Event[];
} {
  const population = filterReportPopulation(events, resolved.analyticsScope);
  const part = partitionByEntryDate(population, resolved.dateFrom, resolved.dateTo);
  return { population, ...part };
}

export function entryDateBounds(events: Event[]): { min?: string; max?: string } {
  let min: string | undefined;
  let max: string | undefined;
  for (const e of events) {
    const d = eventEntryDate(e);
    if (!d) continue;
    if (min === undefined || d < min) min = d;
    if (max === undefined || d > max) max = d;
  }
  return { min, max };
}

export function countSources(events: Event[]): {
  excel: number;
  directEntry: number;
  files: number;
  batches: number;
} {
  const files = new Set<string>();
  const batches = new Set<string>();
  let excel = 0;
  let directEntry = 0;
  for (const e of events) {
    if (eventSourceChannel(e) === "direct-entry") directEntry += 1;
    else {
      excel += 1;
      const f = eventSourceFileLabel(e);
      if (f) files.add(f);
    }
    const b = eventBatchId(e);
    if (b) batches.add(b);
  }
  return { excel, directEntry, files: files.size, batches: batches.size };
}
