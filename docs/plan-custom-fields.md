# Plan: First-class Excel-like custom field schema (persisted, queryable)

## Goal
Let operators define arbitrary columns ("fields") once — name, type, required, and
which stages they apply to — have the system EXTRACT them from uploaded Excel, let
them edit the schema, and **store each field's value as structured, queryable
canonical data** (not a comment blob). Custom fields become real dimensions you can
group/filter by, like stage/size today.

## Invariants (do not break)
1. Append-only ledger. Edits/deletes = `CorrectionEvent` (`src/lib/contract/d1.ts`);
   `EventStore.effective()` drops superseded. Reuse the ingest upsert in
   `src/app/api/ingest/route.ts`; no parallel write path.
2. Model never invents numbers; values come only from cells/typed entry.
3. Schema is the contract: extend Zod in `d1.ts` + `src/lib/schemas.ts`; use
   `.nullable()` not `.optional()` for any LLM-facing shape.
4. One schema, three consumers (staging extract → data entry → analytics) via the
   `registries` table + `/api/schema`.

## 1. Field definitions in the registry
Extend `ClientRegistry` (`d1.ts`) and `DISPOSAFE_REGISTRY`
(`src/lib/registry/disposafe.ts`) with `customFields`:
`{ fieldId; label; type:"number"|"text"|"date"|"enum"; options?:string[]|null;
   required:boolean; stageIds:string[]|null /* null=all */; unit?:string|null }`.
Add `CustomFieldDef` Zod. `/api/schema` GET returns them; POST maps extracted
non-role columns → customFields and upserts (new `registries.custom_fields jsonb`
migration in `supabase/migrations/`).

## 2. Value storage (structured, queryable)
**Option A (recommended):** add optional `attributes: Record<string,string|number>|null`
to the `ProductionEvent`/`InspectionEvent` envelope in `d1.ts`; persist as `events.attributes jsonb`
(update `src/lib/store/supabase-mappers.ts` + migration). Values ride the existing
stage·day event, so the ingest upsert supersedes them correctly on re-ingest.
(Option B: a separate `EntryAttributeEvent` only if attributes must exist without a
metric row — more plumbing; avoid unless needed.)

## 3. Ingestion / extraction (carryover)
- `src/lib/ingest/schema-extractor.ts`: surface non-role, non-formula columns as
  candidate custom fields (infer type from data); return on `ExtractedSchema`.
- `classifyWithSchema` + `emitStageDay` (`src/lib/ingest/emit.ts`): write confirmed
  custom values into `record.attributes` / event `attributes`, keyed by `fieldId`,
  with provenance cells.

## 4. Data Entry (`src/app/data-entry/page.tsx`)
- Drive the custom-field grid from `registry.customFields` (already fetched via
  `/api/schema`) instead of ad-hoc local state. Render Excel-like rows: label,
  type-aware value input, required indicator. Required-empty blocks submit (extend
  `blockingErrors`); optional-empty skipped.
- "Add/Remove Field" edits `registry.customFields` (POST `/api/schema`) so a field
  defined once persists and reappears daily (the carryover). `stageIds` controls
  which stage rows show it.
- On submit, write values to `attributes`; the date-load effect prefills them too.

## 5. Analytics (real dimensions)
- `src/lib/analytics/scope.ts`: add `attrFilters?: Record<string,string>` to `Scope`;
  `scopeEvents` filters on `attributes`.
- New `src/lib/analytics/attributes.ts`: `byAttribute(events, scope, fieldId)`
  (mirror `byStage`/`bySize`); export via `analytics/index.ts`.
- Optional: a header custom-field filter (TweaksContext + AppShell) feeding
  `resolveScope`, like `stageView`.

## 6. Schema view (`src/app/schema/page.tsx`)
Add a "Custom Fields" table (fieldId, label, type, required, stages, unit) from the
live registry.

## 7. Migration & safety
New migration: `registries.custom_fields jsonb default '[]'`, `events.attributes
jsonb`. No backfill (append-only). Re-ingest (Clear Data → re-upload) so attributes
populate.

## Acceptance
- Define "Mould No." (text, required, stages=[balloon]) → persists, shows on the
  Balloon row daily, blocks submit when empty.
- Upload a workbook with an extra column → staging proposes it → on confirm its
  values land on events (visible in View Source) and are filterable via
  `attrFilters` / groupable via `byAttribute`.
- Re-upload updates, never doubles (rides the upsert).
- `npx tsc` clean; `npx jest` green (tests: attribute round-trip in
  supabase-mappers, `byAttribute`, schema POST→customFields).

## Files
`contract/d1.ts`, `lib/schemas.ts`, `registry/disposafe.ts`, `api/schema/route.ts`,
`ingest/schema-extractor.ts`, `ingest/emit.ts`, `store/supabase-mappers.ts` +
`supabase/migrations/`, `analytics/scope.ts`, `analytics/attributes.ts` (new),
`analytics/index.ts`, `app/data-entry/page.tsx`, `app/schema/page.tsx`,
(optional) `editorial/TweaksContext.tsx` + `app/AppShell.tsx`.
