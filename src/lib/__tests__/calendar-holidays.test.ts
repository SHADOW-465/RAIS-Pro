// src/lib/__tests__/calendar-holidays.test.ts
import {
  parseCalendarDay,
  resolveCalendarSeries,
  computeBreakRuns,
} from "../calendar-holidays";

describe("calendar-holidays", () => {
  it("parses 15 Aug as Independence Day (national holiday)", () => {
    const info = parseCalendarDay("2024-08-15");
    expect(info.isDayGrain).toBe(true);
    expect(info.isHoliday).toBe(true);
    expect(info.holidayName).toBe("Independence Day");
    expect(info.holidayType).toBe("national");
    expect(info.weekdayShort).toBe("Thu");
    expect(info.isSunday).toBe(false);
  });

  it("identifies Sunday as weekly off", () => {
    // 18 Aug 2024 was Sunday
    const info = parseCalendarDay("2024-08-18");
    expect(info.isDayGrain).toBe(true);
    expect(info.isSunday).toBe(true);
    expect(info.weekdayShort).toBe("Sun");
  });

  it("handles non-day period safely", () => {
    const info = parseCalendarDay("2024-08");
    expect(info.isDayGrain).toBe(false);
    expect(info.isHoliday).toBe(false);
    expect(info.isSunday).toBe(false);
  });

  it("correctly classifies holiday off vs working day break", () => {
    const series = [
      { period: "2024-08-13", label: "13 Aug", value: 0.12, checked: 1000, rejected: 120 },
      // 14 Aug: Wednesday with no production -> unplanned break
      { period: "2024-08-14", label: "14 Aug", value: Number.NaN, checked: 0, rejected: 0, noProduction: true },
      // 15 Aug: Independence Day (Thursday) with no production -> holiday off
      { period: "2024-08-15", label: "15 Aug", value: Number.NaN, checked: 0, rejected: 0, noProduction: true },
      // 16 Aug: Friday with no production -> unplanned break
      { period: "2024-08-16", label: "16 Aug", value: Number.NaN, checked: 0, rejected: 0, noProduction: true },
      // 17 Aug: Saturday with production
      { period: "2024-08-17", label: "17 Aug", value: 0.10, checked: 1500, rejected: 150 },
      // 18 Aug: Sunday with no production -> Sunday weekly off
      { period: "2024-08-18", label: "18 Aug", value: Number.NaN, checked: 0, rejected: 0, noProduction: true },
    ];

    const resolved = resolveCalendarSeries(series);
    expect(resolved).toHaveLength(6);

    expect(resolved[0].status).toBe("normal_production");

    // 14 Aug: Unplanned break on a Wednesday
    expect(resolved[1].status).toBe("unplanned_break");
    expect(resolved[1].weekdayShort).toBe("Wed");

    // 15 Aug: Scheduled holiday off
    expect(resolved[2].status).toBe("holiday_off");
    expect(resolved[2].holidayName).toBe("Independence Day");
    expect(resolved[2].statusBadge).toBe("🌴 HOLIDAY");

    // 16 Aug: Unplanned break on a Friday
    expect(resolved[3].status).toBe("unplanned_break");

    // 17 Aug: Saturday production
    expect(resolved[4].status).toBe("normal_production");

    // 18 Aug: Sunday weekly off
    expect(resolved[5].status).toBe("holiday_off");
    expect(resolved[5].isSunday).toBe(true);
    expect(resolved[5].statusBadge).toBe("📅 SUN OFF");
  });

  it("computes multi-day break runs and reports included holidays", () => {
    const series = [
      { period: "2024-08-13", label: "13 Aug", value: 0.10, checked: 100, rejected: 10 },
      { period: "2024-08-14", label: "14 Aug", value: Number.NaN, checked: 0, rejected: 0, noProduction: true },
      { period: "2024-08-15", label: "15 Aug", value: Number.NaN, checked: 0, rejected: 0, noProduction: true },
      { period: "2024-08-16", label: "16 Aug", value: Number.NaN, checked: 0, rejected: 0, noProduction: true },
      { period: "2024-08-17", label: "17 Aug", value: 0.10, checked: 100, rejected: 10 },
    ];

    const runs = computeBreakRuns(series);
    expect(runs.size).toBe(3); // indices 1, 2, 3
    const run = runs.get(1);
    expect(run).toBeDefined();
    expect(run?.runLength).toBe(3);
    expect(run?.startLabel).toBe("14 Aug");
    expect(run?.endLabel).toBe("16 Aug");
    expect(run?.includedHolidays).toContain("Independence Day");
  });

  it("recognizes pure value series (COPQ, defect counts) as live production without checked/rejected counts", () => {
    const copqSeries = [
      // 06 Aug 2026 was Thursday with active COPQ
      { period: "2026-08-06", label: "06 Aug", value: 21000 },
      // 07 Aug 2026 was Friday with 0 COPQ / no production
      { period: "2026-08-07", label: "07 Aug", value: 0, noProduction: true },
      // 09 Aug 2026 was Sunday with 0 COPQ
      { period: "2026-08-09", label: "09 Aug", value: 0 },
    ];

    const resolved = resolveCalendarSeries(copqSeries);
    expect(resolved).toHaveLength(3);

    // 06 Aug: Active COPQ must be normal production, NEVER unplanned_break
    expect(resolved[0].status).toBe("normal_production");
    expect(resolved[0].statusLabel).toBe("Production Active");

    // 07 Aug: Friday with no production is unplanned break
    expect(resolved[1].status).toBe("unplanned_break");

    // 09 Aug: Sunday with 0 value is Sunday weekly off
    expect(resolved[2].status).toBe("holiday_off");
    expect(resolved[2].isSunday).toBe(true);
  });
});
