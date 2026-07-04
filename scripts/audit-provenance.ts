/**
 * Runtime provenance audit — verifies the trust chain
 *   parser output → claimed Excel cell → actual cell value in the workbook
 * and simulates the View Source reconstruction (FloatingDetailModal matching)
 * to check that every event's cell ref is (a) a valid A1 ref, (b) resolves to
 * the claimed value in the ORIGINAL workbook, and (c) is findable in the
 * RawSheet grid the modal renders (same colLetters/__rowNum logic).
 *
 * The Excel workbook is treated as the only source of truth.
 *
 * Run:  npx tsx scripts/audit-provenance.ts [optional-extra-file.xlsx ...]
 */
import * as XLSX from "xlsx";
import { readFileSync, readdirSync } from "fs";
import { join, basename } from "path";
import { recordsFromBuffer } from "../src/lib/ingest/parsers";
import { parseWorkbookBuffer } from "../src/lib/parser";
import { extractSchemaFromWorkbook, classifyWithSchema } from "../src/lib/ingest/schema-extractor";
import { classifyRejectionSheets } from "../src/lib/ingest/from-rejection-sheets";
import type { StageDayRecord } from "../src/lib/ingest/emit";

const DATA_DIR = join(process.cwd(), "DATA");

interface Finding {
  file: string;
  sheet: string;
  kind: "invalid-ref" | "cell-mismatch" | "cell-empty" | "viewsource-miss" | "viewsource-wrong-value";
  detail: string;
}

const findings: Finding[] = [];
let checkedValues = 0;
let viewSourceChecked = 0;

const A1_RE = /^(.+)!([A-Z]+)(\d+)$/;

function excelCellValue(wb: XLSX.WorkBook, sheet: string, addr: string): unknown {
  const ws = wb.Sheets[sheet];
  if (!ws) return undefined;
  const cell = ws[addr];
  return cell ? cell.v : undefined;
}

/** Compare a parser-extracted number against the raw Excel cell value.
 *  Parsers apply Math.round(); dates may come back as Date objects. */
function valuesMatch(claimed: number, raw: unknown): boolean {
  if (typeof raw === "number") return Math.round(raw) === claimed || Math.abs(raw - claimed) < 1e-6;
  if (typeof raw === "string") {
    const n = Number(raw.replace(/[, ]/g, ""));
    return Number.isFinite(n) && Math.round(n) === claimed;
  }
  return false;
}

function auditSourcedValue(
  wb: XLSX.WorkBook,
  file: string,
  recSheet: string,
  label: string,
  value: number,
  cellRef: string,
) {
  checkedValues++;
  const m = A1_RE.exec(cellRef);
  if (!m) {
    findings.push({ file, sheet: recSheet, kind: "invalid-ref", detail: `${label}=${value} cell="${cellRef}" is not a valid SHEET!A1 ref` });
    return;
  }
  const [, refSheet, col, row] = m;
  const raw = excelCellValue(wb, refSheet, `${col}${row}`);
  if (raw === undefined) {
    findings.push({ file, sheet: recSheet, kind: "cell-empty", detail: `${label}=${value} claims ${cellRef} but that cell is EMPTY/absent in the workbook` });
    return;
  }
  if (!valuesMatch(value, raw)) {
    findings.push({ file, sheet: recSheet, kind: "cell-mismatch", detail: `${label}=${value} claims ${cellRef} but workbook cell holds ${JSON.stringify(raw)}` });
  }
}

/** Simulate FloatingDetailModal's View Source matching: can this event cell be
 *  located in the RawSheet grid, and does the displayed cell hold the value? */
function auditViewSource(
  rawSheets: ReturnType<typeof parseWorkbookBuffer>["rawSheets"],
  file: string,
  recSheet: string,
  label: string,
  value: number,
  cellRef: string,
) {
  const m = A1_RE.exec(cellRef);
  if (!m) return; // already reported as invalid-ref
  viewSourceChecked++;
  const [, refSheet, colLetter, rowStr] = m;
  const rowNum = Number(rowStr);
  // Modal matching (mirrors FloatingDetailModal.rawSheetMatches): RawSheet.name
  // is "<file> - <sheet>", events carry the bare sheet name; compare TRIMMED
  // bare names (real sheets have leading-space names like " MAY 25").
  const sheet = rawSheets.find((s) => {
    const bare = s.name.startsWith(`${s.fileName} - `) ? s.name.slice(s.fileName.length + 3) : s.name;
    return bare.trim().toLowerCase() === refSheet.trim().toLowerCase();
  });
  if (!sheet) {
    findings.push({ file, sheet: recSheet, kind: "viewsource-miss", detail: `${label}=${value} ${cellRef}: no RawSheet matches sheet "${refSheet}" — no tab, no beam` });
    return;
  }
  const col = sheet.columns.find((c) => (sheet.colLetters?.[c]) === colLetter);
  if (!col) {
    findings.push({ file, sheet: recSheet, kind: "viewsource-miss", detail: `${label}=${value} ${cellRef}: no rendered column has letter ${colLetter} (colLetters=${JSON.stringify(sheet.colLetters)}) — cell can't highlight` });
    return;
  }
  const row = sheet.rows.find((r) => r.__rowNum === rowNum);
  if (!row) {
    findings.push({ file, sheet: recSheet, kind: "viewsource-miss", detail: `${label}=${value} ${cellRef}: no rendered row has __rowNum=${rowNum} — cell can't highlight` });
    return;
  }
  const shown = row[col];
  if (!valuesMatch(value, shown)) {
    findings.push({ file, sheet: recSheet, kind: "viewsource-wrong-value", detail: `${label}=${value} ${cellRef}: View Source grid shows ${JSON.stringify(shown)} at that position (column "${col}")` });
  }
}

function auditRecord(wb: XLSX.WorkBook, rawSheets: ReturnType<typeof parseWorkbookBuffer>["rawSheets"], file: string, rec: StageDayRecord) {
  const sv = (label: string, v: { value: number; cell: string } | null | undefined) => {
    if (!v || !v.cell) return;
    auditSourcedValue(wb, file, rec.source.sheet, label, v.value, v.cell);
    auditViewSource(rawSheets, file, rec.source.sheet, label, v.value, v.cell);
  };
  sv("checked", rec.checked);
  sv("acceptedGood", rec.acceptedGood);
  sv("rework", rec.rework);
  sv("rejected", rec.rejected);
  for (const d of rec.defects) sv(`defect[${d.raw}]`, d);
}

// ─── main ────────────────────────────────────────────────────────────────────

const extra = process.argv.slice(2);
const files = [
  ...readdirSync(DATA_DIR).filter((f) => f.toLowerCase().endsWith(".xlsx")).map((f) => join(DATA_DIR, f)),
  ...extra,
];

let totalRecords = 0;
for (const path of files) {
  const buf = readFileSync(path);
  const name = basename(path);
  const wb = XLSX.read(buf, { type: "buffer" });
  const { rawSheets } = parseWorkbookBuffer(buf, name);

  // Mirror /staging's exact routing: family parsers first, then the generic
  // schema classifier, then the rejection-sheet classifier.
  let via = "family";
  let records = recordsFromBuffer(buf, name).map((p) => p.record);
  if (records.length === 0) {
    via = "schema-fallback";
    records = classifyWithSchema(rawSheets, extractSchemaFromWorkbook(wb, name), "audit");
  }
  if (records.length === 0) {
    via = "rejection-fallback";
    records = classifyRejectionSheets(rawSheets, "audit").records;
  }
  if (records.length === 0) {
    console.log(`— ${name}: 0 records via any path`);
    continue;
  }
  totalRecords += records.length;
  for (const rec of records) auditRecord(wb, rawSheets, name, rec);
  console.log(`✓ ${name}: ${records.length} records audited (${via})`);
}

console.log(`\n══════ PROVENANCE AUDIT ══════`);
console.log(`records: ${totalRecords} · sourced values checked vs Excel: ${checkedValues} · View-Source lookups: ${viewSourceChecked}`);
const byKind = new Map<string, Finding[]>();
for (const f of findings) {
  if (!byKind.has(f.kind)) byKind.set(f.kind, []);
  byKind.get(f.kind)!.push(f);
}
if (findings.length === 0) {
  console.log("NO FINDINGS — every extracted value traces to its exact Excel cell and is renderable in View Source.");
} else {
  for (const [kind, list] of byKind) {
    console.log(`\n■ ${kind} (${list.length})`);
    for (const f of list.slice(0, 12)) console.log(`  [${f.file} :: ${f.sheet}] ${f.detail}`);
    if (list.length > 12) console.log(`  … and ${list.length - 12} more`);
  }
  process.exitCode = 1;
}
