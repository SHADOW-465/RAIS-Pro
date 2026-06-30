// src/lib/schema/from-workbook.ts
import * as XLSX from "xlsx";
import {
  detectHeaderRow,
  buildHeaderBlock,
  normalizeHeaders,
  colIndexToLabel,
} from "@/lib/parser";
import type { ProfilingCell, ProfilingTable } from "./types";

const MAX_SAMPLE_ROWS = 60;

/** Sheets that are templates or rollups, not primary data — skipped. */
const SKIP_SHEET_RE = /^\s*(formate|format|yearly|annual|cumul|summary|total|config|settings)\b/i;

/**
 * Build one ProfilingTable per data sheet of a workbook, reusing the existing
 * header-detection helpers and reading per-cell formulas (cell.f) so the
 * profiler can use the formula dependency graph. The ONLY file here that touches
 * xlsx — keeps the profiler core pure.
 */
export function buildProfilingTables(data: ArrayBuffer | Buffer, _fileName: string): ProfilingTable[] {
  const wb = XLSX.read(data, { cellFormula: true });
  const tables: ProfilingTable[] = [];

  for (const sheetName of wb.SheetNames) {
    if (SKIP_SHEET_RE.test(sheetName)) continue;
    const ws = wb.Sheets[sheetName];
    if (!ws) continue;

    const rawRows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" }) as unknown[][];
    if (rawRows.length === 0) continue;

    const headerRowIndex = detectHeaderRow(rawRows);
    const { header, dataStartIndex } = buildHeaderBlock(rawRows, headerRowIndex);
    const normalizedHeader = normalizeHeaders(header);
    const colLetters = normalizedHeader.map((_, i) => colIndexToLabel(i));
    const firstDataRow = dataStartIndex + 1; // 1-based sheet row of rows[0]

    const dataRows = rawRows.slice(dataStartIndex, dataStartIndex + MAX_SAMPLE_ROWS);
    const rows: ProfilingCell[][] = dataRows.map((row, rIdx) =>
      normalizedHeader.map((_, cIdx) => {
        const value = row[cIdx] ?? "";
        const ref = `${colLetters[cIdx]}${firstDataRow + rIdx}`;
        const cell = ws[ref];
        const formula = cell && typeof cell.f === "string" ? cell.f : null;
        return { value, formula } satisfies ProfilingCell;
      }),
    );

    const hasData = rows.some((r) => r.some((c) => c.value !== "" && c.value != null));
    if (!hasData) continue;

    tables.push({ sheetName, header: normalizedHeader, colLetters, firstDataRow, rows });
  }

  return tables;
}
