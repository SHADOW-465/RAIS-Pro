# Master Plan — AI-Native Workspace (UX/IA redesign per GM + ChatGPT convo)

**Source brief:** `MOID UX chatgpt convo.txt` (Obsidian inbox) — the validated direction: MO!D is an
AI Manufacturing Data Explorer, not a dashboard pile. Workbooks are the primary object; dashboards
are views of them. **Branch:** `feat/ai-native-workspace` (off main, which contains Plans 1–9).

## What already exists (do NOT rebuild)

| Convo ask | Already built (Plans 1–9) |
|---|---|
| AI Schema Intelligence Engine | `src/lib/schema/` profiler + signatures (deterministic; LLM confidence layer deferred) |
| Schema Registry / workbook families | `src/lib/dataset/` — signature+stage-aware Datasets, persisted (Supabase `datasets`/`dataset_rows`) |
| Generated dashboards | `buildGenericDashboard` + `GenericDatasetView` |
| Generated data entry | `DatasetEntryForm` ("Custom Datasets" tab) |
| Semantic sheet names | `recognizeSheetStage` → registry stage labels |
| Publish/migration path | `toStageRecords` + explicit Publish → `/api/ingest` |
| Problem-first overview + 5-part KPI narrative + heatmap | Plan 9 (`page.tsx` overview strip, `kpiNarrative`, `StageSizeHeatmap`) |
| Traceability | `FloatingDetailModal` View Source beams |
| Deterministic math / ledger / provenance | Core architecture, untouched |

## Locked constraints (AGENTS.md — the convo's "Linear/Stripe aesthetic" is interpreted WITHIN these)
- Editorial design system stays: Fraunces/Inter Tight/JetBrains Mono, warm paper, CSS variables, flat/outlined cards. No Chart.js/lucide/framer-motion, no new hex colors, no Tailwind color utilities.
- "Less orange" = usage discipline (orange for brand/accent/active only; status uses existing `--positive/--warning/--critical` tones), NOT a palette swap.
- AI never does math. RBAC deferred (architecture may anticipate it; no auth work).
- TradingView-grade brush/annotations: DEFERRED (zoom +/−/FIT already exists on charts). Note in Phase D as future work.

## Data-model note for the workbook tree
`Dataset` groups by schema+stage ACROSS files (12 monthly files → one "Visual Inspection" dataset).
The convo wants navigation by FILE → sheet. Both are served without migrations: `DatasetRow` carries
`(datasetId, fileName, sheetName)`, and `Dataset.sources` lists every (file, sheet). So:
- Workbook tree = invert `datasets[].sources` → `file → [{sheetName, datasetId, recognizedStageId}]`.
- Sheet dashboard (L3) = `buildGenericDashboard(dataset, rows.filter(r => r.fileName===f && r.sheetName===s))`.
- Workbook dashboard (L2) = per-dataset sections over `rows.filter(r => r.fileName===f)`.
- Factory Overview (L1) = existing Cumulative dashboard (unchanged name in code; retitled in UI).

---

## Phase A — Navigation & Information Architecture (kills the "18 tabs" problem)

**A1. Top View selector → compact dropdown.** Replace the 13-stage-button strip + appended dataset
tabs in `AppShell.tsx` with ONE compact `<select>`-style dropdown (styled like the existing Date
Range control, not a native select if the codebase has a pattern): groups "Factory Overview" /
"Stations (live data)" (only stages present in events) / "Uploaded Data" (dataset tabs, existing
visibility rules). Same `stageView` tweak semantics — zero behavior change below the header. The 13
hardcoded always-visible stage buttons are gone; stations only appear once they have data.

**A2. Sidebar grouping.** In `AppShell.tsx`'s left nav, group the 15 flat items into collapsible
sections (default expanded, persisted collapse state in localStorage):
- **Overview**: Dashboard
- **Workbooks**: Workbooks (new route, Phase B — in Phase A link it but render a stub if B not merged; ship A+B together to avoid the stub)
- **Data**: Data Entry, Staging & Review
- **Analysis**: Stage / Size / Defect / SPC / Process Flow / COPQ
- **Management**: Reports, CAPA, Ask RAIS, Audit Trail, Data Schema, Settings
Section headers: small caps, `--text-3`, chevron toggle. Keep existing icons/routes untouched.

**Verify (browser):** all existing routes reachable; View dropdown switches Factory Overview /
station / dataset views identically to the old tabs; no console errors.

## Phase B — Workbooks experience (the centerpiece: L2/L3 dashboards + tree)

**B1. `/workbooks` page.** Two-pane layout inside `AppShell`: left panel (within page, NOT the app
sidebar) = search box + expandable tree of uploaded workbooks from `/api/datasets` (invert sources
per the data-model note); right pane = dashboard. Tree: `▼ file.xlsx → 📊 Overview + one node per
sheet` (semantic label when the sheet's dataset `recognizedStageId` is set — e.g. "VISUAL" sheet
shows "Visual Inspection"; raw sheet name otherwise). Click sheet → L3; click Overview/file → L2.
No hover menus. Tree scales: collapsed by default except the first file; search filters files+sheets.

**B2. Source-scoped dashboards.** Extend `buildGenericDashboard` call sites (NOT its signature) by
pre-filtering rows: L3 = one (file, sheet); L2 = all rows of the file, rendered as one section per
dataset represented in that file (section header = dataset title, then KPIs/trends via the existing
generic components). Reuse `GenericDatasetView`'s pieces — extract its dashboard-rendering JSX into
a small presentational component (`GenericDashboardBody`) both it and the workbooks page use, rather
than duplicating. Publish banner appears on L2/L3 when the dataset is recognized & unpublished (reuse
existing logic).

**B3. Record Explorer hook (L4).** Where the generic dashboards render KPIs, wire the existing
provenance affordance minimally: each L3 dashboard shows a "Source: file → sheet" caption line
(cheap, honest traceability; the full beam-modal stays on Factory Overview as today).

**Verify (browser):** upload April file fresh (memory store), tree shows the workbook with semantic
sheet names, sheet click renders correct single-sheet KPIs (cross-check one number against the sheet),
file click renders sectioned L2, search filters, zero console errors, screenshots.

## Phase C — Upload reveal, action cards, executive brief

**C1. Staging "AI understood your workbook" panel.** After Analyze in `/staging`, render a Detected
summary card ABOVE the review table, from data already computed client-side by the silent hook path
(run `datasetsWithRowsFromWorkbooks` result through to state instead of discarding): per workbook —
detected sheets, per-sheet semantic type (recognized stage label or "General data"), column-role
counts (N measures, N dimensions, N defect codes, N derived-recomputed), and a deterministic
confidence proxy per sheet (fraction of columns with non-"other" role assignments + date-axis
presence; label ≥0.9 High / ≥0.7 Medium / else "Needs review" — NO fake AI percentages). This is the
ChatGPT-style "reveal" moment. Review table + Publish flow unchanged below it.

**C2. Recommendations → action cards.** In `page.tsx` Factory Overview, replace the plain-text
"Recommended Actions" list items with small structured cards: severity chip (existing tones),
action text, evidence line (the metric that triggered it — already known at construction), and a
"Create CAPA →" link routing to `/capa` (prefill via query params only if `/capa` already supports
them — check; otherwise plain link, no new CAPA plumbing). No owner/due-date fields yet (that data
doesn't exist; do not fabricate).

**C3. Executive Brief format.** Reshape the "AI Executive Summary" card content into brief form:
one bolded headline line (worst deterioration or top risk, from existing computed diffs), then
labeled lines — Impact (COPQ), Primary driver (top stage/defect), Recommendation (top action) — all
from existing deterministic values. Falls back to current bullets when data is sparse.

**Verify (browser):** upload → reveal panel shows honest detection; action cards render + CAPA link
navigates; brief reads as a brief; zero console errors; screenshots.

## Phase D — Visual hierarchy & polish pass (within locked tokens)

- Typography scale: page titles up (display serif, ~28–32), hero KPI numerals up (mono, ~40–48),
  card titles stay small-caps — adjust inline styles only, no token changes.
- Spacing: increase page gutters + card gaps on the Factory Overview and Workbooks pages (20→24);
  ensure no grid squeeze below 1280px.
- Semantic color usage sweep: status/tone elements must use positive/warning/critical vars; orange
  only for brand/active/accent. Grep for tone misuse on the touched pages only (no app-wide churn).
- Empty states: upgrade the 3 highest-traffic ones (no datasets yet on /workbooks; heatmap no-size;
  station no-data) to helpful guidance ("what to upload / where") per the convo's pattern.
- NOT in scope: chart brush/annotations (future), font/palette changes, RBAC.

**Verify (browser):** side-by-side screenshots before/after for Factory Overview + Workbooks; all
238+ tests green; `tsc` clean.

## Execution
Phases run A+B together (one implementer, they interlock), then C, then D — each browser-verified
against the real April corpus before commit, subagent-driven with review. Full suite + tsc gate
every phase. No migrations required anywhere in this plan.
