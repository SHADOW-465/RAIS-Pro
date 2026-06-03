import { readFileSync } from "fs";
import { join } from "path";
import { parseWorkbookBuffer } from "@/lib/parser";
import { inferSheetGraph, computeMetrics } from "@/lib/metrics";
import { GOLDEN } from "./fixtures/golden";

const DATA = join(process.cwd(), "DATA");

function runFile(file: string) {
  const { summaries } = parseWorkbookBuffer(readFileSync(join(DATA, file)), file);
  const graphs = summaries.map(inferSheetGraph);
  const res = computeMetrics(summaries, graphs);
  const v = (id: string) => res.metrics.find((m) => m.id === id)!.value;
  return { summaries, graphs, res, v };
}

describe("golden metrics (entry-stage funnel)", () => {
  for (const [file, g] of Object.entries(GOLDEN)) {
    test(`${file}: checked / accepted / rejected / hold / rate match golden`, () => {
      const { v } = runFile(file);
      expect(v("checked_qty")).toBeCloseTo(g.checkedQty, 6);
      expect(v("accepted_qty")).toBeCloseTo(g.acceptedQty, 6);
      expect(v("rejected_qty")).toBeCloseTo(g.rejectedQty, 6);
      expect(v("hold_qty")).toBeCloseTo(g.holdQty, 6);
      expect(v("rejection_rate")).toBeCloseTo(g.rejectionRate, 12);
    });

    test(`${file}: reportType + summary handling`, () => {
      const { graphs } = runFile(file);
      // Every sheet of this file is detected as the expected report type.
      const types = new Set(graphs.map((x) => x.reportType));
      expect(types.has(g.reportType)).toBe(true);

      if (g.isSummary) {
        // Summary files: every sheet is isSummary → excluded → checked = 0.
        expect(graphs.every((x) => x.isSummary)).toBe(true);
        const { v } = runFile(file);
        expect(v("checked_qty")).toBe(0);
        expect(v("rejected_qty")).toBe(0);
      }
    });
  }

  test("summary sheets inside multi-sheet files are excluded from aggregation", () => {
    // ASSEMBLY has a YEARLY 2025-26 rollup sheet; it must NOT inflate totals.
    const { graphs } = runFile("ASSEMBLY REJECTION REPORT.xlsx");
    const yearly = graphs.find((x) => /yearly/i.test(x.sheetKey));
    expect(yearly?.isSummary).toBe(true);
  });

  test("ASSEMBLY rejection rate is a believable single-to-low-double-digit %", () => {
    const { v } = runFile("ASSEMBLY REJECTION REPORT.xlsx");
    const rate = v("rejection_rate");
    expect(rate).toBeGreaterThan(0.01);
    expect(rate).toBeLessThan(0.25);
  });

  test("ASSEMBLY APRIL single-sheet reconciles to embedded Total row", () => {
    const { summaries } = parseWorkbookBuffer(
      readFileSync(join(DATA, "ASSEMBLY REJECTION REPORT.xlsx")),
      "ASSEMBLY REJECTION REPORT.xlsx"
    );
    const apr = summaries.find((s) => s.name.toUpperCase().includes("APRIL"))!;
    const g = inferSheetGraph(apr);
    const res = computeMetrics([apr], [g]);
    const v = (id: string) => res.metrics.find((m) => m.id === id)!.value;
    expect(v("checked_qty")).toBe(247767); // matches sheet Total row
    expect(v("rejected_qty")).toBe(19271 + 1910 + 6101); // three stage rejects
  });

  // ── Independent regression guard for the two-row-header (legend-row) bug ──────
  // VISUAL monthly sheets carry a reason-code legend row (COAG/SD/…/BST) right
  // under the real header. A naive "most distinct strings wins" header detector
  // picks the 21-token legend row, drops REC. QTY / REJ. QTY, and zeroes
  // checked-qty. These assertions reconcile against the spreadsheet's OWN APRIL
  // Total row (247767 / 215296 / 12200 / 19271) — values the app aggregation does
  // not invent — so they fail loudly if header detection regresses.
  test("VISUAL APRIL single-sheet reconciles to embedded Total row", () => {
    const { summaries } = parseWorkbookBuffer(
      readFileSync(join(DATA, "VISUAL INSPECTION REPORT 2025.xlsx")),
      "VISUAL INSPECTION REPORT 2025.xlsx"
    );
    const apr = summaries.find((s) => s.name.toUpperCase().includes("APRIL"))!;
    const col = (name: string) => apr.columns.find((c) => c.name === name);
    // The quantity columns must exist (legend row must NOT have been chosen).
    expect(col("REC. QTY")?.sum).toBe(247767);
    expect(col("ACCEPT QTY")?.sum).toBe(215296);
    expect(col("HOLD QTY")?.sum).toBe(12200);
    expect(col("REJ. QTY")?.sum).toBe(19271);
    // Reason matrix still labelled by the merged sub-header (not dropped).
    expect(col("BM")?.sum).toBe(3807);
  });

  test("VISUAL whole-file checked-qty is non-zero (legend-row regression guard)", () => {
    const { v } = runFile("VISUAL INSPECTION REPORT 2025.xlsx");
    expect(v("checked_qty")).toBeGreaterThan(2_000_000);
    const rate = v("rejection_rate");
    expect(rate).toBeGreaterThan(0.01);
    expect(rate).toBeLessThan(0.25);
  });
});
