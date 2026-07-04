// Classify parsed rejection workbooks → StageDayRecords + a human-verifiable
// mapping preview (MOID-SPEC §8/§13). Heuristic, deterministic. Targets the
// stage-per-sheet shape of the client's REJECTION ANALYSIS files
// (sheet = stage; columns DATE / QUANTITY CHECKED / REJECTION / %), and any
// sheet whose name names one of the four rejection stages.
//
// Output feeds the verify/mapping screen (which adds per-row comments) and,
// on confirm, emit.ts → the canonical store.

import type { RawSheet } from "@/types/dashboard";
import type { StageDayRecord } from "@/lib/ingest/emit";

const STAGE_FROM_NAME: { test: RegExp; stageId: string; label: string }[] = [
  { test: /valve|integrit/i, stageId: "valve-integrity", label: "Valve Integrity" },
  { test: /balloon/i,        stageId: "balloon",         label: "Balloon Inspection" },
  { test: /visual/i,         stageId: "visual",          label: "Visual Inspection" },
  { test: /final/i,          stageId: "final",           label: "Final Inspection" },
];

export const SUMMARY_NAME = /c[ou]mm?ulative|yearly|summary|^\s*(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)/i;

function stageForSheet(sheetName: string): { stageId: string; label: string } | null {
  // valve before balloon (valve sheets often mention balloon too)
  for (const s of STAGE_FROM_NAME) if (s.test.test(sheetName)) return { stageId: s.stageId, label: s.label };
  return null;
}

function pickColumn(columns: string[], re: RegExp, exclude?: RegExp): string | null {
  for (const c of columns) {
    if (exclude && exclude.test(c)) continue;
    if (re.test(c)) return c;
  }
  return null;
}

/** Normalize a cell value to an ISO date (YYYY-MM-DD), or null. */
export function toISODate(v: unknown): string | null {
  if (v == null || v === "") return null;
  if (v instanceof Date && !isNaN(v.getTime())) return v.toISOString().slice(0, 10);
  if (typeof v === "number") {
    // Excel serial (1900 system)
    if (v > 30000 && v < 60000) {
      const ms = Math.round((v - 25569) * 86400 * 1000);
      const d = new Date(ms);
      if (!isNaN(d.getTime())) return d.toISOString().slice(0, 10);
    }
    return null;
  }
  const s = String(v).trim();
  const d = new Date(s);
  if (!isNaN(d.getTime()) && /\d{4}|\d{1,2}[/-]\d{1,2}/.test(s)) return d.toISOString().slice(0, 10);
  return null;
}

function toNumber(v: unknown): number | null {
  if (v == null || v === "") return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  const n = Number(String(v).replace(/[, ]/g, ""));
  return Number.isFinite(n) ? n : null;
}

/** One row in the verify/mapping table — what the human confirms (and can comment on). */
export interface MappingRow {
  id: string;            // stable per sheet
  file: string;
  sheet: string;
  stageId: string;
  stageLabel: string;
  dateColumn: string | null;
  checkedColumn: string | null;
  rejectedColumn: string | null;
  pctColumn: string | null;
  dayCount: number;      // rows that produced a record
  sampleDate: string | null;
  confidence: number;    // 0..1 heuristic
  status: "ok" | "needs-check"; // needs-check when a key column is missing
}

export interface ClassifyResult {
  records: StageDayRecord[];
  mappings: MappingRow[];
  skipped: { sheet: string; reason: string }[];
}

/**
 * Turn parsed rejection sheets into records + a mapping preview.
 * `ingestionId` ties the events together; `fileHash` is best-effort provenance.
 */
export function classifyRejectionSheets(
  rawSheets: RawSheet[],
  ingestionId: string,
  fileHash = "local"
): ClassifyResult {
  const records: StageDayRecord[] = [];
  const mappings: MappingRow[] = [];
  const skipped: { sheet: string; reason: string }[] = [];

  rawSheets.forEach((sheet, sheetIdx) => {
    const stage = stageForSheet(sheet.name);
    if (!stage) {
      skipped.push({ sheet: sheet.name, reason: SUMMARY_NAME.test(sheet.name) ? "summary/rollup sheet (kept as claim only)" : "no rejection stage detected" });
      return;
    }

    const cols = sheet.columns;
    const dateColumn = pickColumn(cols, /date/i);
    const checkedColumn = pickColumn(cols, /check|quantity|qty|rec/i, /%|percent|rej/i);
    const rejectedColumn = pickColumn(cols, /reject|rej/i, /%|percent/i);
    const pctColumn = pickColumn(cols, /%|percent/i);

    // sheet.name is "<fileName> - <sheetName>" (RawSheet's cross-file display
    // key, built in src/lib/parser.ts for the Workbooks explorer) — NOT the
    // true Excel sheet name. Every other family parser's source.sheet holds
    // the raw sheet name; this one must too, or any consumer that compares
    // source.sheet against the workbook's actual sheet names (the /staging
    // ingestion-completeness check; Verify Mode's sheet lookup) never finds a
    // match and misreports a fully-ingested sheet as skipped.
    const rawSheetName = sheet.name.startsWith(`${sheet.fileName} - `)
      ? sheet.name.slice(sheet.fileName.length + 3)
      : sheet.name;
    const source = { file: sheet.fileName, fileHash, sheet: rawSheetName, tableId: "t1" };
    let dayCount = 0;
    let sampleDate: string | null = null;

    if (dateColumn && (checkedColumn || rejectedColumn)) {
      // True A1 provenance: the RawSheet carries each row's real worksheet row
      // (__rowNum) and each column's real letter (colLetters) — refs built from
      // array indices or column NAMES are unfindable in the original workbook.
      // parseWorkbookBuffer always provides both; the positional estimate below
      // only fires for synthetic RawSheets (the contract requires a non-empty
      // cell ref on every event, so "" is not an option).
      const a1 = (col: string, row: Record<string, unknown>, rowIdx: number): string => {
        const letter = sheet.colLetters?.[col]
          ?? String.fromCharCode(65 + Math.max(0, sheet.columns.indexOf(col)));
        const rowNum = typeof row.__rowNum === "number" ? row.__rowNum : rowIdx + 2;
        return `${rawSheetName}!${letter}${rowNum}`;
      };
      sheet.rows.forEach((row, rowIdx) => {
        const iso = toISODate(row[dateColumn]);
        if (!iso) return;
        const checked = checkedColumn ? toNumber(row[checkedColumn]) : null;
        const rejected = rejectedColumn ? toNumber(row[rejectedColumn]) : null;
        if (checked == null && rejected == null) return;
        const pctVal = pctColumn ? toNumber(row[pctColumn]) : null;
        records.push({
          occurredOn: { kind: "day", start: iso, end: iso },
          stageId: stage.stageId,
          source,
          checked: checked != null && checked >= 0 ? { value: Math.round(checked), cell: a1(checkedColumn!, row, rowIdx), header: checkedColumn! } : null,
          acceptedGood: null,
          rework: null,
          rejected: rejected != null && rejected >= 0 ? { value: Math.round(rejected), cell: a1(rejectedColumn!, row, rowIdx), header: rejectedColumn! } : null,
          defects: [],
          statedPct: pctVal != null && pctColumn ? { value: pctVal, cell: a1(pctColumn, row, rowIdx), formula: null } : null,
          extractedBy: "heuristic",
          ingestionId,
        });
        dayCount++;
        if (!sampleDate) sampleDate = iso;
      });
    }

    const missingKey = !dateColumn || (!checkedColumn && !rejectedColumn);
    mappings.push({
      id: `${sheetIdx}-${stage.stageId}`,
      file: sheet.fileName,
      sheet: sheet.name,
      stageId: stage.stageId,
      stageLabel: stage.label,
      dateColumn,
      checkedColumn,
      rejectedColumn,
      pctColumn,
      dayCount,
      sampleDate,
      confidence: missingKey ? 0.5 : checkedColumn && rejectedColumn ? 0.9 : 0.7,
      status: missingKey || dayCount === 0 ? "needs-check" : "ok",
    });
  });

  return { records, mappings, skipped };
}
