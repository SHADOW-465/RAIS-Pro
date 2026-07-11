// Phase 1 proof (MOD-MIGRATION-PLAN §Phase 1): the reader captures a real
// corpus workbook losslessly — every sheet, every populated cell, formulas,
// merges — and is content-addressed (same bytes → same snapshotId).
import * as fs from "fs";
import * as path from "path";
import * as XLSX from "xlsx";
import { readWorkbookSnapshot } from "@/core/workbook/reader";
import { WorkbookSnapshot } from "@/shared/models/workbook";

const CORPUS = path.join(process.cwd(), "DATA", "VISUAL INSPECTION REPORT 2025.xlsx");
const maybe = fs.existsSync(CORPUS) ? describe : describe.skip;

maybe("readWorkbookSnapshot (real corpus)", () => {
  const buf = fs.readFileSync(CORPUS);

  it("captures every sheet and every populated cell, and validates against the schema", async () => {
    const snap = await readWorkbookSnapshot(buf, "VISUAL INSPECTION REPORT 2025.xlsx");
    expect(() => WorkbookSnapshot.parse(snap)).not.toThrow();

    const wb = XLSX.read(buf, { cellFormula: true, cellNF: true, cellStyles: true });
    expect(snap.sheets.map((s) => s.name)).toEqual(wb.SheetNames);

    for (const sheet of snap.sheets) {
      const ws = wb.Sheets[sheet.name]!;
      // Count populated cells straight off the worksheet object (keys that are
      // real A1 refs) and compare — the snapshot must not drop a single one.
      const direct = Object.keys(ws).filter((k) => /^[A-Z]+\d+$/.test(k) && ws[k] !== undefined).length;
      expect(sheet.cells.length).toBe(direct);

      // Merges preserved 1:1.
      expect(sheet.merges.length).toBe((ws["!merges"] ?? []).length);
    }

    // Formulas survive verbatim: every cell.f in the source appears in the snapshot.
    const sourceFormulas = wb.SheetNames.flatMap((n) => {
      const ws = wb.Sheets[n]!;
      return Object.keys(ws)
        .filter((k) => /^[A-Z]+\d+$/.test(k) && typeof ws[k].f === "string")
        .map((k) => ws[k].f as string);
    });
    const snapFormulas = snap.sheets.flatMap((s) => s.cells.filter((c) => c.f !== null).map((c) => c.f));
    expect(snapFormulas.length).toBe(sourceFormulas.length);
    expect(sourceFormulas.length).toBeGreaterThan(0); // the corpus IS formula-heavy
  });

  it("is content-addressed: identical bytes → identical snapshotId", async () => {
    const a = await readWorkbookSnapshot(buf, "a.xlsx");
    const b = await readWorkbookSnapshot(Buffer.from(buf), "b.xlsx");
    expect(a.snapshotId).toBe(b.snapshotId);
    expect(a.snapshotId).toMatch(/^[0-9a-f]{64}$/);
  });
});
