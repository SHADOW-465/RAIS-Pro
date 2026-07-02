import { buildGenericDashboard } from "../dashboard";
import type { Dataset, DatasetRow } from "../types";

const dataset: Dataset = {
  id: "ds1",
  signatureHash: "ds1",
  title: "Visual Inspection",
  columns: [
    { role: "dimension-date", name: "date" },
    { role: "measure", name: "quantity checked" },
    { role: "measure", name: "rejection" },
    { role: "dimension", name: "size" },
    { role: "defect", name: "coag" },
    { role: "defect", name: "sd" },
  ],
  sources: [{ fileName: "a.xlsx", sheetName: "VISUAL", rowCount: 3 }],
  totalRows: 3,
  recognizedStageId: null,
};

const row = (date: string, checked: number, rejection: number, size: string, coag: number, sd: number): DatasetRow => ({
  datasetId: "ds1",
  fileName: "a.xlsx",
  sheetName: "VISUAL",
  rowIndex: 0,
  values: { date, "quantity checked": checked, rejection, size, coag, sd },
});

describe("buildGenericDashboard", () => {
  const rows = [
    row("2025-04-01", 100, 10, "6FR", 3, 2),
    row("2025-04-02", 200, 20, "8FR", 5, 0),
    row("2025-04-03", 150, 5, "6FR", 0, 1),
  ];

  it("sums each measure column into a KPI total", () => {
    const d = buildGenericDashboard(dataset, rows);
    const checkedKpi = d.kpis.find((k) => k.columnName === "quantity checked")!;
    expect(checkedKpi.total).toBe(450);
    const rejKpi = d.kpis.find((k) => k.columnName === "rejection")!;
    expect(rejKpi.total).toBe(35);
  });

  it("builds an ascending-by-date trend per KPI from the date-dimension column", () => {
    const d = buildGenericDashboard(dataset, rows);
    const checkedKpi = d.kpis.find((k) => k.columnName === "quantity checked")!;
    expect(checkedKpi.trend.map((p) => p.label)).toEqual(["2025-04-01", "2025-04-02", "2025-04-03"]);
    expect(checkedKpi.trend.map((p) => p.value)).toEqual([100, 200, 150]);
  });

  it("computes the dataset's overall date range from valid dates", () => {
    const d = buildGenericDashboard(dataset, rows);
    expect(d.dateRange).toEqual({ from: "2025-04-01", to: "2025-04-03" });
  });

  it("breaks down a dimension column by summing the first measure per distinct value, sorted desc", () => {
    const d = buildGenericDashboard(dataset, rows);
    const sizeBreakdown = d.breakdowns.find((b) => b.columnName === "size")!;
    // 6FR: rows 1 and 3 → 100 + 150 = 250 (first measure = "quantity checked").
    // 8FR: row 2 → 200.
    expect(sizeBreakdown.bars).toEqual([
      { label: "6FR", value: 250 },
      { label: "8FR", value: 200 },
    ]);
  });

  it("sums defect columns into a Pareto, descending, excluding zero-value defects", () => {
    const d = buildGenericDashboard(dataset, rows);
    expect(d.defectPareto).toEqual([
      { label: "Coag", value: 8 },
      { label: "Sd", value: 3 },
    ]);
  });

  it("returns null defectPareto and empty breakdowns/trend gracefully when a dataset has no such columns", () => {
    const bare: Dataset = { ...dataset, columns: [{ role: "measure", name: "count" }] };
    const bareRows: DatasetRow[] = [
      { datasetId: "ds1", fileName: "a.xlsx", sheetName: "S", rowIndex: 0, values: { count: 5 } },
    ];
    const d = buildGenericDashboard(bare, bareRows);
    expect(d.defectPareto).toBeNull();
    expect(d.breakdowns).toEqual([]);
    expect(d.dateRange).toBeNull();
    expect(d.kpis[0].trend).toEqual([]);
    expect(d.kpis[0].total).toBe(5);
  });

  it("dedupes same-name columns within a role so a name collision renders one tile, not two identical ones", () => {
    // Simulates two raw headers ("REJ %" / "Rej %") that both normalized to the
    // same Dataset.columns name — SchemaSignatureColumn has no column letter to
    // disambiguate, so the builder must not produce two KPIs both reading the
    // same value under the hood.
    const colliding: Dataset = {
      ...dataset,
      columns: [
        { role: "dimension-date", name: "date" },
        { role: "measure", name: "count" },
        { role: "measure", name: "count" }, // duplicate name, same role
      ],
    };
    const collidingRows: DatasetRow[] = [
      { datasetId: "ds1", fileName: "a.xlsx", sheetName: "S", rowIndex: 0, values: { date: "2025-04-01", count: 7 } },
    ];
    const d = buildGenericDashboard(colliding, collidingRows);
    expect(d.kpis).toHaveLength(1);
    expect(d.kpis[0].total).toBe(7);
  });

  it("treats non-numeric / null measure values as 0 rather than throwing or producing NaN", () => {
    const withGaps: DatasetRow[] = [
      row("2025-04-01", 100, 10, "6FR", 3, 2),
      { ...row("2025-04-02", 0, 0, "8FR", 0, 0), values: { date: "2025-04-02", "quantity checked": null, rejection: "n/a", size: "8FR", coag: 0, sd: 0 } },
    ];
    const d = buildGenericDashboard(dataset, withGaps);
    const checkedKpi = d.kpis.find((k) => k.columnName === "quantity checked")!;
    expect(checkedKpi.total).toBe(100);
    expect(Number.isNaN(checkedKpi.total)).toBe(false);
  });
});
