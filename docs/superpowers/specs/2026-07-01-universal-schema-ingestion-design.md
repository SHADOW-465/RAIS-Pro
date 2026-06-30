# Universal Schema-Aware Ingestion & Per-Dataset Dashboards

**Status:** Design approved (2026-07-01) — pending spec review before implementation planning.
**Author:** RAIS-Pro / MO!D engineering session.
**Supersedes mechanism, not data:** keeps the append-only event store, Findings, and analytics selectors; replaces filename-routing, hardcoded views, and the formula-based column heuristic.

---

## 1. Problem

The client (Disposafe) keeps quality data as ~50 inconsistently-named Excel workbooks across two folders, organised as ~6 logical streams sliced by month and size. The current app cannot absorb this cleanly:

1. **Views are hardcoded.** The `View` dropdown is built from `DISPOSAFE_REGISTRY.stages` served by `/api/schema`, which **falls back to the hardcoded registry** when the persisted schema is empty (`src/app/api/schema/route.ts:51`). Clearing data/schema therefore can never remove the 13 stage tabs — they were never derived from uploads.
2. **Ingestion routes by filename.** `recordsFromBuffer()` calls `routeFamily(name)` and dispatches to one of four hardcoded parsers, **returning `[]` (silent zero) when the filename doesn't match a known family** (`src/lib/ingest/parsers/index.ts:25`). Arbitrary files produce nothing.
3. **Columns are misclassified by formula presence.** `schema-extractor.ts` tags a column as `formula` (then drops/recomputes it) when its Excel cell has a formula. But raw ground-truth columns are *also* formulas in the analytical files — e.g. `QUANTITY CHECKED = '[3]APRIL 25'!B9` (a cross-file link). These get discarded, so checked/rejected counts vanish. This is the "data entries wrongly flagged as wrong values" chaos.

### Goal

Upload **any** workbook, in **any order**, and get a clear, structured, error-free dashboard — "like ChatGPT: drop a file, get a dashboard." Same-shaped tables collapse into one **Dataset** (a View). Recognised Disposafe data additionally powers the rich integrated quality dashboard. The detected schema also drives in-app data entry so users stop round-tripping through Excel.

---

## 2. Approved decisions (this session)

| Decision | Choice |
|---|---|
| Core model | **Both**: a cross-file *integrated* quality view AND a *generic per-dataset* dashboard, all in the View dropdown. Stages/sizes/defects become **derived**, not hardcoded. |
| View grouping | **Group by schema signature** — same column layout auto-collapses into one Dataset; ~50 files → ~6 views; new files get their own. |
| Value policy | **Trust raw, recompute derived, flag gaps** — raw measurements always trusted (even if filled by link/SUM); only true derived metrics recomputed; mismatches raise a Finding; never silently overwrite, never drop a column. |
| Data entry | **Generalize to per-dataset grids** generated from each Dataset's detected schema. |
| Domain smarts | **Keep** COPQ/SPC/FPY/process-flow/Pareto for recognised quality data; generic datasets get an auto-dashboard. |
| Role-based access | **Out of scope (v1)**, deferred. |

PDF (`MOID REVIEW POINTS 27.06.26`) review points are understood but **deliberately not folded into this spec yet** — to be incorporated on explicit instruction.

---

## 3. Architecture

```
Workbook(s)
  → [A] Structural Parser   → Table[]            (clean cells + provenance, no domain knowledge)
  → [B] Schema Profiler      → ColumnProfile[] + SchemaSignature   (AI-labeled, heuristic fallback + sanity gate)
  → [C] Dataset Registry     → Dataset[]          (group by signature; persisted)  ← VIEW dropdown source
  → [D] Canonical Row Store   → typed rows + Findings   (append-only event store reuse)
  → [E] Domain Recognizer     → stageId tag        (match signature to known Disposafe profile)
  → [F1] Generic Dashboard    → DashboardConfig     (any Dataset)
  → [F2] Integrated Quality   → Cumulative view     (recognised Datasets: COPQ/SPC/FPY/flow)
  → [G] Schema-driven Entry  → editable grid       (from a Dataset's schema)
```

The pipeline mirrors the existing **graph → compute → narrative** invariant: structural + statistical analysis is deterministic; the LLM only *classifies/labels*; all numbers come from deterministic selectors.

### [A] Structural Parser — `workbook → Table[]`

Pure, browser+server safe. Responsibilities:

- **Header detection** for headers at row 2/4/6 under title/doc-control rows; **multi-row headers** merged into a header path (e.g. label row + numeric index row + code row `COAG/SD/TT…` → `Reason:COAG`).
- **Sub-table separation**: detect a second logical table embedded in the same sheet (the weekly mini-table in cols R/S/T) and emit it as its own `Table`.
- **Noise filtering**: drop marker rows (`SUNDAY`), subtotal/`SUM` rows (kept only as cross-check evidence, not data rows), and `#DIV/0!`/error cells.
- **Sheet/file skipping**: ignore `~$…` lock files, `FORMATE`/template sheets, and `YEARLY`/rollup sheets (configurable patterns), with a visible "skipped" note.
- Each cell retains `{ sheet, a1, formula?, cachedValue }` provenance.

**Interface:** `parseWorkbook(buf, fileName): Table[]` where `Table = { sourceSheet, region, headerPath[], rows: Cell[][], docMeta? }`.
**Depends on:** `xlsx` (cells + formulas), existing `src/lib/parser.ts` header helpers.

### [B] Schema Profiler — `Table → { columns, signature }`

Per column, assign a **role** from three independent signals:

- **Name** (normalized header / header-path).
- **Value statistics** (sampled): numeric ratio, date ratio, cardinality, integer-ness, blank ratio.
- **Formula dependency graph**: parse the cell formula; classify by what it references — *sibling columns in the same row* (→ candidate `derived`), *another sheet/workbook* (`'[3]APRIL 25'!B9` → a linked **raw value**, NOT derived), or a vertical range `SUM(B6:B10)` (subtotal, not a row value).

Roles: `dimension` (date | size | batch | category), `measure` (raw count/quantity — **ground truth even when formula-linked**), `derived` (row-wise function of sibling columns: `%`, rate, row total, FPY), `defect` (reason-code tally), `meta` (S.No, remarks, doc-control).

**Decision rule (the core fix):** a column is `derived` **only if** its formula (or name) expresses a row-wise function of other columns in the same table. A cross-file/cross-sheet link or a plain value is treated as a `measure`/`dimension` and **never discarded**.

**AI usage:** an LLM pass refines ambiguous roles and proposes a human-readable Dataset title/labels, via `tryModels` + a Zod schema, with the deterministic profile as baseline and a **sanity gate** (LLM result accepted only if it doesn't drop a detected `measure`/`date` or contradict strong statistics). Follows `AGENTS.md` invariant #1–#3. New schema → covered by `npm run check:ai`.

**SchemaSignature:** stable hash over the ordered list of `(role, normalizedName)` (date/dimension columns first), tolerant to month/size-specific naming, so the 12 monthly files and the per-size sheets each collapse to one signature.

### [C] Dataset Registry — dynamic, persisted

Groups Tables sharing a `SchemaSignature` into a **Dataset**. A Dataset has: `id`, `signature`, `title`, `columns: ColumnProfile[]`, `recognizedStageId?`, source provenance, and row count. Persisted (new `datasets` table alongside `registries`).

**This becomes the View-dropdown source** (`AppShell` reads detected Datasets, not `registry.stages`). `Cumulative` remains as the integrated view; each Dataset adds a tab. Clearing data clears Datasets → views genuinely disappear.

The old `DISPOSAFE_REGISTRY` is **demoted** to a "known-signature catalog" consumed only by [E].

### [D] Canonical Row Store — reuse existing event store

Reuse the append-only `EventStore` (memory + Supabase adapters), content-hash dedup, and re-ingest correction logic. Raw `measure`/`dimension`/`defect` values stored verbatim with provenance. `derived` values are **not stored as truth** — recomputed on read by deterministic selectors.

**Value policy implementation:** when a stored derived cell disagrees with the recomputed value beyond tolerance, raise a **Finding** (reuse `V-010 value-conflict` path in `/api/ingest`) carrying stated vs computed + provenance. Surfaced in Audit; raw data untouched.

### [E] Domain Recognizer

Matches a Dataset signature against known Disposafe stage profiles (Visual, Balloon, Valve Integrity, Final, Production, etc.). On match, tag `recognizedStageId` so the Dataset flows into [F2]. No match → first-class generic Dataset, [F1] only.

### [F1] Generic Dashboard Builder — `Dataset → DashboardConfig`

Deterministic mapping from column roles: each `measure` → a KPI + a trend over the primary `date` dimension; each `dimension` → a breakdown (bars); `defect` columns → a Pareto. Reuses editorial widgets/charts. Always renders something, even for never-seen schemas.

### [F2] Integrated Quality — `Cumulative`

The current rich dashboard, fed by recognised Datasets; COPQ/SPC/FPY/process-flow/Pareto intact. Stages/sizes/defects now sourced from recognised Datasets rather than the hardcoded list.

### [G] Schema-driven Data Entry

Each Dataset's schema generates an editable grid: `dimension` columns as row keys, `measure`/`defect` columns as numeric inputs, `derived` columns shown read-only and live-computed. Saving appends rows through the same emit path as an upload. Generalises today's registry-driven `/data-entry`.

---

## 4. Data flow

1. User drops workbook(s) on Staging (any order). `[A]` → Tables.
2. `[B]` → ColumnProfiles + signature per Table (deterministic, then AI-refined under sanity gate).
3. `[C]` groups Tables into Datasets; persists; View dropdown updates.
4. `[D]` emits canonical rows; derived mismatches → Findings.
5. `[E]` tags recognised Datasets.
6. Dashboard renders: `Cumulative` = `[F2]`; each Dataset tab = `[F1]` (or domain view if recognised).
7. Data Entry `[G]` writes new rows back through `[D]`.

---

## 5. Reuse vs. change

| Reused as-is | Changed / new |
|---|---|
| `EventStore` (memory + Supabase), dedup, corrections | Filename router → **content/signature router** `[A]+[B]+[C]` |
| Findings (`V-010`) + Audit | View source: hardcoded registry → **dynamic Dataset registry** |
| Analytics selectors, COPQ/SPC/FPY | `schema-extractor` heuristic → **role-by-graph Profiler** |
| Editorial widgets, charts, modal, `tryModels` chain, Zod discipline | `/data-entry` → **schema-driven grids**; new generic dashboard builder; new `datasets` table |

The four existing parsers (`parse-rejection-analysis`, `parse-size-wise`, `parse-assembly-daily`, `parse-daily-activity`) become **golden fixtures / known-signature definitions** for `[E]`, not the primary path.

---

## 6. Error handling & invariants

- **Never zero, never silent drop**: an unrecognised schema still yields a Dataset + generic dashboard; a dropped column is impossible for `measure`/`dimension`/`defect` roles.
- **Order independence**: re-uploading a month supersedes prior rows for the same key (existing correction logic); totals update, never double.
- **Junk tolerance**: `~$` locks, template/rollup sheets, `#DIV/0!` skipped with a visible note.
- **AI never does maths** (`AGENTS.md` #1): LLM limited to role/label classification under a sanity gate.

---

## 7. Testing

Golden tests over the real 50-file corpus:

- Signature stability across the 12 monthly Rejection-Analysis files and across per-size sheets.
- **Raw `measure` columns are never dropped** (regression guard for the reported bug), including formula-linked `QUANTITY CHECKED`.
- Derived values recomputed; stored-vs-computed mismatch raises a Finding.
- Order-independent ingest (shuffle upload order → identical store).
- Unknown schema → non-empty generic dashboard.
- `npm run check:ai` for the new Profiler labeling schema across all backends.

---

## 8. Out of scope (v1)

- Role-based access control (deferred).
- PDF review-point features (quantity-on-graph filters, defect/size drill-downs beyond current, cost analysis expansion, UX overhaul) — understood, folded in later on instruction.

---

## 9. Open questions for implementation planning

- Exact persistence shape of the `datasets` table and migration.
- Tolerance threshold for derived-value discrepancy Findings.
- Whether the generic dashboard and domain dashboard share a single `DashboardConfig` type or two.
- Phasing: ship `[A]+[B]+[C]+[F1]` (generic any-file dashboards) first, then `[E]+[F2]` (domain re-wire) and `[G]` (entry) — to avoid a big-bang rewrite.
