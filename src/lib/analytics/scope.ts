// Analytics scope: filter the event set + bucket by period (plan 02).
// FY = April–March. Pure functions; no I/O.

import type { Event } from "@/lib/store/types";

export type Grain = "day" | "week" | "month" | "fy";

export interface Scope {
  dateFrom?: string; // ISO yyyy-mm-dd (inclusive)
  dateTo?: string;   // ISO yyyy-mm-dd (inclusive)
  stageIds?: string[];
  sizes?: string[];
  grain: Grain;
  // V2 dimensions — ignored by selectors until events carry them.
  shift?: string;
  productIds?: string[];
  machineIds?: string[];
  operatorIds?: string[];
}

export const DEFAULT_SCOPE: Scope = { grain: "month" };

function stageOf(e: Event): string | null {
  return "stageId" in e ? (e.stageId as string) : null;
}
function sizeOf(e: Event): string | null {
  return "size" in e ? ((e.size as string | null) ?? null) : null;
}

/** Apply the scope's date/stage/size filters. Events without a stage/size are
 *  kept (selectors decide relevance); date is matched on overlap. */
export function scopeEvents(events: Event[], scope: Scope): Event[] {
  return events.filter((e) => {
    if (scope.dateFrom && e.occurredOn.end < scope.dateFrom) return false;
    if (scope.dateTo && e.occurredOn.start > scope.dateTo) return false;
    if (scope.stageIds?.length) {
      const s = stageOf(e);
      if (s != null && !scope.stageIds.includes(s)) return false;
    }
    if (scope.sizes?.length) {
      const s = sizeOf(e);
      if (s != null && !scope.sizes.includes(s)) return false;
    }
    return true;
  });
}

/** Bucket key for a date under a grain. FY runs Apr(4)–Mar(3). */
export function periodKey(iso: string, grain: Grain): string {
  const [y, m, d] = iso.split("-").map(Number);
  switch (grain) {
    case "day":
      return iso;
    case "month":
      return `${y}-${String(m).padStart(2, "0")}`;
    case "fy": {
      const fy = m >= 4 ? y : y - 1;
      return `FY${fy}-${String((fy + 1) % 100).padStart(2, "0")}`;
    }
    case "week": {
      const week = Math.floor((d - 1) / 7) + 1; // week-of-month 1..5
      return `${y}-${String(m).padStart(2, "0")}-W${week}`;
    }
  }
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** Human label for a period key (e.g. "2025-04" → "Apr-25"). */
export function periodLabel(key: string): string {
  const d = key.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (d) return `${d[3]} ${MONTHS[Number(d[2]) - 1]}`;
  const m = key.match(/^(\d{4})-(\d{2})$/);
  if (m) return `${MONTHS[Number(m[2]) - 1]}-${m[1].slice(2)}`;
  const w = key.match(/^(\d{4})-(\d{2})-W(\d)$/);
  if (w) return `W${w[3]} (${MONTHS[Number(w[2]) - 1]})`;
  if (key.startsWith("FY")) {
    return key.replace("FY20", "FY");
  }
  return key;
}

/** Chronologically sorted distinct period keys present in the events. */
export function periodsIn(events: Event[], grain: Grain): string[] {
  const keys = new Set<string>();
  for (const e of events) keys.add(periodKey(e.occurredOn.start, grain));
  const sorted = [...keys].sort();
  return sorted;
}

/** The immediately-prior equal-length window, for "vs previous period" deltas. */
export function prevWindow(scope: Scope): Scope {
  if (!scope.dateFrom || !scope.dateTo) return scope;
  const from = new Date(scope.dateFrom + "T00:00:00Z").getTime();
  const to = new Date(scope.dateTo + "T00:00:00Z").getTime();
  const day = 86_400_000;
  const len = to - from + day;
  const pTo = from - day;
  const pFrom = pTo - len + day;
  const iso = (ms: number) => new Date(ms).toISOString().slice(0, 10);
  return { ...scope, dateFrom: iso(pFrom), dateTo: iso(pTo) };
}
