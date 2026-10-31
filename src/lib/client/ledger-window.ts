// Which slice of the ledger a screen should ask for.
//
// The date presets match resolveScope (anchor = latest event day, not "today").
// The HTTP window is wider on the start side: the screen keeps a row when its
// lot date is in range, while /api/events filters on occurredOn. Pulling the
// start back covers a lot that was keyed in before the batch date. The end is
// not pulled forward for relative presets — a later row would move the anchor
// and every KPI with it.

export const LEDGER_FETCH_PAD_DAYS = 180;
export const EVENTS_STALE_MS = 60_000;

const DAY = 86_400_000;

export type DatePreset = "all" | "this-month" | "last-90-days" | "last-12-months" | "this-fy" | "custom";

export interface LedgerDateTweaks {
  datePreset: DatePreset;
  dateFrom: string;
  dateTo: string;
}

export interface LedgerWindow {
  from?: string;
  to?: string;
  /** Relative preset, or "all" before bounds are known, cannot be fetched yet. */
  needsAnchor: boolean;
  /**
   * Ask /api/events not to apply the 30-day default. Set when bounds failed,
   * or when a custom range is only half filled. "All data" with known ends
   * sends those ends instead, so the default cannot shrink the plant.
   */
  span?: "all";
}

export interface LedgerAnchor {
  ready: boolean;
  min?: string;
  /** Latest occurredOn.start. Relative presets anchor on this. */
  max?: string;
  /** Latest occurredOn.end. "All data" uses this as the inclusive end. */
  maxEnd?: string;
}

function iso(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

function shiftDays(day: string, days: number): string {
  return iso(new Date(`${day}T00:00:00Z`).getTime() + days * DAY);
}

export function presetNeedsAnchor(preset: DatePreset): boolean {
  return preset !== "custom";
}

/** Same date window resolveScope applies. An empty ledger (ready, no max)
 *  anchors on today, which is what resolveScope does with no events. */
export function analyticsWindow(
  t: LedgerDateTweaks,
  anchor: LedgerAnchor,
): LedgerWindow {
  if (t.datePreset === "all") return { needsAnchor: false };
  if (t.datePreset === "custom") {
    if (t.dateFrom && t.dateTo) return { from: t.dateFrom, to: t.dateTo, needsAnchor: false };
    return { needsAnchor: false };
  }
  if (!anchor.ready) return { needsAnchor: true };

  const anchorDate = anchor.max ? new Date(`${anchor.max}T00:00:00Z`) : new Date();
  const isoDate = (d: Date) => d.toISOString().slice(0, 10);

  if (t.datePreset === "this-month") {
    const y = anchorDate.getUTCFullYear();
    const m = anchorDate.getUTCMonth();
    const lastDay = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
    return {
      needsAnchor: false,
      from: `${y}-${String(m + 1).padStart(2, "0")}-01`,
      to: `${y}-${String(m + 1).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`,
    };
  }
  if (t.datePreset === "last-90-days") {
    return {
      needsAnchor: false,
      from: isoDate(new Date(anchorDate.getTime() - 90 * DAY)),
      to: isoDate(anchorDate),
    };
  }
  if (t.datePreset === "last-12-months") {
    const p = new Date(anchorDate);
    p.setUTCFullYear(p.getUTCFullYear() - 1);
    return { needsAnchor: false, from: isoDate(p), to: isoDate(anchorDate) };
  }
  const m = anchorDate.getUTCMonth();
  const y = anchorDate.getUTCFullYear();
  const fy = m >= 3 ? y : y - 1;
  return { needsAnchor: false, from: `${fy}-04-01`, to: `${fy + 1}-03-31` };
}

/** A cached fetch may stand in for the next one only when it already holds
 *  every row the next window would return. An unscoped cache covers any
 *  window. A narrower cache must not be shown as a wider one — the screen
 *  would under-count until the new request landed. */
export function cachedWindowCovers(
  cached: { from?: string; to?: string },
  next: { from?: string; to?: string },
): boolean {
  if (!cached.from && !cached.to) return true;
  if (!next.from || !next.to || !cached.from || !cached.to) return false;
  return cached.from <= next.from && cached.to >= next.to;
}

/** Window passed to /api/events.
 *  "All data" sends the bounds range (start..latest end) once that read has
 *  landed. A failed bounds read, or a custom range with one end missing,
 *  sends span=all so the route's 30-day default cannot drop the rest. */
export function ledgerFetchWindow(
  t: LedgerDateTweaks,
  anchor: LedgerAnchor,
  opts?: { unscoped?: boolean },
): LedgerWindow {
  if (opts?.unscoped) return { needsAnchor: false, span: "all" };
  if (t.datePreset === "all") {
    if (!anchor.ready) return { needsAnchor: true };
    const from = anchor.min;
    const to = anchor.maxEnd ?? anchor.max;
    if (!from || !to) return { needsAnchor: false, span: "all" };
    return { needsAnchor: false, from, to };
  }
  const w = analyticsWindow(t, anchor);
  if (w.needsAnchor) return w;
  if (!w.from || !w.to) return { needsAnchor: false, span: "all" };
  return {
    needsAnchor: false,
    from: shiftDays(w.from, -LEDGER_FETCH_PAD_DAYS),
    to: t.datePreset === "custom" ? shiftDays(w.to, LEDGER_FETCH_PAD_DAYS) : w.to,
  };
}
