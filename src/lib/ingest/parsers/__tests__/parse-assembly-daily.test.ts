// src/lib/ingest/parsers/__tests__/parse-assembly-daily.test.ts
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { parseAssemblyDaily } from "../parse-assembly-daily";

const FILE = join(process.cwd(), "DATA", "ASSEMBLY REJECTION REPORT.xlsx");
const maybe = existsSync(FILE) ? describe : describe.skip;

maybe("parseAssemblyDaily (golden, APRIL 25)", () => {
  const { records } = parseAssemblyDaily(readFileSync(FILE), "ASSEMBLY REJECTION REPORT.xlsx");
  const april = records.filter((r) => r.occurredOn.start.startsWith("2025-04"));

  const sum = (stage: string, pick: (r: any) => number | null) =>
    april.filter((r) => r.stageId === stage).reduce((s, r) => s + (pick(r) ?? 0), 0);

  it("totals visual rejected to the sheet's total row", () => {
    expect(sum("visual", (r) => r.rejected?.value)).toBe(19271);
    expect(sum("visual", (r) => r.checked?.value)).toBe(247767);
  });
  it("totals balloon + valve + final rejected", () => {
    expect(sum("balloon", (r) => r.rejected?.value)).toBe(1910);
    expect(sum("valve-integrity", (r) => r.rejected?.value)).toBe(6101);
    expect(sum("final", (r) => r.rejected?.value)).toBe(5900);
  });
  it("skips SUNDAY/WEEK/Total marker rows (no record on those)", () => {
    expect(april.every((r) => /^\d{4}-\d{2}-\d{2}$/.test(r.occurredOn.start))).toBe(true);
  });
});
