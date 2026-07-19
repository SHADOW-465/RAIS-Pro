# Plan 4 — Dataset Row Storage (full values, not just schema)

**Spec:** `docs/superpowers/specs/2026-07-01-universal-schema-ingestion-design.md` component **[D]** (the generic-dataset slice; the existing canonical event store already serves recognized Disposafe data — this plan adds the equivalent for arbitrary/generic Datasets).
**Builds on:** Plan 1 (`src/lib/schema/`), Plan 2 (`src/lib/dataset/{types,registry,title,from-workbooks}.ts`), Plan 3 (`src/lib/dataset/store*.ts`, `/api/datasets`). **Branch:** `feat/universal-schema-ingestion`.

## Why this plan exists

`Dataset` (Plan 2/3) only carries schema metadata — signature, title, and `sources: {fileName, sheetName, rowCount}`. It deliberately does **not** carry cell values (see the comment on `DatasetSource.rowCount` in `src/lib/dataset/types.ts`: "full-row ingestion is a later plan"). Without real values persisted, no generic dashboard can show real KPIs/trends after a page reload. This plan closes that gap: **persist every non-meta column's value, for every row, for every uploaded source**, keyed to its Dataset.

## Scope discipline (same boundary as Plan 3)

Purely additive. Do NOT touch `AppShell.tsx`'s View dropdown, dashboard rendering, `/api/ingest`, `/api/schema`, or the existing parsers. This plan only adds storage + extends the existing `/api/datasets` route and the existing silent Staging hook (both from Plan 3) to also carry row values. The **generic dashboard builder** that reads these rows is a **separate, later plan** — do not build it here.

## A critical, easy-to-miss detail

`buildProfilingTables` (Plan 1, `src/lib/schema/from-workbook.ts`) caps sampling at `MAX_SAMPLE_ROWS = 60` — that's correct for role/type CLASSIFICATION (60 rows is plenty to infer a column's role) but WRONG for row extraction: a dashboard must ingest **every** data row, not a capped sample, or later months' totals would be silently truncated. Task 1 below adds an optional parameter so the classification call sites keep their existing capped behavior (zero risk to Plan 1's already-reviewed tests) while a new row-extraction call site reads the full sheet.

---

## Task 1 — extend `buildProfilingTables` with an optional row cap (backward compatible)

In `src/lib/schema/from-workbook.ts`, change the signature to accept an optional 3rd parameter, defaulting to the existing constant so EVERY existing call site and test is unaffected:

```typescript
const DEFAULT_MAX_SAMPLE_ROWS = 60;

export function buildProfilingTables(
  data: ArrayBuffer | Buffer,
  _fileName: string,
  opts: { maxRows?: number } = {},
): ProfilingTable[] {
  const maxRows = opts.maxRows ?? DEFAULT_MAX_SAMPLE_ROWS;
  // ... replace every use of MAX_SAMPLE_ROWS below with `maxRows`
```

Add one test to `src/lib/schema/__tests__/from-workbook.test.ts` (it already skip-guards on the real corpus folder — add inside the existing `describe`):

```typescript
  it("respects an explicit maxRows override for full-data extraction, beyond the 60-row classification cap", () => {
    const files = fs.readdirSync(DIR).filter((f) => /REJECTION ANALYSIS.*\.xlsx$/i.test(f) && !f.startsWith("~$"));
    const buf = fs.readFileSync(path.join(DIR, files[0]));
    const capped = buildProfilingTables(buf, files[0]);
    const uncapped = buildProfilingTables(buf, files[0], { maxRows: 5000 });
    // Same sheets, and uncapped never has FEWER rows than capped for any sheet.
    const cappedByName = new Map(capped.map((t) => [t.sheetName, t.rows.length]));
    for (const t of uncapped) {
      expect(t.rows.length).toBeGreaterThanOrEqual(cappedByName.get(t.sheetName) ?? 0);
    }
  });
```

(Adjust the exact `DIR`/import setup to match what's already in that test file — read it first.)

**Verify:** `npx jest src/lib/schema` green, including all PRE-EXISTING tests in that file (they must still pass unchanged — this confirms the default-preserving refactor didn't regress Plan 1). **Commit:** `feat(schema): optional maxRows override for full-data row extraction`.

---

## Task 2 — `DatasetRow` type (additive; do not modify `Dataset`/`DatasetSource`)

In `src/lib/dataset/types.ts`, add (do not touch existing exports):

```typescript
/** One data row's non-meta column values, as actually read from a source sheet.
 *  This is the ground truth a generic dashboard computes KPIs/trends from. Meta
 *  columns (remarks, serials) are excluded — they carry no analytical signal. */
export interface DatasetRow {
  datasetId: string;
  fileName: string;
  sheetName: string;
  rowIndex: number; // 0-based, stable within (fileName, sheetName) across re-uploads
  values: Record<string, string | number | null>; // column name -> raw value
}
```

**Verify:** `npx tsc --noEmit -p tsconfig.json` clean. **Commit:** `feat(dataset): DatasetRow type`.

---

## Task 3 — `datasetsWithRowsFromWorkbooks` (extends, does not break, `from-workbooks.ts`)

In `src/lib/dataset/from-workbooks.ts`, keep the existing `datasetsFromWorkbooks` export working byte-identically (it's already tested/reviewed), and add a new function alongside it:

```typescript
import type { Dataset, DatasetRow, ProfiledTableInput } from "./types";
// (keep existing imports)

export interface DatasetsWithRows {
  datasets: Dataset[];
  rows: DatasetRow[];
}

/** Same grouping as datasetsFromWorkbooks, but also extracts every non-meta
 *  column's value for every row (uncapped — see buildProfilingTables maxRows),
 *  tagged with the Dataset id they belong to. */
export function datasetsWithRowsFromWorkbooks(files: WorkbookInput[]): DatasetsWithRows {
  const inputs: (ProfiledTableInput & { rowsRaw: import("@/lib/schema/types").ProfilingCell[][] })[] = [];

  for (const f of files) {
    for (const table of buildProfilingTables(f.data, f.fileName, { maxRows: 5000 })) {
      const { columns } = profileTable(table);
      const signature = computeSignature(columns);
      inputs.push({
        fileName: f.fileName,
        sheetName: table.sheetName,
        signature,
        columns,
        rowCount: table.rows.length,
        rowsRaw: table.rows,
      });
    }
  }

  const datasets = groupIntoDatasets(inputs);

  const idFor = new Map<string, string>();
  for (const d of datasets) for (const s of d.sources) idFor.set(`${s.fileName}::${s.sheetName}`, d.id);

  const rows: DatasetRow[] = [];
  for (const inp of inputs) {
    const datasetId = idFor.get(`${inp.fileName}::${inp.sheetName}`);
    if (!datasetId) continue; // should not happen; grouping covers every input
    const nonMetaCols = inp.columns.filter((c) => c.role !== "meta");
    inp.rowsRaw.forEach((cells, rowIndex) => {
      const values: Record<string, string | number | null> = {};
      for (const col of nonMetaCols) {
        const raw = cells[col.index]?.value;
        values[col.name] = raw === "" || raw === undefined ? null : (raw as string | number);
      }
      const allEmpty = Object.values(values).every((v) => v === null);
      if (allEmpty) return; // skip fully-blank rows (e.g. trailing sheet padding)
      rows.push({ datasetId, fileName: inp.fileName, sheetName: inp.sheetName, rowIndex, values });
    });
  }

  return { datasets, rows };
}

export function datasetsFromWorkbooks(files: WorkbookInput[]): Dataset[] {
  return datasetsWithRowsFromWorkbooks(files).datasets;
}
```

Note: this REPLACES the body of the existing `datasetsFromWorkbooks` with a thin delegation — its observable behavior (same grouping, same output) is unchanged, so Plan 2's existing tests for it must still pass without modification. Do not change `src/lib/dataset/registry.ts` or `src/lib/dataset/types.ts`'s `ProfiledTableInput`/`Dataset`/`DatasetSource` — the extra `rowsRaw` field is carried on a locally-typed superset object, never on the shared type.

Add a real-corpus test to `src/lib/dataset/__tests__/from-workbooks.test.ts` (extend the existing guarded `describe`):

```typescript
  it("datasetsWithRowsFromWorkbooks extracts real row values, excludes meta columns, and covers all sources", () => {
    const { datasetsFromWorkbooks: _unused } = require("../from-workbooks"); // sanity: old export still present
    const { datasets, rows } = datasetsWithRowsFromWorkbooks(files);
    expect(rows.length).toBeGreaterThan(0);
    // Every row must reference a real dataset id.
    const datasetIds = new Set(datasets.map((d) => d.id));
    for (const r of rows) expect(datasetIds.has(r.datasetId)).toBe(true);
    // No row's values object should contain a meta-role column name (spot-check
    // against the dataset's own non-meta column list for that row's dataset).
    const colsById = new Map(datasets.map((d) => [d.id, new Set(d.columns.map((c) => c.name))]));
    for (const r of rows.slice(0, 50)) {
      const allowed = colsById.get(r.datasetId)!;
      for (const key of Object.keys(r.values)) expect(allowed.has(key)).toBe(true);
    }
  });
```

**Verify:** `npx jest src/lib/dataset` green, including ALL pre-existing dataset tests unchanged. **Commit:** `feat(dataset): extract real row values alongside dataset grouping`.

---

## Task 4 — migration `supabase/migrations/20260701120000_dataset_rows.sql`

```sql
-- Row-level values for Datasets (universal schema ingestion, component [D] for
-- generic/unrecognized data). One row per (dataset, source sheet, row index).
-- The UNIQUE constraint makes re-upload of the same file/sheet an idempotent
-- REPLACE of that row's values (upsert on conflict), not a duplicate insert.
CREATE TABLE IF NOT EXISTS dataset_rows (
  id bigserial PRIMARY KEY,
  dataset_id text NOT NULL REFERENCES datasets(id) ON DELETE CASCADE,
  file_name text NOT NULL,
  sheet_name text NOT NULL,
  row_index integer NOT NULL,
  values jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (dataset_id, file_name, sheet_name, row_index)
);

CREATE INDEX IF NOT EXISTS dataset_rows_dataset_id_idx ON dataset_rows (dataset_id);

ALTER TABLE dataset_rows ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS dataset_rows_service_role_all ON dataset_rows;
CREATE POLICY dataset_rows_service_role_all ON dataset_rows FOR ALL USING (true) WITH CHECK (true);
```

**Commit:** `feat(dataset): dataset_rows table migration`. (No live-DB step here — per project convention, migrations are staged as files; the user applies them manually.)

---

## Task 5 — `src/lib/dataset/row-store.ts` (interface) + `row-store-memory.ts` + test (TDD)

```typescript
// src/lib/dataset/row-store.ts
import type { DatasetRow } from "./types";

export interface RowStore {
  /** Replace-by-key upsert: same (datasetId, fileName, sheetName, rowIndex) replaces in place. */
  upsert(rows: DatasetRow[]): Promise<void>;
  /** All rows for one dataset, in insertion-stable (fileName, sheetName, rowIndex) order. */
  forDataset(datasetId: string): Promise<DatasetRow[]>;
  clear(): Promise<void>;
}
```

```typescript
// src/lib/dataset/__tests__/row-store-memory.test.ts
import { MemoryRowStore } from "../row-store-memory";
import type { DatasetRow } from "../types";

const row = (datasetId: string, rowIndex: number, values: Record<string, number> = { qty: 1 }): DatasetRow => ({
  datasetId, fileName: "a.xlsx", sheetName: "S", rowIndex, values,
});

describe("MemoryRowStore", () => {
  it("upserts and lists rows for a dataset, sorted by (fileName, sheetName, rowIndex)", async () => {
    const store = new MemoryRowStore();
    await store.upsert([row("d1", 1), row("d1", 0), row("d2", 0)]);
    const rows = await store.forDataset("d1");
    expect(rows.map((r) => r.rowIndex)).toEqual([0, 1]);
  });

  it("replaces a row in place on the same key rather than duplicating", async () => {
    const store = new MemoryRowStore();
    await store.upsert([row("d1", 0, { qty: 1 })]);
    await store.upsert([row("d1", 0, { qty: 99 })]);
    const rows = await store.forDataset("d1");
    expect(rows).toHaveLength(1);
    expect(rows[0].values.qty).toBe(99);
  });

  it("clear() empties the store", async () => {
    const store = new MemoryRowStore();
    await store.upsert([row("d1", 0)]);
    await store.clear();
    expect(await store.forDataset("d1")).toEqual([]);
  });
});
```

```typescript
// src/lib/dataset/row-store-memory.ts
import type { DatasetRow } from "./types";
import type { RowStore } from "./row-store";

function key(r: Pick<DatasetRow, "datasetId" | "fileName" | "sheetName" | "rowIndex">): string {
  return `${r.datasetId}::${r.fileName}::${r.sheetName}::${r.rowIndex}`;
}

export class MemoryRowStore implements RowStore {
  private byKey = new Map<string, DatasetRow>();

  async upsert(rows: DatasetRow[]): Promise<void> {
    for (const r of rows) this.byKey.set(key(r), r);
  }

  async forDataset(datasetId: string): Promise<DatasetRow[]> {
    return [...this.byKey.values()]
      .filter((r) => r.datasetId === datasetId)
      .sort(
        (a, b) =>
          a.fileName.localeCompare(b.fileName) ||
          a.sheetName.localeCompare(b.sheetName) ||
          a.rowIndex - b.rowIndex,
      );
  }

  async clear(): Promise<void> {
    this.byKey.clear();
  }
}
```

**Verify:** `npx jest src/lib/dataset/__tests__/row-store-memory.test.ts` green. **Commit:** `feat(dataset): in-memory RowStore adapter`.

---

## Task 6 — `src/lib/dataset/row-store-supabase.ts` (chunked — row volume is meaningfully larger than dataset volume)

```typescript
// src/lib/dataset/row-store-supabase.ts
import { createServerClient } from "@/lib/supabase";
import { chunk } from "@/lib/store/batch";
import type { DatasetRow } from "./types";
import type { RowStore } from "./row-store";

interface RowRow {
  dataset_id: string;
  file_name: string;
  sheet_name: string;
  row_index: number;
  values: DatasetRow["values"];
  updated_at: string;
}

function toRow(r: DatasetRow): RowRow {
  return {
    dataset_id: r.datasetId,
    file_name: r.fileName,
    sheet_name: r.sheetName,
    row_index: r.rowIndex,
    values: r.values,
    updated_at: new Date().toISOString(),
  };
}

function fromRow(r: RowRow): DatasetRow {
  return { datasetId: r.dataset_id, fileName: r.file_name, sheetName: r.sheet_name, rowIndex: r.row_index, values: r.values };
}

const UPSERT_BATCH = 500; // mirrors SupabaseEventStore's INSERT_BATCH convention

export class SupabaseRowStore implements RowStore {
  private get client() {
    return createServerClient();
  }

  async upsert(rows: DatasetRow[]): Promise<void> {
    if (rows.length === 0) return;
    for (const batch of chunk(rows.map(toRow), UPSERT_BATCH)) {
      const { error } = await this.client
        .from("dataset_rows")
        .upsert(batch, { onConflict: "dataset_id,file_name,sheet_name,row_index" });
      if (error) throw error;
    }
  }

  async forDataset(datasetId: string): Promise<DatasetRow[]> {
    const { data, error } = await this.client
      .from("dataset_rows")
      .select("*")
      .eq("dataset_id", datasetId)
      .order("file_name")
      .order("sheet_name")
      .order("row_index");
    if (error) throw error;
    return (data ?? []).map(fromRow);
  }

  async clear(): Promise<void> {
    const { error } = await this.client.from("dataset_rows").delete().neq("dataset_id", "");
    if (error) throw error;
  }
}
```

**Verify:** `npx tsc --noEmit -p tsconfig.json` clean (no unit test — needs a live DB, same convention as Plan 3's `store-supabase.ts`). **Commit:** `feat(dataset): Supabase RowStore adapter with chunked upserts`.

---

## Task 7 — `src/lib/dataset/get-row-store.ts` (selector, mirrors `get-store.ts` from Plan 3)

```typescript
// src/lib/dataset/get-row-store.ts
/* eslint-disable @typescript-eslint/no-require-imports */
import { shouldUseSupabase } from "@/lib/store";
import type { RowStore } from "./row-store";
import { MemoryRowStore } from "./row-store-memory";

const g = globalThis as unknown as { __rowStore?: RowStore };

export function getRowStore(): RowStore {
  if (g.__rowStore) return g.__rowStore;
  if (shouldUseSupabase()) {
    const { SupabaseRowStore } = require("./row-store-supabase") as typeof import("./row-store-supabase");
    g.__rowStore = new SupabaseRowStore();
  } else {
    g.__rowStore = new MemoryRowStore();
  }
  return g.__rowStore;
}
```

**Verify:** `npx tsc --noEmit -p tsconfig.json` clean. **Commit:** `feat(dataset): env-based RowStore selector`.

---

## Task 8 — extend `/api/datasets` to accept and serve rows (additive to Plan 3's route, not a rewrite)

Read the CURRENT `src/app/api/datasets/route.ts` first (Plan 3 built it, then a fix commit hardened POST validation — read the fixed version). Extend it:

- **POST**: body may now optionally include `rows: DatasetRow[]` alongside `datasets`. If present, validate each row has `datasetId`/`fileName`/`sheetName`/`values`, then `getRowStore().upsert(rows)` after the existing dataset upsert succeeds. Keep the existing `datasets`-only validation/behavior 100% intact — `rows` is optional and additive.
- **GET**: accept an optional `?datasetId=` query param. When present, return `{ rows: await getRowStore().forDataset(datasetId) }` INSTEAD of the dataset list (i.e., this becomes a rows-lookup mode). When absent, behave exactly as before (`{ datasets }`).

```typescript
// src/app/api/datasets/route.ts — illustrative diff, adapt to the actual current file
import { getRowStore } from "@/lib/dataset/get-row-store";
import type { DatasetRow } from "@/lib/dataset/types";

export async function GET(req: NextRequest) {
  try {
    const datasetId = req.nextUrl.searchParams.get("datasetId");
    if (datasetId) {
      const rows = await getRowStore().forDataset(datasetId);
      return NextResponse.json({ rows });
    }
    const store = getDatasetStore();
    const datasets = await store.list();
    return NextResponse.json({ datasets });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? "Failed to load datasets" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const datasets = body?.datasets as Dataset[] | undefined;
    if (!datasets || !Array.isArray(datasets) || datasets.length === 0) {
      return NextResponse.json({ error: "No datasets provided." }, { status: 400 });
    }
    const invalidDataset = datasets.find((d) => !d?.id || !d?.title || !Array.isArray(d?.sources));
    if (invalidDataset) {
      return NextResponse.json({ error: "Malformed dataset: id, title, and sources are required." }, { status: 400 });
    }

    const rows = body?.rows as DatasetRow[] | undefined;
    if (rows !== undefined) {
      if (!Array.isArray(rows)) {
        return NextResponse.json({ error: "rows must be an array when provided." }, { status: 400 });
      }
      const invalidRow = rows.find((r) => !r?.datasetId || !r?.fileName || !r?.sheetName || typeof r?.values !== "object");
      if (invalidRow) {
        return NextResponse.json({ error: "Malformed row: datasetId, fileName, sheetName, values are required." }, { status: 400 });
      }
    }

    const store = getDatasetStore();
    await store.upsert(datasets);

    if (rows && rows.length > 0) {
      await getRowStore().upsert(rows);
    }

    return NextResponse.json({ success: true, count: datasets.length, rowCount: rows?.length ?? 0 });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? "Failed to persist datasets" }, { status: 500 });
  }
}
```

Add tests to `src/app/api/datasets/__tests__/route.test.ts` (extend the existing file; keep `process.env.MOID_STORE = "memory"` at the top):

```typescript
  it("POST with rows persists them; GET ?datasetId= returns them", async () => {
    const dataset = { id: "ds1", signatureHash: "ds1", title: "T", columns: [], sources: [{ fileName: "a.xlsx", sheetName: "S", rowCount: 1 }], totalRows: 1 };
    const rows = [{ datasetId: "ds1", fileName: "a.xlsx", sheetName: "S", rowIndex: 0, values: { qty: 5 } }];
    const postRes = await POST(post({ datasets: [dataset], rows }));
    expect(postRes.status).toBe(200);

    const getRes = await GET(new NextRequest("http://localhost/api/datasets?datasetId=ds1"));
    const json = await getRes.json();
    expect(json.rows).toHaveLength(1);
    expect(json.rows[0].values.qty).toBe(5);
  });

  it("POST with a malformed row is a 400 and does not persist the dataset either", async () => {
    const dataset = { id: "ds2", signatureHash: "ds2", title: "T", columns: [], sources: [{ fileName: "a.xlsx", sheetName: "S", rowCount: 1 }], totalRows: 1 };
    const res = await POST(post({ datasets: [dataset], rows: [{ fileName: "a.xlsx" }] }));
    expect(res.status).toBe(400);
  });
```

(`GET` now takes a `NextRequest` — check whether the plan's existing Task-6 `GET` signature took zero args; if so, update its signature to `GET(req: NextRequest)` and adjust the existing "GET returns an empty list" test to pass a bare `new NextRequest("http://localhost/api/datasets")`.)

**Verify:** `npx jest src/app/api/datasets` green, all tests (old + new) passing. **Commit:** `feat(dataset): persist and serve row values via /api/datasets`.

---

## Task 9 — extend the Staging silent hook to also send rows

In `src/app/staging/page.tsx`, the fire-and-forget block added in Plan 3 currently calls `datasetsFromWorkbooks(inputs)` and POSTs `{ datasets }`. Change it to call the new `datasetsWithRowsFromWorkbooks(inputs)` and POST `{ datasets, rows }`:

```typescript
void (async () => {
  try {
    const { datasetsWithRowsFromWorkbooks } = await import("@/lib/dataset/from-workbooks");
    const inputs = await Promise.all(
      files.map(async (f) => ({ fileName: f.name, data: await f.arrayBuffer() })),
    );
    const { datasets, rows } = datasetsWithRowsFromWorkbooks(inputs);
    if (datasets.length > 0) {
      await fetch("/api/datasets", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ datasets, rows }),
      }).catch(() => {});
    }
  } catch {
    // best-effort; the existing upload/review pipeline is unaffected either way
  }
})();
```

This is a one-line-ish change to an already-additive, already-isolated block — do not touch anything else in the file.

**Verify:** `npx tsc --noEmit` clean. Full `npx jest` — zero regressions vs. the last known-good count (205 before this plan). **Commit:** `feat(staging): send row values alongside dataset schema in the silent persistence hook`.

---

## Done criteria
- `npx jest` full suite green — report exact counts (expect the 205 pre-existing tests to still ALL pass, plus new tests from Tasks 1, 3, 5, 8).
- `npx tsc --noEmit` clean.
- Confirm via `git diff --stat` that `AppShell.tsx`, `/api/ingest`, `/api/schema`, and the existing parsers remain untouched by this plan's commits.
- Confirm `datasetsFromWorkbooks`'s existing behavior (used by Plan 2/3's own tests) is unchanged — same output for the same input.
- Report whether row extraction on the real corpus (Task 3's test) found any sheet whose true row count exceeded the OLD 60-row cap (this tells us how much silent truncation would have happened without this plan).
