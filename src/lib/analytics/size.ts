import { type Scope, scopeEvents, periodBucket, periodLabel, periodsIn } from "./scope";
import type { SeriesPoint } from "./rejection";
import type { Event } from "@/lib/store/types";
import { bySize } from "./defect";

export interface SizeAnalysisRow {
  size: string;
  checked: number;
  rejected: number;
  rejRate: number | null;
  rejectedContributionPct: number | null;
  checkedContributionPct: number | null;
  rank: number | null;
  unclassified: boolean;
  status: "has-records" | "no-qualifying-records";
}

export interface SizeAnalysis {
  rows: SizeAnalysisRow[];
  /** Rejected among the size-analysis population (tagged + unclassified). */
  rejectedDenominator: number;
  rejectedDenominatorNote: "size rejected / total rejected among the size-analysis population × 100";
  /** Checked among size-tagged records only. */
  checkedTaggedDenominator: number;
  checkedDenominatorNote: "size checked / total checked among size-tagged records × 100";
  sizeTaggedEventCount: number;
  missingSizeEventCount: number;
}

function sizeOf(e: Event): string | null {
  if (!("size" in e)) return null;
  const s = (e as { size?: string | null }).size;
  return s && String(s).trim() ? String(s) : null;
}

function qty(e: Event): number {
  return "quantity" in e ? Number((e as { quantity?: number }).quantity ?? 0) : 0;
}

/**
 * Size-wise report. Unclassified (missing size) is an explicit row.
 * Never fabricates a default size. Checked contribution uses size-tagged
 * checked as the denominator — not the full plant checked population.
 */
export function sizeAnalysis(events: Event[], scope: Scope): SizeAnalysis {
  const ev = scopeEvents(events, scope);
  const tagged = bySize(events, scope);
  let unChecked = 0;
  let unRejected = 0;
  let missingSizeEventCount = 0;
  let sizeTaggedEventCount = 0;
  for (const e of ev) {
    const size = sizeOf(e);
    if (size) {
      sizeTaggedEventCount += 1;
      continue;
    }
    if (e.eventType === "production" || e.eventType === "inspection" || e.eventType === "rejection") {
      missingSizeEventCount += 1;
      if (e.eventType === "production") unChecked += qty(e);
      else if (e.eventType === "inspection" && (e as { disposition?: string }).disposition === "rejected") {
        unRejected += qty(e);
      } else if (e.eventType === "rejection") {
        unRejected += qty(e);
      }
    }
  }

  const taggedRejected = tagged.reduce((a, r) => a + r.rejected, 0);
  const taggedChecked = tagged.reduce((a, r) => a + r.checked, 0);
  const rejectedDenom = taggedRejected + unRejected;

  const rows: SizeAnalysisRow[] = tagged.map((r) => ({
    size: r.size,
    checked: r.checked,
    rejected: r.rejected,
    rejRate: r.checked > 0 ? r.rejRate : r.rejected > 0 ? null : 0,
    rejectedContributionPct: rejectedDenom > 0 ? (r.rejected / rejectedDenom) * 100 : 0,
    checkedContributionPct: taggedChecked > 0 ? (r.checked / taggedChecked) * 100 : 0,
    rank: null,
    unclassified: false,
    status: "has-records" as const,
  }));

  if (missingSizeEventCount > 0) {
    rows.push({
      size: "Unclassified",
      checked: unChecked,
      rejected: unRejected,
      rejRate: unChecked > 0 ? unRejected / unChecked : unRejected > 0 ? null : 0,
      rejectedContributionPct: rejectedDenom > 0 ? (unRejected / rejectedDenom) * 100 : 0,
      checkedContributionPct: null,
      rank: null,
      unclassified: true,
      status: "has-records",
    });
  }

  const ranked = [...rows].sort((a, b) => b.rejected - a.rejected);
  ranked.forEach((r, i) => {
    r.rank = i + 1;
  });

  return {
    rows,
    rejectedDenominator: rejectedDenom,
    rejectedDenominatorNote: "size rejected / total rejected among the size-analysis population × 100",
    checkedTaggedDenominator: taggedChecked,
    checkedDenominatorNote: "size checked / total checked among size-tagged records × 100",
    sizeTaggedEventCount,
    missingSizeEventCount,
  };
}

export function sizeTrend(events: Event[], scope: Scope, size: string): SeriesPoint[] {
  const allEvents = scopeEvents(events, scope);
  const ev = allEvents.filter((e) => "size" in e && (e as any).size === size);
  const periods = periodsIn(allEvents, scope.grain, { from: scope.dateFrom, to: scope.dateTo });
  return periods.map((p) => {
    const bucket = periodBucket(ev, scope.grain, p);
    let checked = 0;
    let rejected = 0;
    for (const e of bucket) {
      if (e.eventType === "production") checked += (e as any).quantity;
      else if (e.eventType === "inspection" && (e as any).disposition === "rejected") rejected += (e as any).quantity;
    }
    return {
      period: p,
      label: periodLabel(p),
      value: checked > 0 ? rejected / checked : 0,
      rejected,
      checked,
    };
  });
}
