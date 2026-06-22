// Classify the VISUAL INSPECTION REPORT workbook → StageDayRecords for the
// `visual` stage, carrying the per-day defect breakdown (and size when present).
//
// Shape: one sheet per month (APRIL 25, MAY 25, …). Each daily row is
//   DATE | REC. QTY | ACCEPT QTY | HOLD QTY | REJ. QTY | REJ % | <21 defect cols>
// where the 21 defect columns are the reason codes COAG / SD / TT / … / BST.
// parser.ts already merges the multi-row header (ordinal + code rows) so those
// codes arrive as real column names, and strips the TOTAL / % rollup rows.
//
// Deterministic: every number is read from a raw cell. The sheet's own REJ % is
// kept only as a claim (statedPct) — never used as an input.

import type { RawSheet } from "@/types/dashboard";
import type { StageDayRecord } from "@/lib/ingest/emit";
import { toISODate, type ClassifyResult, type MappingRow } from "@/lib/ingest/from-rejection-sheets";

/** Reason code → readable defect name (from the workbook's FORMATE legend +
 *  the per-defect chart titles). Names that are registry aliases (Coagulum,
 *  Surface Defect, Thin Spot, Raised Wire, Black Mark, Webbing, Pin Hole)
 *  resolve to canonical codes downstream; the rest show verbatim. */
const VISUAL_DEFECT_DICT: Record<string, string> = {
  COAG: "Coagulum",
  SD: "Surface Defect",
  TT: "Thin Spot",
  BL: "Blister",
  PS: "Ply Separation",
  SB: "Step Balloon",
  PW: "Projected Wire",
  FP: "Foreign Particle",
  RW: "Raised Wire",
  BEP: "Bad Eye Punching",
  DEC: "Decolorisation",
  BM: "Black Mark",
  WEB: "Webbing",
  BT: "Bad Trimming",
  SF: "Short Funnel",
  BIC: "Bend In Catheter",
  WK: "Wrinkles",
  BMP: "BMP",
  TF: "Torn Funnel",
  PH: "Pin Hole",
  BST: "Bad Stripping",
};
const DEFECT_CODES = new Set(Object.keys(VISUAL_DEFECT_DICT));

function toNum(v: unknown): number | null {
  if (v == null || v === "") return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  const n = Number(String(v).replace(/[, ]/g, ""));
  return Number.isFinite(n) ? n : null;
}

function pick(columns: string[], re: RegExp, exclude?: RegExp): string | null {
  for (const c of columns) {
    if (exclude && exclude.test(c)) continue;
    if (re.test(c)) return c;
  }
  return null;
}

/** A sheet is a visual-inspection daily report if it has a date column and at
 *  least a few of the reason-code columns — distinguishing it from the simple
 *  REJECTION ANALYSIS `VISUAL` sheet (which carries no defect columns) and from
 *  the FORMATE template / YEARLY rollups. */
export function isVisualInspectionSheet(sheet: RawSheet): boolean {
  const name = sheet.name;
  if (/formate|yearly|summary|cumm?ulative/i.test(name)) return false;
  const hasDate = sheet.columns.some((c) => /date/i.test(c));
  const codeCount = sheet.columns.filter((c) => DEFECT_CODES.has(c.trim().toUpperCase())).length;
  return hasDate && codeCount >= 3;
}

export function classifyVisualInspectionSheets(
  rawSheets: RawSheet[],
  ingestionId: string,
  fileHash = "local",
): ClassifyResult {
  const records: StageDayRecord[] = [];
  const mappings: MappingRow[] = [];
  const skipped: { sheet: string; reason: string }[] = [];

  rawSheets.forEach((sheet, sheetIdx) => {
    if (!isVisualInspectionSheet(sheet)) return; // other parsers / skip handle these

    const cols = sheet.columns;
    const dateColumn = pick(cols, /date/i);
    const checkedColumn = pick(cols, /rec\.?\s*qty|received|input|check|quantity/i, /%|rej|accept|hold|grade|reason/i);
    const rejectedColumn = pick(cols, /rej/i, /%|reason/i);
    const acceptedColumn = pick(cols, /accept|a\s*grade/i, /%/);
    const pctColumn = cols.find((c) => /rej/i.test(c) && /%/.test(c)) ?? null;
    const sizeColumn = pick(cols, /size/i);
    const defectColumns = cols.filter((c) => DEFECT_CODES.has(c.trim().toUpperCase()));

    const source = { file: sheet.fileName, fileHash, sheet: sheet.name, tableId: "t1" };
    let dayCount = 0;
    let sampleDate: string | null = null;

    if (dateColumn && (checkedColumn || rejectedColumn)) {
      sheet.rows.forEach((row, rowIdx) => {
        const iso = toISODate(row[dateColumn]);
        if (!iso) return;
        const checked = checkedColumn ? toNum(row[checkedColumn]) : null;
        const rejected = rejectedColumn ? toNum(row[rejectedColumn]) : null;
        const accepted = acceptedColumn ? toNum(row[acceptedColumn]) : null;
        if (checked == null && rejected == null) return;
        const r = rowIdx + 2;

        const defects = defectColumns
          .map((col) => {
            const qty = toNum(row[col]);
            if (qty == null || qty <= 0) return null;
            const code = col.trim().toUpperCase();
            return { raw: VISUAL_DEFECT_DICT[code] ?? code, value: Math.round(qty), cell: `${sheet.name}!${col}${r}` };
          })
          .filter((d): d is { raw: string; value: number; cell: string } => d !== null);

        const size = sizeColumn ? String(row[sizeColumn] ?? "").trim() || null : null;
        const pctVal = pctColumn ? toNum(row[pctColumn]) : null;

        records.push({
          occurredOn: { kind: "day", start: iso, end: iso },
          stageId: "visual",
          size,
          source,
          checked: checked != null && checked >= 0 ? { value: Math.round(checked), cell: `${sheet.name}!${checkedColumn}${r}`, header: checkedColumn! } : null,
          acceptedGood: accepted != null && accepted >= 0 ? { value: Math.round(accepted), cell: `${sheet.name}!${acceptedColumn}${r}`, header: acceptedColumn! } : null,
          rework: null,
          rejected: rejected != null && rejected >= 0 ? { value: Math.round(rejected), cell: `${sheet.name}!${rejectedColumn}${r}`, header: rejectedColumn! } : null,
          defects,
          statedPct: pctVal != null && pctColumn ? { value: pctVal, cell: `${sheet.name}!${pctColumn}${r}`, formula: null } : null,
          extractedBy: "heuristic",
          ingestionId,
        });
        dayCount++;
        if (!sampleDate) sampleDate = iso;
      });
    }

    if (dayCount === 0) {
      skipped.push({ sheet: sheet.name, reason: "no daily visual-inspection rows detected" });
      return;
    }

    const missingKey = !dateColumn || (!checkedColumn && !rejectedColumn);
    mappings.push({
      id: `${sheetIdx}-visual`,
      file: sheet.fileName,
      sheet: sheet.name,
      stageId: "visual",
      stageLabel: "Visual Inspection",
      dateColumn,
      checkedColumn,
      rejectedColumn,
      pctColumn,
      dayCount,
      sampleDate,
      confidence: missingKey ? 0.5 : checkedColumn && rejectedColumn ? 0.9 : 0.7,
      status: missingKey ? "needs-check" : "ok",
    });
  });

  return { records, mappings, skipped };
}
