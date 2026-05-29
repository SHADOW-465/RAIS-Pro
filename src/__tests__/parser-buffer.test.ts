import { readFileSync } from "fs";
import { join } from "path";
import { parseWorkbookBuffer } from "@/lib/parser";

test("parseWorkbookBuffer reads a real xlsx into summaries", () => {
  const buf = readFileSync(join(process.cwd(), "DATA", "ASSEMBLY REJECTION REPORT.xlsx"));
  const { summaries } = parseWorkbookBuffer(buf, "ASSEMBLY REJECTION REPORT.xlsx");
  expect(summaries.length).toBeGreaterThan(0);
  expect(summaries[0].name).toContain("ASSEMBLY");
});
