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
  if (grain === "day") return sorted.slice(-15);
  if (grain === "week") return sorted.slice(-12);
  if (grain === "month") return sorted.slice(-12);
  return sorted;
}

/** The latest-period snapshot window + the full-span trend window for an event
 *  set under a grain. Centralizes the snapshot/trend scope math every screen
 *  needs so grain (D/W/M/FY) wires identically everywhere. */
export interface DerivedScopes {
  snapshotScope: Scope;
  trendScope: Scope;
  latestPeriod: string | null;
  latestPeriodLabel: string;
}

export function deriveScopes(events: Event[], grain: Grain): DerivedScopes {
  if (!events.length) {
    return { snapshotScope: { grain }, trendScope: { grain }, latestPeriod: null, latestPeriodLabel: "" };
  }
  const dates = events.map((e) => e.occurredOn.start).sort();
  const trendScope: Scope = { grain, dateFrom: dates[0], dateTo: dates[dates.length - 1] };

  const periods = periodsIn(events, grain);
  const latestPeriod = periods[periods.length - 1] ?? null;

  let snapshotScope: Scope = { grain };
  if (latestPeriod) {
    if (grain === "day") {
      snapshotScope = { grain: "day", dateFrom: latestPeriod, dateTo: latestPeriod };
    } else if (grain === "month") {
      const [y, mStr] = latestPeriod.split("-");
      const lastDay = new Date(Number(y), Number(mStr), 0).getDate();
      snapshotScope = { grain: "month", dateFrom: `${y}-${mStr}-01`, dateTo: `${y}-${mStr}-${String(lastDay).padStart(2, "0")}` };
    } else if (grain === "week") {
      const [y, mStr, wStr] = latestPeriod.split("-");
      const wNum = Number(wStr.replace("W", ""));
      const dStart = String((wNum - 1) * 7 + 1).padStart(2, "0");
      const dEnd = String(Math.min(wNum * 7, 31)).padStart(2, "0");
      snapshotScope = { grain: "week", dateFrom: `${y}-${mStr}-${dStart}`, dateTo: `${y}-${mStr}-${dEnd}` };
    } else if (grain === "fy") {
      const mm = latestPeriod.match(/FY(\d{4})/);
      const startYear = Number(mm ? mm[1] : "2025");
      snapshotScope = { grain: "fy", dateFrom: `${startYear}-04-01`, dateTo: `${startYear + 1}-03-31` };
    }
  }
  return { snapshotScope, trendScope, latestPeriod, latestPeriodLabel: latestPeriod ? periodLabel(latestPeriod) : "" };
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
