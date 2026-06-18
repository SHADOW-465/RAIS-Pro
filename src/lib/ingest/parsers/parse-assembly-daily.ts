// src/lib/ingest/parsers/parse-assembly-daily.ts
import xlsx from "xlsx";
import type { StageDayRecord } from "@/lib/ingest/emit";
import { toLocalISODate } from "@/lib/ingest/date";

// Fixed column layout of the ASSEMBLY daily sheet (header row index 3 / row 4):
// A DATE | B VISUAL QTY | C VISUAL ACPT | D REJ | E REJ% | F BALLOON CHKD | G ACPT |
// H REJ | I REJ% | J VALVE CHKD | K ACPT | L REJ | M REJ% | N FINAL CHKD | O FINAL REJ ...
const COL = {
  date: 0,
  vChk: 1,
  vAcc: 2,
  vRej: 3,
  bChk: 5,
  bAcc: 6,
  bRej: 7,
  kChk: 9,
  kAcc: 10,
  kRej: 11,
  fChk: 13,
  fRej: 14,
};

const MARKER = /sunday|week|w\.?\s*report|total/i;

const intOrNull = (v: unknown): number | null => {
  if (v == null || v === "") return null;
  const n = Number(String(v).replace(/[, ]/g, ""));
  return Number.isFinite(n) && n >= 0 ? Math.round(n) : null;
};

const sv = (value: number | null, sheet: string, col: number, row: number, header: string) =>
  value == null ? null : { value, cell: `${sheet}!${String.fromCharCode(65 + col)}${row}`, header };

export interface AssemblyParseResult {
  records: StageDayRecord[];
}

export function parseAssemblyDaily(buf: Buffer | ArrayBuffer, file: string): AssemblyParseResult {
  const wb = xlsx.read(buf, { type: "buffer", cellDates: true });
  const records: StageDayRecord[] = [];

  for (const sheet of wb.SheetNames) {
    if (/yearly|summary/i.test(sheet)) continue;
    const rows: any[][] = xlsx.utils.sheet_to_json(wb.Sheets[sheet], { header: 1, defval: null, blankrows: false });
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      if (!Array.isArray(row)) continue;
      const a = row[COL.date];
      if (typeof a === "string" && MARKER.test(a)) continue;
      const iso = toLocalISODate(a);
      if (!iso) continue;
      const r = i + 1;
      const src = { file, fileHash: "local", sheet, tableId: "t1" };
      
      const mk = (
        stageId: string,
        chkCol: number,
        accCol: number | null,
        rejCol: number,
        rejHdr: string
      ): StageDayRecord => ({
        occurredOn: { kind: "day", start: iso, end: iso },
        stageId,
        size: null,
        source: src,
        checked: sv(intOrNull(row[chkCol]), sheet, chkCol, r, "CHKD QTY"),
        acceptedGood: accCol != null ? sv(intOrNull(row[accCol]), sheet, accCol, r, "ACPT QTY") : null,
        rework: null,
        rejected: sv(intOrNull(row[rejCol]), sheet, rejCol, r, rejHdr),
        defects: [],
        statedPct: null,
        extractedBy: "heuristic",
        ingestionId: "init-seed-assembly",
      });

      records.push(mk("visual", COL.vChk, COL.vAcc, COL.vRej, "VISUAL REJ"));
      records.push(mk("balloon", COL.bChk, COL.bAcc, COL.bRej, "BALLOON REJ"));
      records.push(mk("valve-integrity", COL.kChk, COL.kAcc, COL.kRej, "VALVE REJ"));
      records.push(mk("final", COL.fChk, null, COL.fRej, "FINAL REJ"));
    }
  }

  // Drop rows that have no checked and no rejected values
  const filtered = records.filter((r) => r.checked?.value || r.rejected?.value);
  return { records: filtered };
}
