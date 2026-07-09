import { resolvePeriod, stepPeriod, periodLabel } from "../period";

describe("resolvePeriod", () => {
  it("day grain resolves to a single-day range", () => {
    expect(resolvePeriod("day", "2026-07-09")).toEqual({ from: "2026-07-09", to: "2026-07-09" });
  });

  it("week grain resolves to the containing week-of-month bucket", () => {
    expect(resolvePeriod("week", "2026-07-09")).toEqual({ from: "2026-07-08", to: "2026-07-14" });
  });

  it("week grain clamps to the real last day for a short final bucket", () => {
    expect(resolvePeriod("week", "2026-07-30")).toEqual({ from: "2026-07-29", to: "2026-07-31" });
  });

  it("month grain resolves to the full calendar month", () => {
    expect(resolvePeriod("month", "2026-02-15")).toEqual({ from: "2026-02-01", to: "2026-02-28" });
  });
});

describe("stepPeriod", () => {
  it("day grain steps by one calendar day, crossing month boundaries", () => {
    expect(stepPeriod("day", "2026-07-31", 1)).toBe("2026-08-01");
    expect(stepPeriod("day", "2026-08-01", -1)).toBe("2026-07-31");
  });

  it("day grain steps crossing a year boundary", () => {
    expect(stepPeriod("day", "2026-12-31", 1)).toBe("2027-01-01");
  });

  it("week grain steps to the next bucket's start, even across a month boundary with a short final bucket", () => {
    // July 2026's last bucket is 29-31 (short); the week after it is August's week 1 (1-7)
    expect(stepPeriod("week", "2026-07-29", 1)).toBe("2026-08-01");
  });

  it("week grain steps backward across a month boundary onto the short final bucket", () => {
    // The week before August's week 1 is July's short last bucket (29-31), not a mis-aligned 7-day jump
    expect(stepPeriod("week", "2026-08-01", -1)).toBe("2026-07-29");
  });

  it("week grain steps backward across a month boundary into June's short final bucket (29-30)", () => {
    expect(stepPeriod("week", "2026-07-01", -1)).toBe("2026-06-29");
  });

  it("month grain steps by one month, wrapping year boundaries in both directions", () => {
    expect(stepPeriod("month", "2026-12-15", 1)).toBe("2027-01-01");
    expect(stepPeriod("month", "2026-01-15", -1)).toBe("2025-12-01");
  });
});

describe("periodLabel", () => {
  it("labels a day", () => {
    expect(periodLabel("day", "2026-07-09")).toBe("9 Jul 2026");
  });

  it("labels a week with its date range", () => {
    expect(periodLabel("week", "2026-07-09")).toBe("Week 2 (8-14 Jul 2026)");
  });

  it("labels a short final week bucket with its clamped range", () => {
    expect(periodLabel("week", "2026-07-30")).toBe("Week 5 (29-31 Jul 2026)");
  });

  it("labels a month", () => {
    expect(periodLabel("month", "2026-07-09")).toBe("July 2026");
  });
});
