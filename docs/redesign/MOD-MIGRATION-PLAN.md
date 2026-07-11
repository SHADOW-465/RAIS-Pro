# MO!D v2 — Migration Plan
*Phased roadmap: patch architecture → MOD single-source-of-truth, without breaking anything · July 2026*
*Companion: [MOD-ADD.md](./MOD-ADD.md) · [MOD-TDD.md](./MOD-TDD.md)*

**Strategy: strangler fig.** The new pipeline grows alongside the old one behind
a flag, proves it reproduces the golden corpus exactly, then the old paths are
deleted phase by phase. The event ledger is **never migrated** — it is the
stable interface both worlds write to.

**Invariant gate for every phase** (from engineering spec v4 §16):
`npx jest` green (golden totals match the client's YEARLY sheet exactly),
doubling-stability test green, `tsc` + build green. A phase that can't hold the
gate doesn't merge.

---

## Phase 0 — Baseline & flag (½ day)

- Tag current main; record golden outputs (`scripts/derive-golden.ts`) as the oracle.
- Add `MOD_PIPELINE` env flag (off = today's behavior, byte-for-byte).
- Remove the five merged worktrees (all already in main).

**Rollback:** trivial — nothing changed.

## Phase 1 — Knowledge-plane foundation (no UI change)

Build: `shared/models/*` (ModDocument/Snapshot/Proposal Zod), migration
`mod_core.sql` (5 new tables + RLS), `core/workbook/reader.ts` (lossless
snapshot; absorbs `parser.ts` header detection), `snapshot-store`, `mod-store`,
`knowledge-store`, seed `global_ontology` concepts.

Relocate profiler `lib/schema/*` → `core/profiler/` (imports only; behavior
frozen by its existing tests).

**Proof:** unit tests — snapshot round-trips a real corpus workbook losslessly
(every formula, merge, header); profiler output identical pre/post move.
**Rollback:** new tables are additive; drop them.

## Phase 2 — Resolver + verification UI (flag-gated)

Build: resolver ladder (`exact/knowledge/global/rules/llm`), `/api/workbooks`,
`/api/mods` + `/verify`, `build-mod.ts`, `learn.ts`, `mod-validator.ts`.

Staging page (flag on): upload → proposals panel (Excel header → canonical →
confidence → reason → accept/override) rendered ABOVE the existing value-review
grid. Verifying publishes a MOD version and writes company knowledge. The old
parse path still produces the records below — both run, user sees both.

**Proof:** fixture tests — resolver on the Disposafe corpus profiles proposes
the same stage/defect/measure mappings the family parsers hardcode (≥ rung-4
without LLM; LLM rung mocked in tests). `check:ai` green for
`MappingProposalSchema`.
**Rollback:** flag off — staging behaves exactly as today.

## Phase 3 — MOD-driven ingestion (the crossover)

Build: `core/ingest/extract-from-mod.ts` (verified MOD + snapshot → StageDayRecords),
dedupe re-keyed off MOD source classes, `emit.ts` takes the MOD catalog +
stamps `modId/modVersion` into provenance, `/api/ingest` resolves via
`catalogFor()` (registry block removed behind the flag).

**Oracle test (the heart of the migration):** for every corpus workbook,
`extract-from-mod(verifiedMod, snapshot)` must produce StageDayRecords whose
emitted events yield **identical analytics totals** to the family-parser path.
The `parser-*/ingest-classify` test fixtures become this oracle suite.
EventIds will differ (provenance gains mod fields) — totals must not.

**Proof:** golden totals identical with flag on vs off, on the full corpus.
**Rollback:** flag off; ledger unaffected (append-only, idempotent).

## Phase 4 — Data entry + registry retirement (data migration happens here)

- `/api/entry-template` + data-entry page consumes it; preset picker and schema
  editor modal removed; `capture-fields.ts` deleted.
- **Migration script `scripts/migrate-presets-to-mods.ts`** (one-shot, idempotent):
  - each `registries` preset → a seeded **verified MOD** (stages/defects/sizes →
    document catalogs; `created_from_filename` → workbook ref; no snapshot →
    synthetic snapshot marked `migrated:true`),
  - `stage_aliases` → `company_knowledge(kind='stage-alias')`,
  - `DISPOSAFE_REGISTRY` constants → Disposafe company knowledge + seed MOD
    (the same knowledge, demoted from code to data),
  - `datasets`/`dataset_rows` → not migrated (derivable; the explorer re-reads
    snapshots) — verify the workbooks page first.
- `/api/schema` compat shim (GET → active MOD catalog) for one release, then
  delete with `api/registry-alias`, `api/datasets`, `api/clear-schema`,
  `RegistryStore`, `dataset/*`, schema page.
- No existing data is lost: `registries`/`datasets` tables are renamed
  `_retired_*` for one release before dropping.

**Proof:** run migration against a copy of prod data; diff `catalogFor()` output
vs old `api/schema` GET response (shim makes this a direct A/B). Direct entry
round-trip: enter → ledger → day-records reload → identical grid.
**Rollback:** shim + `_retired_` tables mean either direction is a rename.

## Phase 5 — Consumer re-pointing + legacy deletion

- Analytics/screens/chat/capa read `catalogFor()`; `resolveDefect` →
  `resolveEntity` (same normalizer); `RegistryContext` → `OntologyContext`.
- Delete: `registry/disposafe.ts` (grep-zero gate), `fbc-process.ts` (→ seed
  data), family parsers, `schema-extractor.ts`, `from-rejection-sheets.ts`,
  legacy pipeline (`api/analyze`, `metrics.ts`, `dashboard-builder.ts`,
  `Dashboard.tsx`, `parser.ts`, `analysis-utils.ts`, legacy types), their tests.
- Audit package manifest gains MOD version. View-source triangulates
  cell ↔ entity ↔ event.
- Remove the `MOD_PIPELINE` flag — the new path is the only path.

**Proof:** full jest + golden + build; UI walkthrough of all 11 screens against
seeded prod copy; export ZIP diff (numbers identical, manifest richer).
**Rollback:** git revert of the deletion commit — earlier phases left both
paths working, so the deletion commit is isolated and small-risk.

## Phase 6 — Decision engine (additive)

`decision_rules` + `core/decision/engine.ts` + `/api/decide`; CAPA and cockpit
"Recommended Actions" read it. Rules operate on canonical variables only.
LLM explains rule hits via `tryModels`; never originates numbers.

**Proof:** rule-eval unit tests with canonical-variable fixtures; recommendation
lineage (rule version + event ids) visible in UI.
**Rollback:** additive; disable the route.

---

## Testing plan (cross-phase)

| Layer | Test | Phase |
|---|---|---|
| Reader | lossless round-trip on real corpus files | 1 |
| Profiler | frozen behavior (existing tests relocated) | 1 |
| Resolver | corpus proposals ≥ parser-equivalent mappings; LLM rung mocked; alias learning loop | 2 |
| MOD | validator rejects orphan entities; version supersede; one-verified-per-lineage index | 2 |
| Extraction | **oracle suite**: extract-from-mod ≡ family parsers on corpus totals | 3 |
| Ledger | doubling-stability, idempotency, correction supersede (existing, unchanged) | all |
| Golden | client YEARLY totals exact | all |
| Migration | preset→MOD A/B diff via shim; direct-entry round-trip | 4 |
| E2E | upload → verify → publish → cockpit → export walkthrough | 5 |

## Rollback summary

| Phase | Mechanism |
|---|---|
| 1 | drop additive tables |
| 2–3 | `MOD_PIPELINE=off` |
| 4 | compat shim + `_retired_` table renames |
| 5 | single isolated deletion commit → revert |
| 6 | disable route |

The ledger's append-only + content-hash design means **no phase can corrupt
historical facts** — worst case is a wrong *interpretation*, which a new MOD
version supersedes without touching events.
