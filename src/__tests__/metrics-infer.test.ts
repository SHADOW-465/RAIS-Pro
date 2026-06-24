import { readFileSync } from "fs";
import { join } from "path";
import { parseWorkbookBuffer } from "@/lib/parser";
import type { ColumnSummary, SheetSummary } from "@/lib/parser";
import { inferSheetGraph } from "@/lib/metrics";

// ─── helpers ──────────────────────────────────────────────────────────────────

function col(name: string, type: ColumnSummary["type"], opts: Partial<ColumnSummary> = {}): ColumnSummary {
  return {
    name,
    type,
    uniqueCount: opts.uniqueCount ?? 20,
    sampleData: opts.sampleData ?? [],
    ...(type === "number" ? { sum: opts.sum ?? 100, mean: 1, min: 0, max: 10 } : {}),
    ...opts,
  };
}

function sheet(name: string, columns: ColumnSummary[], rowCount = 30): SheetSummary {
  return {
    name,
    rowCount,
    totalRowsStripped: 0,
    columns,
    groupedSeries: [],
    manifest: {} as any,
  };
}

const roleOf = (g: ReturnType<typeof inferSheetGraph>, c: string) =>
  g.columns.find((m) => m.column === c)?.role;
const stageOf = (g: ReturnType<typeof inferSheetGraph>, c: string) =>
  g.columns.find((m) => m.column === c)?.stage;

// ─── synthetic ASSEMBLY (Apr-Oct shape) ────────────────────────────────────────

test("assembly funnel: stage grouping + derived/ignore roles + stageOrder", () => {
  const s = sheet("ASSEMBLY REJECTION REPORT.xlsx - APRIL 25", [
    col("DATE", "date"),
    col("VISUAL QTY", "number"),
    col("VISUAL ACPT QTY", "number"),
    col("REJ QTY", "number"),
    col("REJ %", "number"),
    col("BALLOON CHKD QTY", "number"),
    col("BALLOON ACPT QTY", "number"),
    col("REJ QTY (2)", "number"),
    col("REJ % (2)", "number"),
    col("VALVE INT CHKD QTY", "number"),
    col("VALVE INTY ACPT QTY", "number"),
    col("VALVE INTY REJ Qty", "number"),
    col("REJ % (3)", "number"),
    col("FINAL CHECKED QTY", "number"),
    col("FINAL REJECTION", "number"),
    col("TOTAL REJ QTY", "number"),
    col("FINAL REJ %", "number"),
  ]);
  const g = inferSheetGraph(s);
  expect(g.reportType).toBe("assembly");
  expect(g.isSummary).toBe(false);

  expect(roleOf(g, "VISUAL QTY")).toBe("stage_checked");
  expect(stageOf(g, "VISUAL QTY")).toBe("visual");
  expect(roleOf(g, "VISUAL ACPT QTY")).toBe("stage_accepted");
  expect(roleOf(g, "REJ QTY")).toBe("stage_rejected");
  expect(stageOf(g, "REJ QTY")).toBe("visual");

  expect(roleOf(g, "REJ %")).toBe("ignore");

  expect(roleOf(g, "BALLOON CHKD QTY")).toBe("stage_checked");
  expect(stageOf(g, "BALLOON CHKD QTY")).toBe("balloon");
  expect(roleOf(g, "REJ QTY (2)")).toBe("stage_rejected");
  expect(stageOf(g, "REJ QTY (2)")).toBe("balloon");

  expect(roleOf(g, "VALVE INT CHKD QTY")).toBe("stage_checked");
  expect(stageOf(g, "VALVE INT CHKD QTY")).toBe("valve-integrity");
  expect(roleOf(g, "VALVE INTY REJ Qty")).toBe("stage_rejected");

  expect(roleOf(g, "FINAL CHECKED QTY")).toBe("derived_total");
  expect(roleOf(g, "FINAL REJECTION")).toBe("derived_total");
  expect(roleOf(g, "TOTAL REJ QTY")).toBe("derived_total");
  expect(roleOf(g, "FINAL REJ %")).toBe("ignore");

  expect(g.stageOrder).toEqual(["visual", "balloon", "valve-integrity"]);
});

test("assembly Nov-Jan shape: Eye Punching is the entry stage", () => {
  const s = sheet("ASSEMBLY REJECTION REPORT.xlsx - NOVEMBER 25", [
    col("DATE", "date"),
    col("EYE PUNCHING QTY", "number"),
    col("EYE PUNCHING ACPT", "number"),
    col("REJ QTY", "number"),
    col("VISUAL QTY", "number"),
    col("VISUAL ACPT QTY", "number"),
    col("REJ QTY (2)", "number"),
    col("REJ %", "number"),
    col("BALLOON CHKD QTY", "number"),
    col("BALLOON ACPT QTY", "number"),
    col("REJ QTY (3)", "number"),
  ]);
  const g = inferSheetGraph(s);
  expect(g.reportType).toBe("assembly");
  expect(g.stageOrder[0]).toBe("eye-punching");
  expect(stageOf(g, "EYE PUNCHING QTY")).toBe("eye-punching");
  expect(roleOf(g, "EYE PUNCHING QTY")).toBe("stage_checked");
  expect(roleOf(g, "EYE PUNCHING ACPT")).toBe("stage_accepted");
  expect(stageOf(g, "REJ QTY")).toBe("eye-punching");
  expect(stageOf(g, "REJ QTY (2)")).toBe("visual");
});

// ─── synthetic BALLOON & VALVE ──────────────────────────────────────────────────

test("balloon_valve: two stages + reason_count columns", () => {
  const s = sheet("BALLOON & VALVE INTEGRITY INSPECTION REPORT FILE 2025.xlsx - APRIL 25", [
    col("DATE", "date"),
    col("CHECKED QTY", "number"),
    col("ACCEPT QTY", "number"),
    col("REJ. QTY", "number"),
    col("REJ. %", "number"),
    col("STRUCK BALLOON", "number"),
    col("BALLOOM BRUST", "number"),
    col("LEAKAGE", "number"),
    col("CHECKED QTY (2)", "number"),
    col("ACCEPT QTY (2)", "number"),
    col("HOLD QTY (2)", "number"),
    col("REJ. QTY (2)", "number"),
    col("REJ. % (2)", "number"),
    col("THIN SPOD", "number"),
  ]);
  const g = inferSheetGraph(s);
  expect(g.reportType).toBe("balloon_valve");
  expect(roleOf(g, "CHECKED QTY")).toBe("stage_checked");
  expect(stageOf(g, "CHECKED QTY")).toBe("balloon");
  expect(roleOf(g, "REJ. QTY")).toBe("stage_rejected");
  expect(roleOf(g, "REJ. %")).toBe("ignore");
  expect(roleOf(g, "STRUCK BALLOON")).toBe("reason_count");
  expect(roleOf(g, "LEAKAGE")).toBe("reason_count");
  expect(roleOf(g, "CHECKED QTY (2)")).toBe("stage_checked");
  expect(stageOf(g, "CHECKED QTY (2)")).toBe("valve-integrity");
  expect(roleOf(g, "HOLD QTY (2)")).toBe("stage_hold");
  expect(roleOf(g, "THIN SPOD")).toBe("reason_count");
  expect(g.stageOrder).toEqual(["balloon", "valve-integrity"]);
});

// ─── synthetic SHOPFLOOR ────────────────────────────────────────────────────────

test("shopfloor: reason columns + Total is derived_total + trolleys dimension", () => {
  const s = sheet("SHOPFLOOR REJECTION REPORT.xlsx - APRIL 25", [
    col("DATE", "date"),
    col("No of TROLLEYS", "number", { uniqueCount: 21 }),
    col("COAG", "number"),
    col("Raised Wire", "number"),
    col("Surface Defect", "number"),
    col("Overlaping", "number"),
    col("Black Mark", "number"),
    col("Webbing", "number"),
    col("Missing Formers", "number"),
    col("Others", "number"),
    col("Total", "number"),
  ]);
  const g = inferSheetGraph(s);
  expect(g.reportType).toBe("shopfloor");
  expect(roleOf(g, "COAG")).toBe("reason_count");
  expect(roleOf(g, "Others")).toBe("reason_count");
  expect(roleOf(g, "Total")).toBe("derived_total");
  expect(roleOf(g, "No of TROLLEYS")).toBe("dimension");
  expect(roleOf(g, "DATE")).toBe("date");
  expect(g.stageOrder).toEqual([]);
});

// ─── synthetic VISUAL reason-matrix ─────────────────────────────────────────────

test("visual reason-matrix: reason_count columns, no stage", () => {
  const s = sheet("VISUAL INSPECTION REPORT 2025.xlsx - APRIL 25", [
    col("COAG", "number"),
    col("SD", "number"),
    col("TT", "number"),
    col("BL", "number"),
    col("PS", "number"),
    col("BM", "number"),
  ]);
  const g = inferSheetGraph(s);
  expect(g.reportType).toBe("visual");
  expect(roleOf(g, "COAG")).toBe("reason_count");
  expect(roleOf(g, "SD")).toBe("reason_count");
  expect(g.stageOrder).toEqual([]);
});

test("visual batch sheet: REC QTY entry stage 'Overall'", () => {
  const s = sheet("VISUAL INSPECTION REPORT 2025.xlsx - MARCH 25", [
    col("B.NO", "string", { uniqueCount: 25 }),
    col("SIZE", "string", { uniqueCount: 8 }),
    col("REC. QTY", "number"),
    col("ACCEPT QTY", "number"),
    col("HOLD QTY", "number"),
    col("HOLD %", "number"),
    col("REJ %", "number"),
    col("REJ. QTY", "number"),
    col("REASON FOR REJECTION", "string", { uniqueCount: 12 }),
  ]);
  const g = inferSheetGraph(s);
  expect(roleOf(g, "REC. QTY")).toBe("stage_checked");
  expect(stageOf(g, "REC. QTY")).toBe("overall");
  expect(roleOf(g, "ACCEPT QTY")).toBe("stage_accepted");
  expect(roleOf(g, "HOLD QTY")).toBe("stage_hold");
  expect(roleOf(g, "REJ. QTY")).toBe("stage_rejected");
  expect(roleOf(g, "REJ %")).toBe("ignore");
  expect(roleOf(g, "HOLD %")).toBe("ignore");
  expect(roleOf(g, "B.NO")).toBe("dimension");
  expect(roleOf(g, "REASON FOR REJECTION")).toBe("dimension");
});

// ─── summary sheets ─────────────────────────────────────────────────────────────

test("cumulative sheet marked isSummary", () => {
  const s = sheet("COMMULATIVE 2025-26.xlsx - Sheet1", [
    col("S.NO.", "number", { uniqueCount: 12 }),
    col("MONTH", "date"),
    col("PRODUCTION QTY", "number"),
    col("DISPATCH QTY", "number"),
    col("TOTAL REJ", "number"),
    col("REJ %", "number"),
  ], 12);
  const g = inferSheetGraph(s);
  expect(g.reportType).toBe("cumulative");
  expect(g.isSummary).toBe(true);
  expect(roleOf(g, "TOTAL REJ")).toBe("derived_total");
  expect(roleOf(g, "REJ %")).toBe("ignore");
  expect(roleOf(g, "S.NO.")).toBe("ignore");
});

test("YEARLY sheet name marked isSummary even for assembly shape", () => {
  const s = sheet("ASSEMBLY REJECTION REPORT.xlsx - YEARLY 2025-26", [
    col("MONTH", "date"),
    col("VISUAL QTY", "number"),
    col("VISUAL ACPT QTY", "number"),
    col("REJ QTY", "number"),
  ], 12);
  const g = inferSheetGraph(s);
  expect(g.isSummary).toBe(true);
});

// ─── real data ──────────────────────────────────────────────────────────────────

test("real ASSEMBLY APRIL roles via parser", () => {
  const buf = readFileSync(join(process.cwd(), "DATA", "ASSEMBLY REJECTION REPORT.xlsx"));
  const { summaries } = parseWorkbookBuffer(buf, "ASSEMBLY REJECTION REPORT.xlsx");
  const apr = summaries.find((s) => s.name.toUpperCase().includes("APRIL"))!;
  const g = inferSheetGraph(apr);
  expect(g.reportType).toBe("assembly");
  expect(roleOf(g, "VISUAL QTY")).toBe("stage_checked");
  expect(stageOf(g, "VISUAL QTY")).toBe("visual");
  expect(roleOf(g, "REJ QTY")).toBe("stage_rejected");
  expect(roleOf(g, "TOTAL REJ QTY")).toBe("derived_total");
  expect(roleOf(g, "REJ %")).toBe("ignore");
  expect(g.stageOrder[0]).toBe("visual");
});
