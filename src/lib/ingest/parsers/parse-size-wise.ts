// src/lib/ingest/parsers/parse-size-wise.ts
import xlsx from "xlsx";
import type { StageDayRecord } from "@/lib/ingest/emit";
import { dateFromFilename, toLocalISODate } from "@/lib/ingest/date";

export function parseSizeWise(buf: Buffer | ArrayBuffer, file: string): StageDayRecord[] {
  const date = dateFromFilename(file);
  if (!date) return [];

  const wb = xlsx.read(buf, { type: "buffer", cellDates: true });
  const records: StageDayRecord[] = [];

  const fileLower = file.toLowerCase();
  const isValve = fileLower.includes("valve") || fileLower.includes("integrity");
  const isVisual = fileLower.includes("visual") || fileLower.includes("vis");

  if (isValve) {
    // Valve Integrity sheets have a COMMULATIVE sheet that has side-by-side Balloon & Valve Integrity data
    const commSheetName = wb.SheetNames.find((s) => /c[ou]mm?ulative/i.test(s));
    if (commSheetName) {
      const ws = wb.Sheets[commSheetName];
      const rows: any[][] = xlsx.utils.sheet_to_json(ws, { header: 1, defval: null });

      for (let r = 0; r < rows.length; r++) {
        const row = rows[r];
        if (!row || row.length < 5) continue;

        const sizeCell = String(row[0] || row[1] || "").trim().toUpperCase();
        const sizeMatch = sizeCell.match(/^(\d+)FR$/);
        if (!sizeMatch) continue;
        const size = `Fr${sizeMatch[1]}`;

        const src = { file, fileHash: "local", sheet: commSheetName, tableId: "valve-comm" };

        // Balloon: Checked (col 2), Rej (col 5), Defects (cols 7,8,9,10)
        const bChecked = Number(row[2]);
        const bRej = Number(row[5]);
        if (!isNaN(bChecked) && bChecked > 0) {
          const defects = [];
          const defLabels = ["STRUCK BALLOON", "BALLOON BURST", "LEAKAGE", "OTHERS"];
          for (let c = 0; c < 4; c++) {
            const val = Number(row[7 + c]);
            if (val > 0) {
              defects.push({
                raw: defLabels[c],
                value: Math.round(val),
                cell: `${commSheetName}!${String.fromCharCode(65 + 7 + c)}${r + 1}`,
              });
            }
          }
          records.push({
            occurredOn: { kind: "day", start: date, end: date },
            stageId: "balloon",
            size,
            source: src,
            checked: { value: Math.round(bChecked), cell: `${commSheetName}!C${r + 1}`, header: "CHECKED" },
            acceptedGood: null,
            rework: null,
            rejected: { value: Math.round(bRej || 0), cell: `${commSheetName}!F${r + 1}`, header: "REJ" },
            defects,
            statedPct: null,
            extractedBy: "heuristic",
            ingestionId: "init-seed-size-valve-balloon",
          });
        }

        // Valve: Checked (col 13), Rej (col 16), Defects (cols 18,19,20,21,22)
        const vChecked = Number(row[13]);
        const vRej = Number(row[16]);
        if (!isNaN(vChecked) && vChecked > 0) {
          const defects = [];
          const defLabels = ["LEAKAGE", "90-10", "BUBBLE", "THIN SPOT", "OTHERS"];
          for (let c = 0; c < 5; c++) {
            const val = Number(row[18 + c]);
            if (val > 0) {
              defects.push({
                raw: defLabels[c],
                value: Math.round(val),
                cell: `${commSheetName}!${String.fromCharCode(65 + 18 + c)}${r + 1}`,
              });
            }
          }
          records.push({
            occurredOn: { kind: "day", start: date, end: date },
            stageId: "valve-integrity",
            size,
            source: src,
            checked: { value: Math.round(vChecked), cell: `${commSheetName}!N${r + 1}`, header: "CHECKED" },
            acceptedGood: null,
            rework: null,
            rejected: { value: Math.round(vRej || 0), cell: `${commSheetName}!Q${r + 1}`, header: "REJ" },
            defects,
            statedPct: null,
            extractedBy: "heuristic",
            ingestionId: "init-seed-size-valve",
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

      let totalChecked = 0;
      let totalRejected = 0;
      const defectSums = new Map<string, number>();

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
        if (!isNaN(chk)) totalChecked += chk;
        if (!isNaN(rej)) totalRejected += rej;

        for (let c = startDefectIdx; c < row.length; c++) {
          const val = Number(row[c]);
          const label = headers[c];
          if (label && !isNaN(val) && val > 0) {
            defectSums.set(label, (defectSums.get(label) || 0) + val);
          }
        }
      }

      if (totalChecked > 0 || totalRejected > 0) {
        const defects = [...defectSums.entries()].map(([raw, value]) => ({
          raw,
          value: Math.round(value),
          cell: `${sheetName}!aggregated`,
        }));

        records.push({
          occurredOn: { kind: "day", start: date, end: date },
          stageId: isVisual ? "visual" : "final",
          size,
          source: { file, fileHash: "local", sheet: sheetName, tableId: "size-agg" },
          checked: { value: Math.round(totalChecked), cell: `${sheetName}!REC`, header: "REC. QTY" },
          acceptedGood: null,
          rework: null,
          rejected: { value: Math.round(totalRejected), cell: `${sheetName}!REJ`, header: "REJ. QTY" },
          defects,
          statedPct: null,
          extractedBy: "heuristic",
          ingestionId: "init-seed-size-wise",
        });
      }
    }
  }

  return records;
}
