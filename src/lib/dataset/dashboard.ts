import type { Dataset, DatasetRow } from "./types";
import { toLocalISODate } from "@/lib/ingest/date";

export interface SeriesPoint {
  label: string;
  value: number;
}

export interface GenericKpi {
  columnName: string;
  label: string;
  total: number;
  /** Ascending by date. Empty when the dataset has no dimension-date column. */
  trend: SeriesPoint[];
}

export interface GenericBreakdown {
  columnName: string;
  label: string;
  /** Descending by value. */
  bars: { label: string; value: number }[];
}

export interface GenericDashboard {
  datasetId: string;
  title: string;
  dateRange: { from: string; to: string } | null;
  kpis: GenericKpi[];
  breakdowns: GenericBreakdown[];
  /** Descending, zero-value defects excluded. null when the dataset has no defect columns. */
  defectPareto: { label: string; value: number }[] | null;
}

function toNumber(v: string | number | null | undefined): number {
  if (v == null) return 0;
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;
  const n = Number(String(v).replace(/[, ]/g, ""));
  return Number.isFinite(n) ? n : 0;
}

/** "quantity checked" -> "Quantity Checked". Purely cosmetic; the columnName
 *  (unlabeled) is the stable identifier consumers should key off. */
function humanize(name: string): string {
  return name.trim().replace(/\s+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

/** Builds a generic, schema-agnostic dashboard from a Dataset's persisted rows.
 *  Deterministic pure arithmetic — no AI, no I/O. Every measure column becomes
 *  a KPI; every dimension column becomes a breakdown; defect columns become one
 *  Pareto. Gracefully degrades (empty arrays / nulls) when a role is absent —
 *  never throws on a dataset that lacks dates, dimensions, or defects. */
export function buildGenericDashboard(dataset: Dataset, rows: DatasetRow[]): GenericDashboard {
  const dateCol = dataset.columns.find((c) => c.role === "dimension-date");
  const measureCols = dataset.columns.filter((c) => c.role === "measure");
  const dimensionCols = dataset.columns.filter((c) => c.role === "dimension");
  const defectCols = dataset.columns.filter((c) => c.role === "defect");

  const rowDates: (string | null)[] = dateCol ? rows.map((r) => toLocalISODate(r.values[dateCol.name])) : rows.map(() => null);
  const validDates = rowDates.filter((d): d is string => d != null).sort();
  const dateRange = validDates.length > 0 ? { from: validDates[0], to: validDates[validDates.length - 1] } : null;

  const kpis: GenericKpi[] = measureCols.map((col) => {
    const total = rows.reduce((sum, r) => sum + toNumber(r.values[col.name]), 0);
    const byDate = new Map<string, number>();
    if (dateCol) {
      rows.forEach((r, i) => {
        const d = rowDates[i];
        if (!d) return;
        byDate.set(d, (byDate.get(d) ?? 0) + toNumber(r.values[col.name]));
      });
    }
    const trend = [...byDate.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([label, value]) => ({ label, value }));
    return { columnName: col.name, label: humanize(col.name), total, trend };
  });

  const primaryMeasure = measureCols[0];
  const breakdowns: GenericBreakdown[] = dimensionCols.map((col) => {
    const byValue = new Map<string, number>();
    for (const r of rows) {
      const key = String(r.values[col.name] ?? "—");
      const add = primaryMeasure ? toNumber(r.values[primaryMeasure.name]) : 1;
      byValue.set(key, (byValue.get(key) ?? 0) + add);
    }
    const bars = [...byValue.entries()].map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value);
    return { columnName: col.name, label: humanize(col.name), bars };
  });

  let defectPareto: { label: string; value: number }[] | null = null;
  if (defectCols.length > 0) {
    const items = defectCols
      .map((col) => ({ label: humanize(col.name), value: rows.reduce((sum, r) => sum + toNumber(r.values[col.name]), 0) }))
      .filter((x) => x.value > 0)
      .sort((a, b) => b.value - a.value);
    defectPareto = items.length > 0 ? items : null;
  }

  return { datasetId: dataset.id, title: dataset.title, dateRange, kpis, breakdowns, defectPareto };
}
