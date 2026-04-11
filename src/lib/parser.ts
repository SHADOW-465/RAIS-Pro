import * as XLSX from 'xlsx';
import type { RawSheet } from '@/types/dashboard';

const MAX_DISPLAY_ROWS = 500;
const MAX_GROUP_LABELS = 24;  // max bars/points in a chart series

export interface ColumnSummary {
  name: string;
  type: 'number' | 'string' | 'date' | 'unknown';
  /** Only for numeric columns */
  sum?: number;
  mean?: number;
  min?: number;
  max?: number;
  uniqueCount: number;
  sampleData: unknown[];
}

/** A pre-computed, chart-ready grouped series (e.g., "Rejection Qty by Month") */
export interface GroupedSeries {
  groupByColumn: string;   // the dimension (x-axis)
  metricColumn: string;    // the aggregated metric (y-axis)
  aggregation: 'sum' | 'mean';
  labels: string[];        // ordered group labels
  values: number[];        // corresponding aggregated values
}

export interface SheetSummary {
  name: string;
  rowCount: number;
  columns: ColumnSummary[];
  /** Pre-computed grouped series, ready to paste into chart datasets */
  groupedSeries: GroupedSeries[];
}

export interface ParseResult {
  summaries: SheetSummary[];
  rawSheets: RawSheet[];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Detect whether a column looks like a date/period dimension */
function isDateLike(name: string, values: unknown[]): boolean {
  const n = name.toLowerCase();
  if (/month|year|date|period|week|quarter|day/.test(n)) return true;
  // Check if sample values look like month names or date strings
  const sample = values.slice(0, 10).map(v => String(v).trim());
  const monthRe = /^(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)/i;
  return sample.filter(v => monthRe.test(v) || /^\d{4}/.test(v)).length >= 3;
}

/** Preserve natural month order when labels look like month names/abbreviations */
const MONTH_ORDER = ['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec',
                     'january','february','march','april','june','july','august','september','october','november','december'];
function monthIndex(s: string): number {
  const idx = MONTH_ORDER.indexOf(s.toLowerCase().slice(0, 3));
  return idx === -1 ? 999 : idx;
}

function roundSig(n: number, sig = 4): number {
  if (n === 0) return 0;
  const d = Math.ceil(Math.log10(Math.abs(n)));
  const p = sig - d;
  const m = Math.pow(10, p);
  return Math.round(n * m) / m;
}

// ─── Main exports ──────────────────────────────────────────────────────────────

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

      // Detect real header row (skip merged title rows at the top)
      const rawRows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' }) as unknown[][];
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
      json = json.filter(row => Object.values(row).some(v => v !== '' && v !== null && v !== undefined));
      if (json.length === 0) continue;

      // Filter out empty / auto-named columns
      const allColumns = Object.keys(json[0] as object);
      const columns = allColumns.filter(col => {
        if (col.startsWith('__EMPTY')) return false;
        return json.some(row => {
          const v = (row as any)[col];
          return v !== '' && v !== null && v !== undefined;
        });
      });

      // ── Per-column statistics ─────────────────────────────────────────────
      const numericCols: string[] = [];
      const dimensionCols: string[] = [];

      const columnSummaries: ColumnSummary[] = columns.map(col => {
        const rawVals = json.map((row: any) => row[col]).filter(v => v !== undefined && v !== null && v !== '');
        const uniqueVals = new Set(rawVals);
        const firstType = typeof rawVals[0];

        if (firstType === 'number') {
          const nums = rawVals as number[];
          const sum = nums.reduce((a, b) => a + b, 0);
          numericCols.push(col);
          return {
            name: col,
            type: 'number',
            sum: roundSig(sum),
            mean: roundSig(sum / nums.length),
            min: Math.min(...nums),
            max: Math.max(...nums),
            uniqueCount: uniqueVals.size,
            sampleData: nums.slice(0, 5),
          } satisfies ColumnSummary;
        } else {
          // String/date column — check if it's a useful dimension
          if (uniqueVals.size <= 50 && uniqueVals.size >= 2) {
            dimensionCols.push(col);
          }
          const strVals = rawVals.map(String);
          return {
            name: col,
            type: isDateLike(col, strVals) ? 'date' : 'string',
            uniqueCount: uniqueVals.size,
            sampleData: [...uniqueVals].slice(0, 5),
          } satisfies ColumnSummary;
        }
      });

      // ── Pre-computed grouped series ───────────────────────────────────────
      // For each dimension × numeric metric, compute sum-by-group and mean-by-group
      // Prioritise date-like dimensions first; limit total series to keep prompt small
      const groupedSeries: GroupedSeries[] = [];

      // Sort dimension columns: date-like first
      const sortedDims = [...dimensionCols].sort((a, b) => {
        const aDate = isDateLike(a, json.map((r: any) => r[a]));
        const bDate = isDateLike(b, json.map((r: any) => r[b]));
        return (bDate ? 1 : 0) - (aDate ? 1 : 0);
      });

      for (const dim of sortedDims.slice(0, 3)) {
        for (const metric of numericCols.slice(0, 4)) {
          // Group rows by dimension value
          const grouped = new Map<string, number[]>();
          for (const row of json) {
            const key = String((row as any)[dim] ?? '').trim();
            const val = (row as any)[metric];
            if (key === '' || typeof val !== 'number') continue;
            if (!grouped.has(key)) grouped.set(key, []);
            grouped.get(key)!.push(val);
          }
          if (grouped.size < 2) continue;

          // Determine natural order
          let entries = [...grouped.entries()];
          const dimIsDate = isDateLike(dim, entries.map(([k]) => k));
          if (dimIsDate) {
            entries.sort(([a], [b]) => {
              const ai = monthIndex(a);
              const bi = monthIndex(b);
              if (ai !== 999 || bi !== 999) return ai - bi;
              return a.localeCompare(b);
            });
          } else {
            // Sort by sum descending for categorical dims
            entries.sort(([, av], [, bv]) => {
              const as = av.reduce((x, y) => x + y, 0);
              const bs = bv.reduce((x, y) => x + y, 0);
              return bs - as;
            });
          }
          entries = entries.slice(0, MAX_GROUP_LABELS);

          const labels = entries.map(([k]) => k);
          const sums = entries.map(([, vs]) => roundSig(vs.reduce((a, b) => a + b, 0)));
          const means = entries.map(([, vs]) => roundSig(vs.reduce((a, b) => a + b, 0) / vs.length));

          groupedSeries.push({ groupByColumn: dim, metricColumn: metric, aggregation: 'sum', labels, values: sums });
          // Only add mean series for rate/percentage columns (small values)
          if (means[0] < 100) {
            groupedSeries.push({ groupByColumn: dim, metricColumn: metric, aggregation: 'mean', labels, values: means });
          }
        }
        if (groupedSeries.length >= 10) break;  // cap total series
      }

      const isYearly = /yearly|annual|cumul|summary|total/i.test(sheetName);
      const isMonthly = /jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec/i.test(sheetName);

      summaries.push({
        name: `${file.name} - ${sheetName}`,
        rowCount: json.length,
        columns: columnSummaries,
        groupedSeries,
        isYearly,
        isMonthly,
      } as any);

      // Raw rows for client-side verification panel (capped)
      rawSheets.push({
        name: `${file.name} - ${sheetName}`,
        fileName: file.name,
        columns,
        rows: json.slice(0, MAX_DISPLAY_ROWS).map(row =>
          Object.fromEntries(columns.map(c => [c, (row as any)[c] ?? '']))
        ),
      });
    }
  }

  return { summaries, rawSheets };
}
