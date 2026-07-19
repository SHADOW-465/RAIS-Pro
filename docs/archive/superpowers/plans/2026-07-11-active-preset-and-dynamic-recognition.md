# Active Preset Wiring + Dynamic Stage Recognition Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make "which registry preset is active" one consistent, persisted concept instead of four independent guesses, stop Clear Schema from repopulating `DISPOSAFE_REGISTRY`'s hardcoded stages, and let stage recognition create genuinely new stages and split same-schema sheets by alias at grouping time — so onboarding a new manufacturing plant never depends on `DISPOSAFE_REGISTRY` for anything user-visible.

**Architecture:** A new `is_active` flag on `registries` plus a single `getActiveRegistryRow()` helper (`src/lib/store/index.ts`) replace four independent resolutions: `registries.first()` in `/api/schema`, a hardcoded `"disposafe"` literal in `clear-schema` and in `workbooks/page.tsx`, and a raw Supabase-bypass fallback in `/api/ingest`. Separately, `groupIntoDatasets`'s grouping key becomes alias-aware (not just its post-grouping confidence score), and a new `StageConfirmPicker` component lets the Workbooks "needs review" badge create a brand-new stage, not just confirm an already-regex-guessed one.

**Tech Stack:** Next.js 16 App Router, TypeScript, Zod, Supabase (Postgres), Jest, `@testing-library/react`.

## Global Constraints

- Do not modify `src/lib/ingest/schema-extractor.ts`'s extraction logic.
- `emit.ts`'s emission logic (`emitStageDay`/`emitMany`/`resolveDefect` calls) stays unchanged — only what's passed in as the `reg` parameter changes (Task 5), never the functions' bodies.
- Do not rename or restructure `DISPOSAFE_REGISTRY`'s export shape in `src/lib/registry/disposafe.ts` — it remains the sole bootstrap fallback for a genuinely zero-preset install, never a "couldn't find the flagged one" fallback.
- All new persistence is additive to the existing `registries` table (one new `is_active` column) — no new tables.
- Every new Supabase write path follows the existing defensive "try the real column, fall back to the legacy shape on a missing-column error" pattern already established in `SupabaseRegistryStore.upsert`.
- `RegistryRow.stageAliases` must never be silently wiped by an unrelated schema-shape update (this is the core bug Task 3 fixes, and every later task that writes a `RegistryRow` must preserve it).
- Test framework: Jest (`npx jest`). Follow the existing colocated `__tests__/` convention.

---

### Task 1: `is_active` flag + `RegistryStore.getActive()`/`setActive()`

**Files:**
- Create: `supabase/migrations/20260712_registry_is_active.sql`
- Modify: `src/lib/store/types.ts` (`RegistryStore` interface)
- Modify: `src/lib/store/memory.ts` (`MemoryRegistryStore`)
- Modify: `src/lib/store/supabase.ts` (`SupabaseRegistryStore`)
- Test: `src/__tests__/registry-store-active.test.ts`

**Interfaces:**
- Produces: `RegistryStore.getActive(): Promise<RegistryRow | null>` (the flagged row, or `null` if none is flagged) and `RegistryStore.setActive(presetId: string): Promise<void>` (flags this preset, clears the flag on every other one). Both are implemented in `MemoryRegistryStore` and `SupabaseRegistryStore`.
- Consumes (Task 2): `getActiveRegistryRow()` calls `registries.getActive()` and falls back to the existing `registries.first()`.

- [ ] **Step 1: Write the migration**

```sql
-- supabase/migrations/20260712_registry_is_active.sql
ALTER TABLE registries ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT false;
```

- [ ] **Step 2: Write the failing test**

```typescript
// src/__tests__/registry-store-active.test.ts
import { MemoryRegistryStore } from "@/lib/store/memory";
import type { RegistryRow } from "@/lib/store/types";

const row = (presetId: string): RegistryRow => ({
  presetId, name: presetId, createdFromFilename: null, registryVersion: "1.0.0",
  fiscalYearStartMonth: 4, stages: [], defects: [], sizes: [], stageAliases: {},
});

describe("RegistryStore.getActive/setActive (memory adapter)", () => {
  it("getActive returns null when nothing has been flagged", async () => {
    const store = new MemoryRegistryStore();
    await store.upsert(row("acme"));
    expect(await store.getActive()).toBeNull();
  });

  it("setActive flags a preset; getActive returns it", async () => {
    const store = new MemoryRegistryStore();
    await store.upsert(row("acme"));
    await store.setActive("acme");
    const active = await store.getActive();
    expect(active?.presetId).toBe("acme");
  });

  it("setActive on a second preset moves the flag, not adds to it", async () => {
    const store = new MemoryRegistryStore();
    await store.upsert(row("acme"));
    await store.upsert(row("beta"));
    await store.setActive("acme");
    await store.setActive("beta");
    const active = await store.getActive();
    expect(active?.presetId).toBe("beta");
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx jest src/__tests__/registry-store-active.test.ts`
Expected: FAIL — `getActive`/`setActive` don't exist on `MemoryRegistryStore` yet.

- [ ] **Step 4: Extend the `RegistryStore` interface**

In `src/lib/store/types.ts`, modify the `RegistryStore` interface (currently `list`/`get`/`first`/`upsert`/`rename`/`delete`):

```typescript
export interface RegistryStore {
  list(): Promise<RegistryPresetSummary[]>;
  get(presetId: string): Promise<RegistryRow | null>;
  /** Oldest saved preset — the "no presetId given" default every caller uses. */
  first(): Promise<RegistryRow | null>;
  /** The single preset flagged is_active, or null if none is flagged yet. */
  getActive(): Promise<RegistryRow | null>;
  /** Flags this preset active, clearing the flag on every other preset. */
  setActive(presetId: string): Promise<void>;
  upsert(row: RegistryRow): Promise<void>;
  rename(presetId: string, name: string): Promise<void>;
  delete(presetId: string): Promise<void>;
}
```

- [ ] **Step 5: Implement in `MemoryRegistryStore`**

In `src/lib/store/memory.ts`, add a private field and two methods to `MemoryRegistryStore` (alongside its existing `byId`/`order`/`counter` fields):

```typescript
export class MemoryRegistryStore implements RegistryStore {
  private byId = new Map<string, RegistryRow>();
  private order = new Map<string, number>();
  private counter = 0;
  private activePresetId: string | null = null;

  // ...existing list()/get()/first()/upsert()/rename()/delete()/sortedRows() unchanged...

  async getActive(): Promise<RegistryRow | null> {
    if (!this.activePresetId) return null;
    return this.get(this.activePresetId);
  }

  async setActive(presetId: string): Promise<void> {
    this.activePresetId = presetId;
  }
}
```

- [ ] **Step 6: Implement in `SupabaseRegistryStore`**

In `src/lib/store/supabase.ts`, add two methods to `SupabaseRegistryStore` (after the existing `rename`/`delete` methods), following the same missing-column fallback pattern as `upsert`:

```typescript
  async getActive(): Promise<RegistryRow | null> {
    const { data, error } = await this.client.from("registries").select("*").eq("is_active", true).maybeSingle();
    if (error) {
      const isColErr = error.message?.includes("column") && error.message?.includes("does not exist");
      if (isColErr) return null; // migration not applied yet — no active-flag concept exists there yet
      throw error;
    }
    return data ? toRegistryRow(data) : null;
  }

  async setActive(presetId: string): Promise<void> {
    const { error: clearError } = await this.client.from("registries").update({ is_active: false }).neq("client_id", presetId);
    if (clearError) {
      const isColErr = clearError.message?.includes("column") && clearError.message?.includes("does not exist");
      if (isColErr) return; // migration not applied yet — setActive is a no-op until it lands
      throw clearError;
    }
    const { error: setError } = await this.client.from("registries").update({ is_active: true }).eq("client_id", presetId);
    if (setError) throw setError;
  }
```

- [ ] **Step 7: Run test to verify it passes**

Run: `npx jest src/__tests__/registry-store-active.test.ts`
Expected: PASS (3/3)

- [ ] **Step 8: Commit**

```bash
git add supabase/migrations/20260712_registry_is_active.sql src/lib/store/types.ts src/lib/store/memory.ts src/lib/store/supabase.ts src/__tests__/registry-store-active.test.ts
git commit -m "feat: add is_active flag to registries (RegistryStore.getActive/setActive)"
```

---

### Task 2: `getActiveRegistryRow()` — the single active-preset resolver

**Files:**
- Modify: `src/lib/store/index.ts`
- Test: `src/lib/store/__tests__/active-registry-row.test.ts`

**Interfaces:**
- Consumes: `RegistryStore.getActive()`/`first()`/`list()` (Task 1).
- Produces: `getActiveRegistryRow(): Promise<RegistryRow | null>`, exported from `@/lib/store` alongside `getStores()`. Returns `null` **only** when zero presets exist at all; every caller in Tasks 3–5/8 falls back to `DISPOSAFE_REGISTRY`'s bootstrap shape in that one case, exactly as today.

- [ ] **Step 1: Write the failing test**

```typescript
// src/lib/store/__tests__/active-registry-row.test.ts
process.env.MOID_STORE = "memory";

import { getActiveRegistryRow, getStores } from "../index";
import type { RegistryRow } from "../types";

const row = (presetId: string): RegistryRow => ({
  presetId, name: presetId, createdFromFilename: null, registryVersion: "1.0.0",
  fiscalYearStartMonth: 4, stages: [], defects: [], sizes: [], stageAliases: {},
});

describe("getActiveRegistryRow", () => {
  beforeEach(() => {
    delete (globalThis as any).__moidStores;
  });

  it("returns null when zero presets exist", async () => {
    expect(await getActiveRegistryRow()).toBeNull();
  });

  it("falls back to the oldest preset when none is explicitly active", async () => {
    const { registries } = getStores();
    await registries.upsert(row("first"));
    await registries.upsert(row("second"));
    const active = await getActiveRegistryRow();
    expect(active?.presetId).toBe("first");
  });

  it("prefers the explicitly-flagged active preset over the oldest one", async () => {
    const { registries } = getStores();
    await registries.upsert(row("first"));
    await registries.upsert(row("second"));
    await registries.setActive("second");
    const active = await getActiveRegistryRow();
    expect(active?.presetId).toBe("second");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest src/lib/store/__tests__/active-registry-row.test.ts`
Expected: FAIL — `getActiveRegistryRow` is not exported from `../index` yet.

- [ ] **Step 3: Implement the helper**

In `src/lib/store/index.ts`, add (after `getStores()`, before the `seedFromDisk` import block):

```typescript
import type { RegistryRow } from "./types";

/** The single source of truth for "which registry preset is active" — every
 *  caller that used to guess (registries.first(), a hardcoded "disposafe"
 *  literal, or a raw Supabase bypass) should call this instead. Returns null
 *  ONLY when zero presets exist at all (a fresh install); callers fall back
 *  to DISPOSAFE_REGISTRY's bootstrap shape in that case, same as today. When
 *  presets exist but none has ever been explicitly activated, the oldest one
 *  wins (registries.first()) — that preserves every existing single-preset
 *  deployment's behavior unchanged. */
export async function getActiveRegistryRow(): Promise<RegistryRow | null> {
  const { registries } = getStores();
  const rows = await registries.list();
  if (rows.length === 0) return null;
  return (await registries.getActive()) ?? (await registries.first());
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest src/lib/store/__tests__/active-registry-row.test.ts`
Expected: PASS (3/3)

- [ ] **Step 5: Commit**

```bash
git add src/lib/store/index.ts src/lib/store/__tests__/active-registry-row.test.ts
git commit -m "feat: add getActiveRegistryRow() as the single active-preset resolver"
```

---

### Task 3: `/api/schema` — resolve the active preset, never wipe learned aliases

**Files:**
- Modify: `src/app/api/schema/route.ts`
- Test: extend `src/app/api/schema/__tests__/route.test.ts`

**Interfaces:**
- Consumes: `getActiveRegistryRow()` (Task 2).
- Produces: `GET /api/schema` (no `presetId`) now returns the active preset, not the oldest one; `POST /api/schema` (merge into an existing `presetId`) preserves that preset's existing `stageAliases` instead of overwriting with `{}`.

- [ ] **Step 1: Write the failing tests**

Append to `src/app/api/schema/__tests__/route.test.ts` (inside the existing `describe("/api/schema (memory store — no Supabase configured)", ...)` block, its `beforeEach` already resets `globalThis.__moidStores`):

```typescript
  it("POST with an existing presetId preserves previously-learned stageAliases (regression: must not wipe them)", async () => {
    await POST(post({ schema: sampleSchema, name: "Alias Keeper" }));
    const { getStores } = await import("@/lib/store");
    const { registries } = getStores();
    const existing = (await registries.get("alias-keeper"))!;
    await registries.upsert({
      ...existing,
      stageAliases: { "visual qc": { stageId: "visual", confidence: 1, basis: "alias", learnedAt: "2026-07-10T00:00:00.000Z" } },
    });
    await POST(post({ schema: sampleSchema, presetId: "alias-keeper" }));
    const row = await registries.get("alias-keeper");
    expect(row?.stageAliases["visual qc"]).toEqual({
      stageId: "visual", confidence: 1, basis: "alias", learnedAt: "2026-07-10T00:00:00.000Z",
    });
  });

  it("GET with no presetId prefers the explicitly-activated preset over the oldest one", async () => {
    await POST(post({ schema: sampleSchema, name: "First Created" }));
    await POST(post({ schema: sampleSchema, name: "Second Created" }));
    const { getStores } = await import("@/lib/store");
    const { registries } = getStores();
    await registries.setActive("second-created");
    const res = await GET(get());
    const json = await res.json();
    expect(json.registry.presetId).toBe("second-created");
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx jest src/app/api/schema/__tests__/route.test.ts`
Expected: FAIL — the alias-preservation test fails because POST always writes `stageAliases: {}`; the active-preset test fails because GET still returns `"first-created"` (the existing `"two presets... returns the FIRST one created"` test already documents this — that test's own assertion stays correct and unchanged, since it never calls `setActive`).

- [ ] **Step 3: Fix the GET handler**

In `src/app/api/schema/route.ts`, add `getActiveRegistryRow` to the existing `@/lib/store` import:

```typescript
import { getStores, getActiveRegistryRow } from "@/lib/store";
```

Change the line (currently `const matchedRow = presetId ? await registries.get(presetId) : await registries.first();`):

```typescript
    const matchedRow = presetId ? await registries.get(presetId) : await getActiveRegistryRow();
```

- [ ] **Step 4: Fix the POST handler**

In `src/app/api/schema/route.ts`, replace the block that resolves `presetId` and upserts (currently ends with `stageAliases: {}`):

```typescript
    let presetId = requestedPresetId;
    if (!presetId) {
      const base = slugify(name!) || "preset";
      presetId = base;
      let suffix = 1;
      while (await registries.get(presetId)) {
        presetId = `${base}-${++suffix}`;
      }
    }

    const existing = await registries.get(presetId);

    await registries.upsert({
      presetId,
      name: name || existing?.name || presetId,
      createdFromFilename: createdFromFilename || existing?.createdFromFilename || null,
      registryVersion: "1.0.0",
      fiscalYearStartMonth: existing?.fiscalYearStartMonth ?? 4,
      stages,
      defects,
      sizes,
      // Preserve previously-learned aliases — this upsert only replaces the
      // schema shape (stages/defects/sizes), never the company's learned
      // sheet-name -> stage mappings.
      stageAliases: existing?.stageAliases ?? {},
    });
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx jest src/app/api/schema/__tests__/route.test.ts`
Expected: PASS, including the 2 new tests and all pre-existing ones (in particular, the pre-existing `"two presets: GET with no presetId returns the FIRST one created"` test must still pass — it never calls `setActive`, so `getActiveRegistryRow()` still falls back to `first()` exactly as before).

- [ ] **Step 6: Commit**

```bash
git add src/app/api/schema/route.ts src/app/api/schema/__tests__/route.test.ts
git commit -m "fix: /api/schema uses the active-preset resolver and never wipes learned aliases"
```

---

### Task 4: Clear Schema resets to empty, not to `DISPOSAFE_REGISTRY`

**Files:**
- Modify: `src/app/api/clear-schema/route.ts`
- Test: `src/app/api/clear-schema/__tests__/route.test.ts` (new)

**Interfaces:**
- Consumes: `getActiveRegistryRow()` (Task 2).
- Produces: `POST /api/clear-schema` (unchanged contract) now resets the targeted preset's `stages`/`defects`/`sizes` to `[]`; with no `?presetId=`, resolves the active preset instead of a hardcoded `"disposafe"` literal; preserves `stageAliases`.

- [ ] **Step 1: Write the failing test**

```typescript
// src/app/api/clear-schema/__tests__/route.test.ts
process.env.MOID_STORE = "memory";

import { POST as clearSchema } from "../route";
import { NextRequest } from "next/server";
import { getStores } from "@/lib/store";

function post(qs = "") {
  return new NextRequest(`http://localhost/api/clear-schema${qs}`, { method: "POST" });
}

describe("POST /api/clear-schema", () => {
  beforeEach(() => {
    delete (globalThis as any).__moidStores;
  });

  it("resets the targeted preset's stages/defects/sizes to empty, not DISPOSAFE_REGISTRY's values", async () => {
    const { registries } = getStores();
    await registries.upsert({
      presetId: "acme", name: "Acme", createdFromFilename: null, registryVersion: "1.0.0",
      fiscalYearStartMonth: 4,
      stages: [{ stageId: "visual", label: "Visual", fields: [] }],
      defects: [{ defectCode: "COAG", label: "Coagulum" }],
      sizes: [{ sizeId: "Fr8", label: "8 FR" }],
      stageAliases: {},
    });
    const res = await clearSchema(post("?presetId=acme"));
    expect(res.status).toBe(200);
    const row = await registries.get("acme");
    expect(row?.stages).toEqual([]);
    expect(row?.defects).toEqual([]);
    expect(row?.sizes).toEqual([]);
  });

  it("preserves learned stageAliases when clearing", async () => {
    const { registries } = getStores();
    await registries.upsert({
      presetId: "acme", name: "Acme", createdFromFilename: null, registryVersion: "1.0.0",
      fiscalYearStartMonth: 4, stages: [], defects: [], sizes: [],
      stageAliases: { "visual qc": { stageId: "visual", confidence: 1, basis: "alias", learnedAt: "2026-07-10T00:00:00.000Z" } },
    });
    await clearSchema(post("?presetId=acme"));
    const row = await registries.get("acme");
    expect(row?.stageAliases["visual qc"]).toBeDefined();
  });

  it("with no presetId given, clears the active preset (not a hardcoded 'disposafe')", async () => {
    const { registries } = getStores();
    await registries.upsert({
      presetId: "realplant", name: "Real Plant", createdFromFilename: null, registryVersion: "1.0.0",
      fiscalYearStartMonth: 4, stages: [{ stageId: "x", label: "X", fields: [] }], defects: [], sizes: [],
      stageAliases: {},
    });
    await registries.setActive("realplant");
    const res = await clearSchema(post());
    expect(res.status).toBe(200);
    const row = await registries.get("realplant");
    expect(row?.stages).toEqual([]);
  });

  it("with no presetId and no active preset flagged yet, bootstraps a new empty 'default' preset", async () => {
    const res = await clearSchema(post());
    expect(res.status).toBe(200);
    const { registries } = getStores();
    const row = await registries.get("default");
    expect(row?.stages).toEqual([]);
    const active = await registries.getActive();
    expect(active?.presetId).toBe("default");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest src/app/api/clear-schema/__tests__/route.test.ts`
Expected: FAIL — the current route resets to `DISPOSAFE_REGISTRY`'s values and hardcodes `"disposafe"`.

- [ ] **Step 3: Rewrite the route**

Replace the full contents of `src/app/api/clear-schema/route.ts`:

```typescript
// src/app/api/clear-schema/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getStores, getActiveRegistryRow } from "@/lib/store";

export async function POST(req: NextRequest) {
  try {
    const { registries } = getStores();
    let presetId = req.nextUrl.searchParams.get("presetId");
    if (!presetId) {
      const active = await getActiveRegistryRow();
      presetId = active?.presetId ?? "default";
    }

    const existing = await registries.get(presetId);

    // Reset only the targeted preset's stages/defects/sizes to genuinely
    // empty — clearing schema must not repopulate DISPOSAFE_REGISTRY's
    // hardcoded stage list, or the dashboard can never actually go blank
    // for a fresh plant. Learned aliases are preserved (clearing the schema
    // shape isn't the same as forgetting what a company already taught us).
    await registries.upsert({
      presetId,
      name: existing?.name ?? presetId,
      createdFromFilename: existing?.createdFromFilename ?? null,
      registryVersion: existing?.registryVersion ?? "1.0.0",
      fiscalYearStartMonth: existing?.fiscalYearStartMonth ?? 4,
      stages: [],
      defects: [],
      sizes: [],
      stageAliases: existing?.stageAliases ?? {},
    });
    if (!existing) await registries.setActive(presetId);

    return NextResponse.json({
      success: true,
      cleared: true,
      registry: { presetId, stages: [], defects: [], sizes: [] },
    });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? "Failed to clear schema registry" }, { status: 500 });
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest src/app/api/clear-schema/__tests__/route.test.ts`
Expected: PASS (4/4)

- [ ] **Step 5: Commit**

```bash
git add src/app/api/clear-schema/route.ts src/app/api/clear-schema/__tests__/route.test.ts
git commit -m "fix: clear-schema resets to empty, resolves the active preset instead of hardcoding 'disposafe'"
```

---

### Task 5: `/api/ingest` resolves the registry via `getStores()`, not a raw Supabase bypass

**Files:**
- Modify: `src/app/api/ingest/route.ts`
- Test: `src/app/api/ingest/__tests__/registry-resolution.test.ts` (new)

**Interfaces:**
- Consumes: `getActiveRegistryRow()` (Task 2), `getStores()` (existing).
- Produces: no change to `/api/ingest`'s request/response contract — only how the route resolves `activeRegistry` before calling `emitMany` changes. This now works identically in memory-store and Supabase modes (previously, the raw Supabase call always no-op'd in memory-store mode).

- [ ] **Step 1: Write the failing test**

This test proves the fix by checking a real, observable side effect: a defect alias defined ONLY in a custom preset's `defects` list resolves correctly when that preset is used — which is impossible today in memory-store mode, since the raw Supabase call always fails silently there.

```typescript
// src/app/api/ingest/__tests__/registry-resolution.test.ts
process.env.MOID_STORE = "memory";

import { POST } from "../route";
import { NextRequest } from "next/server";
import { getStores } from "@/lib/store";

function post(body: unknown) {
  return new NextRequest("http://localhost/api/ingest", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
}

describe("POST /api/ingest resolves defects against the correct registry", () => {
  beforeEach(() => {
    delete (globalThis as any).__moidStores;
  });

  it("resolves a defect alias defined only in the given presetId's custom registry, not DISPOSAFE_REGISTRY", async () => {
    const { registries, events } = getStores();
    await registries.upsert({
      presetId: "acme", name: "Acme", createdFromFilename: null, registryVersion: "1.0.0",
      fiscalYearStartMonth: 4,
      stages: [{ stageId: "visual", label: "Visual", fields: [] }],
      defects: [{ defectCode: "XYZ", label: "Custom Defect", aliases: ["FOOBAR"], stages: ["visual"] }],
      sizes: [],
      stageAliases: {},
    });

    const res = await POST(post({
      ingestionId: "ing-active-registry-test",
      fileName: "test.xlsx",
      presetId: "acme",
      records: [{
        occurredOn: { kind: "day", start: "2026-07-11", end: "2026-07-11" },
        stageId: "visual",
        source: { file: "test.xlsx", fileHash: "h1", sheet: "VISUAL", tableId: "t1" },
        checked: { value: 100, cell: "B2", header: "CHECKED" },
        acceptedGood: null,
        rework: null,
        rejected: { value: 10, cell: "D2", header: "REJECTED" },
        defects: [{ raw: "FOOBAR", value: 10, cell: "E2" }],
        statedPct: null,
        extractedBy: "heuristic",
        ingestionId: "ing-active-registry-test",
      }],
    }));
    expect(res.status).toBe(200);

    const stored = await events.effective({ from: "2026-07-11", to: "2026-07-11" });
    const rejection = stored.find((e: any) => e.eventType === "rejection");
    expect(rejection).toBeDefined();
    // Proves the "acme" registry was actually consulted — DISPOSAFE_REGISTRY
    // has no "FOOBAR" alias, so without the fix this would be null.
    expect((rejection as any).defectCode).toBe("XYZ");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest src/app/api/ingest/__tests__/registry-resolution.test.ts`
Expected: FAIL — `defectCode` is `null`, because the raw Supabase bypass always no-ops in memory-store mode, so `emitMany` runs with `activeRegistry: undefined` (→ `DISPOSAFE_REGISTRY`, which has no `"FOOBAR"` alias).

- [ ] **Step 3: Fix the registry-resolution block**

In `src/app/api/ingest/route.ts`, add `getActiveRegistryRow` to the existing `@/lib/store` import (keep `createServerClient` imported — it's still used by the earlier `isDirectEntry` block in this same file):

```typescript
import { getStores, shouldUseSupabase, getActiveRegistryRow } from "@/lib/store";
```

Replace the block (currently starts with `// 2. Emit canonical events and append (idempotent on content hash).` and does a raw `createServerClient().from("registries")...` query):

```typescript
    // 2. Emit canonical events and append (idempotent on content hash).
    let activeRegistry = undefined;
    try {
      const { registries } = getStores();
      const targetPresetId = body.presetId || (await getActiveRegistryRow())?.presetId;
      const regRow = targetPresetId ? await registries.get(targetPresetId) : null;
      if (regRow) {
        activeRegistry = {
          clientId: regRow.presetId,
          registryVersion: regRow.registryVersion,
          fiscalYearStartMonth: regRow.fiscalYearStartMonth,
          stages: regRow.stages,
          defects: regRow.defects,
          sizes: regRow.sizes || [],
          // Not modeled on RegistryRow (no write path in this codebase ever
          // sets it) — always null, matching DISPOSAFE_REGISTRY's own
          // costConfig default.
          costConfig: null,
        };
      }
    } catch (err) {
      console.warn("Could not fetch active registry (non-fatal, falling back to static default):", err);
    }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest src/app/api/ingest/__tests__/registry-resolution.test.ts`
Expected: PASS (1/1)

- [ ] **Step 5: Run the existing emit regression test**

Run: `npx jest src/__tests__/ingest-emit.test.ts`
Expected: PASS, unchanged — `emit.ts`'s own logic was not touched, only what `/api/ingest` passes into it.

- [ ] **Step 6: Commit**

```bash
git add src/app/api/ingest/route.ts src/app/api/ingest/__tests__/registry-resolution.test.ts
git commit -m "fix: /api/ingest resolves the registry via getStores(), not a raw Supabase-only bypass"
```

---

### Task 6: Alias-aware grouping key in `groupIntoDatasets`

**Files:**
- Modify: `src/lib/dataset/registry.ts`
- Test: extend `src/lib/dataset/__tests__/registry.test.ts`

**Interfaces:**
- Consumes: `normalizeAliasKey` (already exported from `src/lib/dataset/recognize.ts`).
- Produces: `groupIntoDatasets`'s grouping key now reflects a learned alias immediately, not just the post-grouping `recognitionConfidence`/`recognitionBasis` fields. No signature change.

- [ ] **Step 1: Write the failing test**

Append to `src/lib/dataset/__tests__/registry.test.ts` (it already imports `normalizeAliasKey` from `../recognize` and `StageAlias` from `@/lib/store/types`, and has an `input(fileName, sheetName, hash, rowCount)` helper — reuse it verbatim):

```typescript
  it("splits two same-signature sheets into separate datasets when they alias to different stages", () => {
    const aliases: Record<string, StageAlias> = {
      [normalizeAliasKey("16FR")]: { stageId: "custom-a", confidence: 1, basis: "alias", learnedAt: "2026-07-10T00:00:00.000Z" },
      [normalizeAliasKey("18FR")]: { stageId: "custom-b", confidence: 1, basis: "alias", learnedAt: "2026-07-10T00:00:00.000Z" },
    };
    const ds = groupIntoDatasets([
      input("x.xlsx", "16FR", "hhhh"),
      input("x.xlsx", "18FR", "hhhh"),
    ], aliases);
    expect(ds).toHaveLength(2);
    const ids = ds.map((d) => d.recognizedStageId).sort();
    expect(ids).toEqual(["custom-a", "custom-b"]);
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest src/lib/dataset/__tests__/registry.test.ts`
Expected: FAIL — both sheets currently collapse into ONE dataset (regex finds nothing for either, so both get grouping-key `stage: null` and merge).

- [ ] **Step 3: Make the grouping key alias-aware**

In `src/lib/dataset/registry.ts`, change the import line:

```typescript
import { recognizeSheetStage, recognizeStageScored, normalizeAliasKey } from "./recognize";
```

Change the per-input loop (currently `const stage = recognizeSheetStage(inp.fileName, inp.sheetName);`):

```typescript
  for (const inp of inputs) {
    const hash = inp.signature.hash;
    const basis = basisKey(inp.signature.columns);
    // Alias-aware grouping: a learned alias (sheet name, then file name — same
    // precedence recognizeStageScored already uses) determines the grouping
    // key, not just the post-grouping confidence score. With an empty
    // stageAliases (the default), this agrees with the plain regex fallback
    // for every pre-existing group — see the Task 8 regression guard.
    const alias = stageAliases[normalizeAliasKey(inp.sheetName)] ?? stageAliases[normalizeAliasKey(inp.fileName)];
    const stage = alias ? alias.stageId : recognizeSheetStage(inp.fileName, inp.sheetName);
    const key = `${hash}::${basis}::${stage ?? ""}`;
    let entry = byKey.get(key);
    if (!entry) {
      entry = { hash, basis, stage, group: [] };
      byKey.set(key, entry);
    }
    entry.group.push(inp);
  }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx jest src/lib/dataset/__tests__/registry.test.ts`
Expected: PASS, including the new test and all pre-existing ones.

- [ ] **Step 5: Run the full dataset regression suite**

Run: `npx jest src/lib/dataset`
Expected: PASS across all files — in particular, the Task 8 regression guard (`"recognizes identical stages with an empty alias table as before this change"` in `src/lib/dataset/__tests__/recognize.test.ts`) must still pass unchanged, since an empty `stageAliases` makes the new alias lookup a no-op.

- [ ] **Step 6: Commit**

```bash
git add src/lib/dataset/registry.ts src/lib/dataset/__tests__/registry.test.ts
git commit -m "feat: make groupIntoDatasets's grouping key alias-aware, not just post-grouping confidence"
```

---

### Task 7: `StageConfirmPicker` — confirm an existing stage or create a new one

**Files:**
- Create: `src/components/app/StageConfirmPicker.tsx`
- Test: `src/components/app/__tests__/StageConfirmPicker.test.tsx`
- Modify: `src/components/app/GenericDashboardBody.tsx`
- Test: extend `src/components/app/__tests__/GenericDashboardBody.test.tsx`
- Modify: `src/components/app/GenericDatasetView.tsx`

**Interfaces:**
- Produces: `StageConfirmPicker({ datasetId, defaultStageId, knownStages, onConfirm })` — a small, isolated component. Calls `onConfirm(datasetId, stageId)` with either an existing `knownStages[].stageId` or the raw text the user typed for a brand-new stage (the caller, Task 8, decides which case it is).
- Produces: `GenericDashboardBody` gains an optional `knownStages?: { stageId: string; label: string }[]` prop. When omitted or empty, the badge's Confirm control is **unchanged** from today (plain button, confirms `dataset.recognizedStageId`) — this is the backward-compatibility contract Task 5's original tests already lock in. When provided, it renders `StageConfirmPicker` instead.
- Consumes (Task 8): `workbooks/page.tsx` passes `knownStages` (derived from the active registry's `stages`) into `GenericDashboardBody` via `SheetDashboard`/`FileDashboard`.

- [ ] **Step 1: Write the failing test for `StageConfirmPicker`**

```tsx
// src/components/app/__tests__/StageConfirmPicker.test.tsx
import { render, screen, fireEvent } from "@testing-library/react";
import StageConfirmPicker from "../StageConfirmPicker";

const knownStages = [
  { stageId: "visual", label: "Visual Inspection" },
  { stageId: "final", label: "Final Inspection" },
];

describe("StageConfirmPicker", () => {
  it("defaults to the guessed stage and confirms it unchanged", () => {
    const onConfirm = jest.fn();
    render(<StageConfirmPicker datasetId="ds1" defaultStageId="visual" knownStages={knownStages} onConfirm={onConfirm} />);
    fireEvent.click(screen.getByRole("button", { name: /confirm/i }));
    expect(onConfirm).toHaveBeenCalledWith("ds1", "visual");
  });

  it("lets the user pick a different known stage", () => {
    const onConfirm = jest.fn();
    render(<StageConfirmPicker datasetId="ds1" defaultStageId="visual" knownStages={knownStages} onConfirm={onConfirm} />);
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "final" } });
    fireEvent.click(screen.getByRole("button", { name: /confirm/i }));
    expect(onConfirm).toHaveBeenCalledWith("ds1", "final");
  });

  it("reveals a text input for '+ New stage…' and confirms the typed label", () => {
    const onConfirm = jest.fn();
    render(<StageConfirmPicker datasetId="ds1" defaultStageId="unrecognized-guess" knownStages={knownStages} onConfirm={onConfirm} />);
    fireEvent.change(screen.getByPlaceholderText(/new stage name/i), { target: { value: "Cutting" } });
    fireEvent.click(screen.getByRole("button", { name: /confirm/i }));
    expect(onConfirm).toHaveBeenCalledWith("ds1", "Cutting");
  });

  it("disables Confirm when '+ New stage…' is selected but nothing is typed", () => {
    const onConfirm = jest.fn();
    render(<StageConfirmPicker datasetId="ds1" defaultStageId="unrecognized-guess" knownStages={knownStages} onConfirm={onConfirm} />);
    expect(screen.getByRole("button", { name: /confirm/i })).toBeDisabled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest src/components/app/__tests__/StageConfirmPicker.test.tsx`
Expected: FAIL — `../StageConfirmPicker` doesn't exist yet.

- [ ] **Step 3: Implement `StageConfirmPicker`**

```tsx
// src/components/app/StageConfirmPicker.tsx
"use client";

import { useState } from "react";

const NEW_STAGE_SENTINEL = "__new__";

/** The "needs review" badge's Confirm control: choose one of the active
 *  registry's known stages, or type a brand-new one. Calls onConfirm with
 *  either an existing stageId or the raw typed label — the caller (Task 8's
 *  confirmStageAlias) decides which case it is and acts accordingly. */
export default function StageConfirmPicker({
  datasetId,
  defaultStageId,
  knownStages,
  onConfirm,
}: {
  datasetId: string;
  defaultStageId: string;
  knownStages: { stageId: string; label: string }[];
  onConfirm: (datasetId: string, stageId: string) => void;
}) {
  const [selected, setSelected] = useState(
    knownStages.some((s) => s.stageId === defaultStageId) ? defaultStageId : NEW_STAGE_SENTINEL,
  );
  const [newLabel, setNewLabel] = useState("");

  const isNew = selected === NEW_STAGE_SENTINEL;

  function submit() {
    const value = isNew ? newLabel.trim() : selected;
    if (!value) return;
    onConfirm(datasetId, value);
  }

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
      <select
        value={selected}
        onChange={(e) => setSelected(e.target.value)}
        style={{
          fontFamily: "var(--font-sans)", fontSize: 12, padding: "4px 8px",
          borderRadius: "var(--radius-sm)", border: "1px solid var(--border-strong)",
          background: "var(--paper)", color: "var(--text)",
        }}
      >
        {knownStages.map((s) => (
          <option key={s.stageId} value={s.stageId}>{s.label}</option>
        ))}
        <option value={NEW_STAGE_SENTINEL}>+ New stage…</option>
      </select>
      {isNew && (
        <input
          type="text"
          value={newLabel}
          onChange={(e) => setNewLabel(e.target.value)}
          placeholder="New stage name"
          style={{
            fontFamily: "var(--font-sans)", fontSize: 12, padding: "4px 8px",
            borderRadius: "var(--radius-sm)", border: "1px solid var(--border-strong)",
            background: "var(--paper)", color: "var(--text)",
          }}
        />
      )}
      <button
        type="button"
        onClick={submit}
        disabled={isNew && !newLabel.trim()}
        style={{
          fontFamily: "var(--font-sans)", fontWeight: 700, fontSize: 12,
          cursor: isNew && !newLabel.trim() ? "not-allowed" : "pointer",
          color: "var(--paper)", background: "var(--accent)",
          border: "none", padding: "6px 14px", borderRadius: "var(--radius-sm)",
          opacity: isNew && !newLabel.trim() ? 0.5 : 1,
        }}
      >
        Confirm
      </button>
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest src/components/app/__tests__/StageConfirmPicker.test.tsx`
Expected: PASS (4/4)

- [ ] **Step 5: Write the failing test for `GenericDashboardBody`'s new prop**

Append to `src/components/app/__tests__/GenericDashboardBody.test.tsx` (it already has `baseDataset`/`emptyDashboard` fixtures from the prior plan — reuse them):

```tsx
  it("renders StageConfirmPicker instead of the plain button when knownStages is provided", () => {
    const knownStages = [{ stageId: "visual", label: "Visual Inspection" }, { stageId: "final", label: "Final Inspection" }];
    render(<GenericDashboardBody d={emptyDashboard} dataset={baseDataset} rows={[]} onConfirmStage={jest.fn()} knownStages={knownStages} />);
    expect(screen.getByRole("combobox")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^confirm$/i })).toBeInTheDocument(); // the picker's own Confirm button
  });

  it("falls back to the plain Confirm button when knownStages is omitted (backward compatible)", () => {
    render(<GenericDashboardBody d={emptyDashboard} dataset={baseDataset} rows={[]} onConfirmStage={jest.fn()} />);
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /confirm/i })).toBeInTheDocument();
  });
```

- [ ] **Step 6: Run test to verify it fails**

Run: `npx jest src/components/app/__tests__/GenericDashboardBody.test.tsx`
Expected: FAIL — `knownStages` prop doesn't exist yet; the first new test's `combobox` query finds nothing.

- [ ] **Step 7: Wire `StageConfirmPicker` into `GenericDashboardBody`**

In `src/components/app/GenericDashboardBody.tsx`, add the import:

```typescript
import StageConfirmPicker from "@/components/app/StageConfirmPicker";
```

Add `knownStages` to the props destructure and type (currently `{ d, caption, publishBanner, dataset, rows, onConfirmStage }`):

```typescript
export default function GenericDashboardBody({
  d,
  caption,
  publishBanner,
  dataset,
  rows,
  onConfirmStage,
  knownStages,
}: {
  d: GenericDashboard;
  caption?: string;
  publishBanner?: PublishBannerProps;
  dataset?: Dataset;
  rows?: DatasetRow[];
  onConfirmStage?: (datasetId: string, stageId: string) => void;
  knownStages?: { stageId: string; label: string }[];
}) {
```

Replace the badge's Confirm block (currently `{onConfirmStage && (<button ...>Confirm</button>)}`):

```tsx
          {onConfirmStage && knownStages && knownStages.length > 0 ? (
            <StageConfirmPicker
              key={dataset.id}
              datasetId={dataset.id}
              defaultStageId={dataset.recognizedStageId!}
              knownStages={knownStages}
              onConfirm={onConfirmStage}
            />
          ) : onConfirmStage && (
            <button
              type="button"
              onClick={() => onConfirmStage(dataset.id, dataset.recognizedStageId!)}
              style={{
                fontFamily: "var(--font-sans)", fontWeight: 700, fontSize: 12,
                cursor: "pointer", color: "var(--paper)", background: "var(--accent)",
                border: "none", padding: "6px 14px", borderRadius: "var(--radius-sm)",
              }}
            >
              Confirm
            </button>
          )}
```

- [ ] **Step 8: Run tests to verify they pass**

Run: `npx jest src/components/app/__tests__/GenericDashboardBody.test.tsx`
Expected: PASS (6/6 — the 4 pre-existing tests plus the 2 new ones).

- [ ] **Step 9: Thread `knownStages` through `GenericDatasetView`**

In `src/components/app/GenericDatasetView.tsx`, add `knownStages` to its own props (mirroring how it already threads `onConfirmStage`) and pass it straight through to `GenericDashboardBody`:

```typescript
export default function GenericDatasetView({
  datasetId,
  onConfirmStage,
  knownStages,
}: {
  datasetId: string;
  onConfirmStage?: (datasetId: string, stageId: string) => void;
  knownStages?: { stageId: string; label: string }[];
}) {
```

```tsx
    <GenericDashboardBody
      d={d}
      dataset={dataset}
      rows={rows}
      onConfirmStage={onConfirmStage}
      knownStages={knownStages}
      publishBanner={
```

- [ ] **Step 10: Run the full component suite as a regression check**

Run: `npx jest src/components/app/__tests__`
Expected: PASS, no regressions.

- [ ] **Step 11: Commit**

```bash
git add src/components/app/StageConfirmPicker.tsx src/components/app/__tests__/StageConfirmPicker.test.tsx src/components/app/GenericDashboardBody.tsx src/components/app/__tests__/GenericDashboardBody.test.tsx src/components/app/GenericDatasetView.tsx
git commit -m "feat: StageConfirmPicker lets the needs-review badge create a new stage, not just confirm a guess"
```

---

### Task 8: Wire Workbooks off the real active preset + new-stage creation

**Files:**
- Create: `src/lib/dataset/confirm-stage.ts`
- Test: `src/lib/dataset/__tests__/confirm-stage.test.ts`
- Modify: `src/app/workbooks/page.tsx`

**Interfaces:**
- Consumes: `useRegistry()` (existing `RegistryContext`), `StageConfirmPicker`'s `onConfirm` contract (Task 7), `/api/schema` POST (Task 3's fix — preserves `stageAliases`), `/api/registry-alias` POST (existing, unchanged).
- Produces: `resolveConfirmPresetId(registry): string` and `isNewStageLabel(stageIdOrLabel, knownStages): boolean` — small pure functions, exported from `src/lib/dataset/confirm-stage.ts`, independently testable without rendering the page.

- [ ] **Step 1: Write the failing test for the pure helpers**

```typescript
// src/lib/dataset/__tests__/confirm-stage.test.ts
import { resolveConfirmPresetId, isNewStageLabel } from "../confirm-stage";

describe("resolveConfirmPresetId", () => {
  it("uses the active registry's presetId", () => {
    expect(resolveConfirmPresetId({ presetId: "acme" })).toBe("acme");
  });

  it("falls back to clientId when presetId is absent", () => {
    expect(resolveConfirmPresetId({ clientId: "acme" })).toBe("acme");
  });

  it("falls back to 'default' when the registry is null (nothing configured yet)", () => {
    expect(resolveConfirmPresetId(null)).toBe("default");
  });
});

describe("isNewStageLabel", () => {
  const knownStages = [{ stageId: "visual" }, { stageId: "final" }];

  it("is false for an existing stageId", () => {
    expect(isNewStageLabel("visual", knownStages)).toBe(false);
  });

  it("is true for a label that matches no known stageId", () => {
    expect(isNewStageLabel("Cutting", knownStages)).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest src/lib/dataset/__tests__/confirm-stage.test.ts`
Expected: FAIL — `../confirm-stage` doesn't exist yet.

- [ ] **Step 3: Implement the pure helpers**

```typescript
// src/lib/dataset/confirm-stage.ts

/** Resolves which preset a stage confirmation (or new-stage creation) should
 *  write against — the active registry's own presetId, never a hardcoded
 *  literal. `activeRegistry` is the same loosely-typed object `useRegistry()`
 *  and `/api/schema` already pass around this codebase. */
export function resolveConfirmPresetId(
  activeRegistry: { presetId?: string | null; clientId?: string | null } | null,
): string {
  return activeRegistry?.presetId ?? activeRegistry?.clientId ?? "default";
}

/** True when the given value is a label the user just typed for a brand-new
 *  stage (not one of the active registry's existing stages). */
export function isNewStageLabel(
  stageIdOrLabel: string,
  knownStages: { stageId: string }[],
): boolean {
  return !knownStages.some((s) => s.stageId === stageIdOrLabel);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest src/lib/dataset/__tests__/confirm-stage.test.ts`
Expected: PASS (5/5)

- [ ] **Step 5: Wire `workbooks/page.tsx` off the real active preset**

Read the current imports at the top of `src/app/workbooks/page.tsx` (it already imports `DISPOSAFE_REGISTRY` from `@/lib/registry/disposafe`). Add:

```typescript
import { useRegistry } from "@/components/app/RegistryContext";
import { resolveConfirmPresetId, isNewStageLabel } from "@/lib/dataset/confirm-stage";
```

Inside the page component (alongside its other `useState`/hook calls, before `confirmStageAlias`), add:

```typescript
  const { registry, refreshRegistry } = useRegistry();
  const activeRegistry = registry || DISPOSAFE_REGISTRY;
  const knownStages = (activeRegistry.stages || []).map((s: any) => ({ stageId: s.stageId, label: s.label }));
```

- [ ] **Step 6: Rewrite `confirmStageAlias`**

Replace the current `confirmStageAlias` function entirely:

```typescript
  async function confirmStageAlias(datasetId: string, stageIdOrLabel: string) {
    const dataset = datasets?.find((d) => d.id === datasetId);
    if (!dataset || dataset.sources.length === 0) return;

    const presetId = resolveConfirmPresetId(activeRegistry);
    let stageId = stageIdOrLabel;

    if (isNewStageLabel(stageIdOrLabel, activeRegistry.stages || [])) {
      // Brand-new stage: append it to the active preset's stages before
      // persisting the alias. Passing defects/sizes through explicitly is
      // required — /api/schema's POST falls back to DISPOSAFE_REGISTRY's
      // values for whichever of those two arrays is omitted.
      const res = await fetch("/api/schema", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          presetId,
          registry: {
            stages: [...(activeRegistry.stages || []), { label: stageIdOrLabel }],
            defects: activeRegistry.defects,
            sizes: activeRegistry.sizes,
          },
        }),
      });
      if (!res.ok) return;
      const data = await res.json();
      const created = data.registry.stages.find((s: any) => s.label === stageIdOrLabel);
      if (!created) return;
      stageId = created.stageId;
      refreshRegistry();
    }

    await fetch("/api/registry-alias", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        presetId,
        sheetName: dataset.sources[0].sheetName,
        stageId,
      }),
    });
    // ponytail: don't locally fake recognitionConfidence to 1 here — the alias
    // is saved to the registry, but nothing on this upload path re-reads
    // stageAliases into groupIntoDatasets until the NEXT upload/classification
    // pass. The badge/button honestly stay as-is until then.
  }
```

- [ ] **Step 7: Thread `knownStages` into `SheetDashboard`/`FileDashboard`**

Read `SheetDashboard`'s and `FileDashboard`'s current prop lists in `workbooks/page.tsx` (both already accept `onConfirmStage: (datasetId: string, stageId: string) => void`). Add `knownStages: { stageId: string; label: string }[]` to both, pass `knownStages={knownStages}` at their call sites, and pass `knownStages={knownStages}` into each of their own `<GenericDashboardBody ... />` calls, alongside the existing `onConfirmStage={onConfirmStage}`.

- [ ] **Step 8: Typecheck and run the full regression suite**

There is no new page-level render test for `workbooks/page.tsx` in this task — the decision logic it now calls (`resolveConfirmPresetId`, `isNewStageLabel`) is fully covered by Step 4's tests, and `StageConfirmPicker`/`GenericDashboardBody`'s rendering is covered by Task 7's tests. This step verifies the wiring compiles and nothing else breaks.

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: 0 errors.

Run: `npx jest`
Expected: same pass/fail shape as the end of Task 7 (no new failures) plus this task's 5 new `confirm-stage.test.ts` passes.

- [ ] **Step 9: Commit**

```bash
git add src/lib/dataset/confirm-stage.ts src/lib/dataset/__tests__/confirm-stage.test.ts src/app/workbooks/page.tsx
git commit -m "feat: wire Workbooks off the real active preset; confirm can create a new stage"
```

---

### Task 9: Full regression check

**Files:**
- None (verification only).

- [ ] **Step 1: Run the full test suite**

Run: `npx jest`
Expected: PASS across every suite touched by Tasks 1–8, plus the same pre-existing corpus-fixture-dependent failures this repo already has (missing `ANALYTICAL DATA/REJECTION ANALYSIS 2025-26` in a fresh worktree) — no NEW failures anywhere else.

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: 0 errors.

- [ ] **Step 3: Grep-verify no `"disposafe"` literal remains in any of the 4 originally-broken call sites**

Run: `grep -rn '"disposafe"' src/app/api/clear-schema/route.ts src/app/api/ingest/route.ts src/app/workbooks/page.tsx`
Expected: no matches (the only remaining `"disposafe"` literal in the codebase should be `src/lib/registry/disposafe.ts`'s own `clientId: "disposafe"` — the bootstrap default, which is correct and unchanged).

- [ ] **Step 4: Commit (only if Steps 1–3 required any fixes)**

If everything already passed, there's nothing to commit here — Tasks 1–8's commits are the deliverable. If a fix was needed, commit it with a message describing exactly what regression it closed.
