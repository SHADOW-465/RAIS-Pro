import { deriveTitle } from "../title";
import type { DatasetSource } from "../types";
import type { SchemaSignatureColumn } from "@/lib/schema/types";

const cols: SchemaSignatureColumn[] = [
  { role: "dimension-date", name: "date" },
  { role: "measure", name: "quantity checked" },
  { role: "derived", name: "%" },
];
const src = (fileName: string, sheetName = "VISUAL"): DatasetSource => ({ fileName, sheetName, rowCount: 10 });

describe("deriveTitle", () => {
  it("extracts the shared meaningful phrase across a monthly file series", () => {
    const sources = [
      src("01 REJECTION ANALYSIS-APRIL 2025.xlsx"),
      src("02 REJECTION ANALYSIS-MAY 2025.xlsx"),
      src("03 REJECTION ANALYSIS-JUNE 2025.xlsx"),
    ];
    expect(deriveTitle(cols, sources).toLowerCase()).toContain("rejection");
    expect(deriveTitle(cols, sources).toLowerCase()).toContain("analysis");
  });

  it("strips month, size, year and sequence noise", () => {
    const t = deriveTitle(cols, [src("1 APRIL 26.xlsx", "16FR"), src("2 MAY 26.xlsx", "16FR")]);
    expect(t).not.toMatch(/\d/);
    expect(t.toLowerCase()).not.toContain("april");
  });

  it("falls back to a shape description when names carry no signal", () => {
    const t = deriveTitle(cols, [src("Sheet1.xlsx", "Sheet1")]);
    expect(t.toLowerCase()).toContain("measure");
  });
});
