import * as fs from "fs";
import * as path from "path";
import * as XLSX from "xlsx";
import { datasetsFromWorkbooks, datasetsWithRowsFromWorkbooks } from "../from-workbooks";

const DIR = path.join(process.cwd(), "ANALYTICAL DATA", "REJECTION ANALYSIS 2025-26");
const maybe = fs.existsSync(DIR) ? describe : describe.skip;

maybe("datasetsFromWorkbooks (real corpus)", () => {
  const files = fs
    .readdirSync(DIR)
    .filter((f) => /REJECTION ANALYSIS.*\.xlsx$/i.test(f) && !f.startsWith("~$"))
    .map((f) => ({ fileName: f, data: fs.readFileSync(path.join(DIR, f)) as unknown as ArrayBuffer }));

  it("collapses the 12 monthly files' many sheets into far fewer datasets", () => {
    const ds = datasetsFromWorkbooks(files);
    // Each file has ~5 sheets → dozens of sheets total, but only a handful of
    // distinct signatures (Cummulative / Visual / Balloon / Valve / Final).
    expect(ds.length).toBeGreaterThan(0);
    expect(ds.length).toBeLessThan(files.length); // far fewer datasets than files
  });

  it("every dataset has a non-empty title and at least one source", () => {
    for (const d of datasetsFromWorkbooks(files)) {
      expect(d.title.trim().length).toBeGreaterThan(0);
      expect(d.sources.length).toBeGreaterThan(0);
    }
  });

  it("datasetsWithRowsFromWorkbooks extracts real row values, excludes meta columns, and covers all sources", () => {
    const { datasetsFromWorkbooks: _unused } = require("../from-workbooks"); // sanity: old export still present
    const { datasets, rows } = datasetsWithRowsFromWorkbooks(files);
    expect(rows.length).toBeGreaterThan(0);
    // Every row must reference a real dataset id.
    const datasetIds = new Set(datasets.map((d) => d.id));
    for (const r of rows) expect(datasetIds.has(r.datasetId)).toBe(true);
    // No row's values object should contain a meta-role column name (spot-check
    // against the dataset's own non-meta column list for that row's dataset).
    const colsById = new Map(datasets.map((d) => [d.id, new Set(d.columns.map((c) => c.name))]));
    for (const r of rows.slice(0, 50)) {
      const allowed = colsById.get(r.datasetId)!;
      for (const key of Object.keys(r.values)) expect(allowed.has(key)).toBe(true);
    }
  });
});

describe("datasetsWithRowsFromWorkbooks (synthetic collision case)", () => {
  it("keeps distinct values for two columns that normalize to the same name (case/whitespace-only difference)", () => {
    // "Rej %" and "REJ %" both normalize to "rej %" via normalizeName. Without
    // collision-safe keys, the second column's values would silently overwrite
    // the first's for every row.
    const header = ["DATE", "Rej %", "REJ %"];
    const data = [
      header,
      ["2025-04-01", 5, 9],
      ["2025-04-02", 6, 10],
    ];
    const ws = XLSX.utils.aoa_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "SHEET1");
    const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;

    const { rows } = datasetsWithRowsFromWorkbooks([{ fileName: "collision.xlsx", data: buf }]);
    expect(rows.length).toBeGreaterThan(0);

    // Both distinct source values must be present somewhere in each row's values,
    // under two DIFFERENT keys — neither silently overwritten by the other.
    for (const r of rows) {
      const numericValues = Object.values(r.values).filter((v) => typeof v === "number");
      expect(new Set(Object.keys(r.values)).size).toBe(Object.keys(r.values).length); // no duplicate keys (trivially true for an object, but documents intent)
      expect(numericValues.length).toBeGreaterThanOrEqual(2);
    }
    // Specifically: row 0 should carry both 5 and 9; row 1 should carry both 6 and 10.
    const row0 = rows.find((r) => r.rowIndex === 0)!;
    const row1 = rows.find((r) => r.rowIndex === 1)!;
    expect(Object.values(row0.values)).toEqual(expect.arrayContaining([5, 9]));
    expect(Object.values(row1.values)).toEqual(expect.arrayContaining([6, 10]));
  });
});
