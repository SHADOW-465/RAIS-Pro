# Plan 5 — Generic Dashboard Builder ([F1])

**Spec:** `docs/superpowers/specs/2026-07-01-universal-schema-ingestion-design.md` component **[F1]**.
**Builds on:** Plan 1 (`src/lib/schema/`), Plan 2 (`src/lib/dataset/{types,registry,title,from-workbooks}.ts`), Plan 4 (`DatasetRow`, `datasetsWithRowsFromWorkbooks`). **Branch:** `feat/universal-schema-ingestion`.

## Goal

A **pure, deterministic** function: `Dataset + DatasetRow[] → GenericDashboard`. This is the piece that finally makes a Dataset's persisted rows (Plan 4) into something showable — KPIs summed from `measure` columns, a trend per KPI bucketed by the `dimension-date` column (if present), breakdowns per `dimension` column, and a defect Pareto from `defect` columns. This plan does **not** touch any React component or route — it is the computation layer only. Wiring it into the UI (fetching a dataset's rows, rendering with the existing `Kpi`/`LineChart`/`BarsH`/`Donut` widgets, and adding the View-dropdown tab) is a **separate, later plan**.

## Scope discipline (same boundary as Plans 3–4)

Purely additive, no React/route changes. Must NOT touch `AppShell.tsx`, `/api/ingest`, `/api/schema`, existing parsers, or any `.tsx` file. Only new files under `src/lib/dataset/`.

## Interfaces this consumes (already exist, do not change)
- `@/lib/dataset/types`: `Dataset`, `DatasetRow`, `SchemaSignatureColumn` (via `Dataset.columns`).
- `@/lib/ingest/date`: `toLocalISODate(v: unknown): string | null` — reuse this for date-dimension parsing; do not write a new date parser.
- For the real-corpus test: `@/lib/dataset/from-workbooks`: `datasetsWithRowsFromWorkbooks`.

---

## Task 1 — `src/lib/dataset/dashboard.ts` + test (TDD)

Write the test first, confirm it fails for the expected reason, then implement.

```typescript
// src/lib/dataset/__tests__/dashboard.test.ts
import { buildGenericDashboard } from "../dashboard";
import type { Dataset, DatasetRow } from "../types";

const dataset: Dataset = {
  id: "ds1",
  signatureHash: "ds1",
  title: "Visual Inspection",
  columns: [
    { role: "dimension-date", name: "date" },
    { role: "measure", name: "quantity checked" },
    { role: "measure", name: "rejection" },
    { role: "dimension", name: "size" },
    { role: "defect", name: "coag" },
    { role: "defect", name: "sd" },
  ],
  sources: [{ fileName: "a.xlsx", sheetName: "VISUAL", rowCount: 3 }],
  totalRows: 3,
};

const row = (date: string, checked: number, rejection: number, size: string, coag: number, sd: number): DatasetRow => ({
  datasetId: "ds1",
  fileName: "a.xlsx",
  sheetName: "VISUAL",
  rowIndex: 0,
  values: { date, "quantity checked": checked, rejection, size, coag, sd },
});

describe("buildGenericDashboard", () => {
  const rows = [
    row("2025-04-01", 100, 10, "6FR", 3, 2),
    row("2025-04-02", 200, 20, "8FR", 5, 0),
    row("2025-04-03", 150, 5, "6FR", 0, 1),
  ];

  it("sums each measure column into a KPI total", () => {
    const d = buildGenericDashboard(dataset, rows);
    const checkedKpi = d.kpis.find((k) => k.columnName === "quantity checked")!;
    expect(checkedKpi.total).toBe(450);
    const rejKpi = d.kpis.find((k) => k.columnName === "rejection")!;
    expect(rejKpi.total).toBe(35);
  });

  it("builds an ascending-by-date trend per KPI from the date-dimension column", () => {
    const d = buildGenericDashboard(dataset, rows);
    const checkedKpi = d.kpis.find((k) => k.columnName === "quantity checked")!;
    expect(checkedKpi.trend.map((p) => p.label)).toEqual(["2025-04-01", "2025-04-02", "2025-04-03"]);
    expect(checkedKpi.trend.map((p) => p.value)).toEqual([100, 200, 150]);
  });

  it("computes the dataset's overall date range from valid dates", () => {
    const d = buildGenericDashboard(dataset, rows);
    expect(d.dateRange).toEqual({ from: "2025-04-01", to: "2025-04-03" });
  });

  it("breaks down a dimension column by summing the first measure per distinct value, sorted desc", () => {
    const d = buildGenericDashboard(dataset, rows);
    const sizeBreakdown = d.breakdowns.find((b) => b.columnName === "size")!;
    // 6FR: rows 1 and 3 → 100 + 150 = 250 (first measure = "quantity checked").
    // 8FR: row 2 → 200.
    expect(sizeBreakdown.bars).toEqual([
      { label: "6FR", value: 250 },
      { label: "8FR", value: 200 },
    ]);
  });

  it("sums defect columns into a Pareto, descending, excluding zero-value defects", () => {
    const d = buildGenericDashboard(dataset, rows);
    expect(d.defectPareto).toEqual([
      { label: "Coag", value: 8 },
      { label: "Sd", value: 3 },
    ]);
  });

  it("returns null defectPareto and empty breakdowns/trend gracefully when a dataset has no such columns", () => {
    const bare: Dataset = { ...dataset, columns: [{ role: "measure", name: "count" }] };
    const bareRows: DatasetRow[] = [
      { datasetId: "ds1", fileName: "a.xlsx", sheetName: "S", rowIndex: 0, values: { count: 5 } },
    ];
    const d = buildGenericDashboard(bare, bareRows);
    expect(d.defectPareto).toBeNull();
    expect(d.breakdowns).toEqual([]);
    expect(d.dateRange).toBeNull();
    expect(d.kpis[0].trend).toEqual([]);
    expect(d.kpis[0].total).toBe(5);
  });

  it("treats non-numeric / null measure values as 0 rather than throwing or producing NaN", () => {
    const withGaps: DatasetRow[] = [
      row("2025-04-01", 100, 10, "6FR", 3, 2),
      { ...row("2025-04-02", 0, 0, "8FR", 0, 0), values: { date: "2025-04-02", "quantity checked": null, rejection: "n/a", size: "8FR", coag: 0, sd: 0 } },
    ];
    const d = buildGenericDashboard(dataset, withGaps);
    const checkedKpi = d.kpis.find((k) => k.columnName === "quantity checked")!;
    expect(checkedKpi.total).toBe(100);
    expect(Number.isNaN(checkedKpi.total)).toBe(false);
  });
});
```

```typescript
// src/lib/dataset/dashboard.ts
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
```

**Verify:** `npx jest src/lib/dataset/__tests__/dashboard.test.ts` green (all 7 cases). **Commit:** `feat(dataset): generic dashboard builder — Dataset+rows to KPIs/trends/breakdowns/Pareto`.

---

## Task 2 — real-corpus integration test (TDD guard, mirrors Plans 1/2/4's pattern)

Guarded by folder presence. Uses `datasetsWithRowsFromWorkbooks` directly (bypassing the DB entirely — this is a pure computation test, no Supabase).

```typescript
// src/lib/dataset/__tests__/dashboard-real-corpus.test.ts
import * as fs from "fs";
import * as path from "path";
import { datasetsWithRowsFromWorkbooks } from "../from-workbooks";
import { buildGenericDashboard } from "../dashboard";

const DIR = path.join(process.cwd(), "ANALYTICAL DATA", "REJECTION ANALYSIS 2025-26");
const maybe = fs.existsSync(DIR) ? describe : describe.skip;

maybe("buildGenericDashboard (real corpus)", () => {
  const files = fs
    .readdirSync(DIR)
    .filter((f) => /REJECTION ANALYSIS.*\.xlsx$/i.test(f) && !f.startsWith("~$"))
    .map((f) => ({ fileName: f, data: fs.readFileSync(path.join(DIR, f)) as unknown as ArrayBuffer }));

  it("produces a sane, non-empty dashboard for every real dataset", () => {
    const { datasets, rows } = datasetsWithRowsFromWorkbooks(files);
    expect(datasets.length).toBeGreaterThan(0);

    for (const ds of datasets) {
      const dsRows = rows.filter((r) => r.datasetId === ds.id);
      const dashboard = buildGenericDashboard(ds, dsRows);
      // At least one KPI (every recognized dataset here has ≥1 measure column).
      expect(dashboard.kpis.length).toBeGreaterThan(0);
      // No KPI total is NaN/negative (rejection/quantity counts are non-negative).
      for (const k of dashboard.kpis) {
        expect(Number.isFinite(k.total)).toBe(true);
        expect(k.total).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it("the Visual-shaped dataset (one with defect columns) produces a non-null Pareto", () => {
    const { datasets, rows } = datasetsWithRowsFromWorkbooks(files);
    const withDefects = datasets.find((d) => d.columns.some((c) => c.role === "defect"));
    if (!withDefects) return; // corpus shape may vary; don't fail if none matched
    const dsRows = rows.filter((r) => r.datasetId === withDefects.id);
    const dashboard = buildGenericDashboard(withDefects, dsRows);
    expect(dashboard.defectPareto).not.toBeNull();
  });
});
```

**Verify:** `npx jest src/lib/dataset/__tests__/dashboard-real-corpus.test.ts` — runs (not skipped) if the corpus folder exists; report which. **Commit:** `test(dataset): real-corpus sanity guard for generic dashboard builder`.

---

## Done criteria
- `npx jest` full suite green (report counts — expect 213 baseline + new tests from Tasks 1–2).
- `npx tsc --noEmit` clean.
- No files touched outside `src/lib/dataset/` (confirm via `git diff --stat` against the forbidden paths from prior plans — should remain empty).
- Report whether the real-corpus test ran or skipped, and if it ran, the actual dashboard shape found (e.g., how many KPIs/breakdowns/whether a Pareto appeared) for at least one real dataset, so we know the builder behaves sensibly on your actual data.
