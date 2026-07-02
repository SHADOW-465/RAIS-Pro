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

/** Drop same-name duplicates within a role group, keeping the first occurrence.
 *
 *  Why this exists: `SchemaSignatureColumn` (Dataset.columns) carries only
 *  {role, name} — no column letter — so it cannot express that two DIFFERENT
 *  raw headers in one sheet normalized to the same name (e.g. "REJ %" vs
 *  "Rej %"). Row storage (src/lib/dataset/from-workbooks.ts) disambiguates that
 *  case by suffixing the second occurrence's VALUE key with its column letter,
 *  but that suffix isn't reconstructable here. Without this dedupe, such a
 *  dataset would render two identical-looking KPI/breakdown/Pareto entries that
 *  both read the SAME (first) column's value — not a crash, but a confusing
 *  duplicate tile, and the second column's real (safely-stored) values would
 *  never surface in this dashboard. Deduping caps the damage to "one tile is
 *  the first column's data" rather than "two identical wrong-looking tiles".
 *  Fully resolving this would require threading column letters through
 *  SchemaSignatureColumn (a Plan 2 change) — out of scope here; flagged as a
 *  known follow-up. */
function dedupeByName<T extends { name: string }>(cols: T[]): T[] {
  const seen = new Set<string>();
  return cols.filter((c) => (seen.has(c.name) ? false : (seen.add(c.name), true)));
}

/** Builds a generic, schema-agnostic dashboard from a Dataset's persisted rows.
 *  Deterministic pure arithmetic — no AI, no I/O. Every measure column becomes
 *  a KPI; every dimension column becomes a breakdown; defect columns become one
 *  Pareto. Gracefully degrades (empty arrays / nulls) when a role is absent —
 *  never throws on a dataset that lacks dates, dimensions, or defects. */
export function buildGenericDashboard(dataset: Dataset, rows: DatasetRow[]): GenericDashboard {
  const dateCol = dataset.columns.find((c) => c.role === "dimension-date");
  const measureCols = dedupeByName(dataset.columns.filter((c) => c.role === "measure"));
  const dimensionCols = dedupeByName(dataset.columns.filter((c) => c.role === "dimension"));
  const defectCols = dedupeByName(dataset.columns.filter((c) => c.role === "defect"));

  const allRowDates: (string | null)[] = dateCol ? rows.map((r) => toLocalISODate(r.values[dateCol.name])) : rows.map(() => null);
  const validDates = allRowDates.filter((d): d is string => d != null).sort();
  const dateRange = validDates.length > 0 ? { from: validDates[0], to: validDates[validDates.length - 1] } : null;

  // When the table has a date axis, only date-bearing rows are DATA rows.
  // Sheets in this corpus end with subtotal rows (=SUM over the month) and
  // marker rows ("SUNDAY") whose date cell is empty/non-date — summing them
  // alongside the daily rows exactly doubles every KPI. This also keeps the
  // KPI totals consistent with the trend and the publish path, which already
  // skip dateless rows. Without a date column there is no such signal, so all
  // rows count.
  const dataRows = dateCol ? rows.filter((_, i) => allRowDates[i] != null) : rows;
  const rowDates: (string | null)[] = dateCol ? allRowDates.filter((d) => d != null) : allRowDates;

  const kpis: GenericKpi[] = measureCols.map((col) => {
    const total = dataRows.reduce((sum, r) => sum + toNumber(r.values[col.name]), 0);
    const byDate = new Map<string, number>();
    if (dateCol) {
      dataRows.forEach((r, i) => {
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
    for (const r of dataRows) {
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
      .map((col) => ({ label: humanize(col.name), value: dataRows.reduce((sum, r) => sum + toNumber(r.values[col.name]), 0) }))
      .filter((x) => x.value > 0)
      .sort((a, b) => b.value - a.value);
    defectPareto = items.length > 0 ? items : null;
  }

  return { datasetId: dataset.id, title: dataset.title, dateRange, kpis, breakdowns, defectPareto };
}
