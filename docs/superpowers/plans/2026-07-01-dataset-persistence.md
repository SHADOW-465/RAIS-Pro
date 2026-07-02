# Plan 3 — Dataset Persistence + API

**Spec:** `docs/superpowers/specs/2026-07-01-universal-schema-ingestion-design.md` component **[C]** (persistence half — grouping logic is Plan 2, already done).
**Builds on:** Plan 1 (`src/lib/schema/`), Plan 2 (`src/lib/dataset/`). **Branch:** `feat/universal-schema-ingestion`.

## Scope discipline — read this first

This plan is **purely additive infrastructure**. It must NOT:
- Modify `AppShell.tsx`'s View dropdown or any dashboard rendering.
- Modify `/api/ingest`, `/api/schema`, or any existing parser (`recordsFromBuffer`, `schema-extractor`, `from-rejection-sheets`).
- Change any existing test's behavior.

Why held back: a Dataset tab in the View dropdown needs somewhere to render (a generic dashboard), which is Plan 4. Wiring the dropdown now would add a tab that shows nothing when clicked — a regression, not a feature. This plan only builds the storage + API layer and makes the Staging upload flow persist detected datasets **silently in the background** (fire-and-forget, never blocking or altering the existing upload/review/publish flow the user already relies on).

## Interfaces this consumes (already exist, do not change)
- `@/lib/dataset/types`: `Dataset`, `DatasetSource`.
- `@/lib/dataset/from-workbooks`: `datasetsFromWorkbooks(files: {fileName, data}[]) => Dataset[]`.
- `@/lib/supabase`: `createServerClient()`.
- Store pattern to mirror: `src/lib/store/{types,memory,supabase,index}.ts` (interface → memory adapter → supabase adapter → env-based selector with a `globalThis` singleton).

---

## Task 1 — migration `supabase/migrations/20260701_datasets.sql`

```sql
-- Persisted Datasets (universal schema ingestion, component [C]). A Dataset
-- groups all tables sharing one schema signature. id = signature hash, or
-- hash-suffixed on a genuine collision (see src/lib/dataset/registry.ts).
CREATE TABLE IF NOT EXISTS datasets (
  id text PRIMARY KEY,
  signature_hash text NOT NULL,
  title text NOT NULL,
  columns jsonb NOT NULL DEFAULT '[]'::jsonb,
  sources jsonb NOT NULL DEFAULT '[]'::jsonb,
  total_rows integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS datasets_signature_hash_idx ON datasets (signature_hash);

ALTER TABLE datasets ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS datasets_service_role_all ON datasets;
CREATE POLICY datasets_service_role_all ON datasets FOR ALL USING (true) WITH CHECK (true);
```

No test for a raw SQL migration file — **Commit:** `feat(dataset): datasets table migration`.

---

## Task 2 — `src/lib/dataset/store.ts` (interface, pure types)

```typescript
// src/lib/dataset/store.ts
// Persistence interface for Datasets — mirrors src/lib/store/types.ts's
// EventStore pattern (interface; memory + supabase adapters implement it).
import type { Dataset } from "./types";

export interface DatasetStore {
  /** Insert or replace by id (a re-ingest of the same signature updates in place). */
  upsert(datasets: Dataset[]): Promise<void>;
  list(): Promise<Dataset[]>;
  /** Remove all — mirrors the app's existing "clear data" affordance. */
  clear(): Promise<void>;
}
```

**Verify:** `npx tsc --noEmit -p tsconfig.json` clean. **Commit:** `feat(dataset): DatasetStore persistence interface`.

---

## Task 3 — `src/lib/dataset/store-memory.ts` + test (TDD)

```typescript
// src/lib/dataset/__tests__/store-memory.test.ts
import { MemoryDatasetStore } from "../store-memory";
import type { Dataset } from "../types";

const ds = (id: string, totalRows = 5): Dataset => ({
  id, signatureHash: id, title: `Dataset ${id}`, columns: [], sources: [], totalRows,
});

describe("MemoryDatasetStore", () => {
  it("upserts new datasets and lists them", async () => {
    const store = new MemoryDatasetStore();
    await store.upsert([ds("a"), ds("b")]);
    const all = await store.list();
    expect(all.map((d) => d.id).sort()).toEqual(["a", "b"]);
  });

  it("replaces an existing id in place rather than duplicating", async () => {
    const store = new MemoryDatasetStore();
    await store.upsert([ds("a", 5)]);
    await store.upsert([ds("a", 99)]);
    const all = await store.list();
    expect(all).toHaveLength(1);
    expect(all[0].totalRows).toBe(99);
  });

  it("clear() empties the store", async () => {
    const store = new MemoryDatasetStore();
    await store.upsert([ds("a")]);
    await store.clear();
    expect(await store.list()).toEqual([]);
  });
});
```

```typescript
// src/lib/dataset/store-memory.ts
import type { Dataset } from "./types";
import type { DatasetStore } from "./store";

export class MemoryDatasetStore implements DatasetStore {
  private byId = new Map<string, Dataset>();

  async upsert(datasets: Dataset[]): Promise<void> {
    for (const d of datasets) this.byId.set(d.id, d);
  }

  async list(): Promise<Dataset[]> {
    return [...this.byId.values()].sort(
      (a, b) => b.totalRows - a.totalRows || a.title.localeCompare(b.title),
    );
  }

  async clear(): Promise<void> {
    this.byId.clear();
  }
}
```

**Verify:** `npx jest src/lib/dataset/__tests__/store-memory.test.ts` green. **Commit:** `feat(dataset): in-memory DatasetStore adapter`.

---

## Task 4 — `src/lib/dataset/store-supabase.ts` (no unit test — needs a live DB; covered by the route-level test in Task 6 against the memory store, and manually against Supabase)

```typescript
// src/lib/dataset/store-supabase.ts
import { createServerClient } from "@/lib/supabase";
import type { Dataset } from "./types";
import type { DatasetStore } from "./store";

interface DatasetRow {
  id: string;
  signature_hash: string;
  title: string;
  columns: Dataset["columns"];
  sources: Dataset["sources"];
  total_rows: number;
}

function toRow(d: Dataset): DatasetRow {
  return {
    id: d.id,
    signature_hash: d.signatureHash,
    title: d.title,
    columns: d.columns,
    sources: d.sources,
    total_rows: d.totalRows,
  };
}

function fromRow(r: DatasetRow): Dataset {
  return {
    id: r.id,
    signatureHash: r.signature_hash,
    title: r.title,
    columns: r.columns,
    sources: r.sources,
    totalRows: r.total_rows,
  };
}

export class SupabaseDatasetStore implements DatasetStore {
  private get client() {
    return createServerClient();
  }

  async upsert(datasets: Dataset[]): Promise<void> {
    if (datasets.length === 0) return;
    const rows = datasets.map(toRow);
    const { error } = await this.client.from("datasets").upsert(rows, { onConflict: "id" });
    if (error) throw error;
  }

  async list(): Promise<Dataset[]> {
    const { data, error } = await this.client.from("datasets").select("*");
    if (error) throw error;
    return (data ?? []).map(fromRow).sort(
      (a, b) => b.totalRows - a.totalRows || a.title.localeCompare(b.title),
    );
  }

  async clear(): Promise<void> {
    const { error } = await this.client.from("datasets").delete().neq("id", "");
    if (error) throw error;
  }
}
```

**Verify:** `npx tsc --noEmit -p tsconfig.json` clean. **Commit:** `feat(dataset): Supabase DatasetStore adapter`.

---

## Task 5 — `src/lib/dataset/get-store.ts` (env-based selector, mirrors `src/lib/store/index.ts`)

```typescript
// src/lib/dataset/get-store.ts
import type { DatasetStore } from "./store";
import { MemoryDatasetStore } from "./store-memory";

const g = globalThis as unknown as { __datasetStore?: DatasetStore };

/** Mirrors src/lib/store/index.ts's shouldUseSupabase() selector. */
function shouldUseSupabase(): boolean {
  if ((process.env.MOID_STORE || "").toLowerCase() === "memory") return false;
  return !!process.env.NEXT_PUBLIC_SUPABASE_URL &&
    !!(process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
}

export function getDatasetStore(): DatasetStore {
  if (g.__datasetStore) return g.__datasetStore;
  if (shouldUseSupabase()) {
    const { SupabaseDatasetStore } = require("./store-supabase") as typeof import("./store-supabase");
    g.__datasetStore = new SupabaseDatasetStore();
  } else {
    g.__datasetStore = new MemoryDatasetStore();
  }
  return g.__datasetStore;
}
```

Note: `require` (not `import`) for the lazy Supabase load, exactly as `src/lib/store/index.ts` does — add `/* eslint-disable @typescript-eslint/no-require-imports */` at the top of the file to match that file's convention.

**Verify:** `npx tsc --noEmit -p tsconfig.json` clean. **Commit:** `feat(dataset): env-based DatasetStore selector`.

---

## Task 6 — `src/app/api/datasets/route.ts` + test (TDD)

```typescript
// src/app/api/datasets/__tests__/route.test.ts
// Forces the memory store so this test never touches a real Supabase project.
process.env.MOID_STORE = "memory";

import { GET, POST } from "../route";
import { NextRequest } from "next/server";

function post(body: unknown) {
  return new NextRequest("http://localhost/api/datasets", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
}

describe("/api/datasets", () => {
  it("GET returns an empty list before anything is persisted", async () => {
    const res = await GET();
    const json = await res.json();
    expect(json.datasets).toEqual([]);
  });

  it("POST persists datasets, then GET returns them", async () => {
    const dataset = {
      id: "abc123", signatureHash: "abc123", title: "Visual Inspection",
      columns: [], sources: [{ fileName: "a.xlsx", sheetName: "VISUAL", rowCount: 3 }], totalRows: 3,
    };
    const postRes = await POST(post({ datasets: [dataset] }));
    expect(postRes.status).toBe(200);

    const getRes = await GET();
    const json = await getRes.json();
    expect(json.datasets).toHaveLength(1);
    expect(json.datasets[0].id).toBe("abc123");
  });

  it("POST with an empty/missing datasets array is a 400", async () => {
    const res = await POST(post({}));
    expect(res.status).toBe(400);
  });
});
```

```typescript
// src/app/api/datasets/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getDatasetStore } from "@/lib/dataset/get-store";
import type { Dataset } from "@/lib/dataset/types";

export async function GET() {
  try {
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
    const store = getDatasetStore();
    await store.upsert(datasets);
    return NextResponse.json({ success: true, count: datasets.length });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? "Failed to persist datasets" }, { status: 500 });
  }
}
```

Before writing the test, check how existing API route tests in this repo construct `NextRequest`/mock the runtime (search `src/app/api/**/__tests__/*.test.ts` — there may be zero precedent, in which case this is the first; keep it minimal and consistent with the framework's actual `NextRequest`/`NextResponse` as used in `route.ts` files already, e.g. `src/app/api/schema/route.ts`).

**Verify:** `npx jest src/app/api/datasets` green. **Commit:** `feat(dataset): /api/datasets list+persist route`.

---

## Task 7 — silent, additive persistence hook in Staging upload

In `src/app/staging/page.tsx`, inside `handleUpload` (the function that already reads each file's `arrayBuffer()` — see the existing loop starting `for (const file of files)`), add a **fire-and-forget** call that profiles the same buffers already in memory and POSTs them to `/api/datasets`. This must NEVER throw into the existing upload flow, never block it, and never change `records`/`rows`/`summary`/anything the existing review UI reads.

Add near the top of `handleUpload`, after files are validated but reusing the SAME per-file `arrayBuffer` already being read in the existing loop (do not re-read files):

```typescript
// Fire-and-forget: profile the same buffers for the new Dataset system.
// Never blocks or throws into the existing upload/review flow.
void (async () => {
  try {
    const { datasetsFromWorkbooks } = await import("@/lib/dataset/from-workbooks");
    const inputs = await Promise.all(
      files.map(async (f) => ({ fileName: f.name, data: await f.arrayBuffer() })),
    );
    const datasets = datasetsFromWorkbooks(inputs);
    if (datasets.length > 0) {
      await fetch("/api/datasets", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ datasets }),
      }).catch(() => {}); // best-effort; never surfaces to the user in this plan
    }
  } catch {
    // best-effort; the existing upload/review pipeline is unaffected either way
  }
})();
```

Note: this reads each `File` a second time via its own `arrayBuffer()` call (Files are re-readable; this does not consume/interfere with the existing loop's own `file.arrayBuffer()` call). Keep this to a single, small, clearly-commented block — do not refactor the surrounding function.

**Verify:** no existing test in the repo covers `staging/page.tsx` upload behavior directly (confirm via `npx jest --listTests | grep -i staging` — expect none). Manually confirm via `npx tsc --noEmit` that the page still compiles. Run the FULL `npx jest` to confirm zero regressions (this change must not alter any existing test's outcome). **Commit:** `feat(staging): silently persist detected datasets alongside existing upload flow`.

---

## Done criteria
- `npx jest` full suite green (report counts) — must show the SAME pre-existing test count passing as before, plus the new dataset-store/route tests. Zero regressions.
- `npx tsc --noEmit` clean.
- Confirm nothing changed in `AppShell.tsx`, `/api/ingest`, `/api/schema`, or any existing parser — `git diff --stat main...HEAD -- src/components/app/AppShell.tsx src/app/api/ingest src/app/api/schema src/lib/ingest` should show no changes from this plan's commits (Plans 1/2 didn't touch these either, so this should be empty).
- Report whether you were able to apply the migration to a live Supabase project, or whether it's staged as a file only (env may not be configured in this sandbox — that's fine, note it).
