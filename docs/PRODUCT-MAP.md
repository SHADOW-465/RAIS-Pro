# RAIS-Pro / MO!D — Product & Code Map (decision board)

**Status:** Living source of orientation for cleanup.  
**Last framing:** 2026-07-19 — factory prefers **Data Entry** daily; **Excel import** teaches plant schema once and loads history; Dashboard + View Source over the ledger.  
**How to use this file:** Before changing anything, find the subsystem here. Prefer this over reading every plan in `docs/` (stale plans live in `docs/archive/`).

---

## 0. Product contract (current)

```
Excel (once) → classify → verified MOD (plant schema)
                              ↓
              entry-template → Data Entry UI (no re-typed columns)
                              ↓ extract rows too
Manual day-to-day entry ──────┴──► events ledger
                                      ↓
                         Dashboard / analysis / View Source
```

| Must | Must not |
|---|---|
| Numbers only from deterministic JS over `events` | AI inventing KPI values |
| Schema for entry comes from verified workbook MODs when available | Hardcoded defects as the only schema forever |
| Successful import/entry = events on the ledger (or hard error) | “Success” that only updates mappings with no numbers |
| View Source traces a metric to contributing events + provenance | Fake demo numbers when empty |
| Grain rules (batch, size, FY Apr–Mar) when showing plant data | Parallel stores disagreeing with the dashboard |

Staging = **transition** from plant Excel into this app (schema + history). Data Entry = **primary** going forward.

---

## 1. How the project evolved (why so many docs)

| Era | Idea | What it left behind |
|---|---|---|
| **V0 editorial analyze** | Upload Excel → LLM graph → narrative dashboard (README still describes this) | Old README layout; analyze/session concepts mostly gone |
| **V1 MO!D ledger** | Real parsers → append-only events → pure analytics | `src/lib/analytics/*`, `emit`, View Source, build-spec invariants |
| **Schema / presets / datasets** | Universal schema, registry, dataset rows, monthly entry | superpowers Jul-01 plans; `datasets` tables; `/api/schema` |
| **Grain + data entry** | D/W/M/FY, monthly grid, then Batch Matrix | entry grain code, matrix, GRAIN-CONTRACT-* |
| **MOD v2 strangler** | Knowledge plane (MOD) separate from facts (events); Excel → verify → extract → ingest | `src/core/*`, staging dual publish, Workbooks, redesign/* |
| **Now (your framing)** | Entry-first smooth ops; less dual-pipeline pain | This map; cleanup decisions |

**Docs bloated because each era wrote full plans without retiring the previous ones.**  
`docs/plans/STATUS.md` still talks about `feat/phase2-real-parsers` and deleted parsers — **outdated as operational truth**.

---

## 2. Durable decisions (still true — do not casually break)

These survived every rewrite and are enforced by tests / AGENTS.md / build-spec §18:

| ID | Decision | Why | Still needed? |
|---|---|---|---|
| D1 | **Model never does maths** | Prevents random KPIs | **YES** — core trust |
| D2 | **Event ledger is the fact store** | Single source of truth | **YES** |
| D3 | **Emit is pure** (`emitStageDay`) | Same path for entry + Excel | **YES** |
| D4 | **canonicalizeEvents on read** | De-dup / no double count | **YES** |
| D5 | **Provenance on every event** | View Source / audit | **YES** |
| D6 | **Direct entry can win over upload** | Shop floor corrections | **YES** (Grain may refine A9/A19) |
| D7 | **Funnel not summed across stages** | Avoids quadruple-count | **YES** for multi-gate plant |
| D8 | **Stated % is claim only** | Sheet formula ≠ truth | **YES** if Excel retained |
| D9 | **No production auto-seed** | Honest empty state | **YES** |
| D10 | **MOD = interpretation of workbooks** | Versioned understanding | **Only if Excel import stays** |
| D11 | **Grain: batch optional, sum for monthly KPIs** | Client plant language | **YES** for entry + analytics |
| D12 | **A12: don’t silent-fix defect≠reject** | Client option 3 | **YES** for entry validation |

---

## 3. Runtime map — pages

| Route | What it is | Driven by | Verdict for entry-first product |
|---|---|---|---|
| `/` Dashboard | Factory KPIs, trends, View Source | `events` via EventsContext | **KEEP — core** |
| `/data-entry` | Batch Matrix + period grid + ledger tab | → `/api/ingest` | **KEEP — core input** |
| `/stage-analysis` | By-stage breakdown | `events` | **KEEP** if used in reviews |
| `/size-analysis` | Size concentration | `events` | **KEEP** if plant uses FR split |
| `/defect-analysis` | Pareto / defects | `events` | **KEEP** |
| `/spc` | Control charts | `events` | **KEEP** if SPC is product |
| `/copq` | Cost of poor quality | `events` + cost config | **KEEP** if costing configured |
| `/reports` | Printable / export-ish | `events` | **KEEP or simplify** |
| `/audit` | Audit trail of events | `events` | **KEEP** (trust) |
| `/staging` | Excel MOD verify + extract + ingest | snapshots + mods + events | **DEMOTE** to bulk-only or hide until entry solid |
| `/workbooks` | Ontology browser (mappings) | mods + snapshots | **DEMOTE / rename** — not “data loaded” |
| `/process-flow` | Static FBC process narrative | mostly static | **OPTIONAL** — not ledger-critical |
| `/capa` | Recommended actions | `/api/decide` + events | **OPTIONAL** — secondary |
| `/chat` Ask MOID | AI narrative over dashboard data | events + AI | **OPTIONAL** — never invent numbers |
| `/settings` | App prefs | local / env | **KEEP** minimal |
| `/clear-data` | Wipe stores | destructive admin | **KEEP** admin-only |

---

## 4. Runtime map — APIs

| API | Role | Verdict |
|---|---|---|
| `POST /api/ingest` | StageDayRecords → events | **CORE** |
| `GET /api/events` | Effective ledger for UI | **CORE** |
| `GET/DELETE /api/manual-entries` | Entry history view | **CORE** for entry UX |
| `GET /api/day-records` | Prefill period grid | **KEEP** if period grid kept |
| `GET /api/entry-template` | MOD-driven columns for period grid | **KEEP** only if period grid uses MOD; Batch Matrix uses local schemas |
| `POST /api/workbooks` | Upload → snapshot + draft MOD | **BULK only** |
| `POST /api/mods/verify` | Apply mapping decisions | **BULK only** |
| `POST /api/mods` | Publish MOD + learn | **BULK only** |
| `POST /api/mods/records` | Extract rows from verified MOD | **BULK only** |
| `GET /api/schema` | Compat registry shape | **DEBT** — labels for analytics; retire after OntologyContext |
| `POST /api/chat` | AI slides | **OPTIONAL** |
| `POST /api/decide` | Rule/decision engine | **OPTIONAL** (CAPA) |
| `POST /api/archive-upload` | Archive raw files | **OPTIONAL** |
| `POST /api/clear-data`, `hard-reset` | Admin wipe | **ADMIN** |
| `GET /api/raw-file` | Serve archived file | **OPTIONAL** for View Source file open |

---

## 5. Code map — directories that matter

### 5.1 Core spine (protect)

```
src/lib/ingest/emit.ts          StageDayRecord → events (pure)
src/lib/ingest/review.ts        Balance / defect flags for review grid
src/lib/analytics/*             All KPI maths (rejection, defect, size, scope, …)
src/lib/store/*                 events/findings adapters (memory + supabase)
src/lib/contract/*              Zod event shapes + hash ids
src/components/app/EventsContext.tsx   Client cache of ledger
src/components/FloatingDetailModal.tsx View Source UX
src/app/api/ingest + events
src/components/BatchMatrixEntry.tsx    Primary shop-floor entry
src/lib/entry/*                 Batch ID, matrix schemas, grain period helpers
```

### 5.2 MOD / Excel plane (only if bulk import stays)

```
src/core/workbook/*             Lossless snapshot
src/core/profiler/*             Column profiling
src/core/ontology/*             Resolver, MOD build, knowledge, validate
src/core/ingest/extract-from-mod.ts
src/app/staging, workbooks, api/workbooks, api/mods/*
```

**Why it was built:** Stop hardcoding family parsers; learn column meanings; still emit into the **same** ledger.  
**Why it hurts:** Two “publish” steps; Workbooks looks like success; incomplete MOD → 0 extract → empty dashboard.

### 5.3 Compat / debt (do not grow)

```
src/components/app/RegistryContext.tsx   Labels for stages
src/app/api/schema/route.ts              Shim registry
src/core/ontology/empty-registry.ts      Fallback catalog
src/lib/store registries adapter         Migration only
```

### 5.4 Secondary features

```
src/core/decision/*             CAPA /api/decide
src/lib/ai.ts, api/chat         Narrative only
src/app/process-flow            Static process education
```

---

## 6. Data stores (Supabase)

| Table / store | Plane | Keep? |
|---|---|---|
| `events` | Facts | **YES — heart** |
| `findings` | Validation | YES |
| `workbook_snapshots` | Excel bulk | Only if staging kept |
| `mods` | Knowledge | Only if staging kept |
| `company_knowledge` | Learned aliases | Only if MOD learning kept |
| `global_ontology` | Concept seed | Optional; code has GLOBAL_ONTOLOGY_SEED fallback |
| `datasets` / `dataset_rows` | Legacy schema era | **DELETE candidates** after zero callers |
| `registries` | Legacy presets | **DELETE candidates** after migrate done |
| `decision_rules` | CAPA | Optional |
| `ingestions`, `raw_files`, `sessions`, `dashboards`, … | Mixed history | Audit case-by-case |

---

## 7. Docs map — what to trust vs archive

### 7.1 Trust as engineering truth (small set)

| Doc | Role |
|---|---|
| **`docs/PRODUCT-MAP.md`** (this file) | Orientation + keep/cut |
| **`docs/GRAIN-CONTRACT-DECISIONS.md`** | Frozen plant rules after client PDF |
| **`docs/SESSION-HANDOFF.md`** | Recent MOD/entry work (slightly stale on “uncommitted”) |
| **`docs/build-spec/18-correctness-invariants.md`** | Non-negotiable number rules |
| **`docs/build-spec/03-data-model-event-ledger.md`** | Event model intent |
| **`AGENTS.md` / design tokens** | How to code in this repo (UI + AI rules) |
| **`Disposafe_Data_Entry_System_Documentation.md`** | Shop-floor entry UX (with Primary/Secondary refinements in code) |

### 7.2 Historical design (read for “why”, not “do this now”)

| Cluster | What it was | Today |
|---|---|---|
| `docs/build-spec/*` | Full rebuild bible | Partial truth; some modules deleted |
| `docs/design/MOID-SPEC.md`, `MOID-*-SPEC*` | Early MO!D | Superseded in places by MOD v2 |
| `docs/redesign/MOD-*` | MOD v2 strangler plan | **Implemented mid-way**; plan still useful to know phases |
| `docs/plans/*` | Build handoff Jun 2026 | STATUS outdated |
| `docs/superpowers/plans|specs 2026-07-01*` | Schema/dataset/registry era | **Mostly superseded by MOD** |
| `docs/superpowers/* data-entry *` | Monthly/grain entry | Partially live |
| `docs/disposafe-*-exhaustive*` | Client PRD/problem | Product context, not code map |
| `docs/trash/*` | Explicitly retired | Ignore |
| `README.md` | V0 analyze app | **Outdated product description** |

### 7.3 Docs cleanup policy (recommended)

| Action | Target |
|---|---|
| **Keep in root docs/** | PRODUCT-MAP, GRAIN-*, SESSION-HANDOFF, build-spec/18 + 03, entry matrix docs |
| **Move to `docs/archive/`** (no delete yet) | superpowers Jul-01 schema/dataset*, plans/STATUS era, exhaustive HTML duplicates, MOID redesign essays once PRODUCT-MAP exists |
| **Never use for implementation** | trash/*, README pipeline section until rewritten |

Do **not** implement from a plan file until you check this map’s verdict column.

---

## 8. Feature → decision matrix

| Feature | Why it was added | Necessary for entry→dashboard→View Source? | Recommendation |
|---|---|---|---|
| Event ledger + analytics | Correct multi-file plant maths | **Yes** | Keep |
| View Source / FloatingDetailModal | Auditability | **Yes** | Keep & harden for direct-entry |
| Batch Matrix data entry | Shop floor UX | **Yes** | Keep as primary input |
| Period grid (D/W/M/FY) | Calendar bulk entry | Nice-to-have | Keep secondary or drop if unused |
| Entry template from MOD | Dynamic columns from Excel ontology | Only if period grid stays MOD-driven | Simplify: matrix schemas may suffice |
| Staging Excel MOD pipeline | Replace hard-coded parsers | **No** for daily entry product | Demote bulk; or finish as one-click import |
| Workbooks page | Inspect ontology | **No** for ops | Demote / admin only |
| Registry / schema API | Pre-MOD presets | **No** | Retire after label source replaced |
| datasets tables | Jul-01 persistence experiments | **No** | Drop if unused |
| CAPA / decide | Phase 6 recommendations | No | Optional |
| Ask MOID chat | Narrative | No | Optional; ground on events only |
| Process flow page | Education | No | Optional |
| AI gateway chain | Multi-backend resilience | Only for chat/LLM resolve | Keep if chat stays |
| Grain contract batch rules | Client plant language | **Yes** for correct reporting | Keep |
| Filename stage fallback | Fix empty extract on month tabs | Only if Excel kept | Keep while staging lives |

---

## 9. Danger zones (break one place, break another)

| If you change… | Also check… |
|---|---|
| `emit.ts` / event shapes | ingest, analytics tests, View Source fields, Supabase mappers |
| `canonicalizeEvents` | all dashboards, doubling tests |
| Stage IDs (visual/balloon/…) | entry matrix resolveStageId, analytics stage order, grain |
| Direct-entry ingest replace rules | multi-batch same day, period grid saves |
| EventsContext empty | every analytics page |
| Delete `/api/schema` | RegistryContext consumers, stage labels |
| MOD extract coordinates | oracle tests, valve multi-table |
| Grain / scope | topbar D/W/M/FY, all screens |

---

## 10. Recommended cleanup sequence (safe)

1. **Freeze product contract** (section 0) — you already stated it.  
2. **Inventory live callers** of datasets, schema, registries (grep + runtime).  
3. **Stabilize entry → ingest → dashboard → View Source** (no Excel required).  
4. **Demote Staging/Workbooks** in nav (bulk / admin).  
5. **Archive docs** into `docs/archive/` per section 7.3; leave PRODUCT-MAP + GRAIN + invariants.  
6. **Delete dead code/tables** only after step 2 proves zero callers.  
7. **Decide Excel fate:** (A) one-click import into same ledger, or (B) remove staging entirely for V1.

---

## 11. One-paragraph orientation for agents

> RAIS-Pro is a manufacturing quality app. Facts live in the **event ledger**; analytics never invent numbers. **Data entry** should be the main way facts enter; Excel MOD is a bulk knowledge+extract path that must not look “done” without events. **View Source** proves KPIs from events+provenance. Docs and STATUS files lag the code: trust PRODUCT-MAP + Grain decisions + correctness invariants, not README or Jul-01 schema plans. Mid-migration left dual publish, Workbooks ontology UI, and legacy registry/schema shims — clean those only after the entry→dashboard loop is solid.

---

*End of map. Update this file when a keep/cut decision is executed.*
