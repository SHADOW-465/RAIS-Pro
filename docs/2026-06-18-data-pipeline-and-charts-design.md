# Data Pipeline Truth + Chart Engine — Design Spec

*Date: 2026-06-18 · Branch: moid-v1 · Status: **awaiting review***
*Scope: (A) make the dashboard show only real, traceable numbers from every file in `DATA/` and `ANALYTICAL DATA/`, and make new user data flow through the same path; (B) rebuild the cockpit charts to match the reference mockup — proper scaling, legends, targets, label decimation, and a real date-range control.*

---

## 0. Why this work exists

Two problems were confirmed by reading the code and the data profile:

1. **The dashboard partly fabricates data.** `src/lib/store/index.ts:79` seeds the
   ledger from a **hardcoded, stale absolute path**
   (`C:\Users\acer\Documents\MO!D\New folder\ANALYTICAL DATA`). When that path is
   missing (it is), it falls back to the repo `DATA/` folder and **synthesizes**:
   - size splits from fixed weights `sizeWeights = [.10,.15,.20,.35,.20]`,
   - a defect mix from fixed weights `THSP .34 / LEAK .24 / BM .16 / BUB .10 / PINH .08 / OTH .08`.

   So the Fr16 "outlier", the defect Pareto, and the size-wise charts are partly
   invented. This violates the canonical pipeline invariant *"the model/never
   invents numbers"* — except here it's the seeder inventing them, not the model.

2. **The cockpit charts are thin.** `LineChart` / `MultiLine` in
   `src/components/app/widgets.tsx`:
   - force a **zero baseline** (`y = H - pad - val/max*…`), so small-variation
     rate series look flat and indistinguishable;
   - print a numeric label on **every** node and an X label on **every** period →
     when the grain toggle switches to `day` (300+ points) everything collapses
     ("clumps together");
   - have **no Y-axis ticks/labels**, and a 6-item legend laid out at fixed
     `si*100` offsets that overlaps;
   - the **date range is auto-derived** (min→max of all events in `page.tsx:72`),
     not a user control.

The good news: the spine is sound. Canonical events already carry `size`
(`emit.ts`), the emitter is deterministic, the analytics selectors
(`src/lib/analytics/*`) are the single source of math, and the registry
(`src/lib/registry/disposafe.ts`) resolves defect aliases. **No core schema change
is required.** This is a seeding/parsing rebuild + a presentation rebuild, not a
re-architecture.

### Decisions locked with the user (2026-06-18)
- **Strict real-only.** Never synthesize a breakdown. If an uploaded file lacks a
  size split, the UI offers an explicit "add size breakdown" entry that the
  steward fills; it is saved to the same schema as `direct-entry` events. No
  hidden weights anywhere.
- **Both ingestion paths.** Excel → *Staging & Review* (parse → schema → verify →
  editable grid → commit) and manual → *Data Entry*. Both emit to one ledger.
- **Unify by real date.** Every record lands on one continuous timeline keyed by
  its actual date. The date-range dropdown + D/W/M/FY grain decide what's shown.
- **Range control = presets + custom + grain.** Presets (This FY / Last 12 months
  / Last 90 days / All) + a custom from/to picker, with the D/W/M/FY grain as an
  independent toggle.
- **Durable persistence = Supabase / Postgres.** The ledger is moved off the
  in-RAM memory store onto the durable Supabase adapter. The deleted migration
  (`supabase/migrations/20260403_init_schema.sql`) is restored; the store stops
  defaulting to memory and uses Supabase whenever configured. Memory store stays
  for tests only. **This is the keystone fix** — see Part C.
- **Merge, don't override.** When manual entry and Excel data exist for the same
  `(stage, day[, size])`, the app reconciles them: identical → dedupe; different
  → raise a Finding and ask the steward to clarify (keep both until resolved).
  Manual entry never silently overwrites ingested data.

---

## PART A — Data pipeline (truth)

### A1. Real data inventory (from `DATA/profile_d1_output.md` + folder scan)

| Source family | Files | Shape | What's real in it |
| --- | --- | --- | --- |
| **Assembly daily** | `DATA/ASSEMBLY REJECTION REPORT.xlsx` | 1 sheet/month, **daily rows**, *wide* columns: Visual/Balloon/Valve/Final each with CHKD·ACPT·REJ·REJ%; weekly subtotals; SUNDAY markers; `#DIV/0!` cells; live formulas | Per-day, per-stage checked/accepted/rejected. **Not currently parsed** (the wide multi-stage daily format has no parser). |
| **Rejection analysis (monthly)** | `ANALYTICAL DATA/REJECTION ANALYSIS 2025-26/01..12 *.xlsx` + `YEARLY ANALYSIS.xlsx` | sheet = stage; columns DATE / CHECKED / REJ / % | Per-stage daily totals (FY25-26). Parsed today by `classifyRejectionSheets`. **No defect or size split inside.** |
| **Size-wise** | `ANALYTICAL DATA/SIZE WISE REJECTION/{VISUAL,VALVE INTEGRITY,FINAL}/*.xlsx` | sheet per FR size (`10FR`,`12FR`,…`18FR`); columns DATE / CHECKED / REJ / defect columns | **Real size + defect detail** per stage. Files labeled `26-27` → FY ambiguity (see A6). Parsed today inside the seeder (inline, not a module). |
| **Visual inspection** | `DATA/VISUAL INSPECTION REPORT 2025.xlsx` | visual stage detail | Visual-stage checked/rejected/defects. |
| **Balloon & valve integrity** | `DATA/BALLOON & VALVE INTEGRITY INSPECTION REPORT FILE 2025.xlsx` | balloon + valve detail | Those stages' checked/rejected/defects. |
| **Cumulative / production** | `DATA/COMMULATIVE 2025-26.xlsx`, `DATA/YEARLY PRODUCTION COMMULATIVE 2025-26.xlsx`, size-wise `commulative *.xlsx` | rollups | **Claims only** — used to cross-check computed totals, never as base counts (would double-count). |
| **SOPs / annexure** | `ANALYTICAL DATA/SOP/*.doc`, `ANNEXURE/DS-ANX-13*.doc`, `VISUAL INSPECTION SOP.doc` | prose | Canonical **defect taxonomy** + inspection rules. Used to reconcile the registry, not for numbers. |

### A2. The hard problem: overlapping sources → double counting

The assembly daily report, the monthly rejection analysis, and the size-wise
workbooks **describe the same production days from different angles**. Summing all
of them triples the counts. We need a **source-precedence rule** per
`(stage, day)`:

1. **Size-wise** is authoritative when present for a `(stage, day)` — it carries
   the finest detail (size + defect). Its size rows **sum up to** that stage-day's
   total.
2. **Assembly daily / rejection-analysis** is authoritative for stage totals on
   days where no size-wise rows exist.
3. **Cumulative/yearly** files never contribute base counts — they emit
   `AggregateClaimEvent`s (the existing event type) that the analytics layer can
   reconcile against computed totals (and surface a Finding on mismatch).

Mechanism: each parser tags records with a `sourceFamily` and a precedence rank.
A new **`dedupeByPrecedence(records)`** step (pure, tested) keeps the
highest-precedence record per `(stageId, size|·, day, dispositionKind)` and drops
shadowed ones. Dropped records are retained as claims for cross-check, not summed.
This runs once in seeding and again on every Excel commit so user uploads that
overlap existing days don't double-count.

### A3. Parser modules (replace the inline seeder)

Move all parsing out of `store/index.ts` into `src/lib/ingest/parsers/`, one
deterministic module per shape, each returning `StageDayRecord[]` (the existing
emit contract) + a `MappingRow[]` preview:

- `parse-assembly-daily.ts` — **new.** The wide multi-stage daily sheet. Detects
  the per-stage column groups from the R4 header band, skips SUNDAY/WEEK/Total
  rows, ignores `#DIV/0!`, reads only integer cells. Emits per-stage records.
- `parse-rejection-analysis.ts` — wraps the existing `classifyRejectionSheets`
  (already correct), adds `sourceFamily`.
- `parse-size-wise.ts` — **extracted** from the seeder's inline block, made a
  tested module. Emits size + defect detail. Defect columns resolved via the
  registry; unknown labels → low-confidence event + V-007 Finding (existing
  behavior), **never** dropped or invented.
- `parse-stage-report.ts` — visual + balloon/valve standalone reports.
- `parse-cumulative.ts` — emits `AggregateClaimEvent`s only.

A `src/lib/ingest/parsers/index.ts` router picks the parser by filename/sheet
fingerprint, so both the seeder and the Staging upload use the **same** code.

### A4. Seeding rewrite (`store/index.ts`)

- **Remove** the hardcoded user path and **all** synthetic weight blocks.
- Resolve the data root from `process.env.MOID_DATA_DIR`, else the repo
  `ANALYTICAL DATA/` (primary) + `DATA/` (supplementary), in that order.
- Run the parser router over every workbook, then `dedupeByPrecedence`, then
  `emitMany` → `append`. Idempotent (content-hash dedupe already exists).
- Log a one-line provenance summary: files read, records kept, records shadowed,
  unknown-defect findings raised.

### A5. "Add breakdown when missing" (strict-real entry path)

When a committed/uploaded source has a stage-day total but **no** size split:
- The Staging grid shows that stage-day row with a **"＋ size breakdown"**
  affordance. Expanding it reveals an editable mini-grid of the active FR sizes
  (Fr10–Fr18) whose entered rejected/checked **must sum to the parent total**
  (validated by the existing arithmetic-balance check before commit).
- On commit these become `size`-scoped events with `extractedBy:"direct-entry"`,
  provenance = the steward + parent cell ref. The parent stage-total record is
  superseded (or kept as claim) so totals stay consistent.
- Same affordance in *Data Entry* for fully-manual rows.
- Nothing is ever auto-distributed. Absent breakdown → charts show "Not in
  source" for that slice, never a modeled number.

### A6. FY label normalization

The size-wise files are labeled `26-27` while assembly/rejection are `2025`/`25-26`.
During the build I will read the actual `DATE` cells in the size-wise sheets:
- if the dates are real 2026-27 dates → keep them as later points on the unified
  timeline (per the "unify by real date" decision);
- if they're mislabeled 2025-26 dates → normalize and note it in the spec
  appendix. Either way the timeline stays date-driven; this only affects labels.

### A7. Registry ↔ SOP reconciliation

Read the SOP/annexure `.doc` files (extract text; if the binary `.doc` resists
tooling, fall back to the defect-column headers already present in the size-wise
sheets) and reconcile `DISPOSAFE_REGISTRY.defects` so every defect the plant
records has a code + aliases. New aliases are **added**, never renamed, preserving
historical resolution. Output: a short `docs/defect-taxonomy.md` mapping table.

---

## PART B — Chart engine

### B1. New shared chart primitives

Add `src/components/app/charts/` (used by the cockpit and the analysis pages),
replacing the thin `LineChart`/`MultiLine` in `widgets.tsx`:

- **Scale** — compute a "nice" Y domain from the data (rounded min/max with
  headroom). Rates **do not** force a zero baseline unless the series range is
  wide; counts/₹ keep zero. Exposes a `baseline: "zero" | "fit"` prop.
- **Axes** — left Y axis with 4–5 nice ticks + formatted labels (`pct`/`num`/
  `rupee`); bottom X axis with **decimated** labels: show at most ~8–12 evenly
  spaced ticks regardless of point count (every Nth where N = ceil(points/12)),
  so `day` grain never clumps. Nodes shrink/disappear above a density threshold.
- **Series** — `MultiSeriesLine` takes `series[]` with id/label/color, draws a
  wrapping legend with swatches, supports **click-to-toggle** a series, and
  renders one **target line** per the metric's target (the mockup's dashed
  "Target (10%)"). Color comes from a shared palette keyed to stage/defect id so
  Visual is always the same hue everywhere.
- **Interaction** — single shared hover tooltip (port the editorial `TrendLine`
  crosshair) showing the period + each series value; value labels appear on hover
  and on the last point only, not on every node.
- All colors via CSS variables (`--viz-*`, `--accent`, `--critical`…) so the
  Tweaks panel + dark/light keep working.

The five mockup line charts (Rejection Trend, Stage-wise Trend, Defect Trend,
Size-wise FR16 Trend, COPQ Trend) become instances of these primitives.

### B2. Date-range + grain control

- New `DateRangeControl` in the masthead (AppShell header), backed by
  `TweaksContext` (which already holds `grain`). Holds `{ preset, from, to,
  grain }`.
- Presets: **This FY**, **Last 12 months**, **Last 90 days**, **All**, **Custom…**
  (custom reveals two date inputs). Grain (D/W/M/FY) is an independent segmented
  control next to it.
- `page.tsx` builds `Scope` from this control instead of auto min/max
  (`page.tsx:72`). Snapshot KPIs use the selected window's latest period; trends
  render the full selected window.
- `periodsIn` (`scope.ts:84`) currently hard-slices last 15/12/12 — change to
  honor `scope.dateFrom/dateTo` so the range control actually drives what's
  plotted, with decimation handling density instead of truncation.

### B3. Consistency

Apply the same primitives + palette to the standalone analysis pages
(`/stage-analysis`, `/size-analysis`, `/defect-analysis`, `/spc`, `/copq`) so the
whole app reads as one chart system. The SPC chart keeps its custom control-limit
overlay but adopts the shared axis/scale helpers.

---

---

## PART C — Full triage of the 33 reported issues

Every reported issue maps to one of seven root causes. Fixing the root causes (not
the symptoms one by one) resolves them in groups. The table maps each issue →
cause → fix → phase.

### Root causes (R1–R7)

- **R1 · Non-durable ledger (keystone).** RAM-only `MemoryEventStore` resets on
  refresh/HMR/redeploy. → Move to durable **Supabase/Postgres** (decision above).
  Resolves the "data vanishes" and the apparent "manual overrides Excel" family.
- **R2 · No merge/reconcile between sources.** Manual + Excel for the same key are
  not reconciled. → `dedupeByPrecedence` + same-key **merge-or-clarify** (A2 + the
  merge decision). Manual never silently wins.
- **R3 · Synthesized/assumed values.** Fixed size/defect weights in the seeder. →
  Strict real-only parsing (Part A); absent data renders **"No data for this
  size/defect"**, never an equal/assumed split.
- **R4 · Thin chart rendering.** Pareto/defect-trend "show text but no chart",
  clumping, single-size trend, wrong titles. → Chart engine (Part B) + fix the
  conditional-render guards that fall back to a text summary when a chart should
  draw.
- **R5 · Calculation bugs.** COPQ, savings, SPC UCL/LCL, audit/trust scores. →
  Move every figure into a tested analytics selector; correct the formulas.
- **R6 · Missing UX feedback & controls.** No progress/result after Analyse /
  Publish; no pagination; required-field & arithmetic validation missing; date
  range not editable; export dead. → Targeted per-screen fixes.
- **R7 · Fabricated audit/trust panels.** Audit & trust widgets show hardcoded
  numbers. → Derive from the real ledger + ingestion log.

### Issue → cause → fix → phase

| # | Issue (paraphrased) | Cause | Fix | Phase |
| --- | --- | --- | --- | --- |
| 1 | No feedback whether Excel "Analyse" ran | R6 | Loading + result toast/state on Analyse; show parsed-row count | 5 |
| 2 | Staging area has no pagination | R6 | Paginate the staging grid (page size + controls) | 5 |
| 3 | Data-quality check shows count but not *where* invalid | R6 | Surface failing cell ref + reason per invalid row (provenance already exists) | 5 |
| 4 | "Publish to analytics" / "Analyse with RAIS" give no confirmation | R6 | Success state + redirect/refresh after `/api/ingest` returns | 5 |
| 5 | Data removed after page change / refresh | **R1** | Durable Supabase ledger | 1 |
| 6 | Only some uploads persist in audit trail, then vanish | **R1** | Durable ledger + persist ingestion log rows | 1 |
| 7 | Dashboard "no data" after refresh despite audit rows | **R1** | Same — reads come from durable store | 1 |
| 8 | Data Entry: enable add/remove fields + required flags | R6 | Dynamic field rows w/ required toggles | 6 |
| 9 | Data Entry: wrong numbers accepted (no arithmetic check) | R6/R5 | Run `validate-entry` (balance + defect-sum) before commit; block on fail | 6 |
| 10 | Data Entry: skipping a required field is ignored | R6 | Mandatory-field validation w/ inline errors | 6 |
| 11 | COPQ & savings calc errors on dashboard | **R5** | Audit + fix `analytics/cost.ts`; single selector; tests | 4 |
| 12 | Pareto not drawn despite data (only text) | R4 | Fix Pareto render guard + chart primitive | 3 |
| 13 | Defect-trend Top-5 not drawn (only text) | R4 | Fix MultiSeries render path | 3 |
| 14 | Size-wise YTD: every size same % (assumed) | **R3** | Strict real per-size; no equal split; "no data" when absent | 2 |
| 15 | Size-wise trend fixed to one size | R4 | Size selector on the trend chart | 3 |
| 16 | Audit & verification shows random data | **R7** | Derive from ledger + ingestion log | 4 |
| 17 | Data Trust Score changes randomly, no errors shown | R7/R5 | Compute trust from real validation results; list the failing checks | 4 |
| 18 | Manual entry overrides Excel on same date | **R1+R2** | Durable store + merge-or-clarify reconcile | 1→2 |
| 19 | All graphs/stats overridden by manual entry for a month | **R1+R2** | Same | 1→2 |
| 20 | Size-analysis page: equal % + identical graphs per size | **R3** | Strict real; "No data found for size Frxx" empty state | 2→3 |
| 21 | Defect-analysis: Pareto & trend not drawn (only text) | R4 | Same render fix as #12/#13 | 3 |
| 22 | SPC UCL/LCL miscalculated | **R5** | Proper p-chart limits: σ=√(p̄(1−p̄)/n̄) per subgroup n | 4 |
| 23 | Process-flow page: manual overrides Excel | R1+R2 | Same as #18 | 1→2 |
| 24 | COPQ page diagnostics ≠ visual; annual savings blank | **R5** | Fix cost selectors; render savings; reconcile text vs chart from one source | 4 |
| 25 | Reports page: manual overrides; Pareto not drawn | R1+R2+R4 | Durable + render fix | 1→3 |
| 26 | CAPA add-action: year field accepts unbounded input | R6 | Constrain/validate the year input | 6 |
| 27 | CAPA: status changes Open→In-progress but no icon change | R6 | Bind status icon to state | 6 |
| 28 | Ask RAIS: no response to presets or typed questions | R6 | Repair `/api/chat` wiring + preset handlers | 6 |
| 29 | Audit trail: caps at 100 rows, no total, no pagination | R6 | Paginate + show total count | 5 |
| 30 | Settings: add limit fields; make registry editable | R6 | Editable quality registry + extra limit fields | 6 |
| 31 | Chart titles say "(Monthly)" regardless of grain | R4 | Title from active grain (Daily/Weekly/Monthly/FY) | 3 |
| 32 | Dashboard date range not editable | R6 | `DateRangeControl` (Part B2) | 3 |
| 33 | Top Export button does nothing | R6 | Wire export (print/PDF or audit ZIP per spec §9) | 6 |

---

## Phased implementation (each phase independently verifiable)

1. **Durable persistence (keystone).** Restore the Supabase migration; make the
   store use Supabase when configured (memory only for tests); persist the
   ingestion log. Verify data survives refresh/navigation/restart.
   *Fixes #5,6,7; unblocks #18,19,23,25.*
2. **Parsers + dedupe + merge-or-clarify (pure, TDD).** Five parser modules +
   `dedupeByPrecedence` + same-key reconcile (merge identical, Finding on
   conflict). Rewrite `store/index.ts` seeding; remove all synthetic weights.
   *Fixes #14,18,19,20,23.*
3. **Chart engine + titles + date-range + size selector.** Shared `charts/`
   primitives (scale, axes, decimation, legend, targets, hover); fix the
   text-fallback render guards; grain-aware titles; `DateRangeControl`.
   *Fixes #12,13,15,21,25,31,32.*
4. **Calculation correctness.** COPQ, savings, SPC p-chart limits, trust score,
   audit panel — all from tested selectors over the real ledger.
   *Fixes #11,16,17,22,24.*
5. **Ingestion & audit UX.** Analyse/Publish progress + result states; staging
   pagination; invalid-cell location; audit-trail pagination + totals.
   *Fixes #1,2,3,4,29.*
6. **Entry, CAPA, chat, settings, export.** Dynamic + required + arithmetic-
   validated Data Entry; CAPA year bound + status icon; Ask RAIS wiring; editable
   settings registry; working Export.
   *Fixes #8,9,10,26,27,28,30,33.*
7. **Registry/SOP reconciliation + analysis-page consistency pass.**

Verification per phase: `npx jest` (golden + schema tests stay green) + the
preview workflow (snapshot/console/screenshot) on the touched screens — evidence,
not "looks fine."

## Out of scope (YAGNI)
- No editorial `Dashboard.tsx` (the upload-analyze report) changes — this targets
  the MO!D cockpit (`src/app/*`).
- No new AI calls in the pipeline; parsing + presentation stay deterministic.
  (Ask RAIS chat repair in phase 6 uses the existing `tryModels` chain.)

## Resolved decisions (2026-06-18 review)
1. **Source precedence (A2):** confirmed **size-wise > assembly/rejection >
   cumulative-as-claims**. Size-wise wins where present (finest detail); stage
   reports fill days it doesn't cover; cumulative never adds base counts.
2. **Conflict reconcile (#18):** on a real same-key value conflict, **keep both
   and raise a Finding** for the steward to clarify. No silent overwrite, no
   most-recent-wins.
3. **Export (#33):** the top Export produces the **full audit ZIP package** —
   `manifest.json` (SHA-256 of each file) + `daily_rejections.csv` +
   `user_comments.csv` + `adjudications.csv`, per canonical spec §9.
4. **Sequencing:** **Phase 1 (Supabase persistence) ships first on its own
   branch/PR** so "data vanishes / manual overrides Excel" is fixed immediately.
   Phases 2–7 follow as the larger rebuild after Phase 1 lands.

*All open questions resolved — spec is final and ready to drive implementation
plans (Phase 1 first).*
