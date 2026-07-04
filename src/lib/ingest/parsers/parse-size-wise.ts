// src/lib/ingest/parsers/parse-size-wise.ts
import * as xlsx from "xlsx";
import type { StageDayRecord } from "@/lib/ingest/emit";
import { dateFromFilename, toLocalISODate } from "@/lib/ingest/date";
import { norm, headerSections } from "./header-sections";

interface ValveBlockCols { stageId: "balloon" | "valve-integrity"; chk: number; acc: number | null; hold: number | null; rej: number | null; defects: { col: number; label: string }[] }

const SUB_CHK = /^(checked|chkd|check)\s*qty$/i;
const SUB_ACC = /^(accept|acpt)\s*qty$/i;
const SUB_HOLD = /^hold\s*qty$/i;
const SUB_REJ = /^rej\.?\s*qty$/i;
const SUB_SKIP = /^batch\s*no\.?$|^remarks?$|^rej\.?\s*%$|^s\.?\s*no\.?$/i;

/** Resolve the Balloon / Valve Integrity column blocks from the sheet's own
 *  two-row header (group row: "BALLOON…"/"VALVE INTEGRITY"; sub row: CHECKED
 *  QTY/ACCEPT QTY/HOLD QTY/REJ. QTY + defect labels) instead of a fixed
 *  index map. Falls back to positional order (Balloon block, then Valve
 *  Integrity block — the corpus's consistent left-to-right layout) if the
 *  group row's labels aren't recognizable, so a stray merged-cell quirk in
 *  the group row never drops the whole sheet. */
function resolveValveBlocks(groupRow: unknown[] | undefined, subRow: unknown[], rowLen: number): ValveBlockCols[] {
  const subSecs = headerSections(subRow, rowLen).filter((s) => SUB_CHK.test(s.text));
  if (subSecs.length < 2) return []; // needs both a Balloon and a Valve Integrity block

  const order: ("balloon" | "valve-integrity")[] = ["balloon", "valve-integrity"];
  if (groupRow) {
    const groupSecs = headerSections(groupRow, rowLen);
    const balloon = groupSecs.find((s) => /balloon|baloon/i.test(s.text));
    const valve = groupSecs.find((s) => /valve/i.test(s.text) && /integrity/i.test(s.text));
    if (balloon && valve) {
      // Assign each CHECKED-QTY column to whichever group section's span contains it.
      order[0] = subSecs[0].col >= balloon.col && subSecs[0].col < balloon.end ? "balloon" : "valve-integrity";
      order[1] = order[0] === "balloon" ? "valve-integrity" : "balloon";
    }
  }

  return subSecs.slice(0, 2).map((chkSec, i) => {
    const end = i + 1 < subSecs.length ? subSecs[i + 1].col : rowLen;
    const cols: ValveBlockCols = { stageId: order[i], chk: chkSec.col, acc: null, hold: null, rej: null, defects: [] };
    for (let c = chkSec.col + 1; c < end; c++) {
      const text = norm(subRow[c]);
      if (!text || SUB_SKIP.test(text)) continue;
      if (SUB_ACC.test(text)) cols.acc = c;
      else if (SUB_HOLD.test(text)) cols.hold = c;
      else if (SUB_REJ.test(text)) cols.rej = c;
      else cols.defects.push({ col: c, label: text }); // defect column — real header text, not a hardcoded label
    }
    return cols;
  });
}

/** Decide whether a size-wise workbook is a Valve (balloon+valve) or Visual
 *  book. Filename hint first (folder path on disk), then sheet-content sniffing
 *  (browser uploads have only a basename). */
function detectSizeKind(wb: xlsx.WorkBook, fileLower: string): "valve" | "visual" {
  if (fileLower.includes("valve") || fileLower.includes("integrity")) return "valve";
  if (fileLower.includes("visual")) return "visual";
  for (const sn of wb.SheetNames) {
    if (!/^\d+FR$/i.test(sn) && !/^commulative|^cumulative/i.test(sn)) continue;
    const rows = xlsx.utils.sheet_to_json(wb.Sheets[sn], { header: 1, defval: null }) as any[][];
    const text = rows.slice(0, 12).flat().map((c) => String(c ?? "").toUpperCase()).join(" | ");
    if (text.includes("VALVE INTEGRITY") || text.includes("STRUCK BALLOON") || text.includes("BALLOM BRUST")) return "valve";
    if (text.includes("REASON FOR REJECTION") || text.includes("REC. QTY") || text.includes("REC QTY")) return "visual";
    break; // inspect only the first matching sheet
  }
  return "visual"; // safe default (visual is the simpler single-section layout)
}

export function parseSizeWise(buf: Buffer | ArrayBuffer, file: string): StageDayRecord[] {
  const date = dateFromFilename(file);
  if (!date) return [];

  const wb = xlsx.read(buf, { type: "buffer", cellDates: true });
  const records: StageDayRecord[] = [];

  // Valve vs Visual must be detectable from a browser upload, where File.name is
  // just the basename ("1 APRIL 26.xlsx") with NO folder context. Prefer the
  // filename hint; otherwise inspect the first size sheet's header text — Valve
  // workbooks carry the side-by-side "BALLOON … VALVE INTEGRITY" block, Visual
  // workbooks carry "REC. QTY … REASON FOR REJECTION".
  const kind = detectSizeKind(wb, file.toLowerCase());
  const isValve = kind === "valve";
  const isVisual = kind === "visual";

  if (isValve) {
    // Valve Integrity workbook: loop through detailed size sheets, e.g. 6FR, 8FR, etc.
    for (const sheetName of wb.SheetNames) {
      const sizeMatch = sheetName.match(/^\s*(\d+)\s*FR\.?\s*$/i);
      if (!sizeMatch) continue;
      const size = `Fr${sizeMatch[1]}`;
      const ws = wb.Sheets[sheetName];
      const rows: any[][] = xlsx.utils.sheet_to_json(ws, { header: 1, defval: null });

      let headerRowIdx = -1;
      for (let i = 0; i < Math.min(20, rows.length); i++) {
        const row = rows[i];
        if (Array.isArray(row) && row.some((v) => v != null && String(v).trim().toUpperCase() === "DATE")) {
          headerRowIdx = i;
          break;
        }
      }
      if (headerRowIdx === -1) continue;

      const rowLen = rows[headerRowIdx]?.length ?? 0;
      const blocks = resolveValveBlocks(rows[headerRowIdx - 1], rows[headerRowIdx] ?? [], rowLen);
      if (blocks.length === 0) continue; // doesn't match this template — nothing to extract

      for (let i = headerRowIdx + 1; i < rows.length; i++) {
        const row = rows[i];
        if (!row || row.length === 0) continue;
        const iso = toLocalISODate(row[0]);
        if (!iso) continue; // Skip non-date rows

        for (const b of blocks) {
          const checked = Number(row[b.chk]);
          const rej = Number(row[b.rej ?? -1]);
          if (isNaN(checked) || checked <= 0) continue;

          const defects = [];
          for (const d of b.defects) {
            const val = Number(row[d.col]);
            if (!isNaN(val) && val > 0) {
              defects.push({ raw: d.label, value: Math.round(val), cell: `${sheetName}!${String.fromCharCode(65 + d.col)}${i + 1}` });
            }
          }
          records.push({
            occurredOn: { kind: "day", start: iso, end: iso },
            stageId: b.stageId,
            size,
            source: { file, fileHash: "local", sheet: sheetName, tableId: `valve-${b.stageId}-row` },
            checked: { value: Math.round(checked), cell: `${sheetName}!${String.fromCharCode(65 + b.chk)}${i + 1}`, header: "CHECKED QTY" },
            acceptedGood: b.acc != null && !isNaN(Number(row[b.acc])) ? { value: Math.round(Number(row[b.acc])), cell: `${sheetName}!${String.fromCharCode(65 + b.acc)}${i + 1}`, header: "ACCEPT QTY" } : null,
            rework: b.hold != null && !isNaN(Number(row[b.hold])) ? { value: Math.round(Number(row[b.hold])), cell: `${sheetName}!${String.fromCharCode(65 + b.hold)}${i + 1}`, header: "HOLD QTY" } : null,
            rejected: { value: Math.round(rej || 0), cell: b.rej != null ? `${sheetName}!${String.fromCharCode(65 + b.rej)}${i + 1}` : "", header: "REJ. QTY" },
            defects,
            statedPct: null,
            extractedBy: "heuristic",
            ingestionId: `init-seed-size-valve-${b.stageId}-${sheetName}-${iso}`,
          });
        }
      }
    }
  } else {
    // Visual or other files: loop through size sheets (e.g. 10FR, 12FR, ...)
    for (const sheetName of wb.SheetNames) {
      const sizeMatch = sheetName.match(/^\s*(\d+)\s*FR\.?\s*$/i);
      if (!sizeMatch) continue;
      const size = `Fr${sizeMatch[1]}`;
      const ws = wb.Sheets[sheetName];
      const rows: any[][] = xlsx.utils.sheet_to_json(ws, { header: 1, defval: null });

      let headerRowIdx = -1;
      let headers: string[] = [];
      for (let i = 0; i < Math.min(20, rows.length); i++) {
        const row = rows[i];
        if (Array.isArray(row) && row.some((v) => v != null && String(v).trim().toUpperCase() === "DATE")) {
          headerRowIdx = i;
          headers = row.map((v) => String(v || "").trim().toUpperCase());
          break;
        }
      }

      if (headerRowIdx === -1) continue;

      // Search for defect sub-header row (e.g. COAG, SD...) in the next 3 rows and merge it
      for (let offset = 1; offset <= 3; offset++) {
        if (headerRowIdx + offset < rows.length) {
          const nextRow = rows[headerRowIdx + offset];
          if (Array.isArray(nextRow) && nextRow.some((v) => v === "COAG" || v === "SD" || v === "STRUCK BALLOON")) {
            nextRow.forEach((v, j) => {
              if (v != null && String(v).trim() !== "") {
                headers[j] = String(v).trim().toUpperCase();
              }
            });
            break;
          }
        }
      }

      const checkedIdx = headers.indexOf("REC. QTY") >= 0 ? headers.indexOf("REC. QTY") : headers.indexOf("INPUT QTY");
      const rejectedIdx = headers.indexOf("REJ. QTY") >= 0 ? headers.indexOf("REJ. QTY") : headers.indexOf("REJ QTY");
      const startDefectIdx = headers.indexOf("REASON FOR REJECTION") >= 0
        ? headers.indexOf("REASON FOR REJECTION") + 1
        : rejectedIdx + 2;
      const acceptIdx = headers.indexOf("ACCEPT QTY") >= 0 ? headers.indexOf("ACCEPT QTY")
                       : headers.indexOf("A GRADE") >= 0 ? headers.indexOf("A GRADE")
                       : -1;
      const holdIdx = headers.indexOf("HOLD QTY") >= 0 ? headers.indexOf("HOLD QTY")
                     : headers.indexOf("HOLD") >= 0 ? headers.indexOf("HOLD") : -1;

      for (let i = headerRowIdx + 1; i < rows.length; i++) {
        const row = rows[i];
        if (!row || row.length === 0) continue;
        const iso = toLocalISODate(row[0]);
        if (!iso) continue; // Skips header/sub-header rows dynamically

        const chk = Number(row[checkedIdx]);
        const rej = Number(row[rejectedIdx]);
        if (isNaN(chk) && isNaN(rej)) continue;

        const defects = [];
        for (let c = startDefectIdx; c < row.length; c++) {
          const val = Number(row[c]);
          const label = headers[c];
          if (label && !isNaN(val) && val > 0) {
            defects.push({
              raw: label,
              value: Math.round(val),
              cell: `${sheetName}!${String.fromCharCode(65 + c)}${i + 1}`,
            });
          }
        }

        records.push({
          occurredOn: { kind: "day", start: iso, end: iso },
          stageId: isVisual ? "visual" : "final",
          size,
          source: { file, fileHash: "local", sheet: sheetName, tableId: "size-row" },
          checked: !isNaN(chk) ? { value: Math.round(chk), cell: `${sheetName}!${String.fromCharCode(65 + checkedIdx)}${i + 1}`, header: headers[checkedIdx] } : null,
          acceptedGood: acceptIdx >= 0 && !isNaN(Number(row[acceptIdx])) ? { value: Math.round(Number(row[acceptIdx])), cell: `${sheetName}!${String.fromCharCode(65 + acceptIdx)}${i + 1}`, header: headers[acceptIdx] } : null,
          rework: holdIdx >= 0 && !isNaN(Number(row[holdIdx])) ? { value: Math.round(Number(row[holdIdx])), cell: `${sheetName}!${String.fromCharCode(65 + holdIdx)}${i + 1}`, header: headers[holdIdx] } : null,
          rejected: !isNaN(rej) ? { value: Math.round(rej), cell: `${sheetName}!${String.fromCharCode(65 + rejectedIdx)}${i + 1}`, header: headers[rejectedIdx] } : null,
          defects,
          statedPct: null,
          extractedBy: "heuristic",
          ingestionId: `init-seed-size-wise-${sheetName}-${iso}`,
        });
      }
    }
  }

  return records;
}
