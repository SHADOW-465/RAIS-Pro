# MO!D v2 — Architecture Design Document (ADD)
*The Manufacturing Ontology Document redesign · July 2026 · Blueprint, not code*
*Companion documents: [MOD-TDD.md](./MOD-TDD.md) (file/API/DB-level changes) · [MOD-MIGRATION-PLAN.md](./MOD-MIGRATION-PLAN.md) (phased roadmap)*

---

## 0. Executive summary

Every uploaded workbook today is understood by **six overlapping mechanisms** (family
parsers, generic schema extractor, rejection-sheet classifier, dataset profiler,
registry presets, stage-recognition regexes), each patching the gaps of the others,
each with its own hardcoded Disposafe knowledge. The redesign collapses all six into
**one pipeline** producing **one persisted, versioned database entity** — the
**Manufacturing Ontology Document (MOD)** — which every downstream module consumes.

> **MOD is a database record, not a code file.** The codebase contains only the
> models, builders, validators, resolver, and APIs that operate on it. Every
> verified workbook creates a persisted, versioned MOD row.

**What does NOT change:** the append-only canonical event ledger, its provenance
envelope, content-hash idempotency, `canonicalizeEvents` dedup, the deterministic
analytics formulas, the Findings/adjudication loop, the audit package, the
`tryModels` AI chain, and the editorial UI system. Those are the proven IP
(engineering spec v4 §16 invariants). **MOD replaces the *understanding* layer,
not the *facts* layer.**

```
        UNDERSTANDING (replaced)                 FACTS (kept)
  parsers/presets/registry/recognizers   →   event ledger + analytics
        becomes: MOD pipeline                 (unchanged formulas)
```

---

## 1. Current architecture (as reverse-engineered)

### 1.1 Module inventory

| Module | Files | Responsibility today |
|---|---|---|
| **Contracts** | `src/lib/contract/{d1,d3,hash}.ts` | Zod event union (7 event types + envelope), Findings/Adjudication/Rulebook, SHA-256 content hashing |
| **Store** | `src/lib/store/*` | `getStores()` → EventStore / FindingStore / RulebookStore / RegistryStore; memory + Supabase adapters |
| **Family parsers** | `src/lib/ingest/parsers/*` | `routeFamily(filename)` → hardcoded per-layout parsers (size-wise, rejection-analysis, assembly-daily); `dedupeByPrecedence` |
| **Generic extractor** | `src/lib/ingest/schema-extractor.ts` | Regex header→role classification (`CHECKED_RE`…), `classifyWithSchema` → StageDayRecords; hardcoded `DEFECT_CODES`, `STAGE_PATTERNS` |
| **Rejection classifier** | `src/lib/ingest/from-rejection-sheets.ts` | Second fallback: sheet-name → stage monthly books |
| **Emit** | `src/lib/ingest/emit.ts` | `StageDayRecord` → canonical events (shared by Excel + direct entry). Sound; keeps |
| **Profiler** | `src/lib/schema/{profile,formula-class,from-workbook,signature}.ts` | Column role/type/formula-class profiling + schema signatures. Newest, cleanest; becomes pipeline Step 2 |
| **Datasets** | `src/lib/dataset/*` | Signature-grouped datasets, stage recognition (regex + learned aliases), generic dashboards, `toStageRecords` publish path |
| **Registry** | `src/lib/registry/disposafe.ts`, `match-preset.ts`, `fbc-process.ts` | Hardcoded Disposafe stages/defects/sizes; `resolveDefect`; Jaccard preset matcher |
| **Presets** | `api/schema` + `RegistryStore` | Extracted schemas saved as presets; `is_active` flag; learned `stageAliases`; `DEFAULT_FIELDS` + `DISPOSAFE_REGISTRY` fallbacks |
| **Analytics** | `src/lib/analytics/*` | Pure selectors over canonical events (rejection, defect, size, cost, trust, status, scope, narrative) |
| **AI** | `src/lib/ai.ts`, `schemas.ts` | `tryModels` provider chain; classification + narrative only |
| **Screens** | `src/app/*` | cockpit, staging, data-entry, workbooks, schema, analytics screens, chat, capa, audit, settings |
| **Legacy (dead)** | `api/analyze`, `lib/metrics.ts`, `lib/dashboard-builder.ts`, `components/Dashboard.tsx`, most of `lib/parser.ts` | Superseded session-dashboard pipeline; marked do-not-extend |

### 1.2 Current database (Supabase migrations)

`raw_files, ingestions, events, findings, adjudications, rulebook_rules,
rule_applications, registries (+ name, created_from_filename, sizes, stage_aliases,
is_active), cost_config, datasets (+ recognized_stage_id, recognition_confidence,
recognition_basis), dataset_rows`

### 1.3 Current upload data flow (the patch architecture, verbatim from `staging/page.tsx handleUpload`)

```
                          Excel file(s)
                               │
       ┌───────────────────────┼──────────────────────────────┐
       ▼ (fire-and-forget)     ▼                              ▼
  dataset profiler       extractSchemaFromWorkbook      recordsFromBuffer
  (signature group,      (regex roles; filtered by      (routeFamily on
   stage recognition,     active preset's stageIds!)     FILENAME → family
   POST /api/datasets)         │                          parsers)
       │                       │ produces "firstSchema"       │
       │                       ▼                              ▼
       │                master mode? ──► POST /api/schema   preceded.length>0?
       │                (creates a PRESET, sets active)      │yes         │no
       │                       │                             ▼            ▼
       │                       │                    dedupeByPrecedence  classifyWithSchema
       │                       │                             │          └─empty?→ classifyRejectionSheets
       │                       │                             ▼            │
       │                       └────────────► filter by preset stageIds ◄─┘
       │                                                     ▼
       │                                            review grid (edit/comment)
       │                                                     ▼
       │                                             POST /api/ingest
       │                                     (reconcile, findings, emitMany
       │                                      w/ activeRegistry ?? DISPOSAFE)
       │                                                     ▼
       └────────────► /workbooks explorer          append-only event ledger
                       (datasets + rows)                     ▼
                                                  GET /api/events → canonicalizeEvents
                                                             ▼
                                                   analytics/* → 11 screens
```

Five understanding paths run **on the same upload**, disagree silently, and the
preset filter (`masterStageIds`) can silently discard rows the parsers produced.

### 1.4 Where Disposafe knowledge is hardcoded today (must all die)

| Knowledge | Locations (duplicated) |
|---|---|
| Stage patterns (`/valve/`, `/balloon/`…) | `schema-extractor.ts` `STAGE_PATTERNS`, `dataset/recognize.ts` `STAGE_PATTERNS` |
| Defect codes + aliases | `registry/disposafe.ts` (28 codes), `schema-extractor.ts` `DEFECT_CODES` set |
| Stage funnel + captures | `registry/disposafe.ts` (14 stages), `registry/fbc-process.ts` (23-node flow) |
| Measure-word regexes | `schema-extractor.ts`, `schema/profile.ts`, `dataset/to-stage-records.ts` (3 diverging copies) |
| Default entry fields | `api/schema/route.ts` `DEFAULT_FIELDS`, `ingest/capture-fields.ts` |
| Sizes (Fr6–Fr24) | `registry/disposafe.ts`, size-regexes in 3 files |
| Workbook family shapes | `ingest/parsers/*` (whole directory) |
| Fallback chain | `api/schema` GET → active preset → oldest preset → `DISPOSAFE_REGISTRY` |

---

## 2. Problems with the current architecture

1. **No single source of truth.** A column's meaning is decided in up to six places;
   whichever path runs last wins. "Data leaks" are exactly this: a value classified
   by path A is filtered by path B's stage list or shadowed by path C's fallback.
2. **Every block mutates the previous block.** Parser drops columns (preset filter),
   schema adds defaults (`DEFAULT_FIELDS`), registry falls back to Disposafe,
   data entry adds fields (`customFields`/extra columns), so provenance of *meaning*
   is lost even though provenance of *values* is excellent.
3. **Hardcoded company.** Onboarding a second company means editing 8+ files.
   The registry fallback means Disposafe's defect catalog silently applies to any
   uploaded workbook that lacks a preset.
4. **Duplicated heuristics drift.** Three measure-word regexes and two stage-pattern
   tables already disagree in small ways; each fix lands in one copy.
5. **Presets conflate four things** — schema shape, data-entry template, stage
   catalog, learned aliases — so changing one risks the others (`api/schema` POST
   silently rewrites stages but preserves aliases; renames vs upserts vs setActive
   interleave).
6. **The LLM is underused where it's strong** (semantic mapping) and the heuristics
   are overextended where they're weak (novel layouts), because there is no place
   for a *proposal + verification* cycle to live.

## 3. Root causes

- **Understanding was never modeled as data.** It lives in code (regexes,
  parsers, presets) so it can't be versioned, verified, audited, or learned.
- **Each new workbook family added a parallel path** instead of enriching a
  shared model — because there was no shared model to enrich.
- **Verification exists for values (staging grid) but not for meaning** —
  the user can edit a number but never confirm "this column IS Rejected Qty",
  so the system can't learn mappings (stageAliases was the first patch toward
  this; it proves the need).

---

## 4. Proposed architecture

### 4.1 Overview

```
                         Excel Upload
                              │
                              ▼
                ┌──────────────────────────┐
                │  1. Workbook Reader (TS) │  lossless: sheets, cells, formulas,
                │     NO decisions         │  merges, formats → workbook_snapshots
                └────────────┬─────────────┘  + raw file archive (existing)
                             ▼
                ┌──────────────────────────┐
                │  2. Profiler (TS)        │  structure only: tables, columns,
                │     NO semantics         │  datatypes, cardinality, formula
                └────────────┬─────────────┘  classes, neighbours (exists today:
                             ▼                src/lib/schema/*)
                ┌──────────────────────────┐
                │  3. Entity Resolver      │  hybrid ladder (§11):
                │     PROPOSES mappings    │  exact → company knowledge → global
                └────────────┬─────────────┘  ontology → rules → LLM. Confidence
                             ▼                per proposal. Never silently applies.
                ┌──────────────────────────┐
                │  4. Staging Verification │  human confirms/overrides/comments
                │     (existing page)      │  each mapping. Excel header → canonical
                └────────────┬─────────────┘  → confidence → reason → ✓
                             ▼
                ┌──────────────────────────┐
                │  5. MOD Builder + Store  │  verified mappings + profile +
                │     versioned DB entity  │  provenance → mods row (vN).
                └────────────┬─────────────┘  Verifications feed company_knowledge.
                             │
     ┌───────────┬───────────┼────────────┬─────────────┐
     ▼           ▼           ▼            ▼             ▼
 Data Entry   Ingestion   Analytics   View Source    Ask RAIS / CAPA
 (generated   (MOD-driven (canonical  (MOD stores    (reads MOD +
  grid from    cell→event  events,     workbook→cell  ledger, never
  MOD layout)  extraction) unchanged   →entity map)   raw Excel)
     │           │          formulas)
     └───────────┴──── all writes still flow through emitStageDay() ────┐
                                                                        ▼
                                              append-only canonical event ledger
                                                       (UNCHANGED)
                                                            ▼
                                              Decision Engine (rules + ML + LLM)
                                              (recommendations, explanations)
```

### 4.2 The two-plane principle

- **Knowledge plane (new):** MOD + company knowledge + global ontology. Versioned
  rows. Answers *"what does this workbook mean?"*
- **Fact plane (kept):** canonical event ledger. Append-only. Answers *"what
  happened on the line?"*

Events gain `modId`/`modVersion` in their provenance, so every number traces to
both the source cell **and** the version of understanding used to read it.

### 4.3 What is deleted (per the redesign mandate)

Disposafe registry fallback chain · hardcoded default schema · preset defaults ·
hardcoded defects/stages/captures/sizes · hardcoded data-entry templates · family
parsers (demoted to golden-test references, then removed) · `extraDefects`-style
side channels · the `datasets`/`dataset_rows` parallel store (superseded by MOD +
snapshots). **The uploaded, verified workbook becomes the template.**

---

## 5. Data flow (end to end)

```
upload → snapshot(lossless JSON, hash)                       [no decisions]
       → profile(snapshot) → WorkbookProfile                 [structure only]
       → resolve(profile, companyKnowledge, globalOntology)  [proposals + confidence]
       → verify(user) → accepted mappings                    [human authority]
       → buildMOD(profile, mappings, provenance) → mods vN   [single source of truth]
       → learn(verifications) → company_knowledge            [system learns]

data entry:   MOD.layout + MOD.entities → generated grid → StageDayRecord[]
excel ingest: MOD.entities + snapshot rows → cell extraction → StageDayRecord[]
both:         → validate (MOD.validation + arithmetic rules) → emitMany → ledger

read side:    ledger → canonicalizeEvents → analytics/* → cockpit/screens
              MOD → entity catalog (stages/defects/sizes) → labels, funnels, scoping
              MOD → view-source (cell ↔ entity ↔ event triangulation)
```

## 6. Control flow (who decides what)

| Decision | Owner | Never decided by |
|---|---|---|
| What bytes are in the workbook | Workbook Reader | anyone else (lossless) |
| Column datatype/structure | Profiler (deterministic) | LLM |
| Proposed meaning of a column/sheet | Resolver ladder | — |
| **Accepted** meaning | **User (staging verification)** | LLM, heuristics |
| Canonical entity catalog for a company | MOD (verified) + company knowledge | code constants |
| Numbers on dashboards | `analytics/*` pure JS over events | LLM (invariant kept) |
| Narrative/explanations | LLM via `tryModels` | — |
| Recommendations | Decision engine (rules → ML → LLM) | dashboards |

---

## 7. Database design

### 7.1 New tables

```sql
-- One lossless workbook capture per upload (Step 1 output).
CREATE TABLE workbook_snapshots (
  snapshot_id   TEXT PRIMARY KEY,          -- sha256 of file bytes
  file_name     TEXT NOT NULL,
  uploaded_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  content       JSONB NOT NULL             -- {sheets:[{name, cells, formulas, merges, formats}]}
);

-- The Manufacturing Ontology Document. One row per (workbook lineage, version).
CREATE TABLE mods (
  mod_id        TEXT NOT NULL,             -- stable lineage id (first snapshot hash)
  version       INT  NOT NULL,             -- 1..n, bumped on re-verification
  company_id    TEXT NOT NULL,
  status        TEXT NOT NULL CHECK (status IN ('draft','verified','superseded')),
  snapshot_id   TEXT NOT NULL REFERENCES workbook_snapshots(snapshot_id),
  document      JSONB NOT NULL,            -- §8 shared model (entities, stages, defects,
                                           --  sizes, relationships, formulas, layout, validation)
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  verified_by   TEXT,
  verified_at   TIMESTAMPTZ,
  supersedes    INT,                       -- previous version number, if any
  PRIMARY KEY (mod_id, version)
);
CREATE UNIQUE INDEX one_active_mod ON mods(mod_id) WHERE status = 'verified';

-- Everything the company has confirmed, reusable across workbooks.
CREATE TABLE company_knowledge (
  company_id    TEXT NOT NULL,
  kind          TEXT NOT NULL,             -- 'stage-alias'|'defect-alias'|'column-mapping'|'header-pattern'
  key           TEXT NOT NULL,             -- normalized raw label
  canonical_id  TEXT NOT NULL,             -- entity id it maps to
  confidence    NUMERIC NOT NULL,
  learned_from  TEXT,                      -- mod_id that taught it
  learned_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  use_count     INT NOT NULL DEFAULT 0,
  PRIMARY KEY (company_id, kind, key)
);

-- Cross-company manufacturing concepts. SEED DATA, not code.
CREATE TABLE global_ontology (
  concept_id    TEXT PRIMARY KEY,          -- 'CHECKED_QTY','REJECTED_QTY','DEFECT','STAGE',…
  kind          TEXT NOT NULL,             -- 'measure'|'entity-class'|'dimension'
  match_terms   JSONB NOT NULL,            -- term lists the resolver ranks against
  description   TEXT NOT NULL
);

-- Versioned decision rules (§14). Operate on canonical variables only.
CREATE TABLE decision_rules (
  rule_id       TEXT NOT NULL,
  version       INT  NOT NULL,
  status        TEXT NOT NULL CHECK (status IN ('draft','active','retired')),
  definition    JSONB NOT NULL,            -- {when: predicate over canonical vars, then: action}
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (rule_id, version)
);
```

### 7.2 Modified

- `events.provenance` (JSONB) gains `modId`, `modVersion` — no DDL needed;
  the Zod `Provenance` schema widens with two nullable fields.
- `ingestions` gains `mod_id`/`mod_version` columns (audit: which understanding
  read this file).

### 7.3 Removed (after migration — see MIGRATION-PLAN)

- `registries` → converted: schema shape → MODs; `stage_aliases` → `company_knowledge`.
- `datasets`, `dataset_rows` → superseded by `mods` + `workbook_snapshots`.

### 7.4 Kept unchanged

`events, findings, adjudications, rulebook_rules, rule_applications, raw_files,
ingestions, cost_config`.

---

## 8. Shared models (the MOD document, `src/shared/models/`)

```ts
// ontology.ts — the MOD document payload (Zod; stored in mods.document)
interface ModDocument {
  companyId: string;
  workbook: { fileName: string; fileHash: string; sheetNames: string[] };
  // Every column/sheet/label the resolver saw — NOTHING omitted.
  entities: ModEntity[];
  // Canonical catalogs derived from verified entities:
  stages: StageDef[];          // reuses contract/d1 StageDef (funnel, captures, effective dating)
  defects: DefectDef[];        // reuses contract/d1 DefectDef (code, label, aliases, stages)
  sizes: SizeDef[];
  relationships: ModRelationship[]; // sheet-represents-stage | column-measures |
                                    // defect-of-stage | derived-from | size-of-sheet
  formulas: ModFormula[];      // {sheet, colLetter, class, refs[], translated}
  layout: ModLayout[];         // per sheet: headerRows, merges, columnOrder — data-entry generation
  validation: ModValidationRule[]; // {ruleId, expr, severity} — arithmetic/balance checks
}

interface ModEntity {
  entityId: string;                       // stable within the MOD
  kind: "stage"|"measure"|"defect"|"dimension"|"size"|"date"|"derived"|"meta";
  original: { sheet: string; colLetter: string|null; header: string }; // verbatim source
  canonical: string | null;               // e.g. "REJECTED_QTY", "DEFECT:PINH", "STAGE:visual"
  subcategory: string | null;
  confidence: number;                     // 0..1
  resolvedBy: "exact"|"knowledge"|"ontology"|"rule"|"llm"|"user";
  reason: string;                         // human-readable basis, shown in verification UI
  verified: boolean;                      // true only after staging acceptance
}
```

`workbook.ts` = the lossless snapshot types (Step 1 output). `entities.ts` =
resolver proposal/verification exchange types. The event contract (`contract/d1.ts`)
is **unchanged** apart from the two provenance fields.

---

## 9. API design

| Route | Method | Purpose |
|---|---|---|
| `/api/workbooks` | POST | Upload → snapshot + profile + resolve → returns `{snapshotId, profile, proposals[]}` (draft MOD) |
| `/api/mods` | GET | List MODs (company scope); `?modId=&version=` one document |
| `/api/mods` | POST | Persist verified MOD (accepted mappings) → new version, `status='verified'`, learns into `company_knowledge` |
| `/api/mods/verify` | POST | Accept/override a single proposal (incremental verification autosave) |
| `/api/knowledge` | GET | Company knowledge (aliases/mappings) for inspection/admin |
| `/api/ingest` | POST | **Unchanged contract** (StageDayRecords → events) but resolves entities via the MOD referenced by `modId`, never a registry fallback |
| `/api/day-records` | GET | Unchanged (ledger → StageDayRecord reconstruction) |
| `/api/events` | GET | Unchanged (canonicalizeEvents chokepoint) |
| `/api/entry-template` | GET | `?modId=` → generated data-entry grid definition (from MOD layout+entities) |
| `/api/decide` | POST | Decision engine: scope → rules+ML+LLM → recommendations with lineage |
| `/api/chat` | POST | Ask RAIS — context built from MOD catalog + analytics selectors (never raw Excel) |
| **Deleted** | | `/api/schema` (presets), `/api/registry-alias`, `/api/datasets`, `/api/clear-schema` — replaced by the MOD/knowledge routes above |

All request/response bodies are Zod-validated; LLM-facing schemas follow the
cross-provider rules in `src/lib/schemas.ts` (`.nullable()` not `.optional()`, etc.).

---

## 10. File structure (target)

```
src/
  core/
    workbook/        reader.ts (lossless), snapshot-store.ts
    profiler/        profile.ts, formula-class.ts, signature.ts   ← moved from lib/schema
    ontology/
      resolver/      ladder.ts, exact.ts, knowledge.ts, global.ts, rules.ts, llm.ts
      builder/       build-mod.ts, learn.ts
      store/         mod-store.ts (memory + supabase), knowledge-store.ts
      validate/      mod-validator.ts
    ingest/          emit.ts (kept), extract-from-mod.ts (NEW: MOD-driven cell→StageDayRecord),
                     dedupe.ts (kept), validate-entry.ts (kept)
    analytics/       (kept verbatim from lib/analytics)
    decision/        engine.ts, rules/, ml/, llm/
  shared/models/     ontology.ts, entities.ts, workbook.ts, events.ts (re-export d1/d3)
  app/               (screens; staging gains the verification panel, data-entry consumes
                     the generated template, workbooks reads snapshots+MODs)
  components/        (editorial + app, kept)
```

Naming keeps repo conventions: `kebab-case.ts` lib, `PascalCase.tsx` components.

---

## 11. Entity resolution (the hybrid resolver)

Priority ladder — first confident hit wins, everything else becomes a
lower-ranked alternative shown in the verification UI:

1. **Exact match** — verbatim header equals a canonical entity already in this
   company's verified MODs. Confidence 1.0.
2. **Company knowledge** — normalized alias hit in `company_knowledge`
   (successor of today's `stageAliases`, generalized to defects/columns/headers).
3. **Global manufacturing ontology** — term match against `global_ontology`
   seed concepts (successor of today's regex families, as *data*).
4. **Rule engine** — deterministic structural rules (successor of today's
   profiler heuristics): "numeric short-code column in a sheet mapped to a
   quality-gate stage → defect entity", "row-derived formula → derived", etc.
5. **LLM semantic resolution** — `tryModels` + `generateObject` with a
   `MappingProposalSchema`; input is the **profile** (never raw rows beyond a
   small sample); prompt mandates: identify every field, never omit, assign
   confidence. Output proposals only.
6. **User verification** — staging page. Accept sets `verified: true`;
   override rewrites `canonical` with `resolvedBy: "user"`, confidence 1.0.

**The LLM proposes. The user verifies. The system learns** (accepted mappings
upsert into `company_knowledge`; next upload short-circuits at rung 2).
Nothing below rung 6 can mutate a verified MOD.

## 12. Manufacturing Ontology (canonical concepts)

Seeded `global_ontology` concepts (extensible without code changes):
`STAGE, CHECKED_QTY, ACCEPTED_QTY, REWORK_QTY, REJECTED_QTY, DEFECT (+subcategory
per code), SIZE, DATE, BATCH, OPERATOR, MACHINE, SHIFT, STATED_PCT (claim),
DERIVED, META`. These name *meanings*; company MODs bind raw headers to them.
`aggregate-claim` semantics are preserved: a stated % is a claim to verify,
never an input.

## 13. Company Knowledge Base

`company_knowledge` + the company's verified MOD lineage *is* the "registry"
successor: aliases → mappings → ontology → history. It is written only by the
learn step (verified mappings), read by resolver rung 2, and browsable via
`/api/knowledge`. Today's `DISPOSAFE_REGISTRY` content ships as **migration seed
data for the Disposafe company row** — the same knowledge, demoted from code to
data (see MIGRATION-PLAN §Phase 4).

## 14. Rule engine (decision)

Separate from resolution rung 4. Operates **only on canonical variables**
(`rejection_rate[stage]`, `defect_share[code]`, `fpy`, `copq`…) — no workbook
names, no company names, no raw headers. Definitions in `decision_rules`
(versioned, draft→active→retired). Evaluation: scope → compute canonical vars
via `analytics/*` → predicate match → actions (recommendation, CAPA draft,
alert). Extends today's `rulebook_rules`/`RuleApplication` machinery rather
than replacing it — provenance of every recommendation = rule version + event ids.

## 15. LLM layer

| Responsibility | Input | Output (Zod) | Never |
|---|---|---|---|
| Entity resolution (rung 5) | WorkbookProfile + samples | `MappingProposal[]` | apply silently |
| Narrative / executive summary | `MetricsSummary` (computed) | prose | compute a number |
| Ask RAIS | question + MOD catalog + selector results | answer + source refs | parse Excel |
| CAPA drafting | finding + canonical context | CAPA draft | auto-approve |
| Decision explanations | rule hits + canonical vars | explanation | new numbers |

All via `tryModels` (Gateway → Anthropic → OpenRouter → Google → Groq → Ollama);
on-prem = Ollama/MiniCPM at the end of the same chain (engineering spec §13).
`npm run check:ai` guards schema compatibility.

## 16. Analytics layer

**Formulas unchanged** (Σ per-stage rates headline, entry-stage totalChecked,
FPY = Π(1−r), separator-insensitive defect resolution, COPQ, SPC). Changes:
- `resolveDefect(raw, DISPOSAFE_REGISTRY)` → `resolveEntity(raw, modCatalog)` —
  same collapse-non-alphanumerics discipline, catalog from the active MOD set.
- Stage labels/funnel order/quality-gate flags come from MOD `stages`, not
  `disposafe.ts`.
- `scopeEvents` unchanged. Current → future per module: see TDD §3.

## 17. Dashboard layer

Reads `/api/events` + MOD catalog only. The generic dataset dashboards
(`GenericDatasetView`, `buildGenericDashboard`) are superseded: an *unverified*
MOD (draft) can still render a generic preview from the snapshot via the same
role-driven KPI/breakdown logic, relocated to read MOD entities instead of
`datasets` rows. Cockpit, D/W/M/FY grains, SPC — untouched.

## 18. Data Entry layer

```
Verified MOD ─► /api/entry-template ─► generated grid (headers, merges, column
order, types, dropdowns from MOD.layout + entities + validation)
      ─► user entry ─► client validation (MOD.validation + arithmetic rules)
      ─► StageDayRecord[] (extractedBy:"direct-entry")
      ─► POST /api/ingest (modId attached) ─► emitMany ─► ledger
```

Presets, `DEFAULT_FIELDS`, schema editor modal, "add field" side channels — all
replaced by the generated view. Editing the *template* = verifying a new MOD
version (one flow, versioned, audited). The grid reproduces the company's own
sheet shape because MOD.layout preserved it losslessly.

## 19. View Source layer

MOD stores workbook → sheet → cell → column → entity. View-source triangulates:
KPI → events (provenance cells + fileHash) → snapshot cell (exact bytes) →
MOD entity (meaning + who verified it + confidence). Strictly more provenance
than today; the beam-drawing client mechanics stay.

## 20. CAPA / 21. Ask RAIS

Both read the MOD catalog + analytics selectors + findings — never raw Excel.
Ask RAIS answers gain "which MOD version interpreted this" in the source flyout.
CAPA recommendations come from the decision engine with rule lineage.

## 22. Permissions

Verification (accepting mappings, publishing MOD versions) = QM/GM authority;
data entry = operator; adjudication of critical findings = GM
(`requiresGmAuthority` exists in d3 already). Enforced at the API layer +
Postgres RLS on-prem. Roles config, not code.

## 23. Versioning

- MOD: integer versions per lineage; verified version supersedes prior;
  events pin `modVersion` — re-interpretation never rewrites history.
- Company knowledge: append + `use_count`; corrections write a new row version.
- Rules: `decision_rules(rule_id, version)`.
- Event schema: `schemaVersion` envelope field (existing).

## 24. Caching

- Snapshot + profile are content-addressed (hash) → re-upload of identical file
  is a no-op (same snapshot_id).
- Resolver results cached per (profile signature, knowledge version) — a known
  workbook shape skips straight to verified mappings.
- `/api/events` responses cached per (filter, ledger head) as today via SWR on
  the client; no server cache added until measured (ponytail: skip until needed).

## 25–27. Migration / Testing / Rollback

Covered in full in [MOD-MIGRATION-PLAN.md](./MOD-MIGRATION-PLAN.md). Headlines:
- **Migration:** phases are strangler-style; the ledger is never migrated;
  presets/aliases convert to MODs/knowledge by script; family parsers demote to
  golden-test oracles before deletion.
- **Testing:** the existing golden corpus (client spreadsheet totals) is the
  invariant — every phase must reproduce it exactly; new resolver gets
  fixture-based mapping tests; doubling-stability test stays.
- **Rollback:** per-phase feature flags (`MOD_PIPELINE=off` falls back to the
  legacy path until Phase 5 removes it); MOD versions are append-only so a bad
  verification is superseded, never edited.
