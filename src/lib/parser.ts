import * as XLSX from 'xlsx';
import type { RawSheet } from '@/types/dashboard';

const MAX_DISPLAY_ROWS = 500;

export interface ColumnSummary {
  name: string;
  type: string;
  min?: number | string;
  max?: number | string;
  uniqueCount: number;
  sampleData: any[];
}

export interface SheetSummary {
  name: string;
  rowCount: number;
  columns: ColumnSummary[];
}

export interface ParseResult {
  summaries: SheetSummary[];
  rawSheets: RawSheet[];
}

export async function parseExcelFiles(files: File[]): Promise<SheetSummary[]> {
  return (await parseExcelFilesWithRaw(files)).summaries;
}

export async function parseExcelFilesWithRaw(files: File[]): Promise<ParseResult> {
  const summaries: SheetSummary[] = [];
  const rawSheets: RawSheet[] = [];

  for (const file of files) {
    const data = await file.arrayBuffer();
    const workbook = XLSX.read(data);

    for (const sheetName of workbook.SheetNames) {
      const sheet = workbook.Sheets[sheetName];

      // Get raw rows to detect merged title rows above the real header.
      const rawRows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' }) as unknown[][];

      // Find the first row where the majority of cells are non-empty strings
      // (not numbers, not blank) — that is the real header row.
      let headerRowIndex = 0;
      for (let i = 0; i < Math.min(rawRows.length, 10); i++) {
        const row = rawRows[i] as unknown[];
        const nonEmpty = row.filter(c => typeof c === 'string' && (c as string).trim().length > 0);
        if (nonEmpty.length >= 2 && nonEmpty.length >= row.filter(c => c !== '').length * 0.4) {
          headerRowIndex = i;
          break;
        }
      }

      let json = XLSX.utils.sheet_to_json(sheet, { range: headerRowIndex, defval: '' }) as Record<string, unknown>[];
      // Drop rows that are completely empty
      json = json.filter(row => Object.values(row).some(v => v !== '' && v !== null && v !== undefined));

      if (json.length === 0) continue;

      // Remove auto-named (__EMPTY*) columns and columns where every value is empty
      const allColumns = Object.keys(json[0] as object);
      const columns = allColumns.filter(col => {
        if (col.startsWith('__EMPTY')) return false;
        const hasData = json.some(row => {
          const v = (row as any)[col];
          return v !== '' && v !== null && v !== undefined;
        });
        return hasData;
      });
      const columnSummaries: ColumnSummary[] = columns.map(col => {
        const values = json.map((row: any) => row[col]).filter(v => v !== undefined && v !== null);
        const uniqueValues = new Set(values);
        const type = typeof values[0];
        
        const summary: ColumnSummary = {
          name: col,
          type: type,
          uniqueCount: uniqueValues.size,
          sampleData: values.slice(0, 5)
        };

        if (type === 'number') {
          summary.min = Math.min(...values as number[]);
          summary.max = Math.max(...values as number[]);
        }

        return summary;
      });

      // Prefer yearly/summary sheets; skip month sheets when a yearly sheet exists in this file
      const isYearly = /yearly|annual|cumul|summary|total/i.test(sheetName);
      const isMonthly = /jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec/i.test(sheetName);

      summaries.push({
        name: `${file.name} - ${sheetName}`,
        rowCount: json.length,
        columns: columnSummaries,
        isYearly,
        isMonthly,
      } as any);

      // Collect raw rows for client-side verification (capped to keep memory sane)
      const rawRows2 = json.slice(0, MAX_DISPLAY_ROWS).map(row =>
        Object.fromEntries(columns.map(c => [c, (row as any)[c] ?? '']))
      );
      rawSheets.push({
        name: `${file.name} - ${sheetName}`,
        fileName: file.name,
        columns,
        rows: rawRows2,
      });
    }
  }

  return { summaries, rawSheets };
}
