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
  canonicalStageId?: string;
  size?: string | null;
  label: string;
  fields: ExtractedField[];
  rowCount: number;
  headerRows?: any[][];
  merges?: any[];
  columns?: string[];
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

// Resolve a sheet to a real registry inspection stage. Valve is tested before
// balloon (P20 "Valve Integrity & Balloon Inspection" mentions both). We match
// the sheet name first, then fall back to the FILE name — so a month-named sheet
// (e.g. "APRIL 25") inside "VISUAL INSPECTION REPORT…" correctly resolves to
// `visual` instead of becoming a bogus per-month "april-25" stage.
const STAGE_PATTERNS: { re: RegExp; id: string }[] = [
  { re: /valve|integrit/i, id: "valve-integrity" },
  { re: /balloon/i,        id: "balloon" },
  { re: /eye.?punch/i,     id: "eye-punching" },
  { re: /final/i,          id: "final" },
  { re: /visual/i,         id: "visual" },
];
function resolveStageId(sheetName: string, fileName: string): string {
  for (const p of STAGE_PATTERNS) if (p.re.test(sheetName)) return p.id;
  for (const p of STAGE_PATTERNS) if (p.re.test(fileName)) return p.id;
  return slugify(sheetName); // genuinely unknown layout → keep a stable id
}

const DATE_RE = /date|day|time/i;
const CHECKED_RE = /checked|chk|qty checked|quantity|input|rec|received|inspect/i;
const REJECTED_RE = /reject|rej/i; // but not % or rate
const GOOD_RE = /good|accept|acpt|ok|pass/i;
const REWORK_RE = /rework|rw|hold/i;
const PCT_RE = /%|pct|percent|rate/i;
const OTHER_RE = /s\.?\s*no|trolley|batch|lot|machine|m\/c|operator|supervisor|remarks|comment/i;
// Known reason/defect codes (visual report + registry). Detected by NAME before the
// formula/rework catches, because these columns are usually formula-driven and a
// bare `hasFormula` was hiding them — leaving 0 defect events / an empty Pareto.
const DEFECT_CODES = new Set(["COAG","SD","TT","BL","PS","SB","PW","FP","RW","BEP","DEC","BM","WEB","BT","SF","BIC","WK","BMP","TF","PH","BST","THSP","LEAK","BLBR","BUB","PINH","OTH"]);

function resolveSize(sheetName: string): string | null {
  const m = sheetName.trim().match(/^(\d+)\s*FR\.?\s*$/i);
  return m ? `Fr${m[1]}` : null;
}

export function extractSchemaFromWorkbook(wb: xlsx.WorkBook, fileName: string): ExtractedSchema {
  const stages: ExtractedStage[] = [];

  for (const sheetName of wb.SheetNames) {
    const ws = wb.Sheets[sheetName];
    if (!ws) continue;

    // Same coordinate discipline as parser.ts: colLetter / row refs must be
    // TRUE Excel coordinates (offset by the used range), or the refs built in
    // classifyWithSchema disagree with the RawSheet __rowNum/colLetters grid.
    const range = xlsx.utils.decode_range(ws['!ref'] ?? 'A1:A1');
    const rawRows = xlsx.utils.sheet_to_json(ws, { header: 1, defval: '', blankrows: true }) as unknown[][];
    if (rawRows.length === 0) continue;

    const headerRowIndex = detectHeaderRow(rawRows);
    const { header, dataStartIndex } = buildHeaderBlock(rawRows, headerRowIndex);
    const normalizedHeader = normalizeHeaders(header);

    // Extract raw header rows (unnormalized, padded)
    const headerRows = rawRows.slice(headerRowIndex, dataStartIndex).map((row) => {
      const padded = [...row];
      while (padded.length < normalizedHeader.length) {
        padded.push('');
      }
      return padded.map((cell) => cell === undefined || cell === null ? '' : cell);
    });

    // Extract merges relative to the header block
    const merges: any[] = [];
    if (ws['!merges']) {
      for (const m of ws['!merges']) {
        if (m.s.r >= headerRowIndex && m.e.r < dataStartIndex) {
          merges.push({
            s: { r: m.s.r - headerRowIndex, c: m.s.c },
            e: { r: m.e.r - headerRowIndex, c: m.e.c }
          });
        }
      }
    }

    const fields: ExtractedField[] = [];
    const dataRows = rawRows.slice(dataStartIndex);

    normalizedHeader.forEach((colName, idx) => {
      const nameToUse = (!colName || colName.startsWith('__EMPTY')) ? `__EMPTY_${idx}` : colName;
      const colLetter = colIndexToLabel(range.s.c + idx);
      
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
        const cellRef = `${colLetter}${range.s.r + dataStartIndex + rIdx + 1}`;
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

      // Classify role. Known defect codes win first
      const u = nameToUse.trim().toUpperCase();
      let role: ExtractedField["role"] = "other";
      if (DATE_RE.test(nameToUse)) role = "date";
      else if (PCT_RE.test(nameToUse)) role = "formula";
      else if (DEFECT_CODES.has(u)) role = "defect";
      else if (CHECKED_RE.test(nameToUse)) role = "checked";
      else if (GOOD_RE.test(nameToUse)) role = "good";
      else if (REWORK_RE.test(nameToUse)) role = "rework";
      else if (REJECTED_RE.test(nameToUse)) role = "rejected";
      else if (type === "number" && /^[A-Z0-9/]{1,5}$/.test(u)) role = "defect";
      else if (hasFormula) role = "formula";
      else if (OTHER_RE.test(nameToUse)) role = "other";
      else if (type === "number") role = "defect";

      fields.push({
        name: nameToUse,
        colLetter,
        colIndex: idx,
        role,
        type,
        formula: formulaStr,
      });
    });

    if (fields.length > 0) {
      const canonicalStageId = resolveStageId(sheetName, fileName);
      const size = resolveSize(sheetName);

      let stageId = canonicalStageId;
      let suffix = 1;
      while (stages.some((s) => s.stageId === stageId)) {
        stageId = `${canonicalStageId}-${++suffix}`;
      }

      stages.push({
        stageId,
        canonicalStageId,
        size,
        label: sheetName,
        fields,
        rowCount: dataRows.length,
        headerRows,
        merges,
        columns: normalizedHeader.map((colName, idx) => (!colName || colName.startsWith('__EMPTY')) ? `__EMPTY_${idx}` : colName),
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
    // lookup actually resolves.
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

    const rawSheetName = sheet.name.startsWith(`${sheet.fileName} - `)
      ? sheet.name.slice(sheet.fileName.length + 3)
      : sheet.name;

    sheet.rows.forEach((row) => {
      const dateVal = row[dateField.name];
      const iso = toISODate(dateVal);
      if (!iso) return;

      const checked = checkedField ? toNumber(row[checkedField.name]) : null;
      const good = goodField ? toNumber(row[goodField.name]) : null;
      const rework = reworkField ? toNumber(row[reworkField.name]) : null;
      const rejected = rejectedField ? toNumber(row[rejectedField.name]) : null;

      // Extract size and stageId from schema stage if defined
      const stageId = stage.canonicalStageId || stage.stageId;
      let size = stage.size || null;
      if (!size) {
        const sizeMatch = rawSheetName.match(/^(\d+)\s*FR\.?\s*$/i);
        if (sizeMatch) {
          size = `Fr${sizeMatch[1]}`;
        }
      }

      const defects: any[] = [];
      defectFields.forEach((df) => {
        const val = toNumber(row[df.name]);
        if (val !== null && val > 0) {
          defects.push({
            raw: df.name,
            value: Math.round(val),
            cell: `${rawSheetName}!${df.colLetter}${row.__rowNum}`,
          });
        }
      });

      let statedPct = null;
      if (statedPctField) {
        const val = toNumber(row[statedPctField.name]);
        if (val !== null) {
          statedPct = {
            value: val,
            cell: `${rawSheetName}!${statedPctField.colLetter}${row.__rowNum}`,
            formula: statedPctField.formula ?? null,
          };
        }
      }

      records.push({
        occurredOn: { kind: "day", start: iso, end: iso },
        stageId,
        size,
        source: {
          file: sheet.fileName,
          fileHash: "local",
          sheet: rawSheetName,
          tableId: "t1",
        },
        checked: checked !== null ? { value: Math.round(checked), cell: `${rawSheetName}!${checkedField!.colLetter}${row.__rowNum}`, header: checkedField!.name } : null,
        acceptedGood: good !== null ? { value: Math.round(good), cell: `${rawSheetName}!${goodField!.colLetter}${row.__rowNum}`, header: goodField!.name } : null,
        rework: rework !== null ? { value: Math.round(rework), cell: `${rawSheetName}!${reworkField!.colLetter}${row.__rowNum}`, header: reworkField!.name } : null,
        rejected: rejected !== null ? { value: Math.round(rejected), cell: `${rawSheetName}!${rejectedField!.colLetter}${row.__rowNum}`, header: rejectedField!.name } : null,
        defects,
        statedPct,
        extractedBy: "heuristic",
        ingestionId,
      });
    });
  }

  return records;
}

/** Discover French sizes from per-size sheet names (e.g. "16FR" → "Fr16"). */
export function extractSizesFromWorkbook(wb: xlsx.WorkBook): { sizeId: string; label: string }[] {
  const out: { sizeId: string; label: string }[] = [];
  const seen = new Set<string>();
  for (const sn of wb.SheetNames) {
    const m = sn.trim().match(/^(\d+)\s*FR$/i);
    if (!m) continue;
    const sizeId = `Fr${m[1]}`;
    if (seen.has(sizeId)) continue;
    seen.add(sizeId);
    out.push({ sizeId, label: `${m[1]} FR` });
  }
  // numeric ascending
  return out.sort((a, b) => Number(a.sizeId.slice(2)) - Number(b.sizeId.slice(2)));
}
