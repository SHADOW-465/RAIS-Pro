// src/lib/ingest/parsers/parse-daily-activity.ts
// Template-aware parser for the "DAILY ACTIVITY REPORT" — the whole-line daily
// throughput log covering the full process chain.
//
// The client's own template for this report changed mid-corpus: JAN25/FEB25
// sheets use a 3-column block (CHKD/ACPT/REJ, no HOLD) for Visual/Balloon and
// have no Final Inspection / Balloon Production sections at all; JULY25
// onward (and the whole 2026 file) use a 4-column block (CHKD/ACPT/HOLD/REJ)
// and add those two sections. A single hardcoded column map cannot be correct
// for both — it silently reads one stage's column into another stage's field
// (e.g. Balloon's CHKD QTY into Visual's REJ) on the sheets it wasn't built
// from. So columns are resolved from each sheet's OWN two-row header (group
// row: "VISUAL INSEPTION" etc; sub row: "CHKD QTY"/"ACPT QTY"/"HOLD"/"REJ")
// instead of a fixed index map — genuinely template-aware, not position-aware.
import * as xlsx from "xlsx";
import type { StageDayRecord } from "@/lib/ingest/emit";
import { toLocalISODate } from "@/lib/ingest/date";
import { norm, headerSections } from "./header-sections";
import { sheetGrid } from "./a1";

interface StageCols { stageId: string; chk: number | null; acc: number | null; hold: number | null; rej: number | null; }

// Order matters: checked top-to-bottom, first full match wins. Each entry is
// an AND of substrings rather than one exact phrase — the client's own sheets
// misspell "INSPECTION" inconsistently across the corpus ("INSEPTION" in
// early-2025 sheets, "INSPECTION" from July25 on), so matching hinges only on
// the stage-name stem, never on how the suffix happens to be spelled that
// month. "balloon-production" is listed before "balloon" so "BALLOON
// PRODUCTION" claims it first; plain "BALOON INSEPTION" / "BALLOON
// INSPECTION" then falls through to "balloon" since it lacks "production".
const STAGE_PATTERNS: { stageId: string; all: RegExp[] }[] = [
  { stageId: "production",         all: [/^production$/i] },
  { stageId: "eye-punching",       all: [/eye/i, /punch/i] },
  { stageId: "leaching",           all: [/^leaching$/i] },
  { stageId: "chlorination",       all: [/chlorination/i] },
  { stageId: "hanging",            all: [/^hanging$/i] },
  { stageId: "gauge",              all: [/^ga?u?age$/i] },
  { stageId: "trimming",           all: [/trimm/i] },
  { stageId: "visual",             all: [/visual/i] },
  { stageId: "balloon-production", all: [/b[ae]l+oon/i, /production/i] },
  { stageId: "balloon",            all: [/b[ae]l+oon/i] },
  { stageId: "valve-fixing",       all: [/valve/i, /fixing/i] },
  { stageId: "valve-integrity",    all: [/valve/i, /integrity/i] },
  { stageId: "final",              all: [/final/i] },
];

const SUB_CHK = /^chkd\s*qty$|^actual$/i;
const SUB_ACC = /^acpt\s*qty$|^accept/i;
const SUB_HOLD = /^hold$/i;
const SUB_REJ = /^rej$/i;

/** Resolve this sheet's actual stage->column map from its own header rows.
 *  Stages absent from the sheet (e.g. Final/Balloon-Production pre-July25)
 *  are simply not returned — never guessed. */
function resolveStageColumns(groupRow: unknown[], subRow: unknown[], rowLen: number): StageCols[] {
  const secs = headerSections(groupRow, rowLen);
  const out: StageCols[] = [];
  for (const { col, text, end } of secs) {
    const match = STAGE_PATTERNS.find((p) => p.all.every((re) => re.test(text)));
    if (!match) continue;
    const cols: StageCols = { stageId: match.stageId, chk: null, acc: null, hold: null, rej: null };
    if (end - col <= 1) {
      // single unlabeled value column (LEACHING, CHLORINATION, HANGING, GAUGE,
      // TRIMMING, VALVE FIXING) — the group-header column itself is the count.
      cols.chk = col;
    } else {
      for (let c = col; c < end; c++) {
        const sub = norm(subRow[c]);
        if (SUB_CHK.test(sub)) cols.chk = c;
        else if (SUB_ACC.test(sub)) cols.acc = c;
        else if (SUB_HOLD.test(sub)) cols.hold = c;
        else if (SUB_REJ.test(sub)) cols.rej = c;
      }
    }
    out.push(cols);
  }
  return out;
}

/** Find the {group header row, sub header row} pair within the first dozen
 *  rows. The group row is whichever row matches the most distinct stage
 *  patterns; the sub row is the very next row (it holds CHKD QTY/ACPT
 *  QTY/HOLD/REJ, or is blank for single-column stages). Returns null if no
 *  row plausibly matches — the sheet doesn't fit this template at all, so it
 *  is skipped rather than guessed. */
function findHeaderRows(rows: unknown[][]): { groupRowIdx: number; subRowIdx: number } | null {
  const limit = Math.min(rows.length, 12);
  let best = -1, bestScore = 0;
  for (let i = 0; i < limit; i++) {
    const row = rows[i] ?? [];
    const score = headerSections(row, row.length).filter((s) => STAGE_PATTERNS.some((p) => p.all.every((re) => re.test(s.text)))).length;
    if (score > bestScore) { bestScore = score; best = i; }
  }
  if (best < 0 || bestScore < 4) return null; // too few stage matches — not this template
  return { groupRowIdx: best, subRowIdx: best + 1 };
}

const ROW_MARKER = /weekly|total|w\.?\s*report/i;
const HOLIDAY = /sunday|holiday|off/i;

const intOrNull = (v: unknown): number | null => {
  if (v == null || v === "") return null;
  const n = Number(String(v).replace(/[, ]/g, ""));
  return Number.isFinite(n) && n >= 0 ? Math.round(n) : null;
};

export interface DailyActivityParseResult { records: StageDayRecord[]; }

export function parseDailyActivity(buf: Buffer | ArrayBuffer, file: string): DailyActivityParseResult {
  const wb = xlsx.read(buf, { type: "buffer", cellDates: true });
  const records: StageDayRecord[] = [];

  for (const sheet of wb.SheetNames) {
    // "yearly/summary/format" sheets are rollups, not daily data. "*weekly
    // report*" sheets duplicate an already-present monthly sheet's dates
    // wholesale (verified against the real corpus: "JAN WEEKLY REPORT 25-26"
    // covers the exact same 31 days as "JAN 2026") — counting both doubles
    // every stage's checked/rejected for that period.
    if (/yearly|summary|format|weekly/i.test(sheet)) continue;
    // blankrows MUST stay on (via sheetGrid): dropping them desyncs array
    // index from worksheet row and every provenance ref lands on the wrong cell.
    const grid = sheetGrid(wb.Sheets[sheet]);
    const rows = grid.rows as any[][];

    const headerRows = findHeaderRows(rows);
    if (!headerRows) continue; // doesn't match this template — nothing to extract
    const rowLen = Math.max(rows[headerRows.groupRowIdx]?.length ?? 0, rows[headerRows.subRowIdx]?.length ?? 0);
    const stages = resolveStageColumns(rows[headerRows.groupRowIdx] ?? [], rows[headerRows.subRowIdx] ?? [], rowLen);
    if (stages.length === 0) continue;

    for (let i = headerRows.subRowIdx + 1; i < rows.length; i++) {
      const row = rows[i];
      if (!Array.isArray(row)) continue;
      const a = row[0];
      if (typeof a === "string" && ROW_MARKER.test(a)) continue;
      const iso = toLocalISODate(a);
      if (!iso) continue;                                  // header / WEEKLY / blank
      if (typeof row[1] === "string" && HOLIDAY.test(row[1])) continue; // SUNDAY etc.

      const src = { file, fileHash: "local", sheet, tableId: "daily-activity" };
      const sv = (val: number | null, col: number, header: string) =>
        val == null ? null : { value: val, cell: `${sheet}!${grid.colLetter(col)}${grid.rowNum(i)}`, header };

      for (const s of stages) {
        const checked = s.chk != null ? sv(intOrNull(row[s.chk]), s.chk, "CHKD QTY") : null;
        const accepted = s.acc != null ? sv(intOrNull(row[s.acc]), s.acc, "ACPT QTY") : null;
        const hold = s.hold != null ? sv(intOrNull(row[s.hold]), s.hold, "HOLD") : null;
        const rejected = s.rej != null ? sv(intOrNull(row[s.rej]), s.rej, "REJ") : null;
        if (!checked && !rejected) continue;               // nothing recorded for this stage·day

        records.push({
          occurredOn: { kind: "day", start: iso, end: iso },
          stageId: s.stageId,
          size: null,
          source: src,
          checked,
          acceptedGood: accepted,
          rework: hold,                                     // HOLD → rework (balance equation)
          rejected,
          defects: [],
          statedPct: null,
          extractedBy: "heuristic",
          ingestionId: "init-seed-daily-activity",
        });
      }
    }
  }

  return { records };
}
