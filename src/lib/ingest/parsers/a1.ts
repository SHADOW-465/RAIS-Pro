// src/lib/ingest/parsers/a1.ts
// True Excel-coordinate mapping for provenance refs.
//
// Every parser MUST build cell refs from this grid, never from raw
// sheet_to_json array indices: `blankrows: false` deletes blank rows (so
// index i no longer equals row i+1), sheets whose used range doesn't start
// at A1 shift both axes, and String.fromCharCode(65 + c) breaks past
// column Z. The provenance audit (scripts/audit-provenance.ts) checks every
// emitted ref against the original workbook — refs built any other way fail.
import * as xlsx from "xlsx";

export interface SheetGrid {
  /** Raw rows INCLUDING blank rows, so index ↔ worksheet row stays linear. */
  rows: unknown[][];
  /** True 1-based Excel row for array index i. */
  rowNum(i: number): number;
  /** True Excel column letter (A…Z, AA…) for array index c. */
  colLetter(c: number): string;
}

export function sheetGrid(ws: xlsx.WorkSheet): SheetGrid {
  const range = xlsx.utils.decode_range(ws["!ref"] ?? "A1:A1");
  const rows = xlsx.utils.sheet_to_json(ws, { header: 1, defval: null, blankrows: true }) as unknown[][];
  return {
    rows,
    rowNum: (i) => range.s.r + i + 1,
    colLetter: (c) => xlsx.utils.encode_col(range.s.c + c),
  };
}
