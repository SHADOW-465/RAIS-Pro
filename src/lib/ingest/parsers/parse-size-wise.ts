// src/lib/ingest/parsers/parse-size-wise.ts
import * as xlsx from "xlsx";
import type { StageDayRecord } from "@/lib/ingest/emit";
import { dateFromFilename, toLocalISODate } from "@/lib/ingest/date";

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
      const sizeMatch = sheetName.match(/^(\d+)FR$/i);
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

      // Balloon columns: DATE (0), CHECKED QTY (3), ACCEPT QTY (4), REJ. QTY (6), defects: 8, 9, 10, 11
      // Valve columns: DATE (0), CHECKED QTY (15), ACCEPT QTY (16), REJ. QTY (18), defects: 20, 21, 22, 23, 24
      const bCheckedIdx = 3;
      const bRejectedIdx = 6;
      const bDefectStart = 8;
      const bDefectLabels = ["STRUCK BALLOON", "BALLOON BURST", "LEAKAGE", "OTHERS"];

      const vCheckedIdx = 15;
      const vRejectedIdx = 18;
      const vDefectStart = 20;
      const vDefectLabels = ["LEAKAGE", "90-10", "BUBBLE", "THIN SPOT", "OTHERS"];

      for (let i = headerRowIdx + 1; i < rows.length; i++) {
        const row = rows[i];
        if (!row || row.length === 0) continue;
        const iso = toLocalISODate(row[0]);
        if (!iso) continue; // Skip non-date rows

        // Balloon Balloon Inspection
        const bChecked = Number(row[bCheckedIdx]);
        const bRej = Number(row[bRejectedIdx]);
        if (!isNaN(bChecked) && bChecked > 0) {
          const defects = [];
          for (let c = 0; c < 4; c++) {
            const val = Number(row[bDefectStart + c]);
            if (!isNaN(val) && val > 0) {
              defects.push({
                raw: bDefectLabels[c],
                value: Math.round(val),
                cell: `${sheetName}!${String.fromCharCode(65 + bDefectStart + c)}${i + 1}`,
              });
            }
          }
          records.push({
            occurredOn: { kind: "day", start: iso, end: iso },
            stageId: "balloon",
            size,
            source: { file, fileHash: "local", sheet: sheetName, tableId: "valve-balloon-row" },
            checked: { value: Math.round(bChecked), cell: `${sheetName}!${String.fromCharCode(65 + bCheckedIdx)}${i + 1}`, header: "CHECKED QTY" },
            acceptedGood: null,
            rework: null,
            rejected: { value: Math.round(bRej || 0), cell: `${sheetName}!${String.fromCharCode(65 + bRejectedIdx)}${i + 1}`, header: "REJ. QTY" },
            defects,
            statedPct: null,
            extractedBy: "heuristic",
            ingestionId: `init-seed-size-valve-balloon-${sheetName}-${iso}`,
          });
        }

        // Valve Integrity
        const vChecked = Number(row[vCheckedIdx]);
        const vRej = Number(row[vRejectedIdx]);
        if (!isNaN(vChecked) && vChecked > 0) {
          const defects = [];
          for (let c = 0; c < 5; c++) {
            const val = Number(row[vDefectStart + c]);
            if (!isNaN(val) && val > 0) {
              defects.push({
                raw: vDefectLabels[c],
                value: Math.round(val),
                cell: `${sheetName}!${String.fromCharCode(65 + vDefectStart + c)}${i + 1}`,
              });
            }
          }
          records.push({
            occurredOn: { kind: "day", start: iso, end: iso },
            stageId: "valve-integrity",
            size,
            source: { file, fileHash: "local", sheet: sheetName, tableId: "valve-integrity-row" },
            checked: { value: Math.round(vChecked), cell: `${sheetName}!${String.fromCharCode(65 + vCheckedIdx)}${i + 1}`, header: "CHECKED QTY" },
            acceptedGood: null,
            rework: null,
            rejected: { value: Math.round(vRej || 0), cell: `${sheetName}!${String.fromCharCode(65 + vRejectedIdx)}${i + 1}`, header: "REJ. QTY" },
            defects,
            statedPct: null,
            extractedBy: "heuristic",
            ingestionId: `init-seed-size-valve-integrity-${sheetName}-${iso}`,
          });
        }
      }
    }
  } else {
    // Visual or other files: loop through size sheets (e.g. 10FR, 12FR, ...)
    for (const sheetName of wb.SheetNames) {
      const sizeMatch = sheetName.match(/^(\d+)FR$/i);
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
          acceptedGood: null,
          rework: null,
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
