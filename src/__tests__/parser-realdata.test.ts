import { readFileSync } from "fs";
import { join } from "path";
import { parseWorkbookBuffer } from "@/lib/parser";

test("ASSEMBLY APRIL real header is detected (not a data row)", () => {
  const buf = readFileSync(join(process.cwd(), "DATA", "ASSEMBLY REJECTION REPORT.xlsx"));
  const { summaries } = parseWorkbookBuffer(buf, "ASSEMBLY REJECTION REPORT.xlsx");
  const apr = summaries.find(s => s.name.toUpperCase().includes("APRIL"))!;
  const names = apr.columns.map(c => c.name);
  // Real headers present, normalized
  expect(names.some(n => n === "DATE")).toBe(true);
  expect(names.some(n => /VISUAL/i.test(n))).toBe(true);
  // No header should look like a bare number (the data-row-as-header bug)
  expect(names.every(n => !/^\d+(\.\d+)?$/.test(n.trim()))).toBe(true);
});

test("BALLOON real header is detected through blank spacer row", () => {
  const buf = readFileSync(join(process.cwd(), "DATA", "BALLOON & VALVE INTEGRITY INSPECTION REPORT FILE 2025.xlsx"));
  const { summaries } = parseWorkbookBuffer(buf, "BALLOON & VALVE INTEGRITY INSPECTION REPORT FILE 2025.xlsx");
  const apr = summaries.find(s => s.name.toUpperCase().includes("APRIL"))!;
  const names = apr.columns.map(c => c.name);
  expect(names.every(n => !/^\d+(\.\d+)?$/.test(n.trim()))).toBe(true);
  expect(names.some(n => /DATE/i.test(n))).toBe(true);
});

test("VISUAL QTY is a numeric column and sums to the April total", () => {
  const buf = readFileSync(join(process.cwd(), "DATA", "ASSEMBLY REJECTION REPORT.xlsx"));
  const { summaries } = parseWorkbookBuffer(buf, "ASSEMBLY REJECTION REPORT.xlsx");
  const apr = summaries.find(s => s.name.toUpperCase().includes("APRIL"))!;
  const visual = apr.columns.find(c => c.name === "VISUAL QTY")!;
  expect(visual.type).toBe("number");
  expect(visual.sum).toBe(247767); // matches the sheet's own Total row
});
