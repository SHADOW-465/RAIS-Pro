import { buildPrompt, buildManifestPrompt } from "../lib/analysis-utils";
import {
  DashboardConfigSchema,
  MergePlanSchema,
  InsightSlideAnswerSchema,
} from "../lib/schemas";

describe("buildPrompt", () => {
  const minimalMergedResult = {
    groups: [
      {
        label: "All Data",
        rowCount: 5,
        sourceSheets: ["test.xlsx - Sheet1"],
        numericAggregates: { Rejections: { sum: 100, mean: 20, min: 5, max: 40 } },
        groupedSeries: [],
      },
    ],
    grandTotals: { Rejections: { sum: 100, mean: 20 } },
    mergePlan: {
      groups: [
        { label: "All Data", sheets: ["test.xlsx - Sheet1"], reason: "single sheet" },
      ],
      excludedSheets: [],
      crossFileStrategy: "sum" as const,
      warnings: [],
    },
  };

  it("includes the data section with grand totals", () => {
    const prompt = buildPrompt(minimalMergedResult);
    expect(prompt).toContain("GRAND TOTALS");
    expect(prompt).toContain("Rejections");
  });

  it("does not contain hardcoded manufacturing field names", () => {
    const prompt = buildPrompt(minimalMergedResult);
    expect(prompt).not.toContain("rejectionRate");
    expect(prompt).not.toContain("totalOutput");
    expect(prompt).not.toContain("qualityScore");
  });

  it("instructs the model to populate history when a time series exists", () => {
    const prompt = buildPrompt(minimalMergedResult);
    expect(prompt).toContain("history");
  });
});

describe("buildManifestPrompt", () => {
  it("formats sheets and rules", () => {
    const prompt = buildManifestPrompt([
      {
        sheetKey: "a.xlsx - S1",
        fileName: "a.xlsx",
        sheetName: "S1",
        rowCount: 100,
        totalRowsStripped: 0,
        granularity: "monthly",
        timeRange: "Jan-Mar 2024",
        isSummaryCandidate: false,
        columns: ["date", "rejections"],
        numericTotals: { rejections: 50 },
        numericMeans: { rejections: 0.5 },
      },
    ]);
    expect(prompt).toContain("a.xlsx - S1");
    expect(prompt).toContain("crossFileStrategy");
  });
});

// Minimal KPI with all nullable fields set to null (cross-provider compat).
const minimalKpi = (overrides: Partial<Record<string, unknown>> = {}) => ({
  label: "Metric",
  value: "1",
  unit: null,
  trend: 0,
  context: "ctx",
  delta: null,
  history: null,
  source: null,
  sourceColumn: null,
  ...overrides,
});

describe("DashboardConfigSchema", () => {
  it("accepts a minimal valid dashboard", () => {
    const parsed = DashboardConfigSchema.parse({
      dashboardTitle: "Sales Q1",
      executiveSummary: "Revenue up.",
      kpis: [minimalKpi({ label: "Revenue", value: "$2.4M", trend: 1, context: "vs last Q" })],
      charts: [],
      insights: ["Insight one"],
      recommendations: ["Do this"],
      alerts: [],
    });
    expect(parsed.kpis).toHaveLength(1);
    expect(parsed.kpis[0].trend).toBe(1);
  });

  it("accepts string KPI values", () => {
    const parsed = DashboardConfigSchema.parse({
      dashboardTitle: "Orders",
      executiveSummary: "ok",
      kpis: [minimalKpi({ label: "Orders", value: "340", trend: 0, context: "total" })],
      charts: [],
      insights: [],
      recommendations: [],
      alerts: [],
    });
    expect(parsed.kpis[0].value).toBe("340");
  });

  it("rejects a non-integer trend value", () => {
    expect(() =>
      DashboardConfigSchema.parse({
        dashboardTitle: "X",
        executiveSummary: "ok",
        kpis: [minimalKpi({ trend: 1.5 })],
        charts: [],
        insights: [],
        recommendations: [],
        alerts: [],
      }),
    ).toThrow();
  });

  it("rejects empty kpis", () => {
    expect(() =>
      DashboardConfigSchema.parse({
        dashboardTitle: "X",
        executiveSummary: "ok",
        kpis: [],
        charts: [],
        insights: [],
        recommendations: [],
        alerts: [],
      }),
    ).toThrow();
  });

  it("accepts a history array for sparklines", () => {
    const parsed = DashboardConfigSchema.parse({
      dashboardTitle: "X",
      executiveSummary: "ok",
      kpis: [
        minimalKpi({
          label: "Rate",
          value: "2.71",
          unit: "%",
          trend: -1,
          context: "monthly avg",
          history: [2.1, 2.3, 2.05, 2.45, 2.71],
        }),
      ],
      charts: [],
      insights: [],
      recommendations: [],
      alerts: [],
    });
    expect(parsed.kpis[0].history).toHaveLength(5);
  });

  it("requires every nullable field to be explicitly present (Groq strict mode contract)", () => {
    // Missing `delta` etc — should fail under the new schema.
    expect(() =>
      DashboardConfigSchema.parse({
        dashboardTitle: "X",
        executiveSummary: "ok",
        kpis: [{ label: "X", value: "1", trend: 0, context: "" }],
        charts: [],
        insights: [],
        recommendations: [],
        alerts: [],
      }),
    ).toThrow();
  });
});

describe("MergePlanSchema", () => {
  it("accepts a minimal valid plan", () => {
    const plan = MergePlanSchema.parse({
      groups: [{ label: "All", sheets: ["a.xlsx - S1"], reason: "single" }],
      excludedSheets: [],
      crossFileStrategy: "sum",
      warnings: [],
    });
    expect(plan.groups).toHaveLength(1);
  });

  it("rejects an invalid crossFileStrategy", () => {
    expect(() =>
      MergePlanSchema.parse({
        groups: [{ label: "All", sheets: ["a"], reason: "x" }],
        excludedSheets: [],
        crossFileStrategy: "average",
        warnings: [],
      }),
    ).toThrow();
  });
});

describe("InsightSlideAnswerSchema", () => {
  it("accepts a 1-chart slide with bullets", () => {
    const slide = InsightSlideAnswerSchema.parse({
      headline: "Cork Line-2 produced 12 of 35 rejections (34%).",
      charts: [
        {
          title: "Top lots",
          type: "bar",
          data: {
            labels: ["LOT-A", "LOT-B"],
            datasets: [{ label: "rej", data: [10, 4] }],
          },
        },
      ],
      bullets: ["one", "two", "three"],
    });
    expect(slide.bullets).toHaveLength(3);
  });

  it("accepts fewer than 3 bullets (min() removed to prevent strict-mode NoObjectGeneratedError)", () => {
    const slide = InsightSlideAnswerSchema.parse({
      headline: "X 1.",
      charts: [],
      bullets: ["only one"],
    });
    expect(slide.bullets).toHaveLength(1);
  });
});
