// src/lib/ingest/parsers/__tests__/parse-rejection-analysis.test.ts
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { parseRejectionAnalysis } from "../parse-rejection-analysis";

const FILE = join(process.cwd(), "ANALYTICAL DATA", "REJECTION ANALYSIS 2025-26", "01 REJECTION ANALYSIS-APRIL 2025.xlsx");
const maybe = existsSync(FILE) ? describe : describe.skip;

maybe("parseRejectionAnalysis", () => {
  const out = parseRejectionAnalysis(readFileSync(FILE), "01 REJECTION ANALYSIS-APRIL 2025.xlsx");
  it("produces rejection-analysis records for the four stages", () => {
    const stages = new Set(out.map((p) => p.record.stageId));
    expect(out.length).toBeGreaterThan(0);
    expect(out.every((p) => p.family === "rejection-analysis")).toBe(true);
    expect(stages.has("visual")).toBe(true);
  });
});
