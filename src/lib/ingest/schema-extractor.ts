// src/lib/ingest/schema-extractor.ts
import * as xlsx from "xlsx";
import { detectHeaderRow, buildHeaderBlock, normalizeHeaders, colIndexToLabel } from "@/lib/parser";
import type { StageDayRecord } from "@/lib/ingest/emit";
import type { RawSheet } from "@/types/dashboard";
import { toISODate } from "@/lib/ingest/from-rejection-sheets";

export interface ExtractedField {
  name: string;
  colLetter: string;
  colIndex: number;
  role: "date" | "checked" | "good" | "rework" | "rejected" | "defect" | "formula" | "other";
  type: "date" | "number" | "string" | "unknown";
  formula?: string | null;
}

export interface ExtractedStage {
  stageId: string;
  label: string;
  fields: ExtractedField[];
  rowCount: number;
}

export interface ExtractedSchema {
  fileName: string;
  stages: ExtractedStage[];
}

function colLabelToIndex(label: string): number {
  let idx = 0;
  for (let i = 0; i < label.length; i++) {
    idx = idx * 26 + (label.charCodeAt(i) - 64);
  }
  return idx - 1;
}

function translateFormula(f: string, headers: string[]): string {
  // matches Excel cell references like B12, D12, AA15
  return f.replace(/\b([A-Z]+)(\d+)\b/g, (match, colLetter, rowNum) => {
    const colIdx = colLabelToIndex(colLetter);
    if (colIdx >= 0 && colIdx < headers.length) {
      const headerName = headers[colIdx];
      if (headerName) return `[${headerName}]`;
    }
    return match;
  });
}

function slugify(s: string): string {
  return s.toLowerCase().trim()
    .replace(/\s+/g, '-')
    .replace(/[^\w\-]+/g, '')
    .replace(/\-\-+/g, '-')
    .replace(/^-+/, '')
    .replace(/-+$/, '');
}

const DATE_RE = /date|day|time/i;
const CHECKED_RE = /checked|chk|qty checked|quantity|input|rec|received|inspect/i;
const REJECTED_RE = /reject|rej/i; // but not % or rate
const GOOD_RE = /good|accept|acpt|ok|pass/i;
const REWORK_RE = /rework|rw|hold/i;
const PCT_RE = /%|pct|percent|rate/i;
const OTHER_RE = /s\.?\s*no|trolley|batch|lot|machine|m\/c|operator|supervisor|remarks|comment/i;

export function extractSchemaFromWorkbook(wb: xlsx.WorkBook, fileName: string): ExtractedSchema {
  const stages: ExtractedStage[] = [];

  for (const sheetName of wb.SheetNames) {
    // Skip summary or yearly rollups
    if (/yearly|annual|cumul|summary|total|config|settings/i.test(sheetName)) continue;

    const ws = wb.Sheets[sheetName];
    if (!ws) continue;

    const rawRows = xlsx.utils.sheet_to_json(ws, { header: 1, defval: '' }) as unknown[][];
    if (rawRows.length === 0) continue;

    const headerRowIndex = detectHeaderRow(rawRows);
    const { header, dataStartIndex } = buildHeaderBlock(rawRows, headerRowIndex);
    const normalizedHeader = normalizeHeaders(header);

    const fields: ExtractedField[] = [];
    const dataRows = rawRows.slice(dataStartIndex);

    normalizedHeader.forEach((colName, idx) => {
      if (!colName || colName.startsWith('__EMPTY')) return;

      const colLetter = colIndexToLabel(idx);
      
      // Determine type based on data rows
      let type: ExtractedField["type"] = "unknown";
      let hasFormula = false;
      let formulaStr: string | null = null;
      let numericCount = 0;
      let dateCount = 0;
      let nonBlankCount = 0;

      // Scan rows to classify data type & find formulas
      for (let rIdx = 0; rIdx < Math.min(50, dataRows.length); rIdx++) {
        const row = dataRows[rIdx];
        if (!row) continue;
        const cellVal = row[idx];
        if (cellVal !== undefined && cellVal !== null && cellVal !== '') {
          nonBlankCount++;
          if (typeof cellVal === 'number') {
            numericCount++;
          }
          const strVal = String(cellVal).trim();
          if (/\d{4}-\d{2}-\d{2}/.test(strVal) || (!isNaN(Date.parse(strVal)) && isNaN(Number(strVal)))) {
            dateCount++;
          }
        }

        // Look for formula in Excel sheet cells
        const cellRef = `${colLetter}${dataStartIndex + rIdx + 1}`;
        const cell = ws[cellRef];
        if (cell && cell.f) {
          hasFormula = true;
          if (!formulaStr) {
            formulaStr = translateFormula(cell.f, normalizedHeader);
          }
        }
      }

      if (nonBlankCount > 0) {
        if (dateCount >= nonBlankCount * 0.5) type = "date";
        else if (numericCount >= nonBlankCount * 0.5) type = "number";
        else type = "string";
      }

      // Classify role
      let role: ExtractedField["role"] = "other";

      if (DATE_RE.test(colName)) role = "date";
      else if (CHECKED_RE.test(colName)) role = "checked";
      else if (GOOD_RE.test(colName)) role = "good";
      else if (REWORK_RE.test(colName)) role = "rework";
      else if (REJECTED_RE.test(colName)) {
        if (PCT_RE.test(colName)) role = "formula";
        else role = "rejected";
      } else if (PCT_RE.test(colName) || hasFormula) role = "formula";
      else if (OTHER_RE.test(colName)) role = "other";
      else if (type === "number") role = "defect";

      fields.push({
        name: colName,
        colLetter,
        colIndex: idx,
        role,
        type,
        formula: formulaStr,
      });
    });

    if (fields.length > 0) {
      stages.push({
        stageId: slugify(sheetName),
        label: sheetName,
        fields,
        rowCount: dataRows.length,
      });
    }
  }

  return {
    fileName,
    stages,
  };
}

function toNumber(v: unknown): number | null {
  if (v == null || v === "") return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  const n = Number(String(v).replace(/[, ]/g, ""));
  return Number.isFinite(n) ? n : null;
}

export function classifyWithSchema(
  rawSheets: RawSheet[],
  schema: ExtractedSchema,
  ingestionId: string
): StageDayRecord[] {
  const records: StageDayRecord[] = [];

  for (const stage of schema.stages) {
    // rawSheet.name is "<fileName> - <sheetName>" (see parser.ts), but a schema
    // stage.label is the bare sheet name. Match on the sheet-name suffix so the
    // lookup actually resolves (the strict === never matched → 0 records).
    const target = stage.label.toLowerCase().trim();
    const sheet = rawSheets.find((s) => {
      const full = s.name.toLowerCase().trim();
      const suffix = full.includes(" - ") ? full.split(" - ").slice(1).join(" - ").trim() : full;
      return suffix === target || full === target;
    });
    if (!sheet) continue;

    const dateField = stage.fields.find((f) => f.role === "date");
    const checkedField = stage.fields.find((f) => f.role === "checked");
    const goodField = stage.fields.find((f) => f.role === "good");
    const reworkField = stage.fields.find((f) => f.role === "rework");
    const rejectedField = stage.fields.find((f) => f.role === "rejected");
    const statedPctField = stage.fields.find((f) => f.role === "formula" && /%|pct|percent|rate/i.test(f.name));
    const defectFields = stage.fields.filter((f) => f.role === "defect");

    if (!dateField) continue;

    sheet.rows.forEach((row) => {
      const dateVal = row[dateField.name];
      const iso = toISODate(dateVal);
      if (!iso) return;

      const checked = checkedField ? toNumber(row[checkedField.name]) : null;
      const good = goodField ? toNumber(row[goodField.name]) : null;
      const rework = reworkField ? toNumber(row[reworkField.name]) : null;
      const rejected = rejectedField ? toNumber(row[rejectedField.name]) : null;

      // Extract size if sheet name indicates it (e.g. 6FR -> Fr6)
      let size: string | null = null;
      const sizeMatch = sheet.name.match(/^(\d+)FR$/i);
      if (sizeMatch) {
        size = `Fr${sizeMatch[1]}`;
      }

      const defects: any[] = [];
      defectFields.forEach((df) => {
        const val = toNumber(row[df.name]);
        if (val !== null && val > 0) {
          defects.push({
            raw: df.name,
            value: Math.round(val),
            cell: `${sheet.name}!${df.colLetter}${row.__rowNum}`,
          });
        }
      });

      let statedPct = null;
      if (statedPctField) {
        const val = toNumber(row[statedPctField.name]);
        if (val !== null) {
          statedPct = {
            value: val,
            cell: `${sheet.name}!${statedPctField.colLetter}${row.__rowNum}`,
            formula: statedPctField.formula ?? null,
          };
        }
      }

      records.push({
        occurredOn: { kind: "day", start: iso, end: iso },
        stageId: stage.stageId,
        size,
        source: {
          file: sheet.fileName,
          fileHash: "local",
          sheet: sheet.name,
          tableId: "t1",
        },
        checked: checked !== null ? { value: Math.round(checked), cell: `${sheet.name}!${checkedField!.colLetter}${row.__rowNum}`, header: checkedField!.name } : null,
        acceptedGood: good !== null ? { value: Math.round(good), cell: `${sheet.name}!${goodField!.colLetter}${row.__rowNum}`, header: goodField!.name } : null,
        rework: rework !== null ? { value: Math.round(rework), cell: `${sheet.name}!${reworkField!.colLetter}${row.__rowNum}`, header: reworkField!.name } : null,
        rejected: rejected !== null ? { value: Math.round(rejected), cell: `${sheet.name}!${rejectedField!.colLetter}${row.__rowNum}`, header: rejectedField!.name } : null,
        defects,
        statedPct,
        extractedBy: "heuristic",
        ingestionId,
      });
    });
  }

  return records;
}
