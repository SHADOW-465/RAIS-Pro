# Plan 6 — Wire Datasets into the View Dropdown (first user-visible change)

**Spec:** `docs/superpowers/specs/2026-07-01-universal-schema-ingestion-design.md` components **[C]/[F1]** (UI wiring — the logic already exists from Plans 2–5).
**Builds on:** Plan 3 (`/api/datasets` GET), Plan 4 (`?datasetId=` rows lookup), Plan 5 (`buildGenericDashboard`). **Branch:** `feat/universal-schema-ingestion`.

## What changes (this IS the user-visible plan)

Every prior plan was deliberately invisible — pure logic and silent persistence. This plan wires it up: the **View** dropdown in the header (`AppShell.tsx`) gets one extra tab per persisted Dataset, appended AFTER the existing stage tabs (nothing existing is removed or reordered). Selecting a dataset tab renders a **new, generic dashboard** (`GenericDatasetView`) built from `buildGenericDashboard` — KPIs, trend lines, dimension breakdowns, and a defect Pareto when present.

## Explicitly NOT in this plan
- No changes to the **Cumulative** view or `StationView` (the existing Disposafe-specific dashboard) — both render exactly as before.
- No domain-recognizer tagging ([E]) — every dataset renders via the GENERIC path only in this plan, even ones that happen to be recognizable Disposafe stages. That merge is a separate, later plan.
- No changes to `/api/ingest`, `/api/schema`, or any parser.

## Files touched (all `.tsx` — this is the point of this plan)
- `src/components/app/AppShell.tsx` (additive: one new fetch + one array-spread into the existing tab list)
- `src/app/page.tsx` (additive: one new branch in the existing view-switch)
- `src/components/app/GenericDatasetView.tsx` (new component)

---

## Task 1 — `src/components/app/GenericDatasetView.tsx` (new component)

```tsx
"use client";

import { useEffect, useState } from "react";
import { Card, Kpi, LineChart, BarsH, Empty } from "@/components/app/widgets";
import PageLoader from "@/components/app/PageLoader";
import ParetoChart from "@/components/ParetoChart";
import { calculatePareto } from "@/lib/dashboard-builder";
import { buildGenericDashboard } from "@/lib/dataset/dashboard";
import type { Dataset, DatasetRow } from "@/lib/dataset/types";

const fmtNum = (n: number) => Math.round(n).toLocaleString("en-IN");

/** Renders any persisted Dataset generically — KPIs from measure columns, a
 *  trend per KPI when a date dimension exists, breakdowns per dimension column,
 *  and a defect Pareto when defect columns exist. Used for datasets that are
 *  NOT (yet) recognized as a known Disposafe stage — see spec component [F1].
 *  Fetches its own data (dataset metadata + rows) so it stays fully decoupled
 *  from AppShell's tab list, which only needs id/title to render the tab. */
export default function GenericDatasetView({ datasetId }: { datasetId: string }) {
  const [dataset, setDataset] = useState<Dataset | null>(null);
  const [rows, setRows] = useState<DatasetRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setDataset(null);
    setRows(null);
    setError(null);
    Promise.all([
      fetch("/api/datasets").then((r) => r.json()),
      fetch(`/api/datasets?datasetId=${encodeURIComponent(datasetId)}`).then((r) => r.json()),
    ])
      .then(([listJson, rowsJson]) => {
        if (cancelled) return;
        const found = ((listJson.datasets ?? []) as Dataset[]).find((d) => d.id === datasetId) ?? null;
        setDataset(found);
        setRows((rowsJson.rows ?? []) as DatasetRow[]);
      })
      .catch((err) => {
        if (!cancelled) setError(err?.message ?? "Failed to load dataset");
      });
    return () => {
      cancelled = true;
    };
  }, [datasetId]);

  if (error) return <Empty label={`Could not load this dataset: ${error}`} />;
  if (!dataset || rows === null) return <PageLoader message="Loading dataset..." minHeight="40vh" />;

  const d = buildGenericDashboard(dataset, rows);
  const trendKpis = d.kpis.filter((k) => k.trend.length > 0);
  const hasPareto = !!d.defectPareto && d.defectPareto.length > 0;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {d.kpis.length === 0 ? (
        <Empty label="This dataset has no measure columns to summarize — it may be a derived or summary sheet." />
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: `repeat(${Math.min(d.kpis.length, 5)}, 1fr)`, gap: 16 }}>
          {d.kpis.map((k) => (
            <Kpi key={k.columnName} label={k.label} value={fmtNum(k.total)} spark={k.trend.length ? k.trend : undefined} />
          ))}
        </div>
      )}

      {trendKpis.length > 0 && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 16 }}>
          {trendKpis.map((k) => (
            <Card key={k.columnName} title={`${k.label} — Trend`}>
              <LineChart points={k.trend} fmt={fmtNum} />
            </Card>
          ))}
        </div>
      )}

      {d.breakdowns.length > 0 && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 16 }}>
          {d.breakdowns.map((b) => (
            <Card key={b.columnName} title={`${b.label} Breakdown`}>
              <BarsH rows={b.bars} fmt={fmtNum} />
            </Card>
          ))}
        </div>
      )}

      {hasPareto && (
        <Card title="Defect Pareto">
          <ParetoChart
            analysis={
              calculatePareto(d.defectPareto!) || {
                items: [],
                totalDefects: 0,
                vitalFewCount: 0,
                vitalFewContribution: 0,
                criticalAreaText: "No defect data available.",
              }
            }
          />
        </Card>
      )}
    </div>
  );
}
```

Before writing this file, read `src/components/app/PageLoader.tsx` and `src/components/ParetoChart.tsx` to confirm their exact prop signatures match what's used above (`message`/`minHeight` for `PageLoader`; `analysis: ParetoAnalysis` for `ParetoChart`) — both are already used identically in `src/app/page.tsx`, so cross-check against that file's usage if anything doesn't line up. Also confirm `calculatePareto` from `@/lib/dashboard-builder` accepts `{ label: string; value: number }[]` (it does — see `src/app/page.tsx`'s existing `calculatePareto(m.defects.map(d => ({ label: d.label, value: d.rejected })))` call).

**Verify:** `npx tsc --noEmit -p tsconfig.json` clean. No automated test (no React-component-test precedent exists in this repo — `jest.config.ts` runs `testEnvironment: 'node'`, zero `.test.tsx` files; adding React Testing Library now would be a new-dependency, out-of-scope lift). Manual browser verification happens in Task 4. **Commit:** `feat(dashboard): GenericDatasetView — renders any Dataset via buildGenericDashboard`.

---

## Task 2 — wire dataset tabs into `AppShell.tsx`'s View selector (additive)

Read the current file first — the two relevant spots (from the last known state) are:
1. Around the `useEffect` that fetches `/api/schema` and sets `viewStages` (near the top of the component body).
2. The View tab-strip render, which currently maps over `[{ id: "cumulative", label: "Cumulative" }, ...(viewStages.length ? viewStages : VIEW_OPTIONS.slice(1))]`.

Add a new piece of state and a new fetch, then extend the render array — do NOT touch the existing `viewStages` fetch/state or the `VIEW_OPTIONS` fallback; only ADD alongside them:

```typescript
const [datasetTabs, setDatasetTabs] = useState<{ id: string; label: string }[]>([]);
```

Add a new `useEffect` (separate from the existing `/api/schema` one):

```typescript
useEffect(() => {
  fetch("/api/datasets")
    .then((res) => res.json())
    .then((data) => {
      const list = (data.datasets ?? []) as { id: string; title: string }[];
      // Prefix with "dataset:" so these ids can never collide with a legacy
      // stageId (which are short kebab-case strings like "visual"), and so
      // page.tsx can cheaply tell the two kinds of tab apart.
      setDatasetTabs(list.map((d) => ({ id: `dataset:${d.id}`, label: d.title })));
    })
    .catch(() => {
      // best-effort — the existing stage tabs still render fine without this
    });
}, []);
```

In the render, change:
```typescript
{[{ id: "cumulative", label: "Cumulative" }, ...(viewStages.length ? viewStages : VIEW_OPTIONS.slice(1))].map((v) => {
```
to:
```typescript
{[{ id: "cumulative", label: "Cumulative" }, ...(viewStages.length ? viewStages : VIEW_OPTIONS.slice(1)), ...datasetTabs].map((v) => {
```

That is the ONLY render-line change. Do not touch anything else in this large file.

**Verify:** `npx tsc --noEmit -p tsconfig.json` clean. **Commit:** `feat(dashboard): append persisted Dataset tabs to the View selector`.

---

## Task 3 — branch on the dataset-tab prefix in `src/app/page.tsx`

Read the current file first (the relevant lines, from the last known state):
```typescript
const activeView = t.stageView;
...
{activeView !== "cumulative" ? (
  <StationView events={events!} stageId={activeView} label={STAGE_LABELS[activeView] ?? activeView} ... />
) : ( ...cumulative JSX... )}
```

Add the import:
```typescript
import GenericDatasetView from "@/components/app/GenericDatasetView";
```

Change the render branch to a 3-way switch — dataset tabs render `GenericDatasetView`, everything else behaves EXACTLY as before:
```tsx
{activeView !== "cumulative" ? (
  activeView.startsWith("dataset:") ? (
    <GenericDatasetView datasetId={activeView.slice("dataset:".length)} />
  ) : (
    <StationView
      events={events!}
      stageId={activeView}
      label={STAGE_LABELS[activeView] ?? activeView}
      scope={m.snapshotScope}
      trendScope={m.trendScope}
      grainLabel={grainLabel}
      targetRej={targetRej}
      openModal={openModal}
      srcRows={srcRows}
    />
  )
) : (
  <>
  {/* ...unchanged cumulative JSX exactly as it is today... */}
  </>
)}
```

Copy the EXACT existing `StationView` prop list and the EXACT existing cumulative JSX block verbatim — do not modify either. This task is purely inserting one new conditional branch.

**Verify:** `npx tsc --noEmit -p tsconfig.json` clean. **Commit:** `feat(dashboard): render GenericDatasetView for dataset-prefixed View tabs`.

---

## Task 4 — manual browser verification (required; this is the first browser-observable change in this whole effort)

Start the dev server and actually exercise this in a browser (per this project's UI-verification standard — do not skip this for a UI-touching plan):

1. `npm run dev` (or use the preview tooling available to you) and navigate to the dashboard (`/`).
2. Confirm the existing tabs (Cumulative + any stage tabs) still render and behave exactly as before — click through 1-2 of them, confirm no regression.
3. Confirm at least one new dataset tab appears (there should be persisted datasets from this session's earlier Staging uploads — check `/api/datasets` directly in the browser or via `curl`/fetch first if none are visible, and if truly none exist, upload one of the real files from `ANALYTICAL DATA/REJECTION ANALYSIS 2025-26/` via `/staging` to populate one, since that flow already silently persists datasets+rows per Plans 3–4).
4. Click a dataset tab. Confirm: it loads (a brief loader, then content), shows at least one KPI tile with a real number (not "NaN", not "undefined", not empty), and if the dataset has a trend/breakdown/Pareto, those render without console errors.
5. Check the browser console/network tab for any error from `/api/datasets` calls.
6. Take a screenshot of the working dataset view and report back what you saw (dataset title, KPI values, whether a trend/breakdown/Pareto rendered) as evidence — do not just claim it works.

**If anything fails:** diagnose and fix before reporting done — this is a UI plan; "the code compiles" is not sufficient, seeing it actually render correctly in the browser is the bar per this project's standards.

---

## Done criteria
- `npx tsc --noEmit` clean.
- Full `npx jest` — zero regressions (report exact count; expect the 223 baseline unchanged, since this plan adds no new automated tests, only manual browser verification).
- Manual browser verification (Task 4) completed with a screenshot and a description of what rendered, including at least one real KPI number from a real dataset.
- Confirm via reading the diffs that `AppShell.tsx` and `page.tsx` changes are each minimal, additive, and don't alter any EXISTING behavior (the Cumulative view and any legacy stage tab must look and behave identically to before).
