# MO!D v2 — Technical Design Document (TDD)
*File-, API-, and DB-level changes for the MOD redesign · July 2026*
*Companion: [MOD-ADD.md](./MOD-ADD.md) (blueprint) · [MOD-MIGRATION-PLAN.md](./MOD-MIGRATION-PLAN.md) (sequencing)*

Verdicts: **KEEP** (untouched) · **MODIFY** (edited in place) · **REPLACE**
(responsibility survives, implementation is rewritten/relocated) · **DELETE**
(responsibility ceases to exist) · **NEW**. Every verdict names the dependency
impact — what breaks if you get it wrong.

---

## 1. New modules

| File (NEW) | Responsibility | Consumed by |
|---|---|---|
| `src/shared/models/ontology.ts` | Zod: `ModDocument`, `ModEntity`, `ModRelationship`, `ModFormula`, `ModLayout`, `ModValidationRule` (ADD §8) | everything below |
| `src/shared/models/workbook.ts` | Zod: `WorkbookSnapshot` (lossless sheets/cells/formulas/merges/formats), `WorkbookProfile` | reader, profiler, resolver, view-source |
| `src/shared/models/entities.ts` | Zod: `MappingProposal`, `VerificationDecision` (resolver ⇄ staging exchange) | resolver, staging UI, `/api/mods/verify` |
| `src/core/workbook/reader.ts` | xlsx → `WorkbookSnapshot`. Lossless; zero decisions. The ONLY new code allowed to import `xlsx` server-side | `/api/workbooks` |
| `src/core/workbook/snapshot-store.ts` | `workbook_snapshots` persistence (memory + supabase, same dual-adapter pattern as `store/`) | reader, view-source, ingest |
| `src/core/ontology/resolver/ladder.ts` | Orchestrates rungs: exact → knowledge → global → rules → LLM (ADD §11); emits `MappingProposal[]` | `/api/workbooks` |
| `src/core/ontology/resolver/{exact,knowledge,global,rules,llm}.ts` | One rung each. `llm.ts` uses `tryModels` + `generateObject(MappingProposalSchema)` — proposals only | ladder |
| `src/core/ontology/builder/build-mod.ts` | profile + accepted mappings + provenance → `ModDocument`; derives stages/defects/sizes catalogs from verified entities | `/api/mods` |
| `src/core/ontology/builder/learn.ts` | verified mappings → `company_knowledge` upserts (+use_count) | `/api/mods` |
| `src/core/ontology/store/mod-store.ts` | `mods` persistence; `activeFor(modId)`, `catalogFor(companyId)` (merged stage/defect/size catalog across verified MODs) | ingest, analytics labels, data entry, chat, capa |
| `src/core/ontology/store/knowledge-store.ts` | `company_knowledge` + `global_ontology` reads/writes | resolver, learn |
| `src/core/ontology/validate/mod-validator.ts` | Internal consistency: every profiled column has an entity; catalogs acyclic; no orphan relationships | `/api/mods` (reject invalid MODs) |
| `src/core/ingest/extract-from-mod.ts` | Verified MOD + snapshot rows → `StageDayRecord[]`. **The single successor of family parsers, schema-extractor classify, and to-stage-records** | staging publish, `/api/ingest` |
| `src/core/decision/engine.ts` + `rules/` | Canonical-variable rule evaluation over `decision_rules`; recommendation objects with lineage | `/api/decide`, capa, cockpit actions |
| `src/app/api/workbooks/route.ts` | POST upload → snapshot + profile + resolve → draft MOD + proposals | staging page |
| `src/app/api/mods/route.ts` + `mods/verify/route.ts` | MOD list/get/persist/verify (ADD §9) | staging, data-entry, workbooks explorer |
| `src/app/api/knowledge/route.ts` | Company knowledge browse/admin | settings |
| `src/app/api/entry-template/route.ts` | MOD → generated data-entry grid definition | data-entry page |
| `src/app/api/decide/route.ts` | Decision engine endpoint | cockpit, capa |
| `supabase/migrations/2026XXXX_mod_core.sql` | `workbook_snapshots`, `mods`, `company_knowledge`, `global_ontology`, `decision_rules` + RLS (ADD §7.1) | — |

## 2. Existing files — verdict table

### 2.1 Contracts & store (the spine — almost all KEEP)

| File | Verdict | Why / impact |
|---|---|---|
| `src/lib/contract/d1.ts` | **MODIFY** | Add nullable `modId`/`modVersion` to `Provenance`. `ClientRegistry`/`StageDef`/`DefectDef`/`SizeDef` types are *reused* by `ModDocument` catalogs. Content-hash inputs unchanged → existing eventIds stay stable |
| `src/lib/contract/d3.ts` | **KEEP** | Findings/adjudication/rulebook are MOD-agnostic |
| `src/lib/contract/hash.ts` | **KEEP** | Hashing is the idempotency IP |
| `src/lib/store/{index,memory,supabase,supabase-mappers,batch,types}.ts` | **MODIFY** | Remove `RegistryStore` + `getActiveRegistryRow` (Phase 4); event/finding/rulebook stores untouched. Impact: every `getStores().registries` caller must be gone first — grep before deleting |
| `src/lib/store/seed.ts` | **MODIFY** | Seeding goes through the MOD pipeline (dev-only); drop registry seeding |
| `src/lib/supabase.ts` | **KEEP** | Client factory |

### 2.2 Ingestion (the patch zone — mostly REPLACE/DELETE)

| File | Verdict | Why / impact |
|---|---|---|
| `src/lib/ingest/emit.ts` | **MODIFY** | Keeps `StageDayRecord`→events transform verbatim; `resolveDefect(d.raw, reg)` param becomes the MOD catalog; envelope writes `modId`/`modVersion`. Both entry paths (Excel + direct) still converge here — the choke point survives |
| `src/lib/ingest/parsers/*` (whole dir) | **DELETE** (Phase 5, after demotion) | Family parsers = hardcoded understanding. Demoted first to golden-test oracles proving `extract-from-mod` reproduces their output on the client corpus, then removed. Impact: `staging/page.tsx handleUpload`, `dedupe` import sites |
| `src/lib/ingest/parsers/dedupe.ts` | **REPLACE** → `src/core/ingest/dedupe.ts` | `dedupeByPrecedence` survives (correctness IP) but precedence keys off MOD source classes, not `routeFamily(filename)` |
| `src/lib/ingest/schema-extractor.ts` | **DELETE** | Regex role classification → resolver ladder; `classifyWithSchema` → `extract-from-mod.ts`; `extractSizesFromWorkbook` → resolver size-entity rung. Impact: staging page, api/schema |
| `src/lib/ingest/from-rejection-sheets.ts` | **DELETE** | Second fallback dies with the first. `toISODate` moves to `core/ingest/date.ts` (already has `ingest/date.ts` — merge there) |
| `src/lib/ingest/review.ts` | **KEEP** | Review-row building over StageDayRecords is pipeline-agnostic |
| `src/lib/ingest/date.ts` | **KEEP** | Pure date coercion, used by extract-from-mod |
| `src/lib/ingest/capture-fields.ts` | **DELETE** (Phase 4) | Hardcoded capture→label→field mappings; generated grids read MOD entities instead |
| `src/lib/entry/{period,validate-entry}.ts` | **KEEP** | Arithmetic/spike checks operate on records, not schemas; MOD `validation` rules ADD to them, not replace |

### 2.3 Profiler (promoted — the one patch-era layer that survives)

| File | Verdict | Why |
|---|---|---|
| `src/lib/schema/{profile,formula-class,from-workbook,signature,types}.ts` | **REPLACE** → `src/core/profiler/` | Same algorithms (role/type/formula-class/signature). Two changes: (a) consumes `WorkbookSnapshot` instead of re-reading xlsx; (b) name-based role *hints* (`MEASURE_NAME_RE`…) move out of `classifyRole` into resolver rung 4 rules — the profiler reports structure (type, cardinality, formula class), the resolver assigns meaning. Impact: `dataset/from-workbooks` (deleted anyway), tests move with it |

### 2.4 Dataset layer (superseded by MOD)

| File | Verdict | Why / impact |
|---|---|---|
| `src/lib/dataset/types.ts` | **DELETE** | `Dataset` ≈ proto-MOD; `ModDocument` subsumes it |
| `src/lib/dataset/registry.ts` (`groupIntoDatasets`) | **DELETE** | Signature grouping folds into the resolver (same-signature sheets share one proposal set) |
| `src/lib/dataset/recognize.ts` | **REPLACE** | `STAGE_PATTERNS` → `global_ontology` seed rows; `normalizeAliasKey` + majority-vote logic → `resolver/knowledge.ts`. The learning loop it pioneered IS resolver rung 2 |
| `src/lib/dataset/to-stage-records.ts` | **REPLACE** → `core/ingest/extract-from-mod.ts` | Same job, driven by verified entities instead of measure-word regexes |
| `src/lib/dataset/dashboard.ts` | **REPLACE** | `buildGenericDashboard` logic survives for draft-MOD previews, reading MOD entities + snapshot rows |
| `src/lib/dataset/{store,store-memory,store-supabase,row-store*,get-store,get-row-store}.ts` | **DELETE** | `datasets`/`dataset_rows` tables retire; snapshots + MODs hold this |
| `src/lib/dataset/{title,confirm-stage}.ts` | **DELETE** | Titles come from MOD stage entities; confirm-stage becomes `/api/mods/verify` |

### 2.5 Registry & presets (the fallback chain — dies)

| File | Verdict | Why / impact |
|---|---|---|
| `src/lib/registry/disposafe.ts` | **REPLACE** → migration seed script | The 14 stages / 28 defects / 10 sizes become `company_knowledge` + a seeded verified MOD for Disposafe. `resolveDefect`'s collapse-non-alphanumerics normalizer survives as `core/ontology/normalize.ts` (analytics depends on it). Impact: 12+ import sites — the single riskiest deletion; Phase 4 gates on grep-zero |
| `src/lib/registry/match-preset.ts` | **DELETE** | Preset ranking is obsolete; resolver caching (profile-signature hit) replaces the "have I seen this shape?" question |
| `src/lib/registry/fbc-process.ts` | **REPLACE** | 23-node flow becomes MOD `relationships`/stage funnel data for the seeded Disposafe MOD; process-flow page reads the catalog |

### 2.6 Analytics (formulas frozen — labels re-pointed)

| File | Verdict | Why |
|---|---|---|
| `src/lib/analytics/{canonical,scope,index}.ts` | **KEEP** | Dedup + scoping are ledger-level |
| `src/lib/analytics/rejection.ts` | **MODIFY** | Stage order/labels/entry-stage from MOD catalog (`catalogFor`), not `DISPOSAFE_REGISTRY`. Formulas byte-identical |
| `src/lib/analytics/defect.ts` | **MODIFY** | `resolveDefect` → `resolveEntity(raw, catalog)`; same normalizer, same "verbatim, never Unknown" rule |
| `src/lib/analytics/{size,cost,trust,status,narrative}.ts` | **MODIFY** (mechanical) | Catalog-lookup injection only |
| Legacy: `src/lib/metrics.ts`, `src/lib/dashboard-builder.ts`, `src/types/{metrics,analysis,dashboard}.ts`, `src/lib/parser.ts` | **DELETE** (Phase 5) | Already-dead session pipeline. `parser.ts`'s `detectHeaderRow`/`buildHeaderBlock`/`normalizeHeaders`/`colIndexToLabel` are still imported by schema-extractor — they move into `core/workbook/reader.ts` (header detection is structural, thus reader/profiler territory) |
| `src/lib/chart-utils.ts`, `src/lib/audit-package.ts` | **KEEP** | Audit package gains MOD version in manifest (1-line) |

### 2.7 AI

| File | Verdict | Why |
|---|---|---|
| `src/lib/ai.ts` | **KEEP** | `tryModels` chain is the LLM transport for resolver rung 5 too |
| `src/lib/schemas.ts` | **MODIFY** | Add `MappingProposalSchema`; retire graph/dashboard schemas with the legacy pipeline. Cross-provider rules in the header still govern; `npm run check:ai` after |
| `src/lib/analysis-utils.ts` | **DELETE** (Phase 5) | Legacy prompt builders |

### 2.8 API routes

| Route | Verdict | Why |
|---|---|---|
| `api/events`, `api/day-records`, `api/manual-entries`, `api/raw-file`, `api/archive-upload`, `api/hard-reset`, `api/clear-data` | **KEEP** | Ledger plumbing. hard-reset extends to clear MOD tables |
| `api/ingest` | **MODIFY** | Registry-preset resolution block (lines ~174-196) → `mod-store.catalogFor`; body gains `modId`. Reconcile/findings/corrections logic untouched |
| `api/chat` | **MODIFY** | Context builder reads MOD catalog instead of registry |
| `api/schema` (+`__tests__`) | **DELETE** (Phase 4, after compat shim) | Preset CRUD → `/api/mods`. Shim maps GET to active-MOD catalog during transition so data-entry keeps working mid-migration |
| `api/registry-alias` | **DELETE** | → `/api/mods/verify` + learn step |
| `api/datasets` | **DELETE** | → `/api/mods` + snapshots |
| `api/clear-schema` | **DELETE** | Meaningless without presets |
| `api/analyze` | **DELETE** (Phase 5) | Legacy |

### 2.9 Screens & components

| File | Verdict | Why |
|---|---|---|
| `src/app/staging/page.tsx` | **REPLACE** | The 5-path `handleUpload` becomes: POST `/api/workbooks` → render proposals (header → canonical → confidence → reason → ✓) + the existing editable value-review grid → verify → publish via extract-from-mod → `/api/ingest`. The review-grid/comments/findings UX survives; the plumbing shrinks by ~half the file |
| `src/app/data-entry/page.tsx` | **REPLACE** | Preset picker + schema-editor modal + `validateSchemaSafety` die; grid renders from `/api/entry-template`. `MonthlyEntryGrid`/`WeekPicker`/ledger tab stay (fed by generated template) |
| `src/app/schema/page.tsx` | **DELETE** | Preset admin obsolete; knowledge browse lands in settings |
| `src/app/workbooks/page.tsx` | **MODIFY** | Explorer reads snapshots + MOD entities (richer: shows meaning + verification state per column) |
| `src/app/page.tsx` (cockpit) + analytics screens (`stage-analysis`, `size-analysis`, `defect-analysis`, `spc`, `copq`, `reports`, `audit`, `process-flow`) | **MODIFY** (mechanical) | Labels/funnels via MOD catalog hook instead of `DISPOSAFE_REGISTRY` import |
| `src/app/{chat,capa}/page.tsx` | **MODIFY** | Source flyout shows MOD version; CAPA lists decision-engine recommendations |
| `src/app/settings/page.tsx` | **MODIFY** | Preset management → MOD versions + company knowledge admin |
| `src/components/app/RegistryContext.tsx` | **REPLACE** → `OntologyContext` | Provides `{catalog, activeMods}` app-wide; same provider slot in `AppShell` |
| `src/components/app/StageConfirmPicker.tsx` | **REPLACE** | Becomes the mapping-verification row control (accept/override canonical) |
| `src/components/{MonthlyEntryGrid,DatasetEntryForm,WeekPicker,UploadZone,ParetoChart,…}.tsx` | **KEEP/MODIFY** | Grid components take generated column defs as props — they already render dynamic columns; the source of the defs changes |
| `src/components/app/{AppShell,EventsContext,widgets,GenericDashboardBody}.tsx`, `src/components/editorial/*` | **KEEP** | Design system + events plumbing untouched |
| `src/components/{Dashboard,InsightSlide,ProcessingLoader,FloatingDetailModal}.tsx` | **DELETE** (Phase 5) | Legacy session dashboard |
| `src/components/app/GenericDatasetView.tsx` | **REPLACE** | Draft-MOD preview (reads relocated generic-dashboard builder) |

### 2.10 Tests & scripts

| File | Verdict | Why |
|---|---|---|
| `src/__tests__/{golden,analytics,audit-correctness,no-rounding,timeline,store,canonical-direct-entry,confidence-basis,ingest-emit,ingest-review}.test.ts` | **KEEP** | The correctness proof. Golden totals must stay green through every phase |
| `parser-*.test.ts`, `ingest-classify.test.ts`, `schema-extractor.test.ts` | **REPLACE** | Become the oracle suite for `extract-from-mod` (same fixtures, new subject), then the reader/profiler suites |
| `registry-store-*.test.ts`, `dataset/__tests__/*`, `api/{schema,registry-alias,datasets,clear-schema}/__tests__` | **DELETE** with their subjects | — |
| `scripts/{seed,reseed-db,ground-truth,derive-golden,inspect-sheets,diagnose-analytical,audit-*}.ts` | **MODIFY** | Seed via MOD pipeline; diagnostics read catalog. `check-ai.ts` KEEP |
| NEW: `scripts/migrate-presets-to-mods.ts` | **NEW** | One-shot: registries → seeded MODs + company_knowledge (MIGRATION-PLAN §Phase 4) |

## 3. Analytics current → future (per the redesign prompt)

| Module | Current reads | Future reads |
|---|---|---|
| rejection/defect/size/cost/trust/status | events + `DISPOSAFE_REGISTRY` (labels, funnel, defect aliases) | events + `catalogFor(companyId)` (MOD-derived) |
| scope, canonical | events only | unchanged |
| narrative | computed metrics | unchanged (+ MOD stage labels) |
| generic dataset dashboards | `datasets`/`dataset_rows` | draft MOD + snapshot rows |
| legacy metrics.ts graph | raw sheets | deleted |

Nothing anywhere references a workbook header after Phase 5 except through a
MOD entity.

## 4. Dependency-impact map (deletion order matters)

```
disposafe.ts ◄── emit.ts, analytics/*, recognize.ts, registry.ts(dataset),
                 api/schema, staging, data-entry, contexts, seed.ts
     └─ delete LAST (Phase 5), after catalogFor() replaces every import

schema-extractor.ts ◄── staging/page, api/schema (createdFrom), tests
parsers/* ◄── staging/page, dedupe callers, tests
dataset/* ◄── staging (fire-and-forget), workbooks page, api/datasets
RegistryStore ◄── api/schema, api/registry-alias, api/ingest, seed
     └─ all four die together in Phase 4 behind the compat shim
```

## 5. API contracts (request/response sketches)

```
POST /api/workbooks           {files} → {snapshotIds[], profile, draftMod, proposals:[
                                {entityId, original:{sheet,colLetter,header},
                                 canonical, confidence, resolvedBy, reason,
                                 alternatives:[{canonical, confidence, resolvedBy}]}]}
POST /api/mods/verify         {modId, decisions:[{entityId, accept|{canonical}}]} → {modId, version:'draft'}
POST /api/mods                {modId} (publish draft) → {modId, version, status:'verified'}
GET  /api/entry-template?modId=… → {stages:[{stageId,label,columns:[{key,label,type,
                                 required,validation}],headerRows,merges}]}
POST /api/ingest              {ingestionId, fileName, modId, records, comments} → (unchanged response)
POST /api/decide              {scope} → {recommendations:[{ruleId, ruleVersion, severity,
                                 text, evidence:{eventIds, vars}}]}
```

All Zod-validated; LLM-adjacent schemas follow `schemas.ts` cross-provider rules.
