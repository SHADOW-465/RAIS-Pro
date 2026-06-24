// src/lib/ingest/parsers/parse-daily-activity.ts
// Fixed-column parser for the "DAILY ACTIVITY REPORT" — the whole-line daily
// throughput log covering the full process chain. Column map (0-indexed) is
// documented in docs/superpowers/plans/2026-06-25-fullfidelity-multistage-entry.md.
import * as xlsx from "xlsx";
import type { StageDayRecord } from "@/lib/ingest/emit";
import { toLocalISODate } from "@/lib/ingest/date";

interface StageCols { stageId: string; chk: number; acc: number | null; hold: number | null; rej: number | null; }

const STAGES: StageCols[] = [
  { stageId: "production",         chk: 2,  acc: 3,  hold: null, rej: 4 },
  { stageId: "eye-punching",       chk: 5,  acc: 6,  hold: null, rej: 7 },
  { stageId: "leaching",           chk: 8,  acc: null, hold: null, rej: null },
  { stageId: "chlorination",       chk: 9,  acc: null, hold: null, rej: null },
  { stageId: "hanging",            chk: 10, acc: null, hold: null, rej: null },
  { stageId: "gauge",              chk: 11, acc: null, hold: null, rej: null },
  { stageId: "trimming",           chk: 12, acc: null, hold: null, rej: null },
  { stageId: "visual",             chk: 13, acc: 14, hold: 15, rej: 16 },
  { stageId: "balloon",            chk: 17, acc: 18, hold: 19, rej: 20 },
  { stageId: "valve-fixing",       chk: 21, acc: null, hold: null, rej: null },
  { stageId: "valve-integrity",    chk: 22, acc: 23, hold: 24, rej: 25 },
  { stageId: "final",              chk: 26, acc: 27, hold: 28, rej: 29 },
  { stageId: "balloon-production", chk: 30, acc: 31, hold: null, rej: 32 },
];

const ROW_MARKER = /weekly|total|w\.?\s*report/i;
const HOLIDAY = /sunday|holiday|off/i;

const intOrNull = (v: unknown): number | null => {
  if (v == null || v === "") return null;
  const n = Number(String(v).replace(/[, ]/g, ""));
  return Number.isFinite(n) && n >= 0 ? Math.round(n) : null;
};

const cellRef = (col: number, row: number): string => {
  // colIndexToLabel-equivalent for cols beyond Z (e.g. col 33 = "AH").
  let s = ""; let n = col;
  do { s = String.fromCharCode(65 + (n % 26)) + s; n = Math.floor(n / 26) - 1; } while (n >= 0);
  return `${s}${row}`;
};

export interface DailyActivityParseResult { records: StageDayRecord[]; }

export function parseDailyActivity(buf: Buffer | ArrayBuffer, file: string): DailyActivityParseResult {
  const wb = xlsx.read(buf, { type: "buffer", cellDates: true });
  const records: StageDayRecord[] = [];

  for (const sheet of wb.SheetNames) {
    if (/yearly|summary|format/i.test(sheet)) continue;
    const rows: any[][] = xlsx.utils.sheet_to_json(wb.Sheets[sheet], { header: 1, defval: null, blankrows: false });

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      if (!Array.isArray(row)) continue;
      const a = row[0];
      if (typeof a === "string" && ROW_MARKER.test(a)) continue;
      const iso = toLocalISODate(a);
      if (!iso) continue;                                  // header / WEEKLY / blank
      if (typeof row[1] === "string" && HOLIDAY.test(row[1])) continue; // SUNDAY etc.

      const r = i + 1;
      const src = { file, fileHash: "local", sheet, tableId: "daily-activity" };
      const sv = (val: number | null, col: number, header: string) =>
        val == null ? null : { value: val, cell: `${sheet}!${cellRef(col, r)}`, header };

      for (const s of STAGES) {
        const checked = sv(intOrNull(row[s.chk]), s.chk, "CHKD QTY");
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
