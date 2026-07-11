// src/core/workbook/reader.ts
// Step 1 of the MOD pipeline: lossless extraction (ADD §4.1).
// ONLY reads. Never decides. Never ignores. Never renames. Never deletes.
// Every populated cell — value, type, formula, formatted text, number format —
// plus merges and column widths is captured. Excel as JSON, nothing else.

import * as XLSX from "xlsx";
import type { SnapshotCellT, SnapshotSheetT, WorkbookSnapshotT } from "@/shared/models/workbook";

async function sha256Hex(data: ArrayBuffer | Buffer): Promise<string> {
  const buf = data instanceof ArrayBuffer ? data : data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength);
  const digest = await globalThis.crypto.subtle.digest("SHA-256", buf as ArrayBuffer);
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Read a workbook into a lossless, content-addressed snapshot. */
export async function readWorkbookSnapshot(
  data: ArrayBuffer | Buffer,
  fileName: string,
): Promise<WorkbookSnapshotT> {
  const snapshotId = await sha256Hex(data);
  // cellNF/cellStyles so number formats and column widths survive; cellFormula
  // is on by default but stated for intent. Dates stay serial numbers (lossless).
  const wb = XLSX.read(data, { cellFormula: true, cellNF: true, cellStyles: true });

  const sheets: SnapshotSheetT[] = wb.SheetNames.map((name) => {
    const ws = wb.Sheets[name];
    const ref = ws?.["!ref"] ?? null;
    const cells: SnapshotCellT[] = [];

    if (ws && ref) {
      const range = XLSX.utils.decode_range(ref);
      for (let r = range.s.r; r <= range.e.r; r++) {
        for (let c = range.s.c; c <= range.e.c; c++) {
          const cell = ws[XLSX.utils.encode_cell({ r, c })];
          if (!cell) continue; // sparse: unpopulated cells carry no information
          cells.push({
            r, c,
            v: cell.v === undefined ? null : (cell.v instanceof Date ? cell.v.toISOString() : cell.v),
            t: cell.t ?? "z",
            f: typeof cell.f === "string" ? cell.f : null,
            w: typeof cell.w === "string" ? cell.w : null,
            z: typeof cell.z === "string" ? cell.z : null,
          });
        }
      }
    }

    const colInfo = ws?.["!cols"];
    return {
      name,
      ref,
      cells,
      merges: (ws?.["!merges"] ?? []).map((m) => ({ s: { r: m.s.r, c: m.s.c }, e: { r: m.e.r, c: m.e.c } })),
      // Array.from, not .map: !cols is often a sparse array and .map would
      // preserve its holes as undefined entries.
      colWidths: colInfo ? Array.from(colInfo, (c) => (c && typeof c.wch === "number" ? c.wch : null)) : null,
    };
  });

  return { snapshotId, fileName, sheets };
}
