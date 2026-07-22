import { parseDatePhrase } from "../date-phrase";

const MAX = "2025-08-15"; // data's latest date; FY = Apr 2025 – Mar 2026

describe("parseDatePhrase", () => {
  it("resolves a bare month to its most recent occurrence at/before dataMax", () => {
    expect(parseDatePhrase("rejection in April", MAX)).toEqual({
      from: "2025-04-01", to: "2025-04-30", grain: "month", matchedText: "april",
    });
  });

  it("resolves a month that hasn't happened yet this year to last year", () => {
    // December is after August 2025 → most recent December is 2024
    expect(parseDatePhrase("December scrap", MAX)).toMatchObject({
      from: "2024-12-01", to: "2024-12-31", grain: "month",
    });
  });

  it("resolves 'this fy' to Apr–Mar around dataMax", () => {
    expect(parseDatePhrase("copq this fy", MAX)).toEqual({
      from: "2025-04-01", to: "2026-03-31", grain: "fy", matchedText: "this fy",
    });
  });

  it("resolves 'last 90 days' relative to dataMax", () => {
    expect(parseDatePhrase("defects last 90 days", MAX)).toMatchObject({
      from: "2025-05-17", to: "2025-08-15", grain: "day",
    });
  });

  it("resolves 'last month'", () => {
    expect(parseDatePhrase("last month", MAX)).toMatchObject({
      from: "2025-07-01", to: "2025-07-31", grain: "month",
    });
  });

  it("returns null when no period phrase is present", () => {
    expect(parseDatePhrase("balloon gate defects", MAX)).toBeNull();
  });
});
