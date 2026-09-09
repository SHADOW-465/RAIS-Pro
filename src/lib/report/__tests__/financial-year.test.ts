import {
  fyStartDate,
  fyEndDate,
  fyLabel,
  fyContaining,
  validateCustomRange,
  monthsInInclusiveRange,
  fyMonthKeys,
  isIsoDate,
  financialYearsFromDates,
} from "../financial-year";

describe("financial year (Apr–Mar, inclusive)", () => {
  it("FY 2025–26 starts 2025-04-01", () => {
    expect(fyStartDate(2025)).toBe("2025-04-01");
  });

  it("FY 2025–26 ends 2026-03-31", () => {
    expect(fyEndDate(2025)).toBe("2026-03-31");
  });

  it("labels FY 2025–26 with an en dash", () => {
    expect(fyLabel(2025)).toBe("FY 2025–26");
  });

  it("2026-03-31 belongs to FY 2025–26", () => {
    expect(fyContaining("2026-03-31").startYear).toBe(2025);
    expect(fyContaining("2026-03-31").from).toBe("2025-04-01");
    expect(fyContaining("2026-03-31").to).toBe("2026-03-31");
  });

  it("2026-04-01 belongs to FY 2026–27", () => {
    expect(fyContaining("2026-04-01").startYear).toBe(2026);
    expect(fyContaining("2026-04-01").from).toBe("2026-04-01");
    expect(fyContaining("2026-04-01").to).toBe("2027-03-31");
  });

  it("handles leap-year 29 February inside FY 2023–24", () => {
    expect(isIsoDate("2024-02-29")).toBe(true);
    expect(isIsoDate("2025-02-29")).toBe(false);
    expect(fyContaining("2024-02-29").startYear).toBe(2023);
    expect(fyContaining("2024-02-29").from).toBe("2023-04-01");
    expect(fyContaining("2024-02-29").to).toBe("2024-03-31");
  });

  it("custom ranges are inclusive", () => {
    const ok = validateCustomRange("2025-04-01", "2025-04-01");
    expect(ok).toEqual({ ok: true, from: "2025-04-01", to: "2025-04-01" });
    expect(monthsInInclusiveRange("2025-04-15", "2025-06-01")).toEqual([
      "2025-04",
      "2025-05",
      "2025-06",
    ]);
  });

  it("rejects reversed custom ranges", () => {
    const bad = validateCustomRange("2025-06-01", "2025-04-01");
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(bad.error).toMatch(/on or before/i);
  });

  it("does not shift date boundaries via local timezone", () => {
    // String helpers never go through local Date getters.
    expect(fyStartDate(2025)).toBe("2025-04-01");
    expect(fyEndDate(2025)).toBe("2026-03-31");
    expect(fyContaining("2025-04-01").from).toBe("2025-04-01");
  });

  it("April-to-March monthly sequence is 12 months", () => {
    expect(fyMonthKeys(2025)).toEqual([
      "2025-04", "2025-05", "2025-06", "2025-07", "2025-08", "2025-09",
      "2025-10", "2025-11", "2025-12", "2026-01", "2026-02", "2026-03",
    ]);
  });

  it("lists financial years from dates without inventing extras", () => {
    const years = financialYearsFromDates(["2025-03-31", "2025-04-01", "2026-03-31"]);
    expect(years.map((y) => y.startYear)).toEqual([2025, 2024]);
  });
});
