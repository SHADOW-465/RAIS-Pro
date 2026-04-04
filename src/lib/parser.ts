import * as XLSX from 'xlsx';

export interface ColumnSummary {
  name: string;
  type: 'number' | 'string' | 'unknown';
  min?: number;
  max?: number;
  uniqueCount: number;
  sampleData: (string | number)[];
}

export interface SheetSummary {
  name: string;
  rowCount: number;
  columns: ColumnSummary[];
}

const VALID_EXTENSIONS = new Set(['.xlsx', '.xls', '.csv']);

export function isValidFile(file: File): boolean {
  const ext = file.name.slice(file.name.lastIndexOf('.')).toLowerCase();
  return VALID_EXTENSIONS.has(ext);
}

function summarizeColumns(rows: Record<string, unknown>[]): ColumnSummary[] {
  if (rows.length === 0) return [];
  const columnNames = Object.keys(rows[0]);

  return columnNames.map((col) => {
    // Single pass: collect values, unique set, min, max
    let min = Infinity;
    let max = -Infinity;
    let isNumeric = true;
    const unique = new Set<unknown>();
    const values: (string | number)[] = [];

    for (const row of rows) {
      const v = row[col];
      if (v === undefined || v === null) continue;
      unique.add(v);
      if (values.length < 5) values.push(v as string | number);
      if (typeof v === 'number') {
        if (v < min) min = v;
        if (v > max) max = v;
      } else {
        isNumeric = false;
      }
    }

    const summary: ColumnSummary = {
      name: col,
      type: isNumeric && unique.size > 0 ? 'number' : unique.size > 0 ? 'string' : 'unknown',
      uniqueCount: unique.size,
      sampleData: values,
    };

    if (isNumeric && unique.size > 0) {
      summary.min = min;
      summary.max = max;
    }

    return summary;
  });
}

async function parseFile(file: File): Promise<SheetSummary[]> {
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer);
  const results: SheetSummary[] = [];

  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json(sheet) as Record<string, unknown>[];
    if (rows.length === 0) continue;

    results.push({
      name: `${file.name} — ${sheetName}`,
      rowCount: rows.length,
      columns: summarizeColumns(rows),
    });
  }

  return results;
}

export async function parseExcelFiles(files: File[]): Promise<SheetSummary[]> {
  // Parse all files concurrently
  const perFile = await Promise.all(files.map(parseFile));
  return perFile.flat();
}
