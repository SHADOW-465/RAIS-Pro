import {
  reconcileGraph,
  metricsSane,
  metricsToKpis,
  metricsToCharts,
  calculatePareto,
  deriveMergePlan,
} from "../lib/dashboard-builder";
import type { MetricsResult, SheetGraph, Metric } from "@/types/metrics";
import type { SheetSummary, ColumnSummary } from "../lib/parser";

// ── helpers ──────────────────────────────────────────────────────────────────

function col(name: string, type: ColumnSummary["type"], extra: Partial<ColumnSummary> = {}): ColumnSummary {
  return { name, type, uniqueCount: 5, sampleData: [], ...extra };
}

function summary(name: string, cols: ColumnSummary[]): SheetSummary {
  return {
    name,
    rowCount: 10,
    totalRowsStripped: 0,
    columns: cols,
    groupedSeries: [],
    manifest: {} as SheetSummary["manifest"],
  };
}

function metric(id: string, value: number, display: string, cols: string[] = [], sheets: string[] = []): Metric {
  return { id, label: id, value, display, unit: null, formula: `formula:${id}`, inputs: [], sourceSheets: sheets, sourceColumns: cols };
}

function result(over: Partial<MetricsResult> = {}): MetricsResult {
  return {
    metrics: [
      metric("rejection_rate", 0.1, "10.00%"),
      metric("checked_qty", 1000, "1,000", ["VISUAL QTY"], ["a.xlsx - S1"]),
      metric("rejected_qty", 100, "100", ["REJ QTY"]),
      metric("accepted_qty", 0, "0"),
      metric("hold_qty", 0, "0"),
    ],
    stageBreakdown: [],
    reasonPareto: [],
    monthlyTrend: [],
    ...over,
  };
}

// ── reconcileGraph ─────────────────────────────────────────────────────────

describe("reconcileGraph", () => {
  const s = summary("a.xlsx - S1", [col("DATE", "date"), col("VISUAL QTY", "number"), col("REJ QTY", "number")]);
  const fallback: SheetGraph = {
    sheetKey: s.name,
    reportType: "assembly",
    isSummary: false,
    stageOrder: ["Visual"],
    columns: [
      { column: "DATE", role: "date", stage: null },
      { column: "VISUAL QTY", role: "stage_checked", stage: "Visual" },
      { column: "REJ QTY", role: "stage_rejected", stage: "Visual" },
    ],
    notes: null,
  };

  it("drops a hallucinated column the sheet doesn't have", () => {
    const llm: SheetGraph = {
      ...fallback,
      columns: [
        { column: "VISUAL QTY", role: "stage_checked", stage: "Visual" },
        { column: "GHOST COL", role: "stage_rejected", stage: "Visual" },
      ],
    };
    const out = reconcileGraph(llm, s, fallback);
    expect(out.columns.find((c) => c.column === "GHOST COL")).toBeUndefined();
  });

  it("back-fills a real column the model omitted, from the heuristic", () => {
    const llm: SheetGraph = {
      ...fallback,
      columns: [{ column: "VISUAL QTY", role: "stage_checked", stage: "Visual" }],
    };
    const out = reconcileGraph(llm, s, fallback);
    const rej = out.columns.find((c) => c.column === "REJ QTY");
    expect(rej?.role).toBe("stage_rejected");
    expect(out.columns).toHaveLength(3);
  });

  it("derives stageOrder from kept stage_checked columns", () => {
    const out = reconcileGraph(fallback, s, fallback);
    expect(out.stageOrder).toEqual(["Visual"]);
  });
});

// ── metricsSane ──────────────────────────────────────────────────────────────

describe("metricsSane", () => {
  const baseline = result();

  it("accepts metrics close to the baseline", () => {
    expect(metricsSane(result(), baseline)).toBe(true);
  });

  it("rejects an out-of-range rate", () => {
    const bad = result({ metrics: [metric("rejection_rate", 1.7, "170%"), metric("checked_qty", 1000, "1,000"), metric("rejected_qty", 100, "100")] });
    expect(metricsSane(bad, baseline)).toBe(false);
  });

  it("rejects checked qty that collapses far below baseline", () => {
    const bad = result({ metrics: [metric("rejection_rate", 0.1, "10%"), metric("checked_qty", 100, "100"), metric("rejected_qty", 100, "100")] });
    expect(metricsSane(bad, baseline)).toBe(false);
  });
});

// ── metricsToKpis ──────────────────────────────────────────────────────────

describe("metricsToKpis", () => {
  it("leads with rejection_rate and drops zero-valued accepted/hold", () => {
    const kpis = metricsToKpis(result());
    expect(kpis[0].label).toBe("rejection_rate");
    const ids = kpis.map((k) => k.label);
    expect(ids).not.toContain("accepted_qty");
    expect(ids).not.toContain("hold_qty");
  });

  it("threads sourceColumn through for verify-mode beams", () => {
    const kpis = metricsToKpis(result());
    const checked = kpis.find((k) => k.label === "checked_qty");
    expect(checked?.sourceColumn).toBe("VISUAL QTY");
  });

  it("computes a falling-rate trend and history from monthlyTrend", () => {
    const kpis = metricsToKpis(
      result({ monthlyTrend: [{ label: "APR", value: 0.12 }, { label: "MAY", value: 0.08 }] }),
    );
    const rate = kpis.find((k) => k.label === "rejection_rate")!;
    expect(rate.trend).toBe(1); // falling rate is good
    expect(rate.history).toEqual([12, 8]);
  });
});

// ── metricsToCharts ──────────────────────────────────────────────────────────

describe("metricsToCharts", () => {
  it("emits stage, reason and trend charts when data is present", () => {
    const charts = metricsToCharts(
      result({
        stageBreakdown: [{ stage: "Visual", checked: 1000, rejected: 100, rate: 0.1 }],
        reasonPareto: [{ label: "LEAKAGE", value: 40 }],
        monthlyTrend: [{ label: "APR", value: 0.1 }, { label: "MAY", value: 0.08 }],
      }),
    );
    expect(charts.map((c) => c.title)).toEqual([
      "Rejection rate by stage",
      "Top rejection reasons",
      "Rejection rate trend",
    ]);
  });

  it("omits charts with no data", () => {
    expect(metricsToCharts(result())).toHaveLength(0);
  });
});

// ── calculatePareto ──────────────────────────────────────────────────────────

describe("calculatePareto", () => {
  it("returns null when there is no positive reason data", () => {
    expect(calculatePareto([])).toBeNull();
    expect(calculatePareto([{ label: "X", value: 0 }])).toBeNull();
  });

  it("ranks descending, reaches 100% cumulative, and flags the vital few", () => {
    // 50 / 35 / 10 / 5  →  totals 100. First crosses 50, second crosses 85 (>80).
    const p = calculatePareto([
      { label: "STRUCK BALLOON", value: 35 },
      { label: "LEAKAGE", value: 50 },
      { label: "DENT", value: 10 },
      { label: "SCRATCH", value: 5 },
    ])!;
    expect(p.totalDefects).toBe(100);
    expect(p.items.map((i) => i.label)).toEqual(["LEAKAGE", "STRUCK BALLOON", "DENT", "SCRATCH"]);
    expect(p.items.map((i) => i.rank)).toEqual([1, 2, 3, 4]);
    // cumulative strictly reaches 100 on the last item
    expect(p.items[p.items.length - 1].cumulative).toBeCloseTo(100, 6);
    // vital few = items up to and including the one crossing 80% (50 then 85)
    expect(p.items.map((i) => i.isVitalFew)).toEqual([true, true, false, false]);
    expect(p.vitalFewCount).toBe(2);
    expect(p.vitalFewContribution).toBeCloseTo(85, 6);
    expect(p.criticalAreaText).toContain("top 2 defect categories");
    expect(p.criticalAreaText).toContain("85.0%");
  });

  it("uses singular phrasing when one category dominates", () => {
    const p = calculatePareto([
      { label: "LEAKAGE", value: 90 },
      { label: "DENT", value: 10 },
    ])!;
    expect(p.vitalFewCount).toBe(1);
    expect(p.criticalAreaText).toContain("top 1 defect category");
  });
});

// ── deriveMergePlan ────────────────────────────────────────────────────────

describe("deriveMergePlan", () => {
  const graphs: SheetGraph[] = [
    { sheetKey: "a.xlsx - S1", reportType: "assembly", isSummary: false, stageOrder: [], columns: [], notes: null },
    { sheetKey: "a.xlsx - Yearly", reportType: "yearly_production", isSummary: true, stageOrder: [], columns: [], notes: null },
  ];
  const summaries = [summary("a.xlsx - S1", []), summary("a.xlsx - Yearly", [])];

  it("excludes summary sheets and labels a single source 'All Data'", () => {
    const plan = deriveMergePlan(summaries, graphs);
    expect(plan.groups).toHaveLength(1);
    expect(plan.groups[0].label).toBe("All Data");
    expect(plan.groups[0].sheets).toEqual(["a.xlsx - S1"]);
    expect(plan.excludedSheets.map((e) => e.sheet)).toEqual(["a.xlsx - Yearly"]);
  });

  it("keeps distinct files as separate groups", () => {
    const multi = [...summaries, summary("b.xlsx - S1", [])];
    const multiGraphs = [...graphs, { sheetKey: "b.xlsx - S1", reportType: "balloon_valve" as const, isSummary: false, stageOrder: [], columns: [], notes: null }];
    const plan = deriveMergePlan(multi, multiGraphs);
    expect(plan.groups.map((g) => g.label).sort()).toEqual(["a.xlsx", "b.xlsx"]);
  });
});
