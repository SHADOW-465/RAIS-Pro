// src/core/profiler/from-workbook.ts
import * as XLSX from "xlsx";
import {
  detectHeaderRow,
  buildHeaderBlock,
  normalizeHeaders,
  colIndexToLabel,
} from "@/lib/parser";
import type { ProfilingCell, ProfilingTable } from "./types";

const DEFAULT_MAX_SAMPLE_ROWS = 60;
const DATE_HEADER_RE = /\b(date|day)\b/i;

/**
 * Build one ProfilingTable per TABLE REGION of a workbook, reusing the existing
 * header-detection helpers and reading per-cell formulas (cell.f) so the
 * profiler can use the formula dependency graph. The ONLY file here that touches
 * xlsx — keeps the profiler core pure.
 *
 * Multi-table sheets: some corpus sheets carry two side-by-side tables (e.g.
 * "BALLOON … | VALVE INTEGRITY" blocks) separated by fully-empty columns. Each
 * region becomes its own ProfilingTable ("t1", "t2", …) with TRUE sheet column
 * letters; a region without its own date column inherits the sheet's date
 * column so its rows keep a time axis. Single-region sheets behave exactly as
 * before.
 *
 * By default samples up to DEFAULT_MAX_SAMPLE_ROWS rows per sheet — plenty for
 * role/type CLASSIFICATION. Pass `opts.maxRows` to read more (e.g. uncapped row
 * extraction for a dashboard, which must not silently truncate later months).
 */
export function buildProfilingTables(
  data: ArrayBuffer | Buffer,
  _fileName: string,
  opts: { maxRows?: number } = {},
): ProfilingTable[] {
  // _fileName is unused here — callers (e.g. src/lib/dataset/from-workbooks.ts)
  // already track fileName separately alongside each returned ProfilingTable.
  const maxRows = opts.maxRows ?? DEFAULT_MAX_SAMPLE_ROWS;
  const wb = XLSX.read(data, { cellFormula: true });
  const tables: ProfilingTable[] = [];

  // Every sheet is profiled — no name-based skipping. Rollup/summary sheets
  // become their own datasets in the explorer; they only affect the cumulative
  // ledger if the user explicitly publishes them.
  for (const sheetName of wb.SheetNames) {
    const ws = wb.Sheets[sheetName];
    if (!ws) continue;

    const rawRows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" }) as unknown[][];
    if (rawRows.length === 0) continue;

    const headerRowIndex = detectHeaderRow(rawRows);
    const { header, dataStartIndex } = buildHeaderBlock(rawRows, headerRowIndex);
    const normalizedHeader = normalizeHeaders(header);
    const colLetters = normalizedHeader.map((_, i) => colIndexToLabel(i));
    const firstDataRow = dataStartIndex + 1; // 1-based sheet row of rows[0]

    const dataRows = rawRows.slice(dataStartIndex, dataStartIndex + maxRows);
    const readCell = (rIdx: number, cIdx: number): ProfilingCell => {
      const value = dataRows[rIdx]?.[cIdx] ?? "";
      const ref = `${colLetters[cIdx]}${firstDataRow + rIdx}`;
      const cell = ws[ref];
      const formula = cell && typeof cell.f === "string" ? cell.f : null;
      return { value, formula };
    };

    const named = (c: number) => {
      const h = (normalizedHeader[c] ?? "").trim();
      return h !== "" && !h.startsWith("__EMPTY");
    };
    const colHasData = (c: number) => dataRows.some((row) => row?.[c] !== "" && row?.[c] != null);

    // Columns covered by a NAMED header merge (e.g. "CHECKED QTY" spanning
    // O7:P7) are part of that column's span, not a table separator.
    const width = normalizedHeader.length;
    const inHeaderSpan: boolean[] = Array(width).fill(false);
    for (const m of ws["!merges"] ?? []) {
      if (m.s.r > dataStartIndex - 1 || m.e.r < headerRowIndex) continue; // merge not in the header block
      for (let c = m.s.c; c <= Math.min(m.e.c, width - 1); c++) {
        if (named(m.s.c)) inHeaderSpan[c] = true;
      }
    }

    // ── Region detection: runs of live columns between dead columns ─────────
    const isDead = (c: number) => !named(c) && !colHasData(c) && !inHeaderSpan[c];
    const runs: { start: number; end: number }[] = []; // end exclusive
    let start: number | null = null;
    for (let c = 0; c <= width; c++) {
      const dead = c === width || isDead(c);
      if (!dead && start === null) start = c;
      if (dead && start !== null) { runs.push({ start, end: c }); start = null; }
    }
    const regions = runs.filter((r) => {
      let count = 0;
      for (let c = r.start; c < r.end; c++) if (named(c)) count++;
      return count >= 2;
    });

    if (regions.length <= 1) {
      // Single region — identical to the pre-split behavior (whole sheet).
      const rows: ProfilingCell[][] = dataRows.map((_, rIdx) =>
        normalizedHeader.map((__, cIdx) => readCell(rIdx, cIdx)),
      );
      const hasData = rows.some((r) => r.some((c) => c.value !== "" && c.value != null));
      if (!hasData) continue;
      tables.push({ sheetName, tableId: "t1", regionLabel: null, header: normalizedHeader, colLetters, firstDataRow, rows });
      continue;
    }

    // ── Multi-region sheet ───────────────────────────────────────────────────
    // The sheet's date column (usually col A) — inherited by regions without one.
    let dateIdx = -1;
    for (let c = 0; c < width; c++) {
      if (named(c) && DATE_HEADER_RE.test(normalizedHeader[c])) { dateIdx = c; break; }
    }

    // Group-header text above the header block (e.g. the "VALVE INTEGRITY" band),
    // matched to a region by column span.
    const labelFor = (r: { start: number; end: number }): string | null => {
      for (let rowIdx = headerRowIndex - 1; rowIdx >= Math.max(0, headerRowIndex - 3); rowIdx--) {
        const row = rawRows[rowIdx];
        if (!Array.isArray(row)) continue;
        for (let c = r.start; c < r.end; c++) {
          const v = row[c];
          if (typeof v === "string" && v.trim().length > 2) return v.trim();
        }
      }
      return null;
    };

    regions.forEach((r, i) => {
      const cols: number[] = [];
      let hasDate = false;
      for (let c = r.start; c < r.end; c++) {
        if (!named(c)) continue;
        if (DATE_HEADER_RE.test(normalizedHeader[c])) hasDate = true;
        cols.push(c);
      }
      if (!hasDate && dateIdx >= 0 && !cols.includes(dateIdx)) cols.unshift(dateIdx);

      const rows: ProfilingCell[][] = dataRows.map((_, rIdx) => cols.map((cIdx) => readCell(rIdx, cIdx)));
      const hasData = rows.some((row) => row.some((c) => c.value !== "" && c.value != null));
      if (!hasData) return;
      tables.push({
        sheetName,
        tableId: `t${i + 1}`,
        regionLabel: labelFor(r),
        header: cols.map((c) => normalizedHeader[c]),
        colLetters: cols.map((c) => colLetters[c]),
        firstDataRow,
        rows,
      });
    });
  }

  return tables;
}
