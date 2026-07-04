// src/lib/ingest/parsers/parse-assembly-daily.ts
// Template-aware parser for the ASSEMBLY daily rejection sheet. Real header
// (single flat row, verified against DATA/ASSEMBLY REJECTION REPORT.xlsx):
//   DATE | VISUAL QTY | VISUAL ACPT QTY | REJ QTY | REJ % | BALLOON CHKD QTY |
//   BALLOON ACPT QTY | REJ QTY | REJ % | VALVE INT CHKD QTY | VALVE INTY ACPT
//   QTY | VALVE INTY REJ Qty | REJ % | FINAL CHECKED QTY | FINAL REJECTION |
//   TOTAL REJ QTY | FINAL REJ % | VISUAL CHECKED QTY | VISUAL REJ QTY | ...
// "REJ QTY"/"REJ %" repeat per stage (not globally unique), and a duplicate
// trailing "VISUAL CHECKED QTY"/"VISUAL REJ QTY" pair appears near the end
// (a weekly-rollup label column, never populated with real per-day data) —
// so columns are resolved by walking the header left-to-right and claiming
// each stage's block at its FIRST distinguishing "chk" column, rather than a
// fixed index map that silently breaks if the client reorders/adds columns.
import * as xlsx from "xlsx";
import type { StageDayRecord } from "@/lib/ingest/emit";
import { toLocalISODate } from "@/lib/ingest/date";
import { norm, headerSections } from "./header-sections";
import { sheetGrid, type SheetGrid } from "./a1";

interface StageCols { stageId: string; chk: number; acc: number | null; rej: number | null; }

// Order matters: checked top-to-bottom, first match per stageId wins (so the
// duplicate trailing "VISUAL CHECKED QTY" near the end of the row is ignored
// once "visual" has already been claimed by the earlier "VISUAL QTY" block).
const CHK_PATTERNS: { stageId: string; all: RegExp[] }[] = [
  { stageId: "visual",          all: [/visual/i, /qty/i] },
  { stageId: "balloon",         all: [/balloon/i, /chkd/i] },
  { stageId: "valve-integrity", all: [/valve/i, /chkd/i] },
  { stageId: "final",           all: [/final/i, /checked/i] },
];

const SUB_ACC = /acpt|accept/i;
const SUB_REJ = /rej/i; // matched only on non-% cells (checked by caller)
const PCT = /%/;

/** Resolve this sheet's stage->column map from its own header row. A stage's
 *  block starts at its "chk" column (matched via CHK_PATTERNS) and runs
 *  until the next matched stage's chk column (or row end); ACPT/REJ within
 *  that span are found by keyword, %% columns ignored. */
function resolveStageColumns(headerRow: unknown[], rowLen: number): StageCols[] {
  const secs = headerSections(headerRow, rowLen);
  const claimed = new Set<string>();
  const starts: { stageId: string; col: number }[] = [];
  for (const { col, text } of secs) {
    const match = CHK_PATTERNS.find((p) => !claimed.has(p.stageId) && p.all.every((re) => re.test(text)));
    if (!match) continue;
    claimed.add(match.stageId);
    starts.push({ stageId: match.stageId, col });
  }

  const out: StageCols[] = [];
  for (let i = 0; i < starts.length; i++) {
    const { stageId, col } = starts[i];
    const end = i + 1 < starts.length ? starts[i + 1].col : rowLen;
    const cols: StageCols = { stageId, chk: col, acc: null, rej: null };
    for (let c = col + 1; c < end; c++) {
      const sub = norm(headerRow[c]);
      if (PCT.test(sub)) continue;
      if (SUB_ACC.test(sub)) cols.acc = c;
      else if (SUB_REJ.test(sub) && cols.rej == null) cols.rej = c; // first REJ in span
    }
    out.push(cols);
  }
  return out;
}

/** Find the header row within the first dozen rows — whichever matches the
 *  most distinct stage chk-column patterns. Returns null (skip the sheet,
 *  never guess) if nothing plausibly matches. */
function findHeaderRow(rows: unknown[][]): number | null {
  const limit = Math.min(rows.length, 12);
  let best = -1, bestScore = 0;
  for (let i = 0; i < limit; i++) {
    const row = rows[i] ?? [];
    const claimed = new Set<string>();
    let score = 0;
    for (const { text } of headerSections(row, row.length)) {
      const match = CHK_PATTERNS.find((p) => !claimed.has(p.stageId) && p.all.every((re) => re.test(text)));
      if (match) { claimed.add(match.stageId); score++; }
    }
    if (score > bestScore) { bestScore = score; best = i; }
  }
  return bestScore >= 3 ? best : null; // require most stage blocks to match — not this template otherwise
}

const MARKER = /sunday|week|w\.?\s*report|total/i;

const intOrNull = (v: unknown): number | null => {
  if (v == null || v === "") return null;
  const n = Number(String(v).replace(/[, ]/g, ""));
  return Number.isFinite(n) && n >= 0 ? Math.round(n) : null;
};

const sv = (value: number | null, sheet: string, grid: SheetGrid, col: number, rowIdx: number, header: string) =>
  value == null ? null : { value, cell: `${sheet}!${grid.colLetter(col)}${grid.rowNum(rowIdx)}`, header };

export interface AssemblyParseResult {
  records: StageDayRecord[];
}

export function parseAssemblyDaily(buf: Buffer | ArrayBuffer, file: string): AssemblyParseResult {
  const wb = xlsx.read(buf, { type: "buffer", cellDates: true });
  const records: StageDayRecord[] = [];

  for (const sheet of wb.SheetNames) {
    if (/yearly|summary/i.test(sheet)) continue;
    // blankrows MUST stay on (via sheetGrid): dropping them desyncs array
    // index from worksheet row and every provenance ref lands on the wrong cell.
    const grid = sheetGrid(wb.Sheets[sheet]);
    const rows = grid.rows as any[][];

    const headerRowIdx = findHeaderRow(rows);
    if (headerRowIdx == null) continue; // doesn't match this template — nothing to extract
    const rowLen = rows[headerRowIdx]?.length ?? 0;
    const dateCol = 0; // DATE is always the first column across the corpus's header text
    const stages = resolveStageColumns(rows[headerRowIdx] ?? [], rowLen);
    if (stages.length === 0) continue;

    for (let i = headerRowIdx + 1; i < rows.length; i++) {
      const row = rows[i];
      if (!Array.isArray(row)) continue;
      const a = row[dateCol];
      if (typeof a === "string" && MARKER.test(a)) continue;
      const iso = toLocalISODate(a);
      if (!iso) continue;
      const src = { file, fileHash: "local", sheet, tableId: "t1" };

      for (const s of stages) {
        const checked = sv(intOrNull(row[s.chk]), sheet, grid, s.chk, i, "CHKD QTY");
        const accepted = s.acc != null ? sv(intOrNull(row[s.acc]), sheet, grid, s.acc, i, "ACPT QTY") : null;
        const rejected = s.rej != null ? sv(intOrNull(row[s.rej]), sheet, grid, s.rej, i, `${s.stageId.toUpperCase()} REJ`) : null;
        if (!checked && !rejected) continue;

        records.push({
          occurredOn: { kind: "day", start: iso, end: iso },
          stageId: s.stageId,
          size: null,
          source: src,
          checked,
          acceptedGood: accepted,
          rework: null,
          rejected,
          defects: [],
          statedPct: null,
          extractedBy: "heuristic",
          ingestionId: "init-seed-assembly",
        });
      }
    }
  }

  // Drop rows that have no checked and no rejected values
  const filtered = records.filter((r) => r.checked?.value || r.rejected?.value);
  return { records: filtered };
}
