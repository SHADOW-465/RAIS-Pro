import { periodKey, weekOfMonthBounds, fyContaining } from "../scope";

describe("weekOfMonthBounds", () => {
  it("buckets days 1-7 of any month into week 1", () => {
    expect(weekOfMonthBounds(2026, 7, 1)).toEqual({ week: 1, startDay: 1, endDay: 7 });
    expect(weekOfMonthBounds(2026, 7, 7)).toEqual({ week: 1, startDay: 1, endDay: 7 });
  });

  it("buckets days 8-14 into week 2, etc.", () => {
    expect(weekOfMonthBounds(2026, 7, 8)).toEqual({ week: 2, startDay: 8, endDay: 14 });
    expect(weekOfMonthBounds(2026, 7, 14)).toEqual({ week: 2, startDay: 8, endDay: 14 });
  });

  it("clamps the last bucket's endDay to the real last day of a 31-day month", () => {
    // July 2026 has 31 days: buckets are 1-7, 8-14, 15-21, 22-28, 29-31 (short last bucket)
    expect(weekOfMonthBounds(2026, 7, 29)).toEqual({ week: 5, startDay: 29, endDay: 31 });
    expect(weekOfMonthBounds(2026, 7, 31)).toEqual({ week: 5, startDay: 29, endDay: 31 });
  });

  it("clamps the last bucket's endDay to the real last day of a 30-day month", () => {
    // June 2026 has 30 days: last bucket is 29-30 (2 days)
    expect(weekOfMonthBounds(2026, 6, 30)).toEqual({ week: 5, startDay: 29, endDay: 30 });
  });

  it("clamps the last bucket's endDay for February", () => {
    // Feb 2026 has 28 days: buckets are 1-7, 8-14, 15-21, 22-28 (exactly 4, no short one)
    expect(weekOfMonthBounds(2026, 2, 28)).toEqual({ week: 4, startDay: 22, endDay: 28 });
  });
});

describe("periodKey with grain 'week' (regression — must stay byte-identical)", () => {
  it("still produces the same key format after the weekOfMonthBounds extraction", () => {
    expect(periodKey("2026-07-01", "week")).toBe("2026-07-W1");
    expect(periodKey("2026-07-08", "week")).toBe("2026-07-W2");
    expect(periodKey("2026-07-31", "week")).toBe("2026-07-W5");
    expect(periodKey("2026-06-30", "week")).toBe("2026-06-W5");
  });
});

describe("fyContaining", () => {
  it("returns the FY containing a date in the second half of the calendar year (Apr-Dec)", () => {
    expect(fyContaining("2026-07-09")).toEqual({
      startYear: 2026,
      label: "FY2026-27",
      from: "2026-04-01",
      to: "2027-03-31",
    });
  });

  it("returns the FY containing a date in the first quarter of the calendar year (Jan-Mar)", () => {
    expect(fyContaining("2027-02-15")).toEqual({
      startYear: 2026,
      label: "FY2026-27",
      from: "2026-04-01",
      to: "2027-03-31",
    });
  });

  it("agrees with periodKey's own FY label format", () => {
    expect(fyContaining("2026-07-09").label).toBe(periodKey("2026-07-09", "fy"));
  });
});
