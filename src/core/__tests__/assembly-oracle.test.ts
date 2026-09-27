/** @jest-environment node */
// End-to-end oracle against the REAL plant workbook that broke: a four-stage
// sheet packed with no separating blank column. Skips itself when the corpus
// isn't present so the suite still runs on a clean checkout.
import fs from "fs";
import path from "path";
import { buildProfilingTables } from "@/core/profiler/from-workbook";

const FILE = path.join(process.env.USERPROFILE ?? "", "Desktop", "New folder", "ASSEMBLY_REJECTION_REPORT_corrected.xlsx");
const present = fs.existsSync(FILE);
const maybe = present ? describe : describe.skip;

maybe("ASSEMBLY_REJECTION_REPORT — four stages on one sheet", () => {
  let tables: ReturnType<typeof buildProfilingTables> = [];
  let april: ReturnType<typeof buildProfilingTables> = [];

  beforeAll(() => {
    if (present) {
      tables = buildProfilingTables(fs.readFileSync(FILE), "ASSEMBLY_REJECTION_REPORT_corrected.xlsx", { maxRows: 40 });
      april = tables.filter((t) => t.sheetName === "APRIL 25");
    }
  });

  it("profiles one region per stage rather than one for the sheet", () => {
    expect(april.map((t) => t.regionLabel)).toEqual(["Visual", "Balloon", "Valve Integrity", "Final"]);
  });

  it("gives every region its own date axis", () => {
    for (const t of april) expect(t.header.some((h) => /date/i.test(h))).toBe(true);
  });

  it("keeps each stage's own columns together", () => {
    const visual = april.find((t) => t.regionLabel === "Visual")!;
    const balloon = april.find((t) => t.regionLabel === "Balloon")!;
    // Visual owns B,C,D,E; balloon owns F,G,H,I. The bug read F as visual's Checked.
    expect(visual.colLetters).toEqual(["A", "B", "C", "D", "E"]);
    expect(balloon.colLetters).toEqual(["A", "F", "G", "H", "I"]);
  });

  it("reads the 01-Apr row as four separate, self-consistent stage rows", () => {
    const rowFor = (label: string) => {
      const t = april.find((x) => x.regionLabel === label)!;
      // First data row whose date cell is populated.
      return t.rows.find((r) => r[0].value !== "" && r[0].value != null)!.map((c) => c.value);
    };

    // Excel 01-Apr-25: VISUAL 10982 → 9627 accepted, 1355 rejected.
    const [, vChecked, vAccepted, vRejected] = rowFor("Visual");
    expect(vChecked).toBe(10982);
    expect(vAccepted).toBe(9627);
    expect(vRejected).toBe(1355);
    // The whole point: this balances. The old parser produced 9627 = 9627 + 1355.
    expect(Number(vAccepted) + Number(vRejected)).toBe(Number(vChecked));

    const [, bChecked, bAccepted, bRejected] = rowFor("Balloon");
    expect([bChecked, bAccepted, bRejected]).toEqual([9627, 9612, 15]);
    expect(Number(bAccepted) + Number(bRejected)).toBe(Number(bChecked));

    const [, valChecked, valAccepted, valRejected] = rowFor("Valve Integrity");
    expect([valChecked, valAccepted, valRejected]).toEqual([9612, 9483, 129]);

    // Cascade: each stage's Checked is the previous stage's Accepted.
    expect(bChecked).toBe(vAccepted);
    expect(valChecked).toBe(bAccepted);
  });

  it("excludes the trailing decoy headers that sit over a WEEK marker", () => {
    const letters = april.flatMap((t) => t.colLetters);
    expect(letters).not.toContain("R"); // "VISUAL CHECKED Q" holding "WEEK 1"
    expect(letters).not.toContain("S");
    expect(letters).not.toContain("T");
  });
});
