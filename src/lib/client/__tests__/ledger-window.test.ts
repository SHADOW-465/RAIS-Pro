import type { Event } from "@/lib/store/types";
import { resolveScope } from "@/lib/analytics/scope";
import {
  LEDGER_FETCH_PAD_DAYS,
  analyticsWindow,
  cachedWindowCovers,
  ledgerFetchWindow,
  presetNeedsAnchor,
  type DatePreset,
  type LedgerDateTweaks,
} from "../ledger-window";
import { eventsCacheCovers } from "../query-keys";

const ANCHOR = "2026-06-15";
const events = [{ occurredOn: { start: ANCHOR, end: ANCHOR } }] as Event[];

function tweaks(preset: DatePreset, dateFrom = "", dateTo = ""): LedgerDateTweaks {
  return { datePreset: preset, dateFrom, dateTo };
}

function scopeDates(preset: DatePreset, dateFrom = "", dateTo = "", rows: Event[] = events) {
  const scope = resolveScope(rows, { grain: "day", ...tweaks(preset, dateFrom, dateTo) });
  return { from: scope.dateFrom, to: scope.dateTo };
}

/** Signed day count from `from` to `to`. Positive when `to` is later. */
function daysBetween(from: string, to: string): number {
  const day = 86_400_000;
  return (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / day;
}

const PRESETS: DatePreset[] = ["all", "this-month", "last-90-days", "last-12-months", "this-fy", "custom"];

describe("analyticsWindow matches resolveScope", () => {
  test.each(PRESETS)("%s uses the same ends as the KPI scope", (preset) => {
    const dates = preset === "custom" ? { dateFrom: "2026-02-01", dateTo: "2026-02-28" } : { dateFrom: "", dateTo: "" };
    const analytic = analyticsWindow(tweaks(preset, dates.dateFrom, dates.dateTo), { ready: true, max: ANCHOR });
    const scope = scopeDates(preset, dates.dateFrom, dates.dateTo);
    expect(analytic.from).toBe(scope.from);
    expect(analytic.to).toBe(scope.to);
    expect(analytic.needsAnchor).toBe(false);
  });

  test("an empty ledger with a known anchor day uses today, same as resolveScope", () => {
    const analytic = analyticsWindow(tweaks("this-month"), { ready: true });
    const scope = scopeDates("this-month", "", "", []);
    expect(analytic.from).toBe(scope.from);
    expect(analytic.to).toBe(scope.to);
  });

  test("a relative preset stays unresolved until the anchor day is known", () => {
    expect(analyticsWindow(tweaks("last-90-days"), { ready: false }).needsAnchor).toBe(true);
    expect(presetNeedsAnchor("last-90-days")).toBe(true);
    expect(presetNeedsAnchor("all")).toBe(true);
    expect(presetNeedsAnchor("custom")).toBe(false);
  });
});

describe("ledgerFetchWindow", () => {
  test("pads the start of a relative window and leaves the end on the anchor", () => {
    const anchor = { ready: true, max: ANCHOR };
    const analytic = analyticsWindow(tweaks("last-90-days"), anchor);
    const fetched = ledgerFetchWindow(tweaks("last-90-days"), anchor);
    expect(analytic.from && analytic.to).toBeTruthy();
    expect(daysBetween(fetched.from!, analytic.from!)).toBe(LEDGER_FETCH_PAD_DAYS);
    expect(fetched.to).toBe(analytic.to);
  });

  test("pads both ends of an explicit custom range", () => {
    const anchor = { ready: true, max: ANCHOR };
    const range = tweaks("custom", "2026-01-01", "2026-01-31");
    const analytic = analyticsWindow(range, anchor);
    const fetched = ledgerFetchWindow(range, anchor);
    expect(daysBetween(fetched.from!, analytic.from!)).toBe(LEDGER_FETCH_PAD_DAYS);
    expect(daysBetween(analytic.to!, fetched.to!)).toBe(LEDGER_FETCH_PAD_DAYS);
  });

  test("all data asks for the bounds range, and waits until those ends exist", () => {
    expect(ledgerFetchWindow(tweaks("all"), { ready: false, max: ANCHOR }).needsAnchor).toBe(true);
    const fetched = ledgerFetchWindow(tweaks("all"), {
      ready: true,
      min: "2025-01-02",
      max: ANCHOR,
      maxEnd: "2026-06-20",
    });
    expect(fetched).toEqual({ needsAnchor: false, from: "2025-01-02", to: "2026-06-20" });
    const noEnds = ledgerFetchWindow(tweaks("all"), { ready: true });
    expect(noEnds).toEqual({ needsAnchor: false, span: "all" });
  });

  test("an unfinished custom range asks for every row, not the 30-day default", () => {
    const fetched = ledgerFetchWindow(tweaks("custom", "2026-01-01", ""), { ready: true, max: ANCHOR });
    expect(fetched).toEqual({ needsAnchor: false, span: "all" });
  });

  test("an unavailable bounds read asks for the ledger without a window", () => {
    const fetched = ledgerFetchWindow(tweaks("this-fy"), { ready: true, max: ANCHOR }, { unscoped: true });
    expect(fetched).toEqual({ needsAnchor: false, span: "all" });
  });
});

describe("cached window may stand in for the next read", () => {
  test("an unscoped cache covers a narrower window, and a narrower cache does not cover all data", () => {
    expect(cachedWindowCovers({}, { from: "2026-01-01", to: "2026-01-31" })).toBe(true);
    expect(cachedWindowCovers({ from: "2026-01-01", to: "2026-01-31" }, {})).toBe(false);
    expect(cachedWindowCovers({ from: "2025-01-01", to: "2026-12-31" }, { from: "2026-03-01", to: "2026-06-15" })).toBe(true);
    expect(cachedWindowCovers({ from: "2026-03-01", to: "2026-06-15" }, { from: "2025-01-01", to: "2026-12-31" })).toBe(false);
  });

  test("a different user and the pending key are not a hit", () => {
    const key = ["events", "ada", "", ""] as const;
    expect(eventsCacheCovers(key, { user: "ada" })).toBe(true);
    expect(eventsCacheCovers(key, { user: "lee", from: "2026-01-01", to: "2026-01-31" })).toBe(false);
    expect(eventsCacheCovers(["events", "ada", "pending"], { user: "ada" })).toBe(false);
  });
});
