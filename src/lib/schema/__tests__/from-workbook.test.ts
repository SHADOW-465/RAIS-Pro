// src/lib/schema/__tests__/from-workbook.test.ts
import * as fs from "fs";
import * as path from "path";
import { buildProfilingTables } from "@/lib/schema/from-workbook";
import { profileTable } from "@/lib/schema/profile";
import { computeSignature } from "@/lib/schema/signature";

// The real corpus lives outside src/. Guard so CI without the data still passes,
// while local runs validate the bug fix on genuine files.
const FILE = path.resolve(
  process.cwd(),
  "ANALYTICAL DATA/REJECTION ANALYSIS 2025-26/01 REJECTION ANALYSIS-APRIL 2025.xlsx",
);
const maybe = fs.existsSync(FILE) ? describe : describe.skip;

maybe("buildProfilingTables on the real April rejection-analysis workbook", () => {
  it("profiles the VISUAL sheet: linked counts are measures, % is derived", () => {
    const tables = buildProfilingTables(fs.readFileSync(FILE), path.basename(FILE));
    const visual = tables.find((t) => /visual/i.test(t.sheetName));
    expect(visual).toBeDefined();

    const { columns } = profileTable(visual!);
    const role = (re: RegExp) => columns.find((c) => re.test(c.name))?.role;

    // The exact regression: QUANTITY CHECKED & REJECTION are formula-LINKED raw
    // counts — they must survive as measures, not be dropped as "formula".
    expect(role(/quantity checked|checked/i)).toBe("measure");
    expect(role(/reject/i)).toBe("measure");
    expect(role(/^%$|percent/i)).toBe("derived");
  });

  it("produces a non-empty stable signature", () => {
    const tables = buildProfilingTables(fs.readFileSync(FILE), path.basename(FILE));
    const visual = tables.find((t) => /visual/i.test(t.sheetName))!;
    const sig = computeSignature(profileTable(visual).columns);
    expect(sig.hash).toMatch(/^[0-9a-f]{8}$/);
    expect(sig.columns.length).toBeGreaterThan(0);
  });
});
