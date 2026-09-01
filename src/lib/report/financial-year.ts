// Indian-style financial year: 1 April → 31 March (inclusive).
// Pure ISO-date-string helpers. Do not use local-timezone Date getters.

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

export function isIsoDate(value: string): boolean {
  const m = ISO_DATE.exec(value);
  if (!m) return false;
  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return false;
  const dt = new Date(Date.UTC(year, month - 1, day));
  return (
    dt.getUTCFullYear() === year &&
    dt.getUTCMonth() === month - 1 &&
    dt.getUTCDate() === day
  );
}

export function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

export function fyStartDate(startYear: number): string {
  return `${startYear}-04-01`;
}

export function fyEndDate(startYear: number): string {
  return `${startYear + 1}-03-31`;
}

/** Display label, e.g. "FY 2025–26". */
export function fyLabel(startYear: number): string {
  return `FY ${startYear}–${String((startYear + 1) % 100).padStart(2, "0")}`;
}

/** Stable id, e.g. "FY2025-26" — matches periodKey("fy") in analytics/scope. */
export function fyId(startYear: number): string {
  return `FY${startYear}-${String((startYear + 1) % 100).padStart(2, "0")}`;
}

export interface FinancialYear {
  startYear: number;
  label: string;
  id: string;
  from: string;
  to: string;
}

export function financialYear(startYear: number): FinancialYear {
  return {
    startYear,
    label: fyLabel(startYear),
    id: fyId(startYear),
    from: fyStartDate(startYear),
    to: fyEndDate(startYear),
  };
}

/** The Apr–Mar financial year containing an ISO calendar date. */
export function fyContaining(isoDate: string): FinancialYear {
  if (!isIsoDate(isoDate)) {
    throw new Error(`fyContaining: invalid ISO date "${isoDate}"`);
  }
  const year = Number(isoDate.slice(0, 4));
  const month = Number(isoDate.slice(5, 7));
  const startYear = month >= 4 ? year : year - 1;
  return financialYear(startYear);
}

/** Inclusive ISO-date comparison. */
export function dateInInclusiveRange(isoDate: string, from: string, to: string): boolean {
  return isoDate >= from && isoDate <= to;
}

export type CustomRangeResult =
  | { ok: true; from: string; to: string }
  | { ok: false; error: string };

export function validateCustomRange(from: string, to: string): CustomRangeResult {
  if (!from || !to) {
    return { ok: false, error: "Custom range requires both a start date and an end date." };
  }
  if (!isIsoDate(from) || !isIsoDate(to)) {
    return { ok: false, error: "Dates must be valid calendar days (YYYY-MM-DD)." };
  }
  if (from > to) {
    return { ok: false, error: "Start date must be on or before the end date." };
  }
  return { ok: true, from, to };
}

/** Calendar months YYYY-MM from `from` through `to`, inclusive. */
export function monthsInInclusiveRange(from: string, to: string): string[] {
  if (!isIsoDate(from) || !isIsoDate(to) || from > to) return [];
  const out: string[] = [];
  let y = Number(from.slice(0, 4));
  let m = Number(from.slice(5, 7));
  const endY = Number(to.slice(0, 4));
  const endM = Number(to.slice(5, 7));
  while (y < endY || (y === endY && m <= endM)) {
    out.push(`${y}-${pad2(m)}`);
    m += 1;
    if (m > 12) {
      m = 1;
      y += 1;
    }
  }
  return out;
}

/** April → March month keys for a financial year. */
export function fyMonthKeys(startYear: number): string[] {
  return monthsInInclusiveRange(fyStartDate(startYear), fyEndDate(startYear));
}

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

export function monthLabel(yyyyMm: string): string {
  const y = yyyyMm.slice(0, 4);
  const m = Number(yyyyMm.slice(5, 7));
  if (m < 1 || m > 12) return yyyyMm;
  return `${MONTH_NAMES[m - 1]} ${y}`;
}

export function monthShortLabel(yyyyMm: string): string {
  const short = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const y = yyyyMm.slice(2, 4);
  const m = Number(yyyyMm.slice(5, 7));
  if (m < 1 || m > 12) return yyyyMm;
  return `${short[m - 1]}-${y}`;
}

/**
 * Distinct financial years represented by a list of ISO dates.
 * Sorted descending (newest first).
 */
export function financialYearsFromDates(isoDates: Iterable<string>): FinancialYear[] {
  const years = new Set<number>();
  for (const d of isoDates) {
    if (!isIsoDate(d)) continue;
    years.add(fyContaining(d).startYear);
  }
  return [...years].sort((a, b) => b - a).map(financialYear);
}
