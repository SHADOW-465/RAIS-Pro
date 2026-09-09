// Deterministic data-coverage summary for reports.
// Absence of a gap record is not proof of calendar completeness.

import type { Event } from "@/lib/store/types";
import { eventEntryDate } from "@/lib/report/date-basis";
import { monthsInInclusiveRange, monthLabel } from "@/lib/report/financial-year";
import { eventSourceChannel, eventSourceFileLabel, eventBatchId } from "./scope";

export interface MonthCoverage {
  key: string;
  label: string;
  qualifyingEventCount: number;
  status: "has-records" | "no-qualifying-records";
}

export interface ReportCoverage {
  qualifyingEventCount: number;
  earliestEntryDate: string | null;
  latestEntryDate: string | null;
  months: MonthCoverage[];
  monthsWithData: number;
  monthsWithoutData: number;
  missingEntryDateCount: number;
  outOfRangeCount: number;
  correctionCount: number;
  annotationCount: number;
  unresolvedStageRejectedQty: number;
  resolvedStageRejectedQty: number;
  unresolvedDefectRejectedQty: number;
  resolvedDefectRejectedQty: number;
  unclassifiedDefectRejectedQty: number;
  sizeTaggedRejectedQty: number;
  missingSizeRejectedQty: number;
  sizeTaggedCheckedQty: number;
  missingSizeCheckedQty: number;
  sourceChannelBreakdown: { excel: number; directEntry: number };
  includedFileCount: number;
  includedBatchCount: number;
  statements: string[];
}

function qty(e: Event): number {
  return "quantity" in e ? Number((e as { quantity?: number }).quantity ?? 0) : 0;
}

function isRejected(e: Event): boolean {
  return (
    (e.eventType === "inspection" && (e as { disposition?: string }).disposition === "rejected") ||
    e.eventType === "rejection"
  );
}

function isProd(e: Event): boolean {
  return e.eventType === "production";
}

function stageId(e: Event): string | null {
  return "stageId" in e ? ((e as { stageId?: string }).stageId ?? null) : null;
}

function defectCode(e: Event): string | null {
  const code = (e as { defectCode?: string | null }).defectCode;
  return code ?? null;
}

function defectRaw(e: Event): string {
  return String((e as { defectCodeRaw?: string }).defectCodeRaw ?? "").trim();
}

function sizeOf(e: Event): string | null {
  if (!("size" in e)) return null;
  const s = (e as { size?: string | null }).size;
  return s && String(s).trim() ? String(s) : null;
}

export function reportCoverage(args: {
  included: Event[];
  missingEntryDate: Event[];
  outOfRange: Event[];
  dateFrom: string;
  dateTo: string;
}): ReportCoverage {
  const { included, missingEntryDate, outOfRange, dateFrom, dateTo } = args;
  const monthKeys = monthsInInclusiveRange(dateFrom, dateTo);
  const byMonth = new Map<string, number>();
  for (const k of monthKeys) byMonth.set(k, 0);

  let earliest: string | null = null;
  let latest: string | null = null;
  let correctionCount = 0;
  let annotationCount = 0;
  let unresolvedStageRejectedQty = 0;
  let resolvedStageRejectedQty = 0;
  let unresolvedDefectRejectedQty = 0;
  let resolvedDefectRejectedQty = 0;
  let unclassifiedDefectRejectedQty = 0;
  let sizeTaggedRejectedQty = 0;
  let missingSizeRejectedQty = 0;
  let sizeTaggedCheckedQty = 0;
  let missingSizeCheckedQty = 0;
  let excel = 0;
  let directEntry = 0;
  const files = new Set<string>();
  const batches = new Set<string>();

  for (const e of included) {
    const day = eventEntryDate(e);
    if (day) {
      const key = day.slice(0, 7);
      if (byMonth.has(key)) byMonth.set(key, (byMonth.get(key) ?? 0) + 1);
      if (earliest === null || day < earliest) earliest = day;
      if (latest === null || day > latest) latest = day;
    }
    if (e.eventType === "correction") correctionCount += 1;
    if (e.eventType === "annotation") annotationCount += 1;

    if (eventSourceChannel(e) === "direct-entry") directEntry += 1;
    else {
      excel += 1;
      const f = eventSourceFileLabel(e);
      if (f) files.add(f);
    }
    const b = eventBatchId(e);
    if (b) batches.add(b);

    const q = qty(e);
    if (isRejected(e)) {
      if (stageId(e)) resolvedStageRejectedQty += q;
      else unresolvedStageRejectedQty += q;

      if (e.eventType === "rejection") {
        if (defectCode(e)) resolvedDefectRejectedQty += q;
        else if (defectRaw(e)) unresolvedDefectRejectedQty += q;
        else unclassifiedDefectRejectedQty += q;
      } else {
        unclassifiedDefectRejectedQty += q;
      }

      if (sizeOf(e)) sizeTaggedRejectedQty += q;
      else missingSizeRejectedQty += q;
    }
    if (isProd(e)) {
      if (sizeOf(e)) sizeTaggedCheckedQty += q;
      else missingSizeCheckedQty += q;
    }
  }

  const months: MonthCoverage[] = monthKeys.map((key) => {
    const n = byMonth.get(key) ?? 0;
    return {
      key,
      label: monthLabel(key),
      qualifyingEventCount: n,
      status: n > 0 ? "has-records" : "no-qualifying-records",
    };
  });
  const monthsWithData = months.filter((m) => m.status === "has-records").length;
  const monthsWithoutData = months.length - monthsWithData;

  const statements: string[] = [];
  statements.push(
    included.length === 0
      ? "No qualifying records found"
      : `${included.length.toLocaleString("en-IN")} qualifying ledger events`,
  );
  if (earliest && latest) {
    statements.push(`Entry dates from ${earliest} to ${latest}`);
  } else {
    statements.push("Coverage could not be established");
  }
  if (months.length > 0) {
    statements.push(
      `${monthsWithData} of ${months.length} months contain qualifying records`,
    );
  }
  const defectDenom =
    resolvedDefectRejectedQty + unresolvedDefectRejectedQty + unclassifiedDefectRejectedQty;
  if (defectDenom > 0) {
    const pct = (resolvedDefectRejectedQty / defectDenom) * 100;
    statements.push(
      `${pct.toFixed(1)}% of rejected quantity on rejection events has a resolved defect code`,
    );
  }
  const sizeRejDenom = sizeTaggedRejectedQty + missingSizeRejectedQty;
  if (sizeRejDenom > 0) {
    const pct = (sizeTaggedRejectedQty / sizeRejDenom) * 100;
    statements.push(`${pct.toFixed(1)}% of rejected quantity has a size tag`);
  }

  return {
    qualifyingEventCount: included.length,
    earliestEntryDate: earliest,
    latestEntryDate: latest,
    months,
    monthsWithData,
    monthsWithoutData,
    missingEntryDateCount: missingEntryDate.length,
    outOfRangeCount: outOfRange.length,
    correctionCount,
    annotationCount,
    unresolvedStageRejectedQty,
    resolvedStageRejectedQty,
    unresolvedDefectRejectedQty,
    resolvedDefectRejectedQty,
    unclassifiedDefectRejectedQty,
    sizeTaggedRejectedQty,
    missingSizeRejectedQty,
    sizeTaggedCheckedQty,
    missingSizeCheckedQty,
    sourceChannelBreakdown: { excel, directEntry },
    includedFileCount: files.size,
    includedBatchCount: batches.size,
    statements,
  };
}

export function coveragePct(part: number, whole: number): number | null {
  if (whole <= 0) return null;
  return (part / whole) * 100;
}
