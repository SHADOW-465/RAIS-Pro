// Historical comparison for the dashboard Rejection Trend card.
// Overlay series and period totals both go through `trend` / `rejectionRate`
// so line, bar, and compare modes never invent a second formula.
//
// Authoritative rate is `rejectionRate()`: the plant's sum-of-section-rates
// rule. Bucket `value`s on a series are that same function on each period.
// Window totals use `rejectionRate` on the whole range — never an average of
// bucket percentages.
//
// Missing history is `noProduction` / null. Zero is never substituted.

import type { Event } from "@/lib/store/types";
import { finiteNumber } from "./finite";
import {
  DERIVED_REGISTRY,
  rejectionRate,
  totalChecked,
  totalRejected,
  trend,
  type Registry,
  type SeriesPoint,
} from "./rejection";
import {
  dateBounds,
  periodKey,
  scopeEvents,
  type Grain,
  type Scope,
} from "./scope";

export type TrendVizMode = "line" | "bar";

export type CompareOffset = "prev-day" | "prev-week" | "prev-month" | "prev-year";

export const COMPARE_LABELS: Record<CompareOffset, string> = {
  "prev-day": "Previous day",
  "prev-week": "Previous week",
  "prev-month": "Previous month",
  "prev-year": "Previous year",
};

/** Offsets that are meaningful for a grain. A year-long overlay on FY is YoY. */
export function offsetsForGrain(grain: Grain): CompareOffset[] {
  switch (grain) {
    case "day":
      return ["prev-day", "prev-week", "prev-month", "prev-year"];
    case "week":
      return ["prev-week", "prev-month", "prev-year"];
    case "month":
      return ["prev-month", "prev-year"];
    case "fy":
      return ["prev-year"];
  }
}

export function defaultOffset(grain: Grain): CompareOffset {
  switch (grain) {
    case "day":
      return "prev-day";
    case "week":
      return "prev-week";
    case "month":
      return "prev-month";
    case "fy":
      return "prev-year";
  }
}

export function parseTrendVizMode(raw: unknown): TrendVizMode {
  return raw === "bar" ? "bar" : "line";
}

/** Compare is a Holidays-style overlay toggle, not a third chart type. */
export function parseCompareEnabled(raw: unknown): boolean {
  return raw === true || raw === "1" || raw === "true" || raw === "on" || raw === "compare";
}

export function parseCompareOffset(raw: unknown, grain: Grain): CompareOffset {
  const allowed = offsetsForGrain(grain);
  return typeof raw === "string" && (allowed as string[]).includes(raw)
    ? (raw as CompareOffset)
    : defaultOffset(grain);
}

export function parseOverlayOffsets(raw: unknown, grain: Grain): CompareOffset[] {
  const allowed = new Set<string>(offsetsForGrain(grain));
  let list: unknown[] = [];
  if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw);
      list = Array.isArray(parsed) ? parsed : raw.split(",");
    } catch {
      list = raw.split(",");
    }
  } else if (Array.isArray(raw)) {
    list = raw;
  }
  const out: CompareOffset[] = [];
  for (const item of list) {
    if (typeof item === "string" && allowed.has(item) && !out.includes(item as CompareOffset)) {
      out.push(item as CompareOffset);
    }
  }
  return out;
}

/** Add `n` calendar days on the UTC date, keeping YYYY-MM-DD. */
export function addCalendarDays(iso: string, n: number): string {
  const t = Date.parse(`${iso}T00:00:00Z`);
  if (!Number.isFinite(t)) return iso;
  return new Date(t + n * 86400000).toISOString().slice(0, 10);
}

/**
 * Shift a calendar date by `n` months. Days that do not exist in the target
 * month clamp to that month's last day (31 Jan → 28/29 Feb).
 */
export function addCalendarMonths(iso: string, n: number): string {
  const y = +iso.slice(0, 4);
  const m = +iso.slice(5, 7);
  const d = +iso.slice(8, 10);
  if (!y || !m || !d) return iso;
  const date = new Date(Date.UTC(y, m - 1 + n, 1));
  const ny = date.getUTCFullYear();
  const nm = date.getUTCMonth();
  const last = new Date(Date.UTC(ny, nm + 1, 0)).getUTCDate();
  const nd = Math.min(d, last);
  return `${ny}-${String(nm + 1).padStart(2, "0")}-${String(nd).padStart(2, "0")}`;
}

export function shiftIso(iso: string, offset: CompareOffset): string {
  switch (offset) {
    case "prev-day":
      return addCalendarDays(iso, -1);
    case "prev-week":
      return addCalendarDays(iso, -7);
    case "prev-month":
      return addCalendarMonths(iso, -1);
    case "prev-year":
      return addCalendarMonths(iso, -12);
  }
}

export function periodStartIso(period: string, grain: Grain): string | null {
  if (grain === "day" && /^\d{4}-\d{2}-\d{2}$/.test(period)) return period;
  if (grain === "month" && /^\d{4}-\d{2}$/.test(period)) return `${period}-01`;
  const w = period.match(/^(\d{4})-(\d{2})-W(\d)$/);
  if (w) {
    const day = (Number(w[3]) - 1) * 7 + 1;
    return `${w[1]}-${w[2]}-${String(day).padStart(2, "0")}`;
  }
  const fy = period.match(/^FY(\d{4})/);
  if (fy) return `${fy[1]}-04-01`;
  return null;
}

export function periodEndIso(period: string, grain: Grain): string | null {
  if (grain === "day" && /^\d{4}-\d{2}-\d{2}$/.test(period)) return period;
  if (grain === "month" && /^\d{4}-\d{2}$/.test(period)) {
    const y = +period.slice(0, 4);
    const m = +period.slice(5, 7);
    const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
    return `${period}-${String(last).padStart(2, "0")}`;
  }
  const w = period.match(/^(\d{4})-(\d{2})-W(\d)$/);
  if (w) {
    const start = (Number(w[3]) - 1) * 7 + 1;
    const y = +w[1];
    const m = +w[2];
    const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
    const end = Math.min(start + 6, last);
    return `${w[1]}-${w[2]}-${String(end).padStart(2, "0")}`;
  }
  const fy = period.match(/^FY(\d{4})/);
  if (fy) return `${Number(fy[1]) + 1}-03-31`;
  return null;
}

/** Equivalent period key under the same grain. Null when the key cannot be parsed. */
export function shiftPeriodKey(period: string, grain: Grain, offset: CompareOffset): string | null {
  const start = periodStartIso(period, grain);
  if (!start) return null;
  return periodKey(shiftIso(start, offset), grain);
}

export function previousEquivalentRange(
  from: string,
  to: string,
  offset: CompareOffset,
): { from: string; to: string } {
  return { from: shiftIso(from, offset), to: shiftIso(to, offset) };
}

function emptyAligned(current: SeriesPoint): SeriesPoint {
  return {
    period: current.period,
    label: current.label,
    value: Number.NaN,
    rejected: 0,
    checked: 0,
    noProduction: true,
  };
}

/**
 * Place an overlay series on the current x-axis by equivalent period, not by
 * array index. Missing history stays `noProduction`.
 */
export function overlaySeries(
  events: Event[],
  scope: Scope,
  current: SeriesPoint[],
  offset: CompareOffset,
  registry: Registry = DERIVED_REGISTRY,
): SeriesPoint[] {
  if (current.length === 0) return [];
  const grain = scope.grain;
  const shiftedKeys = current.map((p) => shiftPeriodKey(p.period, grain, offset));
  const starts: string[] = [];
  const ends: string[] = [];
  for (const key of shiftedKeys) {
    if (!key) continue;
    const s = periodStartIso(key, grain);
    const e = periodEndIso(key, grain);
    if (s) starts.push(s);
    if (e) ends.push(e);
  }
  if (starts.length === 0) return current.map(emptyAligned);

  const overlayScope: Scope = {
    ...scope,
    dateFrom: starts.reduce((a, b) => (a < b ? a : b)),
    dateTo: ends.reduce((a, b) => (a > b ? a : b)),
  };
  const overlayPoints = trend(events, overlayScope, "rejectionRate", registry);
  const byPeriod = new Map(overlayPoints.map((p) => [p.period, p]));

  return current.map((p, i) => {
    const key = shiftedKeys[i];
    const hit = key ? byPeriod.get(key) : undefined;
    if (!hit || hit.noProduction || !Number.isFinite(hit.value)) {
      return {
        ...emptyAligned(p),
        label: hit?.label ?? p.label,
      };
    }
    return {
      period: p.period,
      label: hit.label,
      value: hit.value,
      rejected: hit.rejected,
      checked: hit.checked,
      noProduction: false,
    };
  });
}

export interface PeriodComparison {
  currentRate: number | null;
  previousRate: number | null;
  currentChecked: number;
  currentRejected: number;
  previousChecked: number;
  previousRejected: number;
  /** Current − previous, same 0–1 unit as the rate. Null when either side is missing. */
  deltaRatio: number | null;
  /** (current − previous) / previous. Null when previous is 0 or missing. */
  relativeChange: number | null;
  previousAvailable: boolean;
  /** Lower rejection is an improvement. Null when a side is missing. */
  improved: boolean | null;
}

function liveRate(rate: number, checked: number, noProduction: boolean): number | null {
  if (noProduction || checked <= 0) return null;
  return finiteNumber(rate);
}

export function comparePeriodRates(
  current: { rate: number; checked: number; rejected: number; noProduction?: boolean },
  previous: { rate: number; checked: number; rejected: number; noProduction?: boolean } | null,
): PeriodComparison {
  const currentRate = liveRate(current.rate, current.checked, !!current.noProduction);
  const previousAvailable = !!previous && !previous.noProduction && previous.checked > 0;
  const previousRate = previousAvailable && previous
    ? liveRate(previous.rate, previous.checked, false)
    : null;
  const deltaRatio =
    currentRate != null && previousRate != null ? currentRate - previousRate : null;
  const relativeChange =
    currentRate != null && previousRate != null && previousRate !== 0
      ? (currentRate - previousRate) / previousRate
      : null;
  const improved = deltaRatio == null ? null : deltaRatio < 0;
  return {
    currentRate,
    previousRate,
    currentChecked: current.checked,
    currentRejected: current.rejected,
    previousChecked: previous?.checked ?? 0,
    previousRejected: previous?.rejected ?? 0,
    deltaRatio,
    relativeChange,
    previousAvailable,
    improved,
  };
}

/**
 * Whole-window current vs previous-equivalent comparison.
 * Uses `rejectionRate` on each window (sum of section rates), not an average
 * of daily/weekly percentages.
 */
export function windowComparison(
  events: Event[],
  scope: Scope,
  offset: CompareOffset,
  registry: Registry = DERIVED_REGISTRY,
): PeriodComparison {
  const scoped = scopeEvents(events, scope);
  const bounds = dateBounds(scoped);
  const from = scope.dateFrom ?? bounds.min;
  const to = scope.dateTo ?? bounds.max;
  const currentRate = rejectionRate(events, scope, registry).value;
  const currentChecked = totalChecked(events, scope, registry).value;
  const currentRejected = totalRejected(events, scope).value;
  const currentLive = currentChecked > 0 && Number.isFinite(currentRate);

  if (!from || !to) {
    return comparePeriodRates(
      {
        rate: currentLive ? currentRate : Number.NaN,
        checked: currentChecked,
        rejected: currentRejected,
        noProduction: !currentLive,
      },
      null,
    );
  }

  const prev = previousEquivalentRange(from, to, offset);
  const prevScope: Scope = { ...scope, dateFrom: prev.from, dateTo: prev.to };
  const previousRate = rejectionRate(events, prevScope, registry).value;
  const previousChecked = totalChecked(events, prevScope, registry).value;
  const previousRejected = totalRejected(events, prevScope).value;
  const previousLive = previousChecked > 0 && Number.isFinite(previousRate);

  return comparePeriodRates(
    {
      rate: currentLive ? currentRate : Number.NaN,
      checked: currentChecked,
      rejected: currentRejected,
      noProduction: !currentLive,
    },
    {
      rate: previousLive ? previousRate : Number.NaN,
      checked: previousChecked,
      rejected: previousRejected,
      noProduction: !previousLive,
    },
  );
}
