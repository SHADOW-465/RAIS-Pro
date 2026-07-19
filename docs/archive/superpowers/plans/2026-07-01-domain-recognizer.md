# Plan 7 — Domain Recognizer [E] (safe, explicit-publish)

**Spec:** component **[E]**. **Builds on:** Plans 2-6. **Branch:** `feat/universal-schema-ingestion`.

## Design decision (read before implementing)

Recognized data must NOT silently auto-ingest into the canonical event store. Today, `/staging` requires an explicit **Publish to Analytics** action after review before data reaches events — that review-then-publish gate is a trust/audit invariant of this codebase (MOID-SPEC). A background recognizer that silently emits events would (a) bypass that gate and (b) risk double-counting if the SAME file is also matched by the old filename-router pipeline. So: recognition is **labeling only** by default; converting a recognized Dataset's rows into canonical events is an **explicit user action**, reusing the existing `/api/ingest` route (which already has dedup/conflict/correction handling — do not reinvent any of that).

## Task 1 — `src/lib/dataset/recognize.ts` + test (TDD)

```typescript
// src/lib/dataset/recognize.ts
import type { Dataset } from "./types";
import { DISPOSAFE_REGISTRY } from "@/lib/registry/disposafe";

// Reuses the same sheet/file naming signal schema-extractor.ts's resolveStageId
// already relies on — sheet/file names are the strongest, already-proven signal
// for stage identity (stronger than column names alone, which vary by month).
const STAGE_PATTERNS: { re: RegExp; id: string }[] = [
  { re: /valve|integrit/i, id: "valve-integrity" },
  { re: /balloon/i, id: "balloon" },
  { re: /eye.?punch/i, id: "eye-punching" },
  { re: /final/i, id: "final" },
  { re: /visual/i, id: "visual" },
];

/** Match a Dataset's sources (file/sheet names) against known Disposafe stage
 *  patterns, requiring the SAME stage to win across a majority of sources (not
 *  just one) and requiring the dataset to actually have a checked/rejected-shaped
 *  measure column — a defensive gate against a stray filename coincidence. */
export function recognizeStage(dataset: Dataset): string | null {
  const hasMeasure = dataset.columns.some((c) => c.role === "measure");
  if (!hasMeasure) return null;

  const votes: Record<string, number> = {};
  for (const s of dataset.sources) {
    const target = `${s.fileName} ${s.sheetName}`;
    for (const p of STAGE_PATTERNS) {
      if (p.re.test(s.sheetName) || p.re.test(s.fileName)) {
        votes[p.id] = (votes[p.id] ?? 0) + 1;
        break; // first pattern match per source wins (patterns are mutually exclusive by construction)
      }
    }
  }
  const entries = Object.entries(votes);
  if (entries.length === 0) return null;
  entries.sort((a, b) => b[1] - a[1]);
  const [topId, topCount] = entries[0];
  // Require the winner to cover a clear majority of sources, not a stray match.
  if (topCount < dataset.sources.length * 0.5) return null;
  const known = DISPOSAFE_REGISTRY.stages.some((st) => st.stageId === topId);
  return known ? topId : null;
}
```

Test (`src/lib/dataset/__tests__/recognize.test.ts`): construct Datasets with sources named like the real corpus (`"3 JUNE 26.xlsx"` + sheet `"16FR"` won't match anything — correct, no false positive on a bare size sheet with no stage keyword; `"01 REJECTION ANALYSIS-APRIL 2025.xlsx"` + sheet `"VISUAL"` → `"visual"`; a dataset with only `derived` columns, no `measure` → `null` regardless of names). Also test the real corpus via `datasetsWithRowsFromWorkbooks` (guarded by folder presence, mirroring prior plans): assert at least one real dataset resolves to a known stageId.

**Verify:** `npx jest src/lib/dataset/__tests__/recognize.test.ts` green. **Commit:** `feat(dataset): recognize known Disposafe stages from a Dataset's source names`.

---

## Task 2 — persist `recognizedStageId` (additive column + field), compute it once per Dataset

- Migration `supabase/migrations/20260702_dataset_recognized_stage.sql`: `ALTER TABLE datasets ADD COLUMN IF NOT EXISTS recognized_stage_id text NULL;` (staged as a file; do not apply — tell the user to apply it manually, same convention as before).
- `Dataset` type gains `recognizedStageId: string | null` (additive field; default `null` wherever constructed without it — check all existing constructors in tests still compile, add the field to fixtures only where TS requires it).
- `groupIntoDatasets` (`src/lib/dataset/registry.ts`) computes `recognizedStageId: recognizeStage(builtDataset)` once per grouped Dataset before returning it (call `recognizeStage` on the dataset object after its `sources`/`columns` are finalized).
- `store-memory.ts`/`store-supabase.ts` (`toRow`/`fromRow`) pass `recognized_stage_id` through untouched (straight pass-through, default `null`).

**Verify:** `npx jest src/lib/dataset` green, all pre-existing tests pass (report exact count vs. the last known baseline). `npx tsc --noEmit` clean. **Commit:** `feat(dataset): persist recognizedStageId on Datasets`.

---

## Task 3 — AppShell: hide dataset tabs that duplicate an existing legacy stage tab

In `AppShell.tsx`'s dataset-tab fetch (added in Plan 6), filter out any dataset whose `recognizedStageId` matches an id already present in `viewStages` (the legacy stage tabs) — avoid two tabs for the same stage:

```typescript
const legacyIds = new Set(viewStages.length ? viewStages.map((v) => v.id) : VIEW_OPTIONS.slice(1).map((v) => v.id));
setDatasetTabs(
  list
    .filter((d) => !d.recognizedStageId || !legacyIds.has(d.recognizedStageId))
    .map((d) => ({ id: `dataset:${d.id}`, label: d.title }))
);
```
Depends on `viewStages` in the effect's dependency array now (add it; this effect already runs after `viewStages` is set once on mount, but add the dependency so it recomputes correctly if `viewStages` loads asynchronously after this effect first runs — order between the two fetches isn't guaranteed).

**Verify:** `npx tsc --noEmit` clean. **Commit:** `feat(dashboard): hide dataset tabs that duplicate an existing legacy stage`.

---

## Task 4 — `src/lib/dataset/to-stage-records.ts` (Dataset+rows → StageDayRecord[]) + test (TDD)

```typescript
// src/lib/dataset/to-stage-records.ts
import type { Dataset, DatasetRow } from "./types";
import type { StageDayRecord } from "@/lib/ingest/emit";
import { toLocalISODate } from "@/lib/ingest/date";

function toNumber(v: string | number | null | undefined): number | null {
  if (v == null || v === "") return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  const n = Number(String(v).replace(/[, ]/g, ""));
  return Number.isFinite(n) ? n : null;
}

const CHECKED_RE = /checked|qty|quantity|input|rec\b|receiv/i;
const REJECTED_RE = /reject|rej\b/i;
const GOOD_RE = /good|accept|acpt|ok\b|pass/i;
const REWORK_RE = /rework|hold/i;

/** Converts a recognized Dataset's rows into the existing StageDayRecord shape
 *  so they can flow through the ALREADY-TRUSTED /api/ingest reconciliation path
 *  (dedup, conflict Findings, corrections) — not a new emission mechanism. */
export function toStageRecords(dataset: Dataset, rows: DatasetRow[], ingestionId: string): StageDayRecord[] {
  if (!dataset.recognizedStageId) return [];
  const dateCol = dataset.columns.find((c) => c.role === "dimension-date");
  if (!dateCol) return [];

  const measureCols = dataset.columns.filter((c) => c.role === "measure");
  const checkedCol = measureCols.find((c) => CHECKED_RE.test(c.name));
  const rejectedCol = measureCols.find((c) => REJECTED_RE.test(c.name));
  const goodCol = measureCols.find((c) => GOOD_RE.test(c.name));
  const reworkCol = measureCols.find((c) => REWORK_RE.test(c.name));
  const defectCols = dataset.columns.filter((c) => c.role === "defect");

  const out: StageDayRecord[] = [];
  for (const row of rows) {
    const iso = toLocalISODate(row.values[dateCol.name]);
    if (!iso) continue;
    const checked = checkedCol ? toNumber(row.values[checkedCol.name]) : null;
    const rejected = rejectedCol ? toNumber(row.values[rejectedCol.name]) : null;
    const good = goodCol ? toNumber(row.values[goodCol.name]) : null;
    const rework = reworkCol ? toNumber(row.values[reworkCol.name]) : null;
    const defects = defectCols
      .map((c) => ({ raw: c.name, value: toNumber(row.values[c.name]) ?? 0, cell: `${row.sheetName}!row${row.rowIndex}` }))
      .filter((d) => d.value > 0);

    out.push({
      occurredOn: { kind: "day", start: iso, end: iso },
      stageId: dataset.recognizedStageId,
      size: null,
      source: { file: row.fileName, fileHash: "local", sheet: row.sheetName, tableId: "t1" },
      checked: checked !== null ? { value: Math.round(checked), cell: "", header: checkedCol!.name } : null,
      acceptedGood: good !== null ? { value: Math.round(good), cell: "", header: goodCol!.name } : null,
      rework: rework !== null ? { value: Math.round(rework), cell: "", header: reworkCol!.name } : null,
      rejected: rejected !== null ? { value: Math.round(rejected), cell: "", header: rejectedCol!.name } : null,
      defects,
      statedPct: null,
      extractedBy: "heuristic",
      ingestionId,
    });
  }
  return out;
}
```

Read `src/lib/ingest/emit.ts`'s actual `StageDayRecord` type first to confirm every field name/shape matches exactly (this plan's code is illustrative — align field-for-field with the real type, which is already used elsewhere in this codebase, e.g. `src/lib/ingest/schema-extractor.ts`'s `classifyWithSchema`).

Test: build a small Dataset+rows fixture with a `recognizedStageId` set, confirm output records have correct `stageId`, `checked`/`rejected` values, and dates; confirm an UNRECOGNIZED dataset (`recognizedStageId: null`) returns `[]`.

**Verify:** `npx jest src/lib/dataset/__tests__/to-stage-records.test.ts` green. **Commit:** `feat(dataset): convert a recognized Dataset's rows into StageDayRecords`.

---

## Task 5 — explicit "Publish to Cumulative Dashboard" action in `GenericDatasetView`

When `dataset.recognizedStageId` is set, show a small badge ("Recognized as: Visual Inspection") and a button "Publish to Cumulative Dashboard →". On click: call `toStageRecords(dataset, rows, crypto.randomUUID())`, then `POST /api/ingest` with `{ ingestionId, fileName: dataset.title, records }` — reuse the EXISTING route as-is, no changes to `/api/ingest`. Show the response's `inserted`/`deduped`/`issues` counts as a small success/warning toast-style message inline (reuse existing simple patterns from `staging/page.tsx` for how it displays ingest results — don't invent new UI chrome).

**Verify:** `npx tsc --noEmit` clean. Manual browser verification (like Plan 6's Task 4): upload a real recognized-shape file if none is already persisted, open its dataset tab, confirm the badge+button appear, click Publish, confirm a success message and that the Cumulative/StationView dashboard's numbers for that stage update accordingly (screenshot both before/after). **Commit:** `feat(dashboard): explicit publish-to-Cumulative action for recognized datasets`.

---

## Done criteria
- `npx jest` full suite green (report counts vs. 224 baseline).
- `npx tsc --noEmit` clean.
- No accidental auto-ingestion — recognized data reaching the event store ONLY happens via the explicit Publish click, never from the silent Staging hook.
- Manual browser verification of Task 5, with before/after screenshots showing the Cumulative dashboard actually updates after Publish.
