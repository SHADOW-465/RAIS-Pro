# MO!D — Finalized UI/UX Design Spec (v1)

**Status:** FINAL for build · 2026-06-17 · **Audience:** the person building the UI in Antigravity.
**Companion (logic/data — don't re-spec here):** [`MOID-SPEC.md`](MOID-SPEC.md).
**Reference mockups:** `MO!D/moid-gm-overview-mockup-1.html` (TradingView-style target), `MO!D/moid-monthly-report-mockup.html` (export). This spec finetunes them; it is not a pixel clone.

This document describes **every screen, component, state, interaction, and token** in enough detail to build the UI without guessing. It contains **no implementation code** — structure, behavior, copy, and visual rules only.

---

## 0. Design principles (apply everywhere)

1. **Decision-support, not a report.** (Direct from the PA review.) Insight and "what to do" lead; raw tables are reachable but never the first thing.
2. **Legible-first.** Numbers are heroes, tabular-aligned. Min UI text 14px.
3. **Layered depth L0→L1→L2:** Glance (headline + verdict) → Read (charts + captions) → Drill (tables, lineage, source cells).
4. **Trust is visible.** Every number can show where it came from and how sure we are.
5. **Light AND dark**, switchable. All color via tokens (no hardcoded hex in components) so the existing Tweaks panel keeps working.

## 1. Theming & tokens

Identity = the locked editorial system (Fraunces / Inter Tight / JetBrains Mono, burnt-orange accent, paper/ink), but **layout density and interaction feel = TradingView** (compact cards, segmented controls, pill chips, smooth 150–200ms transitions). Where they conflict: **mockup wins layout, editorial wins color/type.**

**Typography**
- Display / headings, KPI hero numbers, report titles: **Fraunces** (serif).
- UI text, labels, buttons, nav, form fields: **Inter Tight**.
- All numeric data (KPI values, table cells, %s, deltas, timestamps): **JetBrains Mono**, `font-variant-numeric: tabular-nums`.
- Scale: KPI hero 26–28px · section title 20–22px · card title 14–15px · body 14px · label 11px uppercase tracked · mono table 11–12px.

**Color tokens** (define both themes; names are stable, values theme-swap):
- `--paper` (app bg), `--surface` (card), `--surface-2` (raised/hover), `--ink` (primary text), `--ink-2` (secondary), `--ink-3` (muted), `--border`, `--border-strong`.
- `--accent` burnt orange `#C8421C` — brand only (active nav, primary CTA, the one highlighted KPI rule, Pareto cumulative line). **Never** used as a status color.
- **Semantic status tokens (new, per PA review):** `--status-good` (green), `--status-warn` (amber), `--status-bad` (red), each with a `-bg` (≤12% tint) variant. Used *only* for thresholds, trend direction, finding severity, lineage. Kept distinct from `--accent`.
- `--chart-1..n` for series.
- Light theme: warm paper bg, near-black ink. Dark theme: deep neutral bg (not pure black), off-white ink, same accent/status hues tuned for contrast (AA on both).

**Theme toggle:** top-bar control, persists choice; default follows system. Charts/print flip to ink-on-white automatically for export.

## 2. App shell & navigation

```
┌──────────────────────────────────────────────────────────────────────┐
│ TOPBAR: ◧ MO!D logo · [Period D|W|M|FY] · Period pill · Line pill ·    │
│         Stage pill ·············· [Explain ◯] [☾/☀ theme] [Export] [+] │
├────────┬─────────────────────────────────────────────────────────────┤
│ RAIL   │  MAIN (route content)                                        │
│ Dash   │                                                              │
│ Entry  │                                                              │
│ Verify │                                                              │
│ Report │                                                  [Ask RAIS ●]│
└────────┴─────────────────────────────────────────────────────────────┘
```
- **Topbar (sticky):** segmented **period control** D / W / M / FY; context **pills** (Period e.g. "May 2025", Line "Foley Balloon Catheter (FBC)", Stage "All Stages"); **Explain** toggle (§9); **theme** toggle; **Export**; **"+"** new ingestion.
- **Left rail:** Dashboard · Data Entry · Verify/Schema · Report. Collapsible to icons.
- **Ask RAIS** floating button bottom-right → slide-over chat panel (§8), available on every screen.
- **Scope is global:** changing period/stage pills re-scopes every screen instantly (no reload). This is the GM's "few rows" request — a slice selector.

## 3. Dashboard (primary screen — the decision surface)

Order top→bottom (compact hero per PA point 3):

1. **Insight bar (L0, top — PA point 1).** A slim full-width band: 2–4 **AI key findings** in plain language with a one-word verdict chip each (`HIGH`/`WATCH`/`OK` colored by status). Example: "Rejection is **HIGH** — Final Inspection at 21.7% on Apr 1 drove the month." Each finding is clickable → scrolls to / focuses the relevant chart. **Not** a tall hero; ~2 lines tall.

2. **KPI strip (PA point 2).** Cards, **Rejection Rate is the visually dominant one** (larger, accent rule on top edge). Each KPI card:
   - Hero number (Fraunces or mono per type), label (11px uppercase).
   - **Trend delta vs previous period**: `▲ 1.8pp` / `▼ 0.4pp` colored by good/bad direction (down = good for rejection).
   - **Status dot** good/warn/bad by threshold.
   - **Trust badge** (small `✓`/`≈`/`?`) → click = lineage (§7/§8).
   - KPIs: Total Rejection %, worst-stage %, total rejected qty, (if cost enabled) ₹ lost. Cost card hidden entirely when cost disabled (§ MOID-SPEC 8).

3. **Main trend chart.** "FBC Quality Rejection Rate %" — multi-series line (per-stage %) + Total, over the selected period. Inline SVG. **Insight caption below (PA point 4):** one plain-language line generated from the numbers ("Total rejection fell 3.1pp vs April; Valve Integrity is the only stage trending up.").

4. **Stage watchlist** (TradingView-style "select to focus"): compact rows, one per stage, each with current %, sparkline, delta, status. Selecting a row drives the **Focus panel** (#8 below). Default focus = worst stage.

5. **Rejections by stage** — horizontal volume bars (cumulative qty for the period) + caption.

6. **Top defect categories (Pareto)** — bars + cumulative line (cumulative line uses `--accent`), 80% threshold marker, canonical defect labels. Caption names the vital-few. Clicking a bar filters the dashboard to that defect.

7. **Observations & Diagnostics panel (KEEP — the analytical core).** Two columns: **"What the data is telling you"** (numbered observations) → **"What to do about it"** (recommendations with a horizon chip: Today / This wk / Next wk / 30 days). Every inline number is a trust-badged chip → click = lineage. If cost enabled, recommendations quantify impact ("addressing Thin Spod ≈ ₹X/mo").

8. **Focus panel** (driven by the watchlist): selected stage's detail — its trend, its top defects, its open findings, its lineage shortcut.

9. **Trust scorecard (PA point 7).** Compact card: big **% verified**, then rows — "Validation checks passed N/M", "Sources complete", "Open questions K", "Confidence ▓▓▓▓░". Click → opens chat filtered to data-health (§8). This is the glance; chat is the drill.

10. **Data Quality & Reconciliation Alerts** — list of current open Findings (severity-colored), each a card (§6) the steward can act on inline.

**Empty/loading:** skeleton cards; if no data ingested, a centered prompt → Data Entry or Upload.

## 4. Data Entry screen (in-dashboard, now primary)

Purpose: type rejection data directly; no Excel required.

- **Form model from the registry.** For the chosen date + stage(s), fields: Date, Quantity Checked, Rejection Qty, then a **defect breakdown** sub-grid (defect name → qty). Big, touch-friendly inputs (tablet-friendly). Hindi sub-labels beside English (e.g. "Visual Inspection / विज़ुअल जाँच") — scope per open Q.
- **"Add field" button.** Adds a new defect/stage column; prompts for label + effective date; persists to the registry going forward (history untouched). Visible affordance, not buried.
- **Inline validation = live clarification (MOID-SPEC §6).** As the user types, soft checks fire: rejection > checked, negatives, a value far off this stage's own history, a daily spike vs the period mean. These do **not** block submit; they raise an inline **clarification chip** ("This 33% is 3× the May average — is it correct?") that becomes a Finding the user can answer now or later. Tone: asking, never accusing.
- **Submit** writes events (`extractedBy: direct-entry`) and routes to the Verify screen summary.
- **Cost inputs (optional).** A collapsible "Cost (optional)" section: toggle on → enter finished ₹/unit and/or per-stage ₹/unit + rework ₹/unit. Off by default; when off, all cost UI elsewhere stays hidden.

## 5. Verify / Schema screen (the trust surface, both ingestion paths)

When an Excel file is uploaded **or** after direct entry, the inferred/entered schema lands here for human confirmation before it's trusted.

- **Two-pane split, independently scrolling:** left = source (Excel: rendered sheet excerpt with the mapped cells highlighted `--accent-bg`; direct entry: the entered rows). Right = the **inferred schema mapping** table — each row: source column/header → mapped role (stage/defect/date/qty), confidence chip, and an **edit control** (dropdown to re-map).
- **Per-row comment affordance (Antigravity-style).** A comment icon on every mapping row → opens a small thread; the user types a correction/note ("this is Valve Integrity, not Balloon"). Comments are saved as `Annotation`s, travel with the data, and resurface in chat (§8). Show a count badge when comments exist.
- **Verify beam:** hovering/selecting a schema row draws a bezier beam to the source cell(s) on the left (existing component). Beams clip at pane edges; panes scroll independently; below 720px panes stack and beams disable (tap a cell chip instead).
- **Confidence styling:** exact = quiet, heuristic = subtle, llm = marked "AI-mapped", external-cached = warned. Low-confidence rows float to top.
- **Actions:** Confirm (commit events), Export schema (JSON/CSV), and per-row Re-map / Comment. Unconfirmed low-confidence rows show a gentle "please check" state.

## 6. Finding card (used in alerts list, focus panel, entry clarifications)

```
┌───────────────────────────────────────────────────────────┐
│ V-006 · CRITICAL ·  SHOPFLOOR · APRIL          [● bad dot] │  label row (mono, status color)
│ The April total skips “Missing Formers” (76 trolleys).     │  question — Fraunces ~18px
│ Including it gives 1,626, not 1,550.                       │  detail — Inter Tight
│ ▸ View evidence            (expands split panel §5 inline) │
│ Possible reasons:                                          │
│  • A column was added after the total formula was written. │  ≤3 hypotheses
│  • Missing Formers may be excluded by policy.              │
│ [ It's a mistake ]  [ It's intentional… ]  [ Not sure ]    │  three buttons
│   intentional → required note field                        │
│   GM-authority → “→ goes to GM to confirm” tag             │
└───────────────────────────────────────────────────────────┘
```
- Severity sets the left border + dot color (`--status-*`). Sorting: critical → magnitude → info (info collapsed).
- "It's intentional" reveals a mandatory note; on submit, an inline toast may offer "Make this a rule?" → opens the rule-draft confirm (§ below).
- `unsure` parks the card (separate "Parked" strip); its metrics stay `unresolved`.
- **Rule-draft confirm** (after enough adjudications): a card showing the LLM-drafted rule in plain language ("Always include every defect column in shopfloor totals") with [Activate] / [Edit] / [Discard]. Drafts never act until activated.

## 7. Trust badges & lineage (cross-cutting)

- **Badge** beside any number: `✓` verified (solid, quiet) · `≈` assumed (outlined; hover = the rule rationale or "user-entered cost") · `?` unresolved (status-warn ring; hover = the open question). A metric's badge = worst contributor.
- **Click a badge** → **lineage panel** (slide-over): list of contributing events → pick one → verify beam to its source cell / entry, plus any comments/adjudication notes. Same component the chat "View Source" opens (§8).

## 8. Ask RAIS chat (provenance + data-health live here)

Slide-over panel, available everywhere.
- Conversational Q&A over the data ("why did Final spike on Apr 1?", "where did 1,708 come from?").
- **Every answer that cites a number** ends with a **"View Source"** button. Click → opens the lineage panel: exact file/sheet/cell (Excel) or the direct-entry record, **and** surfaces any editing comments / discrepancy notes attached to that data.
- **Data-health on demand:** "is this month's data trustworthy?" → RAIS summarizes verified/assumed/unresolved with links to the open findings. (The dashboard scorecard is the glance; this is the conversation.)
- Answers are plain-language; numbers are mono chips with trust badges. Saveable as insight snippets (existing capability).

## 9. Explain mode

Global toggle in topbar. When on, every metric label, chart, and KPI shows an inline plain-language definition (subtitle or tooltip): e.g. "Total Rejection % — share of checked pieces rejected across all four inspection stages this period." Lets the GM (layman) and engineer share one screen. Off by default; persists.

## 10. Export / monthly report (3 pages, A4)

Print view at `/report`, screen chrome hidden, light theme forced. Pages (from `moid-monthly-report-mockup.html`, **minus the data-health/sign-off page**):
- **P1 — Monthly Quality & Rejection Report:** letterhead + doc-control strip, exec summary (the insight bar prose), daily Total Rejection % control-style line chart, stage status grid.
- **P2 — Stage-wise Loss Analysis:** per-stage bars, consolidated stage register table (checked / rejected / %, + ₹ loss column only if cost enabled), process inspection-coverage strip.
- **P3 — Defect & Variation Deep-Dive:** defect Pareto, weekly trend table.
- **Print trust marks** inline: `✓`/`≈`/`?` with a footer legend + endnote table ("Notes on data") for assumed/unresolved figures.
- **Print button** triggers browser print-to-PDF and writes a system audit annotation. Repeating headers + "PAGE x / 3" footers; `break-inside: avoid` on cards; thead repeats on long tables; margins ~14mm.
- **Audit ZIP** action (separate from print): downloads CSVs + SHA-256 `manifest.json`.

## 11. Locked / future modules (show, don't build)

Render as **disabled cards** with a one-line promise + "Coming" tag — visible roadmap, zero fake UI: Production/RTY, OEE, Correlation (machine/shift/operator), WIP/VSM, SPC control charts, CAPA memory. Keeps the demo honest.

## 12. Responsive & states

- **Desktop-first** (the GM/engineer use large screens); **tablet** matters for Data Entry (large inputs).
- Below 720px: split panels stack, beams disable (cell chips instead), KPI strip scrolls horizontally, rail collapses to icons.
- Every data component has: loading (skeleton), empty (prompt), error (inline, never a raw stack), and populated states.
- Motion: 150–200ms ease for hovers/expands/theme; chart draw-in on first render only; respect `prefers-reduced-motion`.

## 13. Component checklist (for the build)

Topbar (period seg, pills, Explain, theme, Export, +) · LeftRail · InsightBar · KpiCard (delta + status + badge) · TrendChart + Caption · StageWatchlist + WatchRow · VolumeBars · ParetoChart · ObservationsPanel · FocusPanel · TrustScorecard · AlertsList · FindingCard · RuleDraftCard · DataEntryForm + AddFieldControl + CostInputs · SchemaVerifySplit (SourcePane / MappingTable / CommentThread / VerifyBeam) · TrustBadge + LineagePanel · AskRaisPanel + ViewSourceButton · ExplainTooltip · ReportP1/P2/P3 + PrintLegend · LockedModuleCard · ThemeToggle. All consume CSS tokens (§1); none hardcode color.
