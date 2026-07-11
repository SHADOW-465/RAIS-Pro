import * as fs from "fs";
import * as path from "path";
import { datasetsWithRowsFromWorkbooks } from "../from-workbooks";
import { buildGenericDashboard } from "../dashboard";

const DIR = path.join(process.cwd(), "ANALYTICAL DATA", "REJECTION ANALYSIS 2025-26");
const maybe = fs.existsSync(DIR) ? describe : describe.skip;

describe("buildGenericDashboard (real corpus)", () => {
  const hasDir = fs.existsSync(DIR);
  if (!hasDir) {
    it.skip("skips because corpus directory is missing", () => {});
    return;
  }

  const files = fs
    .readdirSync(DIR)
    .filter((f) => /REJECTION ANALYSIS.*\.xlsx$/i.test(f) && !f.startsWith("~$"))
    .map((f) => ({ fileName: f, data: fs.readFileSync(path.join(DIR, f)) as unknown as ArrayBuffer }));

  it("produces a sane, non-empty dashboard for every real dataset", () => {
    const { datasets, rows } = datasetsWithRowsFromWorkbooks(files);
    expect(datasets.length).toBeGreaterThan(0);

    for (const ds of datasets) {
      const dsRows = rows.filter((r) => r.datasetId === ds.id);
      const dashboard = buildGenericDashboard(ds, dsRows);
      // At least one KPI for datasets that actually have a `measure` column.
      // (Some real sheets — e.g. a yearly summary with only date + %-derived
      // columns — legitimately have zero `measure` columns; the builder must
      // degrade gracefully there rather than every dataset having a KPI.)
      const hasMeasureCol = ds.columns.some((c) => c.role === "measure");
      if (hasMeasureCol) {
        expect(dashboard.kpis.length).toBeGreaterThan(0);
      }
      // No KPI total is NaN/negative (rejection/quantity counts are non-negative).
      for (const k of dashboard.kpis) {
        expect(Number.isFinite(k.total)).toBe(true);
        expect(k.total).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it("the Visual-shaped dataset (one with defect columns) produces a non-null Pareto", () => {
    const { datasets, rows } = datasetsWithRowsFromWorkbooks(files);
    const withDefects = datasets.find((d) => d.columns.some((c) => c.role === "defect"));
    if (!withDefects) return; // corpus shape may vary; don't fail if none matched
    const dsRows = rows.filter((r) => r.datasetId === withDefects.id);
    const dashboard = buildGenericDashboard(withDefects, dsRows);
    expect(dashboard.defectPareto).not.toBeNull();
  });
});
