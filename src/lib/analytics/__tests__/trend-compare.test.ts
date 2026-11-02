import { DISPOSAFE_REGISTRY as REG } from "@/__tests__/fixtures/disposafe-registry";
import type { Event } from "@/lib/store/types";
import { trend } from "../rejection";
import type { Scope } from "../scope";
import {
  addCalendarMonths,
  comparePeriodRates,
  defaultOffset,
  offsetsForGrain,
  overlaySeries,
  parseCompareEnabled,
  parseCompareOffset,
  parseOverlayOffsets,
  parseTrendVizMode,
  previousEquivalentRange,
  shiftPeriodKey,
  windowComparison,
} from "../trend-compare";

let n = 0;
function ev(date: string, checked: number, rejected = 0): Event[] {
  const out: Event[] = [
    {
      eventId: `p${n++}`,
      eventType: "production",
      stageId: "visual",
      quantity: checked,
      occurredOn: { kind: "day", start: date, end: date },
      extractedBy: "direct-entry",
    } as Event,
  ];
  if (rejected > 0) {
    out.push({
      eventId: `r${n++}`,
      eventType: "inspection",
      disposition: "rejected",
      stageId: "visual",
      quantity: rejected,
      occurredOn: { kind: "day", start: date, end: date },
      extractedBy: "direct-entry",
    } as Event);
  }
  return out;
}

describe("calendar alignment", () => {
  it("shifts a day to the previous weekday, week, month, and year", () => {
    expect(shiftPeriodKey("2026-10-15", "day", "prev-day")).toBe("2026-10-14");
    expect(shiftPeriodKey("2026-10-15", "day", "prev-week")).toBe("2026-10-08");
    expect(shiftPeriodKey("2026-10-15", "day", "prev-month")).toBe("2026-09-15");
    expect(shiftPeriodKey("2026-10-15", "day", "prev-year")).toBe("2025-10-15");
  });

  it("clamps a day that does not exist in the previous month", () => {
    expect(addCalendarMonths("2026-03-31", -1)).toBe("2026-02-28");
    expect(shiftPeriodKey("2026-03-31", "day", "prev-month")).toBe("2026-02-28");
  });

  it("shifts month and week keys by equivalent calendar periods", () => {
    expect(shiftPeriodKey("2026-10", "month", "prev-month")).toBe("2026-09");
    expect(shiftPeriodKey("2026-10", "month", "prev-year")).toBe("2025-10");
    expect(shiftPeriodKey("2026-10-W2", "week", "prev-week")).toBe("2026-10-W1");
    expect(shiftPeriodKey("FY2025-26", "fy", "prev-year")).toBe("FY2024-25");
  });

  it("builds an equivalent previous window without inventing extra days", () => {
    expect(previousEquivalentRange("2026-10-01", "2026-10-31", "prev-month")).toEqual({
      from: "2026-09-01",
      to: "2026-09-30",
    });
    expect(previousEquivalentRange("2026-10-15", "2026-10-15", "prev-day")).toEqual({
      from: "2026-10-14",
      to: "2026-10-14",
    });
  });

  it("offers only meaningful overlays per grain", () => {
    expect(offsetsForGrain("month")).toEqual(["prev-month", "prev-year"]);
    expect(defaultOffset("day")).toBe("prev-day");
    expect(defaultOffset("fy")).toBe("prev-year");
  });

  it("parses stored mode and overlay choices without inventing grain-invalid offsets", () => {
    expect(parseTrendVizMode("bar")).toBe("bar");
    expect(parseTrendVizMode("nope")).toBe("line");
    expect(parseTrendVizMode("compare")).toBe("line");
    expect(parseCompareEnabled("on")).toBe(true);
    expect(parseCompareEnabled("compare")).toBe(true);
    expect(parseCompareEnabled("0")).toBe(false);
    expect(parseCompareOffset("prev-day", "month")).toBe("prev-month");
    expect(parseOverlayOffsets('["prev-year","prev-day"]', "month")).toEqual(["prev-year"]);
  });
});

describe("overlaySeries alignment", () => {
  const events = [
    ...ev("2026-10-08", 100, 10), // 10%
    ...ev("2026-10-15", 200, 40), // 20%
  ];
  const scope: Scope = { grain: "day", dateFrom: "2026-10-15", dateTo: "2026-10-15" };

  it("places previous-week history on the current day's x slot", () => {
    const current = trend(events, scope, "rejectionRate", REG);
    expect(current).toHaveLength(1);
    expect(current[0].period).toBe("2026-10-15");
    const overlay = overlaySeries(events, scope, current, "prev-week", REG);
    expect(overlay).toHaveLength(1);
    expect(overlay[0].period).toBe("2026-10-15");
    expect(overlay[0].noProduction).toBe(false);
    expect(overlay[0].value).toBeCloseTo(0.1, 6);
    expect(overlay[0].checked).toBe(100);
    expect(overlay[0].rejected).toBe(10);
  });

  it("does not fabricate a previous-month point when that day has no records", () => {
    const current = trend(events, scope, "rejectionRate", REG);
    const overlay = overlaySeries(events, scope, current, "prev-month", REG);
    expect(overlay[0].noProduction).toBe(true);
    expect(Number.isFinite(overlay[0].value)).toBe(false);
  });

  it("does not align by array index across unrelated lengths", () => {
    const wide: Scope = { grain: "day", dateFrom: "2026-10-08", dateTo: "2026-10-15" };
    const current = trend(events, wide, "rejectionRate", REG);
    const overlay = overlaySeries(events, wide, current, "prev-week", REG);
    const oct8 = current.findIndex((p) => p.period === "2026-10-08");
    const oct15 = current.findIndex((p) => p.period === "2026-10-15");
    expect(overlay[oct8].noProduction).toBe(true);
    expect(overlay[oct15].value).toBeCloseTo(0.1, 6);
  });

  it("historical overlay respects the same stage filter as the current series", () => {
    const mixed: Event[] = [
      ...ev("2026-10-08", 100, 10),
      {
        eventId: "b-prod",
        eventType: "production",
        stageId: "balloon",
        quantity: 50,
        occurredOn: { kind: "day", start: "2026-10-08", end: "2026-10-08" },
        extractedBy: "direct-entry",
      } as Event,
      {
        eventId: "b-rej",
        eventType: "inspection",
        disposition: "rejected",
        stageId: "balloon",
        quantity: 25,
        occurredOn: { kind: "day", start: "2026-10-08", end: "2026-10-08" },
        extractedBy: "direct-entry",
      } as Event,
      ...ev("2026-10-15", 200, 40),
    ];
    const scoped: Scope = {
      grain: "day",
      dateFrom: "2026-10-15",
      dateTo: "2026-10-15",
      stageIds: ["visual"],
    };
    const current = trend(mixed, scoped, "rejectionRate", REG);
    const overlay = overlaySeries(mixed, scoped, current, "prev-week", REG);
    expect(overlay[0].checked).toBe(100);
    expect(overlay[0].rejected).toBe(10);
    expect(overlay[0].value).toBeCloseTo(0.1, 6);
  });
});

describe("rejection-rate calculations", () => {
  it("window totals use the plant rate, not the average of bucket percentages", () => {
    const events = [
      ...ev("2026-10-01", 100, 10), // 10%
      ...ev("2026-10-02", 1000, 200), // 20%
    ];
    const scope: Scope = { grain: "day", dateFrom: "2026-10-01", dateTo: "2026-10-02" };
    const cmp = windowComparison(events, scope, "prev-day", REG);
    expect(cmp.currentChecked).toBe(1100);
    expect(cmp.currentRejected).toBe(210);
    expect(cmp.currentRate).toBeCloseTo(210 / 1100, 6);
    expect(cmp.currentRate).not.toBeCloseTo(0.15, 6);
  });

  it("line and bar modes share the same series values", () => {
    const events = [...ev("2026-04-10", 100, 5), ...ev("2026-05-10", 200, 8)];
    const scope: Scope = { grain: "month", dateFrom: "2026-04-01", dateTo: "2026-05-31" };
    const series = trend(events, scope, "rejectionRate", REG);
    expect(series.map((p) => p.value)).toEqual(series.map((p) => p.value));
    expect(series[0].checked).toBe(100);
    expect(series[1].checked).toBe(200);
  });
});

describe("period comparison arithmetic", () => {
  it("reports percentage-point and relative change", () => {
    const cmp = comparePeriodRates(
      { rate: 0.1, checked: 1000, rejected: 100 },
      { rate: 0.12, checked: 800, rejected: 96 },
    );
    expect(cmp.deltaRatio).toBeCloseTo(-0.02, 10);
    expect(cmp.relativeChange).toBeCloseTo(-0.02 / 0.12, 10);
    expect(cmp.improved).toBe(true);
    expect(cmp.previousAvailable).toBe(true);
  });

  it("does not produce Infinity when the previous rate is zero", () => {
    const cmp = comparePeriodRates(
      { rate: 0.1, checked: 100, rejected: 10 },
      { rate: 0, checked: 80, rejected: 0 },
    );
    expect(cmp.previousRate).toBe(0);
    expect(cmp.relativeChange).toBeNull();
    expect(cmp.deltaRatio).toBeCloseTo(0.1, 10);
    expect(Number.isFinite(cmp.deltaRatio)).toBe(true);
  });

  it("leaves comparison empty when previous production is missing", () => {
    const cmp = comparePeriodRates(
      { rate: 0.1, checked: 100, rejected: 10 },
      { rate: 0, checked: 0, rejected: 0, noProduction: true },
    );
    expect(cmp.previousAvailable).toBe(false);
    expect(cmp.previousRate).toBeNull();
    expect(cmp.deltaRatio).toBeNull();
    expect(cmp.relativeChange).toBeNull();
    expect(cmp.improved).toBeNull();
  });

  it("windowComparison does not invent a previous month", () => {
    const events = [...ev("2026-10-15", 500, 50)];
    const scope: Scope = { grain: "month", dateFrom: "2026-10-01", dateTo: "2026-10-31" };
    const cmp = windowComparison(events, scope, "prev-month", REG);
    expect(cmp.currentRate).toBeCloseTo(0.1, 6);
    expect(cmp.previousAvailable).toBe(false);
    expect(cmp.previousRate).toBeNull();
  });
});
