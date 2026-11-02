// Calendar checks for the conversion date. Shared by the server (planConversion)
// and the form, so both reject the same dates for the same reason.

/** A real calendar day: `2026-02-31` matches YYYY-MM-DD but is not one. */
export function isRealCalendarDay(s: string | null | undefined): boolean {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s ?? "");
  if (!m) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const dt = new Date(Date.UTC(y, mo - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === mo - 1 && dt.getUTCDate() === d;
}

/** Today in the browser's own time zone, as YYYY-MM-DD. */
export function localToday(now = new Date()): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}`;
}

/**
 * Latest day the server accepts: today in UTC plus one day. The server cannot
 * know the plant's clock, and a plant east of UTC is already on "tomorrow"
 * for part of every UTC day. One day of slack stops that rejecting a real
 * entry; anything further out is genuinely in the future.
 */
export function latestServerDay(now = new Date()): string {
  return new Date(now.getTime() + 86_400_000).toISOString().slice(0, 10);
}

/** Null when `date` is a real day no later than `latest`; otherwise the message to show. */
export function conversionDateError(date: string | null | undefined, latest: string): string | null {
  if (!isRealCalendarDay(date)) {
    return `${date || "(empty)"} is not a real calendar date. Use YYYY-MM-DD.`;
  }
  if ((date as string) > latest) {
    return `${date} is in the future. A conversion can only be recorded for a day that has happened.`;
  }
  return null;
}
