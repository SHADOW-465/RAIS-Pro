import * as XLSX from 'xlsx';
import type { RawSheet } from '@/types/dashboard';
import type { SheetManifest } from '@/types/analysis';

const MAX_DISPLAY_ROWS = 500;
const MAX_GROUP_LABELS = 24;

export interface ColumnSummary {
  name: string;
  type: 'number' | 'string' | 'date' | 'unknown';
  sum?: number;
  mean?: number;
  min?: number;
  max?: number;
  uniqueCount: number;
  sampleData: unknown[];
}

export interface GroupedSeries {
  groupByColumn: string;
  metricColumn: string;
  aggregation: 'sum' | 'mean';
  labels: string[];
  values: number[];
}

export interface SheetSummary {
  name: string;
  rowCount: number;
  totalRowsStripped: number;
  columns: ColumnSummary[];
  groupedSeries: GroupedSeries[];
  manifest: SheetManifest;
  // legacy compat flags (still used for sheet preference logic)
  isYearly?: boolean;
  isMonthly?: boolean;
}

export interface ParseResult {
  summaries: SheetSummary[];
  rawSheets: RawSheet[];
}

// ─── Total-row detection ──────────────────────────────────────────────────────

const TOTAL_ROW_RE = /^(grand\s*)?total[s]?$|^subtotal[s]?$|^sum$|^gesamt$|^合計$|^총계$|^योग$/i;

function isTotalRow(row: Record<string, unknown>, strCols: string[]): boolean {
  for (const col of strCols) {
    const v = String(row[col] ?? '').trim();
    if (TOTAL_ROW_RE.test(v)) return true;
  }
  return false;
}

// ─── Granularity detection ────────────────────────────────────────────────────

const MONTH_ORDER = ['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec'];

function detectGranularity(
  colName: string,
  values: unknown[]
): SheetManifest['granularity'] {
  const name = colName.toLowerCase();
  const samples = values.slice(0, 30).map(v => String(v ?? '').trim().toLowerCase());
  const nonEmpty = samples.filter(Boolean);

  // Annual: 4-digit year values or column named year
  if (/^year/.test(name) || nonEmpty.filter(v => /^20\d{2}$|^19\d{2}$/.test(v)).length > nonEmpty.length * 0.5)
    return 'annual';

  // Quarterly
  if (nonEmpty.filter(v => /^q[1-4]\b|quarter/i.test(v)).length >= 2) return 'quarterly';

  // Monthly: month names/abbreviations or column named month/period
  if (/^month|^period/.test(name) || nonEmpty.filter(v => MONTH_ORDER.some(m => v.startsWith(m))).length >= 3)
    return 'monthly';

  // Weekly
  if (nonEmpty.filter(v => /^week\s*\d+|wk\s*\d+/i.test(v)).length >= 3) return 'weekly';

  // Daily: ISO dates or Excel serial numbers → many unique values
  const uniqueCount = new Set(nonEmpty).size;
  if (uniqueCount > 50 || /^date|^day/.test(name)) return 'daily';

  return 'unknown';
}

function extractTimeRange(values: unknown[]): string | null {
  const strs = values
    .map(v => String(v ?? '').trim())
    .filter(v => v.length > 0 && v.length < 20);
  if (strs.length < 2) return null;
  return `${strs[0]} – ${strs[strs.length - 1]}`;
}

function isSummaryCandidate(sheetName: string, rowCount: number): boolean {
  const n = sheetName.toLowerCase();
  if (/summary|annual|yearly|total|overview|consolidated|rollup|grand|cumul/.test(n)) return true;
  if (rowCount <= 15) return true;   // very few rows → likely aggregated data
  return false;
}

// ─── Numeric helpers ──────────────────────────────────────────────────────────

function roundSig(n: number, sig = 4): number {
  if (!isFinite(n) || n === 0) return 0;
  const d = Math.ceil(Math.log10(Math.abs(n)));
  const p = sig - d;
  const m = Math.pow(10, p);
  return Math.round(n * m) / m;
}

function isDateLike(name: string, values: unknown[]): boolean {
  const n = name.toLowerCase();
  if (/month|year|date|period|week|quarter|day/.test(n)) return true;
  const sample = values.slice(0, 10).map(v => String(v ?? '').trim());
  const monthRe = /^(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)/i;
  return sample.filter(v => monthRe.test(v) || /^\d{4}/.test(v)).length >= 3;
}

function monthSortIndex(s: string): number {
  const idx = MONTH_ORDER.indexOf(s.toLowerCase().slice(0, 3));
  return idx === -1 ? 999 : idx;
}

// ─── Main exports ─────────────────────────────────────────────────────────────

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

      // ── Detect real header row ──────────────────────────────────────────────
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

      // ── Strip auto-named / all-empty columns ────────────────────────────────
      const allColumns = Object.keys(json[0] as object);
      const columns = allColumns.filter(col => {
        if (col.startsWith('__EMPTY')) return false;
        return json.some(row => {
          const v = (row as any)[col];
          return v !== '' && v !== null && v !== undefined;
        });
      });

      // ── Strip total / grand-total rows ──────────────────────────────────────
      const strCols = columns.filter(c => typeof (json[0] as any)[c] === 'string' || typeof (json[0] as any)[c] === 'undefined');
      const cleanRows = json.filter(row => !isTotalRow(row as any, strCols));
      const totalRowsStripped = json.length - cleanRows.length;

      // ── Per-column statistics (on clean rows) ───────────────────────────────
      const numericCols: string[] = [];
      const dimensionCols: string[] = [];
      let dateDimCol: string | null = null;

      const columnSummaries: ColumnSummary[] = columns.map(col => {
        const rawVals = cleanRows.map((row: any) => row[col]).filter(v => v !== undefined && v !== null && v !== '');
        const uniqueVals = new Set(rawVals);

        if (typeof rawVals[0] === 'number') {
          const nums = rawVals as number[];
          const sum = nums.reduce((a, b) => a + b, 0);
          numericCols.push(col);
          return {
            name: col, type: 'number',
            sum: roundSig(sum),
            mean: roundSig(sum / nums.length),
            min: Math.min(...nums),
            max: Math.max(...nums),
            uniqueCount: uniqueVals.size,
            sampleData: nums.slice(0, 5),
          } satisfies ColumnSummary;
        } else {
          if (uniqueVals.size >= 2 && uniqueVals.size <= 50) dimensionCols.push(col);
          const strVals = rawVals.map(String);
          const isDate = isDateLike(col, strVals);
          if (isDate && !dateDimCol) dateDimCol = col;
          return {
            name: col,
            type: isDate ? 'date' : 'string',
            uniqueCount: uniqueVals.size,
            sampleData: [...uniqueVals].slice(0, 5),
          } satisfies ColumnSummary;
        }
      });

      // ── Pre-computed grouped series ─────────────────────────────────────────
      const groupedSeries: GroupedSeries[] = [];
      const sortedDims = [...dimensionCols].sort((a, b) => {
        const aDate = isDateLike(a, cleanRows.map((r: any) => r[a]));
        const bDate = isDateLike(b, cleanRows.map((r: any) => r[b]));
        return (bDate ? 1 : 0) - (aDate ? 1 : 0);
      });

      for (const dim of sortedDims.slice(0, 3)) {
        for (const metric of numericCols.slice(0, 4)) {
          const grouped = new Map<string, number[]>();
          for (const row of cleanRows) {
            const key = String((row as any)[dim] ?? '').trim();
            const val = (row as any)[metric];
            if (!key || typeof val !== 'number') continue;
            if (!grouped.has(key)) grouped.set(key, []);
            grouped.get(key)!.push(val);
          }
          if (grouped.size < 2) continue;

          let entries = [...grouped.entries()];
          const dimIsDate = isDateLike(dim, entries.map(([k]) => k));
          if (dimIsDate) {
            entries.sort(([a], [b]) => {
              const ai = monthSortIndex(a);
              const bi = monthSortIndex(b);
              return ai !== 999 || bi !== 999 ? ai - bi : a.localeCompare(b);
            });
          } else {
            entries.sort(([, av], [, bv]) =>
              bv.reduce((x, y) => x + y, 0) - av.reduce((x, y) => x + y, 0)
            );
          }
          entries = entries.slice(0, MAX_GROUP_LABELS);

          const labels = entries.map(([k]) => k);
          const sums  = entries.map(([, vs]) => roundSig(vs.reduce((a, b) => a + b, 0)));
          const means = entries.map(([, vs]) => roundSig(vs.reduce((a, b) => a + b, 0) / vs.length));

          groupedSeries.push({ groupByColumn: dim, metricColumn: metric, aggregation: 'sum', labels, values: sums });
          if (means[0] < 100) {
            groupedSeries.push({ groupByColumn: dim, metricColumn: metric, aggregation: 'mean', labels, values: means });
          }
        }
        if (groupedSeries.length >= 10) break;
      }

      // ── Build sheet manifest ────────────────────────────────────────────────
      const granularity: SheetManifest['granularity'] = dateDimCol
        ? detectGranularity(dateDimCol, cleanRows.map((r: any) => r[dateDimCol!]))
        : 'unknown';

      const timeRange = dateDimCol
        ? extractTimeRange(cleanRows.map((r: any) => r[dateDimCol!]))
        : null;

      const numericTotals: Record<string, number> = {};
      const numericMeans:  Record<string, number> = {};
      for (const cs of columnSummaries) {
        if (cs.type === 'number' && cs.sum !== undefined) {
          numericTotals[cs.name] = cs.sum;
          numericMeans[cs.name]  = cs.mean ?? 0;
        }
      }

      const manifest: SheetManifest = {
        sheetKey: `${file.name} - ${sheetName}`,
        fileName: file.name,
        sheetName,
        rowCount: cleanRows.length,
        totalRowsStripped,
        granularity,
        timeRange,
        isSummaryCandidate: isSummaryCandidate(sheetName, cleanRows.length),
        columns,
        numericTotals,
        numericMeans,
      };

      const isYearly = /yearly|annual|cumul|summary|total/i.test(sheetName);
      const isMonthly = /jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec/i.test(sheetName);

      summaries.push({
        name: `${file.name} - ${sheetName}`,
        rowCount: cleanRows.length,
        totalRowsStripped,
        columns: columnSummaries,
        groupedSeries,
        manifest,
        isYearly,
        isMonthly,
      });

      // ── Raw rows for verification panel ────────────────────────────────────
      rawSheets.push({
        name: `${file.name} - ${sheetName}`,
        fileName: file.name,
        columns,
        rows: cleanRows.slice(0, MAX_DISPLAY_ROWS).map(row =>
          Object.fromEntries(columns.map(c => [c, (row as any)[c] ?? '']))
        ),
      });
    }
  }

  return { summaries, rawSheets };
}
