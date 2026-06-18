import { toLocalISODate, dateFromFilename } from "../date";

describe("toLocalISODate", () => {
  it("uses local calendar date, not UTC (fixes the -1 day artifact)", () => {
    const d = new Date(2025, 3, 1, 0, 0, 0); // local Apr 1 2025
    expect(toLocalISODate(d)).toBe("2025-04-01");
  });
  it("parses Excel serial numbers to local ISO", () => {
    expect(toLocalISODate(45748)).toBe("2025-04-01"); // Excel serial 45748 = 2025-04-01
  });
  it("returns null for junk", () => {
    expect(toLocalISODate("SUNDAY")).toBeNull();
  });
});

describe("dateFromFilename", () => {
  it("reads 'D MONTH YY' style (size-wise files, FY26)", () => {
    expect(dateFromFilename("1 APRIL 26.xlsx")).toBe("2026-04-01");
  });
  it("reads 'NN ... MONTH YYYY' style (rejection analysis)", () => {
    expect(dateFromFilename("01 REJECTION ANALYSIS-APRIL 2025.xlsx")).toBe("2025-04-01");
  });
  it("returns null when no month/day is present", () => {
    expect(dateFromFilename("YEARLY ANALYSIS.xlsx")).toBeNull();
  });
});
