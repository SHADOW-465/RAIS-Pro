// Multi-table oracle: the BALLOON & VALVE workbook's month sheets carry TWO
// side-by-side tables (Balloon | Valve Integrity). The legacy family parser
// yields ZERO records for this file (it gates on FR-named sheets + a month in
// the filename), so the reference here is INDEPENDENT cell arithmetic computed
// directly off the worksheet: per block, sum CHECKED/REJ./defect columns over
// date-valid rows, skipping Excel error cells. extract-from-mod over the
// split-region MOD must reproduce those sums exactly, with distinct tableIds.
import * as fs from "fs";
import * as path from "path";
import * as XLSX from "xlsx";
import { modPathRecords } from "./fixtures/extract-oracle-helpers";
import { buildProfilingTables } from "@/core/profiler/from-workbook";
import { toLocalISODate } from "@/lib/ingest/date";
import type { StageDayRecord } from "@/lib/ingest/emit";
import { emitMany } from "@/lib/ingest/emit";
import { canonicalizeEvents } from "@/lib/analytics/canonical";

const FILE = "BALLOON & VALVE INTEGRITY INSPECTION REPORT FILE 2025.xlsx";
const CORPUS = path.join(process.cwd(), "DATA", FILE);
const maybe = fs.existsSync(CORPUS) ? describe : describe.skip;

interface BlockSums { checked: number; rejected: number; defects: number }

const SKIP_HEADER_RE = /^(date|checked qty|accept qty|hold qty|rej\.? qty|rej\.? ?%|remarks?|batch no\.?|s\.? ?no\.?)$/i;

/** Independent reference: direct per-block column sums off the raw worksheet. */
function referenceSums(buf: Buffer): { balloon: BlockSums; valve: BlockSums; sheets: string[] } {
  const wb = XLSX.read(buf, { cellFormula: true });
  const out = { balloon: { checked: 0, rejected: 0, defects: 0 }, valve: { checked: 0, rejected: 0, defects: 0 }, sheets: [] as string[] };

  for (const sheetName of wb.SheetNames) {
    const ws = wb.Sheets[sheetName]!;
    if (!ws["!ref"]) continue;
    const range = XLSX.utils.decode_range(ws["!ref"]);
    const cell = (r: number, c: number) => ws[XLSX.utils.encode_cell({ r, c })];
    const num = (r: number, c: number): number | null => {
      const x = cell(r, c);
      if (!x || x.t === "e") return null; // NEVER read an Excel error cell as a quantity
      const n = typeof x.v === "number" ? x.v : Number(String(x.v ?? "").replace(/[, ]/g, ""));
      return Number.isFinite(n) && String(x.v) !== "" ? n : null;
    };

    // Header row = the row whose first cell is exactly "DATE".
    let headerR = -1;
    for (let r = range.s.r; r <= Math.min(range.s.r + 20, range.e.r); r++) {
      for (let c = range.s.c; c <= range.e.c; c++) {
        if (String(cell(r, c)?.v ?? "").trim().toUpperCase() === "DATE") { headerR = r; break; }
      }
      if (headerR >= 0) break;
    }
    if (headerR < 0) continue;

    // Two CHECKED QTY columns = the two block anchors.
    const headers = new Map<number, string>();
    for (let c = range.s.c; c <= range.e.c; c++) {
      const v = String(cell(headerR, c)?.v ?? "").trim();
      if (v) headers.set(c, v);
    }
    const anchors = [...headers.entries()].filter(([, v]) => /^checked qty$/i.test(v)).map(([c]) => c);
    if (anchors.length !== 2) continue; // not a two-block sheet (e.g. YEARLY)
    out.sheets.push(sheetName);

    const dateC = [...headers.entries()].find(([, v]) => /^date$/i.test(v))![0];
    const blocks: { key: "balloon" | "valve"; from: number; to: number }[] = [
      { key: "balloon", from: anchors[0], to: anchors[1] },
      { key: "valve", from: anchors[1], to: range.e.c + 1 },
    ];

    for (let r = headerR + 1; r <= range.e.r; r++) {
      const iso = toLocalISODate(cell(r, dateC)?.t === "e" ? null : cell(r, dateC)?.v);
      if (!iso) continue;
      for (const b of blocks) {
        const rejC = [...headers.entries()].find(([c, v]) => c >= b.from && c < b.to && /^rej\.? qty$/i.test(v))?.[0];
        const chk = num(r, b.from);
        if (chk !== null) out[b.key].checked += Math.round(chk);
        const rej = rejC !== undefined ? num(r, rejC) : null;
        if (rej !== null) out[b.key].rejected += Math.round(rej);
        for (const [c, v] of headers) {
          if (c < b.from || c >= b.to || SKIP_HEADER_RE.test(v)) continue;
          const d = num(r, c);
          if (d !== null && d > 0) out[b.key].defects += Math.round(d);
        }
      }
    }
  }
  return out;
}

function canonicalTotals(records: StageDayRecord[]) {
  const events = canonicalizeEvents(emitMany(records));
  const byStage = new Map<string, BlockSums>();
  for (const e of events as any[]) {
    if (!["production", "inspection", "rejection"].includes(e.eventType)) continue;
    const s = byStage.get(e.stageId) ?? { checked: 0, rejected: 0, defects: 0 };
    if (e.eventType === "production") s.checked += e.quantity;
    else if (e.eventType === "inspection" && e.disposition === "rejected") s.rejected += e.quantity;
    else if (e.eventType === "rejection") s.defects += e.quantity;
    byStage.set(e.stageId, s);
  }
  return byStage;
}

maybe("multi-table splitting: valve book ≡ independent cell arithmetic", () => {
  jest.setTimeout(60000);

  it("splits each month sheet into two regions with labels and true column letters", () => {
    const buf = fs.readFileSync(CORPUS);
    const tables = buildProfilingTables(buf, FILE);
    const april = tables.filter((t) => t.sheetName === "APRIL 25");
    expect(april.map((t) => t.tableId)).toEqual(["t1", "t2"]);
    expect(april[0].regionLabel).toMatch(/balloon/i);
    expect(april[1].regionLabel).toMatch(/valve integrity/i);
    // The inherited date column keeps its TRUE sheet letter in region 2.
    expect(april[1].header[0]).toMatch(/date/i);
    expect(april[1].colLetters[0]).toBe(april[0].colLetters[0]);
  });

  it("extract-from-mod reproduces the per-block sums with distinct tableIds", async () => {
    const buf = fs.readFileSync(CORPUS);
    const ref = referenceSums(buf);
    expect(ref.sheets.length).toBeGreaterThan(5); // the month tabs
    expect(ref.balloon.checked).toBeGreaterThan(0);
    expect(ref.valve.checked).toBeGreaterThan(0);

    // Rung-6 stand-in: per-region stage identity + the valve book's
    // company-specific defect columns (what a user names in the panel).
    const stageOfSheet = new Map<string, string>();
    for (const s of ref.sheets) {
      stageOfSheet.set(`${s}::t1`, "balloon");
      stageOfSheet.set(`${s}::t2`, "valve-integrity");
    }
    const defectOverrides = new Map<string, string>([
      ["struck balloon", "DEFECT:STBL"],
      ["balloom brust", "DEFECT:BLBR"],
      ["balloon brust", "DEFECT:BLBR"],
      ["leakage", "DEFECT:LEAK"],
      ["leakage (2)", "DEFECT:LEAK"], // valve-block duplicate, suffixed by header normalization
      ["others", "DEFECT:OTH"],
      ["others (2)", "DEFECT:OTH"],
      ["90/10", "DEFECT:9010"],
      ["thin spod", "DEFECT:THSP"],
      ["thin spot", "DEFECT:THSP"],
      ["bubble", "DEFECT:BUB"],
    ]);

    const records = await modPathRecords(FILE, buf, stageOfSheet, defectOverrides);
    const totals = canonicalTotals(records);

    expect(totals.get("balloon")).toEqual(ref.balloon);
    expect(totals.get("valve-integrity")).toEqual(ref.valve);

    // Provenance keeps the regions distinct.
    const tableIds = new Set(records.map((r) => r.source.tableId));
    expect(tableIds).toEqual(new Set(["t1", "t2"]));
  });
});
