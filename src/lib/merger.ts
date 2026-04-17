// src/lib/merger.ts
// Deterministic cross-sheet aggregation using the AI-produced merge plan.
// No AI involved here — pure arithmetic.

import type { SheetSummary, GroupedSeries } from './parser';
import type { MergePlan, MergedGroup, MergedResult } from '@/types/analysis';

function roundSig(n: number, sig = 4): number {
  if (!isFinite(n) || n === 0) return 0;
  const d = Math.ceil(Math.log10(Math.abs(n)));
  const p = sig - d;
  return Math.round(n * Math.pow(10, p)) / Math.pow(10, p);
}

function fmtNum(n: number): string {
  if (Math.abs(n) >= 1_000_000) return (n / 1_000_000).toFixed(2) + 'M';
  if (Math.abs(n) >= 1_000)     return (n / 1_000).toFixed(1) + 'k';
  if (Math.abs(n) < 10)         return n.toFixed(2);
  return n.toFixed(1);
}

/**
 * Merge multiple GroupedSeries with the same groupByColumn + metricColumn + aggregation.
 * Aligns labels (union) and sums / averages values across sheets.
 */
function mergeGroupedSeries(seriesList: GroupedSeries[][]): GroupedSeries[] {
  // Key = "metricColumn::groupByColumn::aggregation"
  const byKey = new Map<string, { sets: Map<string, number[]> }>();

  for (const sheetSeries of seriesList) {
    for (const s of sheetSeries) {
      const key = `${s.metricColumn}::${s.groupByColumn}::${s.aggregation}`;
      if (!byKey.has(key)) byKey.set(key, { sets: new Map() });
      const { sets } = byKey.get(key)!;
      s.labels.forEach((label, i) => {
        if (!sets.has(label)) sets.set(label, []);
        sets.get(label)!.push(s.values[i]);
      });
    }
  }

  const result: GroupedSeries[] = [];
  for (const [key, { sets }] of byKey) {
    const [metricColumn, groupByColumn, aggregation] = key.split('::') as [string, string, 'sum' | 'mean'];
    const entries = [...sets.entries()];
    const labels = entries.map(([k]) => k);
    const values = entries.map(([, vs]) =>
      aggregation === 'sum'
        ? roundSig(vs.reduce((a, b) => a + b, 0))
        : roundSig(vs.reduce((a, b) => a + b, 0) / vs.length)
    );
    result.push({ groupByColumn, metricColumn, aggregation, labels, values });
  }
  return result;
}

/**
 * Apply the AI-produced merge plan to raw sheet summaries.
 * Returns deterministically computed per-group and grand-total aggregates.
 */
export function applyMergePlan(
  summaries: SheetSummary[],
  mergePlan: MergePlan
): MergedResult {
  const summaryMap = new Map(summaries.map(s => [s.name, s]));

  const excludedKeys = new Set(mergePlan.excludedSheets.map(e => e.sheet));

  const groups: MergedGroup[] = mergePlan.groups.map(group => {
    const included = group.sheets
      .filter(k => !excludedKeys.has(k))
      .map(k => summaryMap.get(k))
      .filter((s): s is SheetSummary => s !== undefined);

    if (included.length === 0) {
      return {
        label: group.label,
        rowCount: 0,
        sourceSheets: group.sheets,
        numericAggregates: {},
        groupedSeries: [],
      };
    }

    // Collect all numeric column names across sheets in this group
    const allNumericCols = new Set<string>();
    for (const sheet of included) {
      for (const col of sheet.columns) {
        if (col.type === 'number') allNumericCols.add(col.name);
      }
    }

    // Aggregate per column
    const numericAggregates: MergedGroup['numericAggregates'] = {};
    for (const colName of allNumericCols) {
      let totalSum = 0;
      let totalCount = 0;
      let overallMin = Infinity;
      let overallMax = -Infinity;

      for (const sheet of included) {
        const col = sheet.columns.find(c => c.name === colName);
        if (!col || col.type !== 'number') continue;
        if (col.sum !== undefined)  totalSum   += col.sum;
        if (col.mean !== undefined) totalCount += sheet.rowCount;
        if (col.min  !== undefined) overallMin  = Math.min(overallMin,  col.min as number);
        if (col.max  !== undefined) overallMax  = Math.max(overallMax,  col.max as number);
      }

      numericAggregates[colName] = {
        sum:  roundSig(totalSum),
        mean: totalCount > 0 ? roundSig(totalSum / totalCount) : 0,
        min:  overallMin === Infinity  ? 0 : overallMin,
        max:  overallMax === -Infinity ? 0 : overallMax,
      };
    }

    // Merge grouped series
    const groupedSeries = mergeGroupedSeries(included.map(s => s.groupedSeries));

    return {
      label: group.label,
      rowCount: included.reduce((a, s) => a + s.rowCount, 0),
      sourceSheets: group.sheets,
      numericAggregates,
      groupedSeries,
    };
  });

  // Grand totals: sum across all groups
  const allCols = new Set(groups.flatMap(g => Object.keys(g.numericAggregates)));
  const grandTotals: MergedResult['grandTotals'] = {};
  for (const col of allCols) {
    let sum = 0, totalRows = 0;
    for (const g of groups) {
      const agg = g.numericAggregates[col];
      if (!agg) continue;
      sum       += agg.sum;
      totalRows += g.rowCount;
    }
    grandTotals[col] = {
      sum:  roundSig(sum),
      mean: totalRows > 0 ? roundSig(sum / totalRows) : 0,
    };
  }

  return { groups, grandTotals, mergePlan };
}

// ── Prompt-building helper (used by analysis-utils) ───────────────────────────

export function mergedResultToPromptText(result: MergedResult): string {
  const { groups, grandTotals } = result;
  const isSingleGroup = groups.length === 1;

  let out = '';

  // Grand totals first (what the GM cares about)
  out += '## GRAND TOTALS (across all sources)\n';
  for (const [col, { sum, mean }] of Object.entries(grandTotals)) {
    out += `  ${col}: total = ${fmtNum(sum)} (exact: ${sum}), average per row = ${fmtNum(mean)}\n`;
  }
  out += '\n';

  if (!isSingleGroup) {
    out += '## PER-SOURCE BREAKDOWN\n';
    for (const group of groups) {
      out += `### ${group.label} (${group.rowCount.toLocaleString()} rows)\n`;
      for (const [col, agg] of Object.entries(group.numericAggregates)) {
        out += `  ${col}: total = ${fmtNum(agg.sum)} (exact: ${agg.sum}), avg = ${fmtNum(agg.mean)}\n`;
      }
      out += '\n';
    }
  } else {
    // Single group — just show per-column detail
    const g = groups[0];
    out += `## COLUMN AGGREGATES (${g.rowCount.toLocaleString()} rows after stripping total rows)\n`;
    for (const [col, agg] of Object.entries(g.numericAggregates)) {
      out += `  ${col}:\n`;
      out += `    total (SUM) = ${fmtNum(agg.sum)} (exact: ${agg.sum})\n`;
      out += `    average (MEAN) = ${fmtNum(agg.mean)} (exact: ${agg.mean})\n`;
      out += `    min = ${agg.min}, max = ${agg.max}\n`;
    }
    out += '\n';
  }

  // Pre-computed chart series — cap to 5 sum-series (prefer sum over mean for brevity)
  const allSeries = groups.flatMap(g => g.groupedSeries);
  const sumSeries  = allSeries.filter(s => s.aggregation === 'sum').slice(0, 4);
  const meanSeries = allSeries.filter(s => s.aggregation === 'mean').slice(0, 1);
  const topSeries  = [...sumSeries, ...meanSeries];

  if (topSeries.length > 0) {
    out += '## PRE-COMPUTED CHART SERIES\n';
    out += 'Use these exact arrays. Do not invent chart data.\n\n';
    for (const s of topSeries) {
      // Cap at 15 labels to keep tokens bounded
      const labels = s.labels.slice(0, 15);
      const values = s.values.slice(0, 15);
      out += `  ${s.metricColumn} by ${s.groupByColumn} [${s.aggregation}]: `;
      out += `labels=${JSON.stringify(labels)} values=${JSON.stringify(values)}\n`;
    }
    out += '\n';

    if (!isSingleGroup) {
      out += 'Per-source totals:\n';
      for (const group of groups) {
        const topCols = Object.entries(group.numericAggregates)
          .filter(([, a]) => a.sum > 0)
          .slice(0, 4);
        for (const [col, agg] of topCols) {
          out += `  ${group.label} ${col}: ${fmtNum(agg.sum)}\n`;
        }
      }
    }
  }

  return out;
}
