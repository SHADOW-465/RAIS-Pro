# Entity Resolution & Manufacturing Ontology (Company Alias Learning) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let dataset/stage recognition learn a company's own terminology (via a persisted, confidence-scored alias table) instead of only matching the hardcoded Disposafe sheet/file-name patterns, surfaced through the existing Staging/Workbooks UI — without touching the schema-extractor.ts → emit.ts → D1 ledger pipeline that feeds the main Cumulative quality dashboard.

**Architecture:** Extends the already-live Schema Profiler / Dataset Registry system (`src/lib/schema/`, `src/lib/dataset/`) approved in `docs/superpowers/specs/2026-07-01-universal-schema-ingestion-design.md`. Recognition (`recognizeStage`/`recognizeSheetStage` in `src/lib/dataset/recognize.ts`) gets a persisted alias lookup checked before its existing regex patterns, plus a numeric confidence score attached to every `Dataset`. Low confidence is surfaced as a simple UI flag — no Finding/Adjudication/RuleId involved for v1 (explicit decision: the D3 `RuleId` enum is frozen at 13 slots and this doesn't need it yet).

**Tech Stack:** Next.js 16 App Router, TypeScript, Zod, Supabase (Postgres), Jest.

## Global Constraints

- **Do not modify** `src/lib/ingest/schema-extractor.ts`, `src/lib/ingest/emit.ts`'s emission logic (`emitStageDay`/`emitMany`/`envelope`), or `src/app/api/ingest/route.ts`'s event-emission behavior. This is the pipeline feeding the main Cumulative quality dashboard (COPQ/SPC/FPY/Pareto in `src/app/page.tsx`) and must produce byte-identical output for existing data after this work lands.
- **Do not rename or restructure** `DISPOSAFE_REGISTRY`'s export shape in `src/lib/registry/disposafe.ts`. Five files import it directly (`src/lib/ingest/emit.ts`, `src/app/staging/page.tsx`, `src/app/workbooks/page.tsx`, `src/lib/dataset/recognize.ts`, `src/lib/dataset/registry.ts`) and all must keep working unmodified.
- All new persistence reuses the existing `registries` table (keyed by `client_id`, exposed as `presetId` in `RegistryRow`) — no new tables.
- `ConfidenceBasis` (from `src/lib/contract/d1.ts`) is the one shared confidence-source vocabulary in the codebase — extend it, do not create a parallel type.
- Test framework: Jest (`npx jest`). Follow existing colocated `__tests__/` convention.
- Every new Supabase write path follows the existing defensive "try full row, fall back to legacy shape on missing-column error" pattern already used in `SupabaseRegistryStore.upsert` (`src/lib/store/supabase.ts:393-418`), so this ships safely even before/during a rolling migration.

---

### Task 1: Extend `ConfidenceBasis` with alias/fuzzy, fix `emit.ts`'s duplicate type

**Files:**
- Modify: `src/lib/contract/d1.ts:57-72`
- Modify: `src/lib/ingest/emit.ts:27`
- Test: `src/__tests__/confidence-basis.test.ts`

**Interfaces:**
- Produces: `ConfidenceBasis` now accepts `"exact" | "heuristic" | "llm" | "external-cached" | "alias" | "fuzzy"`. `Confidence.refine()` additionally caps `fuzzy` at `<= 0.75`.
- Consumes (Task 3): `matchStageAlias()` will construct `{ score, basis: "alias" }` or `{ score, basis: "fuzzy" }` conforming to this schema.

- [ ] **Step 1: Write the failing test**

```typescript
// src/__tests__/confidence-basis.test.ts
import { Confidence } from "@/lib/contract/d1";

describe("Confidence basis extension", () => {
  it("accepts alias basis at high confidence", () => {
    const result = Confidence.safeParse({ score: 0.95, basis: "alias" });
    expect(result.success).toBe(true);
  });

  it("accepts fuzzy basis at or below 0.75", () => {
    expect(Confidence.safeParse({ score: 0.75, basis: "fuzzy" }).success).toBe(true);
  });

  it("rejects fuzzy basis above 0.75", () => {
    expect(Confidence.safeParse({ score: 0.8, basis: "fuzzy" }).success).toBe(false);
  });

  it("still caps external-cached at 0.5 (regression)", () => {
    expect(Confidence.safeParse({ score: 0.6, basis: "external-cached" }).success).toBe(false);
    expect(Confidence.safeParse({ score: 0.5, basis: "external-cached" }).success).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest src/__tests__/confidence-basis.test.ts`
Expected: FAIL — `alias`/`fuzzy` are not valid enum values yet, so the first two assertions fail.

- [ ] **Step 3: Extend the enum and refine rule**

In `src/lib/contract/d1.ts`, replace lines 57-72:

```typescript
export const ConfidenceBasis = z.enum([
  "exact",
  "heuristic",
  "llm",
  "external-cached",
  "alias",
  "fuzzy",
]);

export const Confidence = z
  .object({
    score: z.number().min(0).max(1),
    basis: ConfidenceBasis,
  })
  .refine(
    (c) => c.basis !== "external-cached" || c.score <= 0.5,
    "external-cached confidence is capped at 0.5"
  )
  .refine(
    (c) => c.basis !== "fuzzy" || c.score <= 0.75,
    "fuzzy confidence is capped at 0.75"
  );
```

- [ ] **Step 4: Fix `emit.ts`'s duplicate hand-rolled type**

In `src/lib/ingest/emit.ts`, replace line 27 (`type ConfidenceBasis = "exact" | "heuristic" | "llm" | "external-cached";`) and its import block (lines 14-22):

```typescript
import {
  ProductionEvent,
  InspectionEvent,
  RejectionEvent,
  AggregateClaimEvent,
  AnnotationEvent,
  Period,
  ClientRegistry,
  ConfidenceBasis,
} from "@/lib/contract/d1";
import { z } from "zod";
```

Remove the standalone `type ConfidenceBasis = ...` line entirely. `basisFor()`/`scoreFor()` (lines 61-69) keep their existing bodies unchanged — they still only ever return `"exact" | "heuristic" | "llm"`, which remain valid members of the now-wider imported type.

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx jest src/__tests__/confidence-basis.test.ts`
Expected: PASS (4/4)

Run: `npx jest src/__tests__/ingest-emit.test.ts`
Expected: PASS, unchanged — regression check that `emit.ts`'s existing behavior (which never used `alias`/`fuzzy`) is untouched.

- [ ] **Step 6: Commit**

```bash
git add src/lib/contract/d1.ts src/lib/ingest/emit.ts src/__tests__/confidence-basis.test.ts
git commit -m "feat: extend ConfidenceBasis with alias/fuzzy, dedupe emit.ts's local copy"
```

---

### Task 2: Add `stage_aliases` to the `registries` table and `RegistryRow`

**Files:**
- Create: `supabase/migrations/20260710_registry_stage_aliases.sql`
- Modify: `src/lib/store/types.ts:70-79` (`RegistryRow` interface)
- Modify: `src/lib/store/memory.ts` (`MemoryRegistryStore`)
- Modify: `src/lib/store/supabase.ts` (`SupabaseRegistryStore`, `toRegistryRow`)
- Test: `src/__tests__/registry-store-aliases.test.ts`

**Interfaces:**
- Produces: `RegistryRow.stageAliases: Record<string, { stageId: string; confidence: number; basis: "alias"; learnedAt: string }>`, keyed by a normalized alias key (defined in Task 3 as `normalizeAliasKey(sheetOrFileName)`).
- Consumes (Task 3): `recognizeSheetStage`/`recognizeStage` read this map before falling back to regex.

- [ ] **Step 1: Write the migration**

```sql
-- supabase/migrations/20260710_registry_stage_aliases.sql
ALTER TABLE registries ADD COLUMN IF NOT EXISTS stage_aliases JSONB NOT NULL DEFAULT '{}'::jsonb;
```

- [ ] **Step 2: Write the failing test (store contract, both adapters)**

```typescript
// src/__tests__/registry-store-aliases.test.ts
import { MemoryRegistryStore } from "@/lib/store/memory";
import type { RegistryRow } from "@/lib/store/types";

const baseRow: RegistryRow = {
  presetId: "acme",
  name: "Acme",
  createdFromFilename: null,
  registryVersion: "1.0.0",
  fiscalYearStartMonth: 4,
  stages: [],
  defects: [],
  sizes: [],
  stageAliases: {},
};

describe("RegistryRow.stageAliases persistence (memory adapter)", () => {
  it("round-trips a learned alias", async () => {
    const store = new MemoryRegistryStore();
    await store.upsert({
      ...baseRow,
      stageAliases: { "visual-qc": { stageId: "visual", confidence: 1, basis: "alias", learnedAt: "2026-07-10T00:00:00.000Z" } },
    });
    const row = await store.get("acme");
    expect(row?.stageAliases["visual-qc"]).toEqual({
      stageId: "visual", confidence: 1, basis: "alias", learnedAt: "2026-07-10T00:00:00.000Z",
    });
  });

  it("defaults to an empty object when a row predates the field", async () => {
    const store = new MemoryRegistryStore();
    const { stageAliases, ...legacyRow } = baseRow;
    await store.upsert(legacyRow as RegistryRow);
    const row = await store.get("acme");
    expect(row?.stageAliases).toEqual({});
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx jest src/__tests__/registry-store-aliases.test.ts`
Expected: FAIL — `RegistryRow` has no `stageAliases` field yet, TypeScript error or `undefined` mismatch.

- [ ] **Step 4: Add the field to `RegistryRow`**

In `src/lib/store/types.ts`, modify the `RegistryRow` interface (lines 70-79):

```typescript
export interface StageAlias {
  stageId: string;
  confidence: number;
  basis: "alias";
  learnedAt: string; // ISO datetime
}

export interface RegistryRow {
  presetId: string;
  name: string;
  createdFromFilename: string | null;
  registryVersion: string;
  fiscalYearStartMonth: number;
  stages: any[];
  defects: any[];
  sizes: any[];
  /** Company-learned sheet/file-name -> stage mappings, keyed by normalizeAliasKey(). */
  stageAliases: Record<string, StageAlias>;
}
```

- [ ] **Step 5: Update `MemoryRegistryStore`**

In `src/lib/store/memory.ts`, no method signatures change (it already stores/returns whatever `RegistryRow` it's given via `upsert`/`get`) — but add a defaulting read path so pre-existing in-memory rows created before this field existed don't return `undefined`. Modify the `get` method:

```typescript
async get(presetId: string): Promise<RegistryRow | null> {
  const row = this.byId.get(presetId) ?? null;
  return row ? { stageAliases: {}, ...row } : null;
}
```

(Same defaulting spread in `first()` and in the `sortedRows()`-derived `list()` path is unnecessary since `list()` returns `RegistryPresetSummary`, not `RegistryRow`.)

- [ ] **Step 6: Update `SupabaseRegistryStore`**

In `src/lib/store/supabase.ts`, modify `toRegistryRow` (lines 351-365):

```typescript
function toRegistryRow(data: any): RegistryRow {
  const rawStages = typeof data.stages === "string" ? JSON.parse(data.stages) : data.stages;
  const rawDefects = typeof data.defects === "string" ? JSON.parse(data.defects) : data.defects;
  const rawSizes = typeof data.sizes === "string" ? JSON.parse(data.sizes) : data.sizes;
  const rawAliases = typeof data.stage_aliases === "string" ? JSON.parse(data.stage_aliases) : data.stage_aliases;
  return {
    presetId: data.client_id,
    name: data.name || data.client_id,
    createdFromFilename: data.created_from_filename || null,
    registryVersion: data.registry_version,
    fiscalYearStartMonth: data.fiscal_year_start_month,
    stages: rawStages || [],
    defects: rawDefects || [],
    sizes: rawSizes || [],
    stageAliases: rawAliases || {},
  };
}
```

Modify `upsert` (lines 393-418) to include `stage_aliases` in the primary attempt, with the existing missing-column fallback covering the case where the migration hasn't run yet:

```typescript
async upsert(row: RegistryRow): Promise<void> {
  const dbRow: Record<string, any> = {
    client_id: row.presetId,
    registry_version: row.registryVersion,
    fiscal_year_start_month: row.fiscalYearStartMonth,
    stages: row.stages,
    defects: row.defects,
    sizes: row.sizes,
    stage_aliases: row.stageAliases ?? {},
  };
  if (row.name) dbRow.name = row.name;
  if (row.createdFromFilename) dbRow.created_from_filename = row.createdFromFilename;

  const { error } = await this.client.from("registries").upsert(dbRow, { onConflict: "client_id" });
  if (!error) return;

  const isColErr = error.message?.includes("column") && error.message?.includes("does not exist");
  if (!isColErr) throw error;
  const fallbackRow = {
    client_id: row.presetId, registry_version: row.registryVersion,
    fiscal_year_start_month: row.fiscalYearStartMonth, stages: row.stages, defects: row.defects, sizes: row.sizes,
  };
  const { error: fallbackError } = await this.client.from("registries").upsert(fallbackRow, { onConflict: "client_id" });
  if (fallbackError) throw fallbackError;
}
```

(The fallback intentionally omits `stage_aliases` — same pre-existing pattern as `name`/`created_from_filename` being conditionally included above it.)

- [ ] **Step 7: Run tests to verify they pass**

Run: `npx jest src/__tests__/registry-store-aliases.test.ts`
Expected: PASS (2/2)

Run: `npx jest src/lib/store` (or the store test glob used in this repo)
Expected: PASS, unchanged — regression check on existing store tests.

- [ ] **Step 8: Commit**

```bash
git add supabase/migrations/20260710_registry_stage_aliases.sql src/lib/store/types.ts src/lib/store/memory.ts src/lib/store/supabase.ts src/__tests__/registry-store-aliases.test.ts
git commit -m "feat: add stage_aliases to registries table and RegistryRow"
```

---

### Task 3: Alias-aware, confidence-scored `recognizeStage`

**Files:**
- Modify: `src/lib/dataset/recognize.ts`
- Test: `src/lib/dataset/__tests__/recognize.test.ts` (extend existing file)

**Interfaces:**
- Consumes: `RegistryRow.stageAliases` (Task 2), `ConfidenceBasis` (Task 1).
- Produces: `recognizeStageScored(dataset: Dataset, aliases: Record<string, StageAlias>): { stageId: string; confidence: number; basis: ConfidenceBasis } | null` — new function, additive. Existing `recognizeStage(dataset: Dataset): string | null` and `recognizeSheetStage(fileName, sheetName): string | null` **keep their exact current signatures and behavior** (regression-critical: `dataset/registry.ts:34` and the real-corpus test both call the unscored versions today).
- Produces: `normalizeAliasKey(sheetOrFileName: string): string` — exported, reused by the UI wiring in Task 5.

- [ ] **Step 1: Write the failing test**

Append to `src/lib/dataset/__tests__/recognize.test.ts`:

```typescript
import { recognizeStageScored, normalizeAliasKey } from "../recognize";
import type { StageAlias } from "@/lib/store/types";

describe("normalizeAliasKey", () => {
  it("collapses case and whitespace so 'Visual QC' and 'visual qc' match", () => {
    expect(normalizeAliasKey("Visual QC")).toBe(normalizeAliasKey("visual qc"));
  });
});

describe("recognizeStageScored", () => {
  it("returns high confidence exact-pattern match with basis heuristic when no alias exists", () => {
    const ds = baseDataset({
      sources: [{ fileName: "01 REJECTION ANALYSIS-APRIL 2025.xlsx", sheetName: "VISUAL", rowCount: 30 }],
    });
    const result = recognizeStageScored(ds, {});
    expect(result).toEqual({ stageId: "visual", confidence: 0.9, basis: "heuristic" });
  });

  it("prefers a learned alias over the regex pattern, with basis alias", () => {
    const ds = baseDataset({
      sources: [{ fileName: "x.xlsx", sheetName: "Visual QC", rowCount: 10 }],
    });
    const aliases: Record<string, StageAlias> = {
      [normalizeAliasKey("Visual QC")]: { stageId: "visual", confidence: 0.99, basis: "alias", learnedAt: "2026-07-10T00:00:00.000Z" },
    };
    const result = recognizeStageScored(ds, aliases);
    expect(result).toEqual({ stageId: "visual", confidence: 0.99, basis: "alias" });
  });

  it("returns null (not a low-confidence guess) when nothing matches and no alias exists", () => {
    const ds = baseDataset({
      sources: [{ fileName: "3 JUNE 26.xlsx", sheetName: "16FR", rowCount: 5 }],
    });
    expect(recognizeStageScored(ds, {})).toBeNull();
  });

  it("still requires a measure column, same defensive gate as recognizeStage", () => {
    const ds = baseDataset({
      columns: [{ role: "dimension-date", name: "date" }, { role: "derived", name: "rej %" }],
      sources: [{ fileName: "x.xlsx", sheetName: "VISUAL", rowCount: 10 }],
    });
    expect(recognizeStageScored(ds, {})).toBeNull();
  });
});

describe("recognizeStage (regression — unscored callers unaffected)", () => {
  it("keeps returning a bare stageId string, not the scored shape", () => {
    const ds = baseDataset({
      sources: [{ fileName: "01 REJECTION ANALYSIS-APRIL 2025.xlsx", sheetName: "VISUAL", rowCount: 30 }],
    });
    expect(recognizeStage(ds)).toBe("visual");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest src/lib/dataset/__tests__/recognize.test.ts`
Expected: FAIL — `recognizeStageScored`/`normalizeAliasKey` don't exist yet.

- [ ] **Step 3: Implement, additive to the existing file**

In `src/lib/dataset/recognize.ts`, add after the existing imports (keep everything from line 1-54 exactly as-is):

```typescript
import type { StageAlias } from "@/lib/store/types";

/** Case/whitespace-insensitive key so "Visual QC", "visual qc", and " Visual  QC "
 *  all learn/hit the same alias. Mirrors disposafe.ts's normDefect discipline
 *  (collapse before compare) without stripping non-alphanumerics — sheet/file
 *  names carry meaningful spacing structure defect codes don't. */
export function normalizeAliasKey(sheetOrFileName: string): string {
  return sheetOrFileName.trim().toLowerCase().replace(/\s+/g, " ");
}

/** Scored version of recognizeStage. Checks the company's learned aliases
 *  (both sheet and file name, sheet first — same precedence as
 *  recognizeSheetStage) before falling back to the hardcoded STAGE_PATTERNS,
 *  and returns null (never a low-confidence guess) when nothing matches. */
export function recognizeStageScored(
  dataset: Dataset,
  aliases: Record<string, StageAlias>,
): { stageId: string; confidence: number; basis: "alias" | "heuristic" } | null {
  const hasMeasure = dataset.columns.some((c) => c.role === "measure");
  if (!hasMeasure) return null;

  // Alias lookup: same majority-vote-across-sources discipline as recognizeStage,
  // but a source matches via a learned alias key OR the regex fallback.
  const votes: Record<string, { count: number; confidence: number; basis: "alias" | "heuristic" }> = {};
  for (const s of dataset.sources) {
    const sheetAlias = aliases[normalizeAliasKey(s.sheetName)];
    const fileAlias = aliases[normalizeAliasKey(s.fileName)];
    const alias = sheetAlias ?? fileAlias;
    const id = alias ? alias.stageId : recognizeSheetStage(s.fileName, s.sheetName);
    if (!id) continue;
    const entry = votes[id] ?? { count: 0, confidence: 0, basis: "heuristic" as const };
    entry.count += 1;
    if (alias) {
      entry.confidence = Math.max(entry.confidence, alias.confidence);
      entry.basis = "alias";
    } else {
      entry.confidence = Math.max(entry.confidence, 0.9);
    }
    votes[id] = entry;
  }

  const entries = Object.entries(votes);
  if (entries.length === 0) return null;
  entries.sort((a, b) => b[1].count - a[1].count);
  const [topId, top] = entries[0];
  if (top.count < dataset.sources.length * 0.5) return null;
  return { stageId: topId, confidence: top.confidence, basis: top.basis };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx jest src/lib/dataset/__tests__/recognize.test.ts`
Expected: PASS (all new + all pre-existing cases in the file).

- [ ] **Step 5: Commit**

```bash
git add src/lib/dataset/recognize.ts src/lib/dataset/__tests__/recognize.test.ts
git commit -m "feat: add alias-aware confidence scoring to stage recognition"
```

---

### Task 4: Attach recognition confidence to `Dataset`

**Files:**
- Modify: `src/lib/dataset/types.ts:14-24` (`Dataset` interface)
- Modify: `src/lib/dataset/registry.ts` (`groupIntoDatasets`)
- Test: `src/lib/dataset/__tests__/registry.test.ts` (extend existing file)

**Interfaces:**
- Consumes: `recognizeStageScored` (Task 3). `groupIntoDatasets` gains an optional second parameter so its existing zero-arg-aliases callers (the real-corpus test, `from-workbooks.ts`) keep compiling.
- Produces: `Dataset.recognitionConfidence: number | null`, `Dataset.recognitionBasis: "alias" | "heuristic" | null`.

- [ ] **Step 1: Write the failing test**

Append to `src/lib/dataset/__tests__/registry.test.ts` (read the existing file first to match its exact input-building helper name before writing this step, since the plan must not guess an unverified helper name — the implementer's report should confirm the file's local dataset-input builder and reuse it verbatim here rather than duplicating a new one).

```typescript
describe("groupIntoDatasets — recognition confidence", () => {
  it("attaches heuristic confidence when a stage is recognized without an alias", () => {
    const datasets = groupIntoDatasets(visualStageInputs()); // reuse this file's existing VISUAL fixture builder
    const visual = datasets.find((d) => d.recognizedStageId === "visual");
    expect(visual?.recognitionConfidence).toBe(0.9);
    expect(visual?.recognitionBasis).toBe("heuristic");
  });

  it("leaves recognitionConfidence null for unrecognized datasets", () => {
    const datasets = groupIntoDatasets(unrecognizedInputs()); // reuse this file's existing unrecognized fixture builder
    const unrecognized = datasets.find((d) => d.recognizedStageId === null);
    expect(unrecognized?.recognitionConfidence).toBeNull();
  });

  it("prefers alias confidence when a stageAliases map is passed", () => {
    const aliases = { [normalizeAliasKey("Visual QC")]: { stageId: "visual", confidence: 0.97, basis: "alias" as const, learnedAt: "2026-07-10T00:00:00.000Z" } };
    const datasets = groupIntoDatasets(visualQcAliasInputs(), aliases); // new fixture: sheet named "Visual QC"
    const visual = datasets.find((d) => d.recognizedStageId === "visual");
    expect(visual?.recognitionConfidence).toBe(0.97);
    expect(visual?.recognitionBasis).toBe("alias");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest src/lib/dataset/__tests__/registry.test.ts`
Expected: FAIL — `recognitionConfidence`/`recognitionBasis` don't exist on `Dataset` yet; `groupIntoDatasets` doesn't accept a second argument.

- [ ] **Step 3: Extend `Dataset` type**

In `src/lib/dataset/types.ts`, modify the `Dataset` interface (lines 14-24):

```typescript
export interface Dataset {
  id: string;
  signatureHash: string;
  title: string;
  columns: SchemaSignatureColumn[];
  sources: DatasetSource[];
  totalRows: number;
  recognizedStageId: string | null;
  /** Confidence behind recognizedStageId; null when recognizedStageId is null. */
  recognitionConfidence: number | null;
  recognitionBasis: "alias" | "heuristic" | null;
}
```

- [ ] **Step 4: Thread scoring through `groupIntoDatasets`**

In `src/lib/dataset/registry.ts`, add the import and change the function signature and body (replace lines 1-4 and the `recognizedStageId`-assigning block at lines 63-80):

```typescript
import type { Dataset, DatasetSource, ProfiledTableInput } from "./types";
import type { StageAlias } from "@/lib/store/types";
import { deriveTitle } from "./title";
import { recognizeSheetStage, recognizeStageScored } from "./recognize";
import { DISPOSAFE_REGISTRY } from "@/lib/registry/disposafe";
```

```typescript
export function groupIntoDatasets(
  inputs: ProfiledTableInput[],
  stageAliases: Record<string, StageAlias> = {},
): Dataset[] {
  // ... unchanged grouping logic (lines 29-62 stay as-is) ...

  subGroups.sort((a, b) => a.basis.localeCompare(b.basis) || (a.stage ?? "").localeCompare(b.stage ?? ""));
  subGroups.forEach(({ stage, group }, i) => {
    const id = i === 0 ? hash : `${hash}-${i + 1}`;
    const sources: DatasetSource[] = group
      .map((g) => ({ fileName: g.fileName, sheetName: g.sheetName, rowCount: g.rowCount }))
      .sort((a, b) => a.fileName.localeCompare(b.fileName) || a.sheetName.localeCompare(b.sheetName));
    const totalRows = sources.reduce((sum, s) => sum + s.rowCount, 0);
    const columns = group[0].signature.columns;
    const hasMeasure = columns.some((c) => c.role === "measure");
    const recognizedStageId = hasMeasure ? stage : null;
    const title = (recognizedStageId && stageLabel(recognizedStageId)) || deriveTitle(columns, sources);

    // Re-score with alias awareness once the dataset shape is known — cheap,
    // and keeps recognizeStageScored (which needs the assembled Dataset) as
    // the single source of truth for confidence instead of duplicating the
    // vote logic here.
    const provisional: Dataset = {
      id, signatureHash: hash, title, columns, sources, totalRows,
      recognizedStageId, recognitionConfidence: null, recognitionBasis: null,
    };
    const scored = recognizedStageId ? recognizeStageScored(provisional, stageAliases) : null;

    datasets.push({
      ...provisional,
      recognitionConfidence: scored?.confidence ?? null,
      recognitionBasis: scored?.basis ?? null,
    });
  });
```

- [ ] **Step 5: Update `from-workbooks.ts`'s call site (verify, don't guess)**

Read `src/lib/dataset/from-workbooks.ts` to find its exact call to `groupIntoDatasets(...)`. It currently calls it with one argument — leave that call unchanged (the new parameter defaults to `{}`), UNLESS the implementer determines during this task that `from-workbooks.ts` should thread a real registry's `stageAliases` through (it has no registry context today — that wiring is Task 6's job, on the Staging upload path, not this task). If `from-workbooks.ts` needs a signature change to accommodate Task 6 later, note it in the report; do not speculatively add registry-fetching here.

- [ ] **Step 6: Run tests to verify they pass**

Run: `npx jest src/lib/dataset/__tests__/registry.test.ts`
Expected: PASS (all new + pre-existing cases).

Run: `npx jest src/lib/dataset/__tests__/recognize.test.ts src/lib/dataset/__tests__/from-workbooks.test.ts src/lib/dataset/__tests__/dashboard.test.ts`
Expected: PASS, unchanged — regression check across the dataset module.

- [ ] **Step 7: Commit**

```bash
git add src/lib/dataset/types.ts src/lib/dataset/registry.ts src/lib/dataset/__tests__/registry.test.ts
git commit -m "feat: attach recognition confidence to Dataset"
```

---

### Task 5: Surface confidence + accept/override in the UI

> **Retargeted after pre-flight review (2026-07-10):** the plan originally targeted `GenericDatasetView.tsx` + `workbooks/page.tsx` directly, assuming `GenericDatasetView` takes a `dataset` prop and is rendered from the Workbooks page. Neither is true: `GenericDatasetView` takes only `{ datasetId }` and self-fetches (rendered from `src/app/page.tsx`, the main Cumulative dashboard), and `workbooks/page.tsx` renders its own local `SheetDashboard`/`FileDashboard` wrappers. Both of those callers already delegate to **`GenericDashboardBody.tsx`** — its own doc comment calls it "the shared presentational core of GenericDatasetView, reused by the /workbooks L2 (file/section) and L3 (sheet) views." `GenericDashboardBody` already accepts an optional `dataset?: Dataset` prop from both call sites, so this task adds the badge/confirm control there once, and it surfaces on both the main dashboard and Workbooks for free — matching the plan's goal of surfacing this "through the existing Staging/Workbooks UI." Human-confirmed via AskUserQuestion before Task 5 was dispatched.

**Files:**
- Modify: `src/components/app/GenericDashboardBody.tsx` — add the badge + confirm control (the shared render surface).
- Modify: `src/components/app/GenericDatasetView.tsx` — thread a new `onConfirmStage` prop through to its existing `<GenericDashboardBody dataset={dataset} .../>` call (lines 104-118).
- Modify: `src/app/workbooks/page.tsx` — thread the same prop through `SheetDashboard`'s existing `<GenericDashboardBody dataset={dataset} .../>` call (it already has `dataset` in scope at the point it builds `d = buildGenericDashboard(dataset, sheetRows)`).
- Test: `src/components/app/__tests__/GenericDashboardBody.test.tsx` (create — no test dir exists yet under `src/components/app/`).

**Interfaces:**
- Consumes: `Dataset.recognitionConfidence`/`recognitionBasis` (Task 4). `GenericDashboard` type (`src/lib/dataset/dashboard.ts`): `{ datasetId, title, dateRange, kpis, breakdowns, defectPareto }`.
- Produces: `onConfirmStage?: (datasetId: string, stageId: string) => void` prop on `GenericDashboardBody`, called from both `GenericDatasetView` and `workbooks/page.tsx`'s `SheetDashboard`; wired in both to the alias-write path built in Task 6.

- [ ] **Step 1: Write the failing test**

```typescript
// src/components/app/__tests__/GenericDashboardBody.test.tsx
import { render, screen, fireEvent } from "@testing-library/react";
import GenericDashboardBody from "../GenericDashboardBody";
import type { Dataset } from "@/lib/dataset/types";
import type { GenericDashboard } from "@/lib/dataset/dashboard";

const baseDataset: Dataset = {
  id: "ds1", signatureHash: "ds1", title: "Visual QC", columns: [], sources: [],
  totalRows: 10, recognizedStageId: "visual", recognitionConfidence: 0.6, recognitionBasis: "heuristic",
};
const emptyDashboard: GenericDashboard = {
  datasetId: "ds1", title: "Visual QC", dateRange: null, kpis: [], breakdowns: [], defectPareto: null,
};

describe("GenericDashboardBody recognition confidence", () => {
  it("shows a needs-review badge below 0.8 confidence", () => {
    render(<GenericDashboardBody d={emptyDashboard} dataset={baseDataset} rows={[]} onConfirmStage={jest.fn()} />);
    expect(screen.getByText(/needs review/i)).toBeInTheDocument();
  });

  it("does not show a needs-review badge at or above 0.8 confidence", () => {
    render(<GenericDashboardBody d={emptyDashboard} dataset={{ ...baseDataset, recognitionConfidence: 0.9 }} rows={[]} onConfirmStage={jest.fn()} />);
    expect(screen.queryByText(/needs review/i)).not.toBeInTheDocument();
  });

  it("calls onConfirmStage with the dataset id and stage id when the user confirms", () => {
    const onConfirmStage = jest.fn();
    render(<GenericDashboardBody d={emptyDashboard} dataset={baseDataset} rows={[]} onConfirmStage={onConfirmStage} />);
    fireEvent.click(screen.getByRole("button", { name: /confirm/i }));
    expect(onConfirmStage).toHaveBeenCalledWith("ds1", "visual");
  });

  it("renders nothing extra when no dataset is provided (static-render callers unaffected)", () => {
    render(<GenericDashboardBody d={emptyDashboard} />);
    expect(screen.queryByText(/needs review/i)).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest src/components/app/__tests__/GenericDashboardBody.test.tsx`
Expected: FAIL — no "needs review" text, no `onConfirmStage` prop, no confirm button exist yet.

- [ ] **Step 3: Implement the confidence badge and confirm control**

Extend `GenericDashboardBody.tsx`'s props destructure (currently `{ d, caption, publishBanner, dataset, rows }`) with `onConfirmStage?: (datasetId: string, stageId: string) => void`, and its type literal with the matching optional field. Render the badge near the existing `publishBanner` block (lines 108-135), using the same `var(--accent)` / `var(--surface-2)` / `var(--border-strong)` tokens that block already uses so it matches the surrounding design system:

```tsx
{dataset && dataset.recognizedStageId && dataset.recognitionConfidence !== null && dataset.recognitionConfidence < 0.8 && (
  <div style={{
    display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap",
    border: "1px solid var(--border-strong)", borderRadius: "var(--radius-md)",
    background: "var(--surface-2)", padding: "10px 14px",
  }}>
    <span style={{ fontSize: 12, fontWeight: 700, color: "var(--accent)" }}>
      Needs review — recognized as {dataset.recognizedStageId} at {Math.round(dataset.recognitionConfidence * 100)}% confidence
    </span>
    {onConfirmStage && (
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
  </div>
)}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx jest src/components/app/__tests__/GenericDashboardBody.test.tsx`
Expected: PASS (4/4)

- [ ] **Step 5: Thread the prop through both callers**

In `GenericDatasetView.tsx`, add `onConfirmStage?: (datasetId: string, stageId: string) => void` to its own props (`{ datasetId, onConfirmStage }`) and pass it straight through to its existing `<GenericDashboardBody ... />` call (lines 104-118).

In `workbooks/page.tsx`, read `SheetDashboard`'s current props and its `<GenericDashboardBody d={d} dataset={dataset} .../>` call site (around line 463 onward) and its parent (the page component that owns `activePresetId`/preset state and already has `datasets` in scope). Thread an `onConfirmStage` prop down from the page component into `SheetDashboard`, then into `GenericDashboardBody`, wired to a new local `confirmStageAlias(datasetId, stageId)` function. Stub `confirmStageAlias` as `console.warn("not yet wired — Task 6", datasetId, stageId)` for now — Task 6 replaces the stub with the real `/api/registry-alias` call.

- [ ] **Step 6: Run the full component test suite as a regression check**

Run: `npx jest src/components/app/__tests__/GenericDashboardBody.test.tsx src/app/workbooks`
Expected: PASS, no regressions in existing Workbooks tests (if any exist).

- [ ] **Step 7: Commit**

```bash
git add src/components/app/GenericDashboardBody.tsx src/components/app/GenericDatasetView.tsx src/app/workbooks/page.tsx src/components/app/__tests__/GenericDashboardBody.test.tsx
git commit -m "feat: surface recognition confidence and confirm control in GenericDashboardBody"
```

---

### Task 6: Alias write path — confirm persists a learned alias

**Files:**
- Create: `src/app/api/registry-alias/route.ts`
- Test: `src/app/api/registry-alias/__tests__/route.test.ts`

**Interfaces:**
- Consumes: `RegistryStore.get`/`upsert` (Task 2), `normalizeAliasKey` (Task 3).
- Produces: `POST /api/registry-alias` accepting `{ presetId: string; sheetName: string; stageId: string }`, returning `{ ok: true; key: string }`. Called by Task 5's `confirmStageAlias`.

- [ ] **Step 1: Write the failing test**

```typescript
// src/app/api/registry-alias/__tests__/route.test.ts
import { POST } from "../route";
import { NextRequest } from "next/server";

// This route uses getStores()/getRegistryStore() — read src/lib/store/index.ts
// first to confirm the exact accessor name and mock it accordingly; do not
// guess the function name.

describe("POST /api/registry-alias", () => {
  it("persists a normalized alias against the preset's registry row", async () => {
    const req = new NextRequest("http://localhost/api/registry-alias", {
      method: "POST",
      body: JSON.stringify({ presetId: "acme", sheetName: "Visual QC", stageId: "visual" }),
    });
    const res = await POST(req);
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.key).toBe("visual qc");
  });

  it("rejects a request missing stageId", async () => {
    const req = new NextRequest("http://localhost/api/registry-alias", {
      method: "POST",
      body: JSON.stringify({ presetId: "acme", sheetName: "Visual QC" }),
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest src/app/api/registry-alias/__tests__/route.test.ts`
Expected: FAIL — route file doesn't exist yet.

- [ ] **Step 3: Read `src/lib/store/index.ts` to confirm the store accessor**

Before implementing, read `getStores()`/`shouldUseSupabase()` usage in `src/app/api/ingest/route.ts:9,77` as the established pattern for reaching `RegistryStore` from a route handler — confirm whether `getStores()` returns a `registries` key alongside `events`/`findings`, or whether registry access goes through a separate accessor (`RegistryContext.tsx` was mentioned by the earlier codebase exploration as a client-side context; a server route needs the server-side store, not that context). Use whatever the confirmed real accessor is in Step 4 below — the code shown here names it `getStores().registries` as the expected shape based on the sibling `events`/`findings` keys already confirmed in `api/ingest/route.ts:77`; adjust if reading the file shows otherwise.

- [ ] **Step 4: Implement the route**

```typescript
// src/app/api/registry-alias/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getStores } from "@/lib/store";
import { normalizeAliasKey } from "@/lib/dataset/recognize";

interface AliasBody {
  presetId: string;
  sheetName: string;
  stageId: string;
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as Partial<AliasBody>;
    if (!body.presetId || !body.sheetName || !body.stageId) {
      return NextResponse.json({ error: "presetId, sheetName, and stageId are required" }, { status: 400 });
    }

    const { registries } = getStores();
    const row = await registries.get(body.presetId);
    if (!row) {
      return NextResponse.json({ error: `No registry preset '${body.presetId}'` }, { status: 404 });
    }

    const key = normalizeAliasKey(body.sheetName);
    const updated = {
      ...row,
      stageAliases: {
        ...row.stageAliases,
        [key]: {
          stageId: body.stageId,
          confidence: 1,
          basis: "alias" as const,
          learnedAt: new Date().toISOString(),
        },
      },
    };
    await registries.upsert(updated);

    return NextResponse.json({ ok: true, key });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? "Failed to save alias" }, { status: 500 });
  }
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx jest src/app/api/registry-alias/__tests__/route.test.ts`
Expected: PASS (2/2)

- [ ] **Step 6: Wire the real call in `workbooks/page.tsx`**

Replace Task 5's stub `confirmStageAlias` with:

```typescript
async function confirmStageAlias(datasetId: string, stageId: string) {
  const dataset = datasets.find((d) => d.id === datasetId); // reuse whatever local variable name workbooks/page.tsx already uses for its dataset list
  if (!dataset || dataset.sources.length === 0) return;
  await fetch("/api/registry-alias", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      presetId: activePresetId ?? "disposafe", // reuse whatever local variable already tracks the active preset, matching the "disposafe" default in api/ingest/route.ts:177
      sheetName: dataset.sources[0].sheetName,
      stageId,
    }),
  });
  // Re-fetch or locally patch the dataset list so the badge clears without a full reload — match whatever refresh pattern this page already uses elsewhere.
}
```

- [ ] **Step 7: Commit**

```bash
git add src/app/api/registry-alias/route.ts src/app/api/registry-alias/__tests__/route.test.ts src/app/workbooks/page.tsx
git commit -m "feat: persist confirmed stage aliases via /api/registry-alias"
```

---

### Task 7: Consistent active-registry fallback in the dataset/schema recognizer

**Files:**
- Modify: `src/lib/dataset/recognize.ts` (`knownStage`)
- Modify: `src/lib/dataset/registry.ts` (`stageLabel`)
- Test: extend `src/lib/dataset/__tests__/recognize.test.ts` and `registry.test.ts`

**Interfaces:**
- Consumes: same `activeRegistry`-or-`DISPOSAFE_REGISTRY` fallback pattern already established in `src/app/api/ingest/route.ts:174-196` — this task does NOT invent a new pattern, it threads the existing one one layer deeper.
- Produces: `knownStage(id: string, reg?: ClientRegistryLike): boolean` and `stageLabel(stageId: string, reg?: ClientRegistryLike): string | null` gain an optional registry parameter, defaulting to `DISPOSAFE_REGISTRY` (unchanged behavior for every existing caller that doesn't pass one).

- [ ] **Step 1: Write the failing test**

```typescript
// append to src/lib/dataset/__tests__/recognize.test.ts
describe("knownStage with an explicit registry", () => {
  it("recognizes a stage defined only in the passed-in registry, not DISPOSAFE_REGISTRY", () => {
    const customRegistry = { ...DISPOSAFE_REGISTRY, stages: [{ ...DISPOSAFE_REGISTRY.stages[0], stageId: "custom-stage" }] };
    const ds = baseDataset({ sources: [{ fileName: "x.xlsx", sheetName: "CUSTOM STAGE FILE", rowCount: 5 }] });
    // recognizeSheetStage only knows the 5 hardcoded STAGE_PATTERNS regexes, so this
    // test targets knownStage directly rather than going through recognizeStage —
    // confirming the registry parameter is actually consulted.
    expect(knownStage("custom-stage", customRegistry)).toBe(true);
    expect(knownStage("custom-stage")).toBe(false); // default (DISPOSAFE_REGISTRY) still doesn't know it
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest src/lib/dataset/__tests__/recognize.test.ts`
Expected: FAIL — `knownStage` isn't exported / doesn't accept a second argument.

- [ ] **Step 3: Export and extend `knownStage`**

In `src/lib/dataset/recognize.ts`, change (currently private, lines 15-17):

```typescript
export function knownStage(id: string, reg: z.infer<typeof ClientRegistry> = DISPOSAFE_REGISTRY): boolean {
  return reg.stages.some((st) => st.stageId === id);
}
```

Add `import type { z } from "zod"; import type { ClientRegistry } from "@/lib/contract/d1";` to the top of the file.

- [ ] **Step 4: Extend `stageLabel` in `registry.ts`**

In `src/lib/dataset/registry.ts`, change (currently lines 10-12):

```typescript
function stageLabel(stageId: string, reg: z.infer<typeof ClientRegistry> = DISPOSAFE_REGISTRY): string | null {
  return reg.stages.find((s) => s.stageId === stageId)?.label ?? null;
}
```

Same import addition as Step 3.

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx jest src/lib/dataset/__tests__/recognize.test.ts src/lib/dataset/__tests__/registry.test.ts`
Expected: PASS, including the new test and all pre-existing ones (default-parameter behavior is unchanged for every caller not yet passing a registry).

- [ ] **Step 6: Commit**

```bash
git add src/lib/dataset/recognize.ts src/lib/dataset/registry.ts src/lib/dataset/__tests__/recognize.test.ts
git commit -m "feat: allow knownStage/stageLabel to accept an explicit registry"
```

**Note for implementation planning:** this task deliberately stops at making the functions *capable* of taking a real per-client registry — it does not yet wire `groupIntoDatasets`/`from-workbooks.ts` to fetch `activeRegistry` from Supabase the way `api/ingest/route.ts` does, because `from-workbooks.ts` runs during Staging upload before a `presetId` is necessarily chosen (same ordering constraint that made `api/ingest/route.ts` fetch the registry only at ingest time, not at classify time). Wiring the actual fetch is follow-up scope once Task 6's `activePresetId` plumbing in `workbooks/page.tsx` proves out — flag as a TODO in the PR description, not silently dropped.

---

### Task 8: Regression + corpus guard

**Files:**
- Test: `src/lib/dataset/__tests__/recognize.test.ts` (extend, real-corpus block)

**Interfaces:**
- Consumes: everything above.

- [ ] **Step 1: Write the regression test**

Append to the existing `maybe("stage-aware grouping (real corpus)", ...)` block in `src/lib/dataset/__tests__/recognize.test.ts` (guarded by the same `fs.existsSync(DIR)` skip the file already uses, since the real corpus isn't present in a fresh worktree — confirmed during baseline test run):

```typescript
it("recognizes identical stages with an empty alias table as before this change (regression)", () => {
  const { datasets } = datasetsWithRowsFromWorkbooks(files);
  const withoutAliases = datasets.map((d) => ({ id: d.id, recognizedStageId: d.recognizedStageId }));
  // groupIntoDatasets defaults its new stageAliases param to {} — recognition
  // output for the real corpus must be byte-identical to pre-Task-3 behavior.
  for (const d of withoutAliases) {
    expect(recognizeStage(datasets.find((x) => x.id === d.id)!)).toBe(d.recognizedStageId);
  }
});

it("a learned alias changes recognition on the next grouping pass without new regex", () => {
  const { datasets: before } = datasetsWithRowsFromWorkbooks(files);
  const unrecognized = before.find((d) => d.recognizedStageId === null && d.sources.length > 0);
  if (!unrecognized) return; // real corpus may have nothing unrecognized; skip gracefully
  const alias = { [normalizeAliasKey(unrecognized.sources[0].sheetName)]: { stageId: "visual", confidence: 0.9, basis: "alias" as const, learnedAt: "2026-07-10T00:00:00.000Z" } };
  const rescored = recognizeStageScored(unrecognized, alias);
  expect(rescored?.stageId).toBe("visual");
});
```

- [ ] **Step 2: Run the full dataset test suite**

Run: `npx jest src/lib/dataset`
Expected: PASS across all files (the real-corpus-gated tests will skip in this worktree per the baseline finding — `ANALYTICAL DATA/REJECTION ANALYSIS 2025-26/*.xlsx` isn't present — but must run and pass in any environment where that data exists, e.g. the main checkout).

- [ ] **Step 3: Run the full suite as a final regression check**

Run: `npx jest`
Expected: same 42/47 suites passing as the Task 0 baseline (5 pre-existing corpus-fixture-dependent failures unchanged, 243+ tests passing, no new failures).

- [ ] **Step 4: Commit**

```bash
git add src/lib/dataset/__tests__/recognize.test.ts
git commit -m "test: regression guard for alias-free recognition parity + alias-changes-outcome case"
```

---

## Explicitly deferred (not in this plan)

- **Finding/Adjudication integration for low-confidence recognition** — decided against for v1 (simple `recognitionConfidence` flag instead); revisit if a wrongly-recognized dataset is ever actually published into the D1 ledger via `toStageRecords()` and needs a correction trail.
- **Full `DISPOSAFE_REGISTRY` de-hardcoding in `emit.ts`'s `resolveDefect()` call and `groupIntoDatasets`'s live Supabase fetch** — Task 7 makes the functions *capable* of taking a real registry; wiring the actual per-request fetch is flagged as follow-up, not silently dropped, per Task 7's closing note.
- **Alias rollback/management UI** (list/edit/delete learned aliases) — no UI surface for this yet; `stageAliases` is a plain JSONB map editable only via direct DB access or a future admin view.
- **`schema-extractor.ts`/`emit.ts` changes of any kind** — out of scope by Global Constraint; that pipeline is untouched by this plan.
