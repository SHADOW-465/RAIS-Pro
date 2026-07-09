// src/lib/entry/period.ts
// Turns (grain, anchorDate) into the row range MonthlyEntryGrid should
// render, and steps the anchor forward/backward by one grain-unit for the
// Prev/Next nav buttons. FY is not a grain here — data-entry/page.tsx maps
// its "fy" grain to "month" (picking a month inside the FY) before calling
// into this module; see docs/superpowers/specs/2026-07-09-data-entry-grain-aware-design.md.

import { weekOfMonthBounds } from "@/lib/analytics/scope";

export type EntryGrain = "day" | "week" | "month";

export interface PeriodRange {
  from: string;
  to: string;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function daysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

function isoDate(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function partsOf(dateStr: string): { year: number; month: number; day: number } {
  const [year, month, day] = dateStr.split("-").map(Number);
  return { year, month, day };
}

function bucketsInMonth(year: number, month: number): number {
  return Math.ceil(daysInMonth(year, month) / 7);
}

export function resolvePeriod(grain: EntryGrain, anchorDate: string): PeriodRange {
  const { year, month, day } = partsOf(anchorDate);
  switch (grain) {
    case "day":
      return { from: anchorDate, to: anchorDate };
    case "week": {
      const { startDay, endDay } = weekOfMonthBounds(year, month, day);
      return { from: isoDate(year, month, startDay), to: isoDate(year, month, endDay) };
    }
    case "month":
      return { from: isoDate(year, month, 1), to: isoDate(year, month, daysInMonth(year, month)) };
  }
}

export function stepPeriod(grain: EntryGrain, anchorDate: string, delta: number): string {
  const { year, month, day } = partsOf(anchorDate);
  switch (grain) {
    case "day": {
      const d = new Date(Date.UTC(year, month - 1, day));
      d.setUTCDate(d.getUTCDate() + delta);
      return d.toISOString().slice(0, 10);
    }
    case "week": {
      // Bucket-index arithmetic, not raw +/-7 days: the last bucket of a
      // month can be shorter than 7 days, so stepping by real calendar days
      // would land inside the wrong bucket when crossing a month boundary.
      const { week } = weekOfMonthBounds(year, month, day);
      let idx = week + delta;
      let y = year, m = month;
      while (idx > bucketsInMonth(y, m)) {
        idx -= bucketsInMonth(y, m);
        m += 1;
        if (m > 12) { m = 1; y += 1; }
      }
      while (idx < 1) {
        m -= 1;
        if (m < 1) { m = 12; y -= 1; }
        idx += bucketsInMonth(y, m);
      }
      return isoDate(y, m, (idx - 1) * 7 + 1);
    }
    case "month": {
      let m = month + delta;
      let y = year;
      while (m > 12) { m -= 12; y += 1; }
      while (m < 1) { m += 12; y -= 1; }
      return isoDate(y, m, 1);
    }
  }
}

export function periodLabel(grain: EntryGrain, anchorDate: string): string {
  const { year, month, day } = partsOf(anchorDate);
  switch (grain) {
    case "day":
      return `${day} ${MONTHS[month - 1]} ${year}`;
    case "week": {
      const { week, startDay, endDay } = weekOfMonthBounds(year, month, day);
      return `Week ${week} (${startDay}-${endDay} ${MONTHS[month - 1]} ${year})`;
    }
    case "month":
      return `${["January","February","March","April","May","June","July","August","September","October","November","December"][month - 1]} ${year}`;
  }
}
