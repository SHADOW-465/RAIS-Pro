// src/lib/ingest/parsers/__tests__/router.test.ts
import { routeFamily } from "../index";

describe("routeFamily", () => {
  it("classifies known filenames", () => {
    expect(routeFamily("ASSEMBLY REJECTION REPORT.xlsx")).toBe("assembly-daily");
    expect(routeFamily("01 REJECTION ANALYSIS-APRIL 2025.xlsx")).toBe("rejection-analysis");
    expect(routeFamily("COMMULATIVE 2025-26.xlsx")).toBe("cumulative");
    expect(routeFamily("YEARLY ANALYSIS.xlsx")).toBe("cumulative");
    expect(routeFamily("1 APRIL 26.xlsx")).toBe("size-wise");
    expect(routeFamily("10 JANUARY 2027.xlsx")).toBe("size-wise");
  });

  it("routes Daily Activity Report to daily-activity", () => {
    expect(routeFamily("DAILY ACTIVITY REPORT 2026.xlsx")).toBe("daily-activity");
  });
});
