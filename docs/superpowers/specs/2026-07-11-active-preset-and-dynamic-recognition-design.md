# Active Preset Wiring + Dynamic Stage Recognition

**Status:** Design approved (2026-07-11) — ready for implementation planning.
**Author:** RAIS-Pro / MOID engineering session.
**Relationship to prior work:** Corrects a scope misunderstanding from
`docs/superpowers/specs/2026-07-01-universal-schema-ingestion-design.md`'s
`[E]`/`[F2]`/`[G]` items. On investigation, schema-driven data entry and a
dynamic (non-`DISPOSAFE_REGISTRY`) dashboard **already exist**, built via
`RegistryContext.tsx` + `/api/schema` presets in an earlier session. What's
actually broken is narrower and more concrete: four call sites disagree
about *which* saved preset is "active," and stage recognition still can't
create genuinely new stages or split same-schema sheets by alias at
grouping time. This spec targets those specific defects, not a rewrite.

---

## 1. Problem

`DISPOSAFE_REGISTRY` (`src/lib/registry/disposafe.ts`) is meant to be only
the bootstrap default for a fresh install with zero saved presets. In
practice, four independent code paths each decide "which preset is active"
their own way, and none of them agree:

1. **`RegistryContext.tsx` / `/api/schema` GET** (`src/app/api/schema/route.ts:77`)
   — calls `registries.first()`, the *oldest-created* preset. No concept of
   "the one I'm currently working with"; the moment a second preset exists
   (a second plant, a test preset, anything), the dashboard silently keeps
   showing the first one ever created.
2. **`clear-schema/route.ts:9`** — `req.nextUrl.searchParams.get("presetId") ||
   "disposafe"`, then resets that preset's `stages`/`defects`/`sizes` back to
   `DISPOSAFE_REGISTRY`'s hardcoded values. Clearing schema therefore
   *repopulates* Disposafe's 13 stages instead of leaving the registry
   genuinely empty for a new plant.
3. **`workbooks/page.tsx`'s `confirmStageAlias`** (~line 186) — hardcodes
   `presetId: "disposafe"` when persisting a confirmed stage alias. A real
   extracted preset's id is a slug of its name (e.g. `"acme"`), so this
   literal almost never matches a real preset — confirming an alias from the
   Workbooks UI likely writes to a registry row that doesn't exist, making
   the alias-learning loop (`docs/superpowers/plans/2026-07-10-entity-resolution-ontology.md`)
   silently inert in real usage, not just in a documented edge case.
4. **`/api/ingest/route.ts:174-196`** — bypasses `getStores()` entirely with
   a raw `createServerClient().from("registries")` query, keyed on
   `body.presetId || "disposafe"`. In memory-store mode (`MOID_STORE=memory`,
   used in dev/tests) this call always no-ops (falls to `catch`), so
   `activeRegistry` is always `undefined` and `emit.ts` always resolves
   defects/labels against `DISPOSAFE_REGISTRY`. `GenericDatasetView.tsx`'s
   `publishToCumulative()` — the actual "publish to ledger" button — posts
   to `/api/ingest` with **no `presetId` at all**, so this hardcoded
   fallback fires on every real publish, not an edge case.

Separately, two gaps block onboarding a plant whose stage vocabulary isn't
already one of the 5 regexes in `recognize.ts`'s `STAGE_PATTERNS`:

5. **No way to create a genuinely new stage from the UI.** The Confirm
   button in `GenericDashboardBody` only ever confirms
   `dataset.recognizedStageId` — whatever the regex already guessed. There's
   no path to assign an unrecognized dataset to a brand-new stage the
   regex has never heard of, even though `/api/registry-alias` itself
   places no such restriction on `stageId`.
6. **`groupIntoDatasets`'s grouping key is alias-blind.** Aliases (per
   `docs/superpowers/plans/2026-07-10-entity-resolution-ontology.md`) only
   promote `recognizedStageId` *after* tables are already grouped by a
   pure-regex `stage` value. Two same-schema sheets that alias to two
   *different* stages still collapse into one dataset at grouping time,
   before any alias gets a chance to split them apart.

### Goal

One consistent, persisted "active preset" concept that every route agrees
on; a Clear Schema that leaves a preset genuinely empty; and stage
recognition that can create new stages and split by alias at grouping
time — so onboarding a new manufacturing plant never depends on
`DISPOSAFE_REGISTRY` for anything user-visible.

---

## 2. Approved decisions

| Decision | Choice |
|---|---|
| Active-preset source of truth | New `is_active boolean` column on `registries`, single active row at a time. A shared `getActivePresetId()` helper is the *only* place that answers "which preset is active" — no call site invents its own default. |
| Fallback when nothing is active | Only when **zero** presets exist at all (fresh install) does `getActivePresetId()`/callers fall back to `DISPOSAFE_REGISTRY`'s bootstrap shape — never as a "couldn't find the flagged one" fallback. |
| Clear Schema | Resets the *active* preset's `stages`/`defects`/`sizes` to `[]`, not to `DISPOSAFE_REGISTRY`'s values. |
| `/api/ingest` registry lookup | Replace the raw Supabase bypass with `getStores().registries.get(activePresetId)`, so it works identically in memory and Supabase modes. |
| New-stage creation | A small inline picker in `GenericDashboardBody`'s "needs review" badge: existing active-preset stages + a "+ New stage" text input. Creating one appends to the active preset's `stages` via the existing `/api/schema` POST path (already supports adding stages — see `data-entry/page.tsx`'s draft-stage flow) before calling `/api/registry-alias`. |
| Grouping-key alias awareness | `groupIntoDatasets`'s per-input loop checks `stageAliases` (sheet name, then file name — same precedence `recognizeStageScored` already uses) before falling back to `recognizeSheetStage`, so the grouping key itself reflects a learned alias, not just the post-grouping confidence score. |
| Active-preset picker UI | Out of scope for this spec — `is_active` can be set via the existing Staging "merge into preset" flow or a follow-up UI; this spec only needs the column and the read/write helper to exist and be correct. |

---

## 3. Architecture

```
registries table
  + is_active boolean default false      -- new column, one row true at a time

getActivePresetId() / getActiveRegistryRow()     [NEW — src/lib/store/index.ts or similar]
  ↓ replaces:
  ├─ registries.first()                          [RegistryContext / api/schema GET]
  ├─ "disposafe" literal                          [clear-schema/route.ts]
  ├─ "disposafe" literal                          [workbooks/page.tsx confirmStageAlias]
  └─ raw Supabase bypass + "disposafe" literal    [api/ingest/route.ts]

groupIntoDatasets(inputs, stageAliases)
  per-input loop: alias lookup (sheet, then file name) BEFORE recognizeSheetStage
  → grouping key (hash::basis::stage) now alias-aware, not just post-grouping score

GenericDashboardBody "needs review" badge
  Confirm control → stage picker (existing stages) + "+ New stage" input
    → new stage: POST /api/schema (append to active preset's stages)
    → then:      POST /api/registry-alias (unchanged contract, stageId now
                  either an existing or newly-created one)
```

### `getActivePresetId()` / `RegistryStore.setActive()`

Two new methods on `RegistryStore` (`src/lib/store/types.ts`), implemented
in both `MemoryRegistryStore` and `SupabaseRegistryStore` following the
exact shape of the existing `rename(presetId, name)` method:

```typescript
getActive(): Promise<RegistryRow | null>;    // the is_active=true row, or null if none is flagged
setActive(presetId: string): Promise<void>;  // clears the flag on all other rows, sets it on this one
```

A new helper (co-located with `getStores()` in `src/lib/store/index.ts`)
resolves "the active preset, or the bootstrap default if none exists":

```typescript
async function getActiveRegistryRow(): Promise<RegistryRow | null> {
  const { registries } = getStores();
  const rows = await registries.list();
  if (rows.length === 0) return null; // caller falls back to DISPOSAFE_REGISTRY
  return (await registries.getActive()) ?? (await registries.first()); // legacy rows predating is_active: oldest wins once, until explicitly activated
}
```

`first()` stays on the interface (existing tests / legacy-row migration
path depend on it) but is no longer called by any of the 4 defect sites —
only by this one fallback path, for presets that existed before this
migration and have never had `is_active` set.

### Supabase migration

```sql
ALTER TABLE registries ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT false;
```

Additive, matches every prior migration's convention in this repo.
`setActive()`'s "clear the flag on others" step is two statements (unset
all, then set the target) inside the same call — no transaction primitive
exists in the current Supabase adapter pattern, so a brief window with zero
or two active rows is possible under concurrent calls; acceptable for v1
(single-operator schema management, not a hot path).

### `/api/ingest`'s registry lookup

Replace lines 174-196's raw `createServerClient().from("registries")...`
block with `await getStores().registries.get(activePresetId)` (falling back
to `undefined`/`DISPOSAFE_REGISTRY` only if that returns `null`), removing
the now-redundant try/catch around a direct Supabase call. This is the one
change in this spec that touches `emit.ts`'s call site indirectly (the
`activeRegistry` object passed into `emitMany`) — `emit.ts` itself is not
modified, only what's passed into it.

### New-stage creation in `GenericDashboardBody`

The existing badge already has `onConfirmStage?: (datasetId, stageId) =>
void`. Extend the surrounding UI (not the callback contract) with a small
`<select>` of the active preset's known stages plus an "other" option that
reveals a text input; submitting either calls the same `onConfirmStage`
with the chosen or newly-typed stage id. The "create new stage" side
effect (POSTing to `/api/schema` to append the stage) lives in
`workbooks/page.tsx`'s `confirmStageAlias`, mirroring how it already talks
to `/api/registry-alias` — `GenericDashboardBody` stays a pure presentation
component with one callback, as it is today.

### Alias-aware grouping key

In `groupIntoDatasets` (`src/lib/dataset/registry.ts`), the per-input loop
currently does:

```typescript
const stage = recognizeSheetStage(inp.fileName, inp.sheetName);
```

Change to check `stageAliases` first (sheet name, then file name — mirrors
`recognizeStageScored`'s existing precedence in `recognize.ts`):

```typescript
const alias = stageAliases[normalizeAliasKey(inp.sheetName)] ?? stageAliases[normalizeAliasKey(inp.fileName)];
const stage = alias ? alias.stageId : recognizeSheetStage(inp.fileName, inp.sheetName);
```

This makes the grouping key alias-aware from the start; the existing
post-grouping `recognizeStageScored` call (added in the entity-resolution
plan) still runs afterward to compute `recognitionConfidence`/`recognitionBasis`
on the now-correctly-grouped dataset — no change needed there, since it
already re-derives from the same `stageAliases` map and will agree with
the (now alias-aware) grouping key by construction.

---

## 4. Data flow (only the changed paths)

1. Any route that needs "the current registry" calls `getActiveRegistryRow()`
   instead of `registries.first()` or a hardcoded string.
2. Clear Schema → the active preset's `stages`/`defects`/`sizes` become `[]`;
   `RegistryContext` refetches and the dashboard shows a genuinely empty
   schema until the user builds or uploads one.
3. Confirming a stage in Workbooks with a brand-new stage name → append to
   active preset's `stages` (`/api/schema`) → persist the alias
   (`/api/registry-alias`) → both against the *same*, correctly-resolved
   preset id.
4. Publishing a dataset to Cumulative (`GenericDatasetView`) → `/api/ingest`
   resolves the registry via `getStores().registries.get(activePresetId)`,
   working the same way in memory and Supabase modes.
5. Next Staging upload of the same file → `groupIntoDatasets` consults
   `stageAliases` at grouping time, so a previously-confirmed alias affects
   which dataset bucket a sheet lands in, not just its confidence label.

---

## 5. Error handling & invariants

- **Exactly one active preset, or none.** `setActive()` always clears other
  flags before setting the new one; `getActiveRegistryRow()` never returns
  more than one row's worth of ambiguity.
- **Zero presets is a real, valid state** (fresh install) — this is the
  only case that legitimately falls back to `DISPOSAFE_REGISTRY`'s shape,
  and it must stay clearly distinguishable from "a preset exists but wasn't
  flagged yet" (which falls back to `first()`, not `DISPOSAFE_REGISTRY`).
- **`/api/ingest` failing to resolve a registry is non-fatal**, same as
  today — falls back to `emit.ts`'s existing `DISPOSAFE_REGISTRY` default,
  just via the correct store abstraction instead of a raw, mode-dependent
  Supabase call.
- **New-stage creation never silently overwrites an existing stage** — the
  append path in `/api/schema` must reject (or dedupe against) a `stageId`
  that's already present, so a typo doesn't clobber a real stage's fields.

---

## 6. Testing

- `getActiveRegistryRow()` / `RegistryStore.setActive()`: round-trips
  through both memory and Supabase adapters (fallback pattern for
  Supabase, matching `stageAliases`' precedent); "zero presets" vs.
  "presets exist, none flagged" are distinct, correctly-handled cases.
- Regression test per fixed call site: `/api/schema` GET, `clear-schema`,
  `workbooks/page.tsx`'s confirm path, `/api/ingest` — each now resolves
  the same active preset, not four different guesses.
- Clear Schema leaves `stages`/`defects`/`sizes` as `[]`, not
  `DISPOSAFE_REGISTRY`'s values.
- New-stage creation: confirming an unrecognized dataset with a brand-new
  stage name appends it to the active preset and persists the alias
  against that same stage id; a duplicate stage id is rejected/deduped.
- Grouping-key alias awareness: two same-signature, same-schema sheets
  aliased to two *different* stages land in two separate `Dataset`s (not
  one), and the existing Task 8 regression guard (alias-free parity with
  the pre-alias behavior) still passes unchanged.

---

## 7. Out of scope (this spec)

- An actual "switch active preset" picker UI — this spec only needs
  `is_active`/`setActive()` to exist and be correct; wiring a UI control is
  a follow-up.
- Multi-preset concurrent editing/locking — single-operator assumption
  holds, same as the rest of this codebase today.
- Anything from the 2026-07-01 spec's `[G]` (schema-driven data entry) —
  already implemented via the registry/`RegistryContext` system; not
  touched here.
