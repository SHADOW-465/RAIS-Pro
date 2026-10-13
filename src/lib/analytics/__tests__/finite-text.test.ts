import type { SeriesPoint } from "../rejection";
import {
  dashboardKpiDeltas,
  finiteNumber,
  formatPercent,
  formatRatioPercent,
  kpiRateDeltaText,
  kpiRelativeDeltaText,
  overallRejectionHeadline,
  rejectionComparisonPhrase,
} from "../finite";

const NON_FINITE = /NaN|Infinity/;

function point(
  label: string,
  value: number,
  extra: Partial<SeriesPoint> = {},
): SeriesPoint {
  return {
    period: label,
    label,
    value,
    checked: extra.checked ?? 100,
    rejected: extra.rejected ?? 0,
    ...extra,
  };
}

/** 03 Oct had production, 09 Oct did not, 10 Oct did. Mirrors the dashboard bug. */
function gapSeries(): SeriesPoint[] {
  return [
    point("03 Oct", 0.25, { period: "2026-10-03", checked: 100, rejected: 25 }),
    point("09 Oct", Number.NaN, {
      period: "2026-10-09",
      checked: 0,
      rejected: 0,
      noProduction: true,
    }),
    point("10 Oct", 0.125, { period: "2026-10-10", checked: 80, rejected: 10 }),
  ];
}

describe("diagnostics comparison skips empty days", () => {
  test("a zero-production previous day compares to the last day that had production", () => {
    const headline = overallRejectionHeadline(0.125, gapSeries());
    expect(headline).toBe("Overall rejection rate is 12.50%, a 12.50% pt reduction vs 03 Oct.");
    expect(headline).not.toMatch(NON_FINITE);
    expect(headline).not.toContain("09 Oct");

    const deltas = dashboardKpiDeltas({ ratePoints: gapSeries(), rejected: 10, checked: 80, fpy: 0.8 });
    expect(deltas.rateDiff).toBe("↓ 12.50% vs 03 Oct");
    expect(deltas.acceptedDiff).toBe("↑ 12.50% vs 03 Oct");
    expect(JSON.stringify(deltas)).not.toMatch(NON_FINITE);
  });

  test("a trailing empty day is not the comparison base", () => {
    const series = [
      point("03 Oct", 0.25, { period: "2026-10-03" }),
      point("04 Oct", 0.125, { period: "2026-10-04" }),
      point("09 Oct", Number.NaN, { period: "2026-10-09", checked: 0, rejected: 0, noProduction: true }),
    ];
    const phrase = rejectionComparisonPhrase(series);
    expect(phrase).toBe(", a 12.50% pt reduction vs 03 Oct");
    expect(phrase).not.toContain("09 Oct");
  });

  test("an increase uses the same productive pair", () => {
    const series = [
      point("03 Oct", 0.125),
      point("09 Oct", Number.NaN, { checked: 0, rejected: 0, noProduction: true }),
      point("10 Oct", 0.25),
    ];
    expect(rejectionComparisonPhrase(series)).toBe(", a 12.50% pt increase vs 03 Oct");
    expect(dashboardKpiDeltas({ ratePoints: series }).rateDiff).toBe("↑ 12.50% vs 03 Oct");
  });
});

describe("no valid comparison omits the phrase", () => {
  test("no prior production at all", () => {
    const onlyToday = [
      point("09 Oct", Number.NaN, { checked: 0, rejected: 0, noProduction: true }),
      point("10 Oct", 0.125),
    ];
    expect(overallRejectionHeadline(0.125, onlyToday)).toBe("Overall rejection rate is 12.50%.");
    expect(dashboardKpiDeltas({ ratePoints: onlyToday })).toEqual({
      rateDiff: "vs Prior Period",
      rejDiff: "vs Prior Period",
      acceptedDiff: "vs Prior Period",
      fpyDiff: "vs Prior Period",
      copqDiff: "vs Prior Period",
    });
    expect(rejectionComparisonPhrase([point("10 Oct", 0.125)])).toBe("");
    expect(rejectionComparisonPhrase([])).toBe("");
  });

  test("undefined, null, NaN, and Infinity inputs produce no non-finite text", () => {
    expect(finiteNumber(undefined)).toBeNull();
    expect(finiteNumber(null)).toBeNull();
    expect(finiteNumber(Number.NaN)).toBeNull();
    expect(finiteNumber(Number.POSITIVE_INFINITY)).toBeNull();
    expect(finiteNumber(Number.NEGATIVE_INFINITY)).toBeNull();
    expect(formatRatioPercent(undefined)).toBeNull();
    expect(formatRatioPercent(Number.NaN)).toBeNull();
    expect(formatRatioPercent(Number.POSITIVE_INFINITY)).toBeNull();
    expect(formatPercent(Number.NEGATIVE_INFINITY)).toBeNull();

    expect(overallRejectionHeadline(undefined, undefined)).toBe("Overall rejection rate is —.");
    expect(overallRejectionHeadline(Number.NaN, null)).toBe("Overall rejection rate is —.");
    expect(overallRejectionHeadline(Number.POSITIVE_INFINITY, [])).toBe("Overall rejection rate is —.");
    expect(overallRejectionHeadline(Number.NEGATIVE_INFINITY, [])).toBe("Overall rejection rate is —.");

    expect(rejectionComparisonPhrase(undefined)).toBe("");
    expect(rejectionComparisonPhrase(null)).toBe("");
    expect(kpiRateDeltaText(undefined, 0.1, "03 Oct")).toBeNull();
    expect(kpiRateDeltaText(0.1, undefined, "03 Oct")).toBeNull();
    expect(kpiRateDeltaText(Number.NaN, 0.1, "03 Oct")).toBeNull();
    expect(kpiRateDeltaText(Number.POSITIVE_INFINITY, 0.1, "03 Oct")).toBeNull();
    expect(kpiRateDeltaText(0.2, Number.NEGATIVE_INFINITY, "03 Oct")).toBeNull();
    expect(kpiRelativeDeltaText(10, 0, "03 Oct")).toBeNull();
    expect(kpiRelativeDeltaText(Number.POSITIVE_INFINITY, 5, "03 Oct")).toBeNull();
    expect(kpiRelativeDeltaText(5, Number.NaN, "03 Oct")).toBeNull();
    expect(kpiRelativeDeltaText(undefined, undefined, "03 Oct")).toBeNull();

    const blanks = [
      { period: "a", label: "A", value: undefined as unknown as number },
      { period: "b", label: "B", value: undefined as unknown as number },
    ];
    expect(rejectionComparisonPhrase(blanks)).toBe("");
    expect(dashboardKpiDeltas(undefined).rateDiff).toBe("vs Prior Period");
    expect(dashboardKpiDeltas({ ratePoints: undefined }).fpyDiff).toBe("vs Prior Period");
  });

  test("a finite pair with a non-finite FPY or COPQ base drops only that number", () => {
    const series = gapSeries();
    const deltas = dashboardKpiDeltas({
      ratePoints: series,
      fpy: Number.NaN,
      copqTrend: [
        { label: "09 Oct", value: 0 },
        { label: "10 Oct", value: Number.POSITIVE_INFINITY },
      ],
    });
    expect(deltas.rateDiff).toBe("↓ 12.50% vs 03 Oct");
    expect(deltas.fpyDiff).toBe("vs 03 Oct");
    expect(deltas.copqDiff).toBe("vs 03 Oct");
    expect(JSON.stringify(deltas)).not.toMatch(NON_FINITE);
  });
});
