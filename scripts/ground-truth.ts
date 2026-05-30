/**
 * Ground-truth oracle — INDEPENDENT of the app's parser (src/lib/parser.ts).
 *
 * For each .xlsx in DATA/, for each data sheet, this script:
 *   1. detects the header row (scan first ~12 rows; pick the row with the most
 *      distinct non-empty string cells that is followed by a row with a numeric
 *      cell),
 *   2. reads the data rows below it,
 *   3. excludes junk rows (total / subtotal / sum / "total in %" / "%" /
 *      legend rows / unlabeled-subtotal rows where the first column is blank
 *      but numeric cells are present),
 *   4. treats Excel-serial date columns (numeric 40000–60000, or named
 *      DATE/MONTH) as dates — never summed,
 *   5. computes checked / accepted / rejected totals + rejection rate per file.
 *
 * Run:  npx tsx scripts/ground-truth.ts
 *
 * This is the oracle the app parser is later checked against. Keep it dumb and
 * explicit; do NOT import from src/lib.
 */
import * as XLSX from "xlsx";
import { readFileSync, readdirSync } from "fs";
import { join } from "path";

type Cell = unknown;
type Grid = Cell[][];

const DATA_DIR = join(process.cwd(), "DATA");

// ─── helpers ────────────────────────────────────────────────────────────────

const JUNK_RE = /\b(grand\s*total|sub\s*total|subtotal|total|sum)\b/i;
const PCT_RE = /total\s*in\s*%|^%$/i;

function norm(c: Cell): string {
  return String(c ?? "").replace(/\s+/g, " ").trim();
}
function isBlank(c: Cell): boolean {
  return c === "" || c === null || c === undefined;
}
function isNum(c: Cell): boolean {
  return typeof c === "number" && isFinite(c);
}
function isSerialDate(c: Cell): boolean {
  return isNum(c) && (c as number) >= 40000 && (c as number) <= 60000;
}

// Words that mark a row as a genuine column-header row (vs. a title or a legend
// row of reason abbreviations).
const HEADER_HINT_RE = /\bqty\b|\bdate\b|\bmonth\b|\brej\b|\brec\.?\b|\baccept\b|\bb\.?\s*no\b|production|dispatch|trolley|reason/i;

/** Detect header row. A header row is the row with the most distinct non-empty
 *  string cells that ALSO contains a header-hint word (qty/date/rej/…) and is
 *  followed — within the next 4 rows — by a row containing a numeric cell.
 *  Requiring a header hint stops a legend row (COAG/SD/TT…) from outscoring the
 *  real header. Scans first 12 rows. */
function detectHeaderRow(grid: Grid): number {
  let best = -1;
  let bestScore = 0;
  const limit = Math.min(grid.length, 12);
  for (let i = 0; i < limit; i++) {
    const row = grid[i] ?? [];
    const strs = row.filter((c) => typeof c === "string" && norm(c).length > 0).map((c) => norm(c));
    const distinct = new Set(strs.map((s) => s.toLowerCase()));
    const hasHint = strs.some((s) => HEADER_HINT_RE.test(s));
    if (!hasHint) continue;
    // followed (within next 4 rows) by a row with a numeric cell — sheets may
    // have blank spacers or legend rows between header and data.
    let nextHasNum = false;
    for (let k = 1; k <= 4 && i + k < grid.length; k++) {
      if ((grid[i + k] ?? []).some((c) => isNum(c))) { nextHasNum = true; break; }
    }
    if (distinct.size > bestScore && nextHasNum) {
      bestScore = distinct.size;
      best = i;
    }
  }
  return best;
}

/** A row is a junk row if any cell text matches total/subtotal/sum/%-legend,
 *  OR it's an unlabeled subtotal (first col blank but numeric cells present). */
function isJunkRow(row: Cell[], firstColIsKey: boolean): boolean {
  for (const c of row) {
    const t = norm(c);
    if (!t) continue;
    if (JUNK_RE.test(t) || PCT_RE.test(t)) return true;
  }
  if (firstColIsKey) {
    const firstBlank = isBlank(row[0]);
    const hasNum = row.some((c) => isNum(c));
    if (firstBlank && hasNum) return true; // unlabeled subtotal
  }
  return false;
}

/** Find the column index whose header matches one of the candidate regexes. */
function colIndex(headers: string[], res: RegExp[]): number {
  for (let i = 0; i < headers.length; i++) {
    const h = norm(headers[i]).toLowerCase();
    if (!h) continue;
    if (res.some((re) => re.test(h))) return i;
  }
  return -1;
}

function sumCol(rows: Cell[][], idx: number): number {
  if (idx < 0) return 0;
  let s = 0;
  for (const r of rows) {
    const v = r[idx];
    if (isNum(v) && !isSerialDate(v)) s += v as number;
  }
  return s;
}

interface SheetExtract {
  headerRow: number;
  headers: string[];
  dataRows: Cell[][];
}

function extractSheet(grid: Grid): SheetExtract | null {
  const headerRow = detectHeaderRow(grid);
  if (headerRow < 0) return null;
  const headers = (grid[headerRow] ?? []).map((c) => norm(c));
  // first column is a "key" column if header is DATE/MONTH/B.NO etc.
  const firstHeader = (headers[0] ?? "").toLowerCase();
  const firstColIsKey = /date|month|b\.?\s*no|s\.?\s*no/.test(firstHeader);
  const dataRows: Cell[][] = [];
  for (let i = headerRow + 1; i < grid.length; i++) {
    const row = grid[i] ?? [];
    if (row.every((c) => isBlank(c))) continue; // blank
    if (isJunkRow(row, firstColIsKey)) continue;
    // require at least one numeric data cell to count as a data row
    if (!row.some((c) => isNum(c))) continue;
    dataRows.push(row);
  }
  return { headerRow, headers, dataRows };
}

function readGrid(file: string, sheet: string): Grid {
  const wb = XLSX.read(readFileSync(join(DATA_DIR, file)));
  return XLSX.utils.sheet_to_json(wb.Sheets[sheet], { header: 1, defval: "" }) as Grid;
}
function sheetNames(file: string): string[] {
  return XLSX.read(readFileSync(join(DATA_DIR, file))).SheetNames;
}

// Exclude yearly / summary sheets to avoid double-counting monthly data.
function isSummarySheet(name: string): boolean {
  return /yearly|annual|cumul|commulative|summary|formate|format/i.test(name);
}

interface FileAgg {
  reportType: string;
  checkedQty: number | null;
  acceptedQty: number | null;
  rejectedQty: number | null;
  rejectionRate: number | null;
}

// ─── per-shape aggregators ────────────────────────────────────────────────────

/** ASSEMBLY: header row has VISUAL QTY / VISUAL ACPT QTY / REJ QTY (visual block
 *  is the first three numeric cols after DATE). */
function aggAssembly(file: string): FileAgg {
  let checked = 0, accepted = 0, rejected = 0;
  for (const sn of sheetNames(file)) {
    if (isSummarySheet(sn)) continue;
    const grid = readGrid(file, sn);
    const ex = extractSheet(grid);
    if (!ex) continue;
    // Visual block: column 1 = VISUAL QTY (checked), 2 = VISUAL ACPT QTY, 3 = REJ QTY
    const ci = colIndex(ex.headers, [/^visual\s*qty/]);
    const ai = colIndex(ex.headers, [/^visual\s*acpt/]);
    // first REJ QTY column after visual checked
    let ri = -1;
    for (let i = ci + 1; i < ex.headers.length; i++) {
      if (/^rej\s*qty/.test(norm(ex.headers[i]).toLowerCase())) { ri = i; break; }
    }
    checked += sumCol(ex.dataRows, ci);
    accepted += sumCol(ex.dataRows, ai);
    rejected += sumCol(ex.dataRows, ri);
  }
  return { reportType: "assembly", checkedQty: checked, acceptedQty: accepted, rejectedQty: rejected, rejectionRate: rejected / checked };
}

/** VISUAL: header DATE, REC. QTY, ACCEPT QTY, HOLD QTY, REJ. QTY, ... */
function aggVisual(file: string): FileAgg {
  let checked = 0, accepted = 0, rejected = 0;
  for (const sn of sheetNames(file)) {
    if (isSummarySheet(sn)) continue;
    const grid = readGrid(file, sn);
    const ex = extractSheet(grid);
    if (!ex) continue;
    const ci = colIndex(ex.headers, [/^rec\.?\s*qty/]);
    const ai = colIndex(ex.headers, [/^accept\s*qty/]);
    const ri = colIndex(ex.headers, [/^rej\.?\s*qty/]);
    checked += sumCol(ex.dataRows, ci);
    accepted += sumCol(ex.dataRows, ai);
    rejected += sumCol(ex.dataRows, ri);
  }
  return { reportType: "visual", checkedQty: checked, acceptedQty: accepted, rejectedQty: rejected, rejectionRate: rejected / checked };
}

/** BALLOON & VALVE: balloon block header CHECKED QTY / ACCEPT QTY / REJ. QTY. */
function aggBalloon(file: string): FileAgg {
  let checked = 0, accepted = 0, rejected = 0;
  for (const sn of sheetNames(file)) {
    if (isSummarySheet(sn)) continue;
    const grid = readGrid(file, sn);
    const ex = extractSheet(grid);
    if (!ex) continue;
    // first CHECKED QTY / ACCEPT QTY / REJ. QTY columns = balloon block
    const ci = colIndex(ex.headers, [/^checked\s*qty/]);
    const ai = colIndex(ex.headers, [/^accept\s*qty/]);
    const ri = colIndex(ex.headers, [/^rej\.?\s*qty/]);
    checked += sumCol(ex.dataRows, ci);
    accepted += sumCol(ex.dataRows, ai);
    rejected += sumCol(ex.dataRows, ri);
  }
  return { reportType: "balloon_valve", checkedQty: checked, acceptedQty: accepted, rejectedQty: rejected, rejectionRate: rejected / checked };
}

/** SHOPFLOOR: reason-count matrix, no checked qty. Rejected = sum of reason
 *  counts. Each sheet has a "Total" column = sum of reasons per row; we sum the
 *  Total column (excluding the No of TROLLEYS and DATE columns). */
function aggShopfloor(file: string): FileAgg {
  let rejected = 0;
  for (const sn of sheetNames(file)) {
    if (isSummarySheet(sn)) continue;
    const grid = readGrid(file, sn);
    const ex = extractSheet(grid);
    if (!ex) continue;
    const ti = colIndex(ex.headers, [/^total$/]);
    if (ti >= 0) {
      rejected += sumCol(ex.dataRows, ti);
    } else {
      // fall back: sum every reason column (exclude DATE + trolleys + total/%)
      for (let i = 0; i < ex.headers.length; i++) {
        const h = norm(ex.headers[i]).toLowerCase();
        if (!h) continue;
        if (/date|trolley|total|%/.test(h)) continue;
        rejected += sumCol(ex.dataRows, i);
      }
    }
  }
  return { reportType: "shopfloor", checkedQty: null, acceptedQty: null, rejectedQty: rejected, rejectionRate: null };
}

/** Cumulative production summaries: TOTAL REJ column only. checked not
 *  meaningful in rejection terms (production != inspected). */
function aggProduction(file: string, reportType: string): FileAgg {
  let rejected = 0;
  for (const sn of sheetNames(file)) {
    const grid = readGrid(file, sn);
    const ex = extractSheet(grid);
    if (!ex) continue;
    const ri = colIndex(ex.headers, [/total\s*rej/]);
    rejected += sumCol(ex.dataRows, ri);
  }
  return { reportType, checkedQty: null, acceptedQty: null, rejectedQty: rejected, rejectionRate: null };
}

// ─── run ──────────────────────────────────────────────────────────────────────

function fmt(a: FileAgg): string {
  const rate = a.rejectionRate == null ? "n/a" : (a.rejectionRate * 100).toFixed(4) + "%";
  return `type=${a.reportType} checked=${a.checkedQty} accepted=${a.acceptedQty} rejected=${a.rejectedQty} rejRate=${rate}`;
}

const results: Record<string, FileAgg> = {};

for (const file of readdirSync(DATA_DIR).filter((f) => f.toLowerCase().endsWith(".xlsx"))) {
  let agg: FileAgg;
  const lower = file.toLowerCase();
  if (lower.startsWith("assembly")) agg = aggAssembly(file);
  else if (lower.startsWith("visual")) agg = aggVisual(file);
  else if (lower.startsWith("balloon")) agg = aggBalloon(file);
  else if (lower.startsWith("shopfloor")) agg = aggShopfloor(file);
  else if (lower.startsWith("commulative")) agg = aggProduction(file, "cumulative");
  else if (lower.startsWith("yearly")) agg = aggProduction(file, "yearly_production");
  else continue;
  results[file] = agg;
  console.log(`\n### ${file}`);
  console.log("   " + fmt(agg));
}

// ─── reconciliation check vs embedded Total rows ──────────────────────────────
console.log("\n--- reconciliation ---");
{
  // ASSEMBLY APRIL 25 single-sheet visual checked should == 247767 (Total row)
  const grid = readGrid("ASSEMBLY REJECTION REPORT.xlsx", "APRIL 25");
  const ex = extractSheet(grid)!;
  const ci = colIndex(ex.headers, [/^visual\s*qty/]);
  const ri = (() => { for (let i = ci + 1; i < ex.headers.length; i++) if (/^rej\s*qty/.test(norm(ex.headers[i]).toLowerCase())) return i; return -1; })();
  const checked = sumCol(ex.dataRows, ci);
  const rejected = sumCol(ex.dataRows, ri);
  console.log(`ASSEMBLY APRIL 25 visual checked=${checked} (Total row=247767)  rej=${rejected} (Total row=19271)  ${checked === 247767 && rejected === 19271 ? "MATCH" : "MISMATCH"}`);
}

console.log("\n--- GOLDEN (paste into fixtures) ---");
console.log(JSON.stringify(results, null, 2));
