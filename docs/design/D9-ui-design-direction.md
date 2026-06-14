# D9 — UI Design Direction ("TradingView-grade")

**Trigger (2026-06-13 client meeting):** GM + coworkers (a) **accepted in-app data entry instead
of Excel**, (b) will **share data via Google Drive**, (c) asked for UI "clean and sophisticated
**like TradingView**." Builds on `docs/rais-design-language.md` + D7; feeds D5 (UX) and B4.

---

## 1. What "like TradingView" actually means (decoded)
Not literal candlesticks — three bundled wants:
1. **Gravitas:** professional command-terminal feel; serious software he can show a board/auditor.
2. **Live:** feels current/alive, not a monthly PDF — now possible because data entry is in-app.
3. **Interactive exploration:** hover exact values, scrub timeframe, drill — = his earlier
   scoped-analysis / Minitab ask, in visual form.
The reference mostly **confirms** our existing design (scope selector, trust badges, role views).

## 2. Trait → MO!D translation
| TradingView trait | MO!D translation |
|---|---|
| Dark, restrained palette | dark UI, near-monochrome + **two semantic accents only** |
| Green up / red down | green = rejection ↓ / in-control · red = rejection ↑ / out-of-limit |
| Central chart + side panels | persistent workspace: main trend chart, watchlist + detail panels around it (not paged screens) |
| 1D/1W/1M/1Y selector | the **global scope selector** (day/week/month/fiscal-year/batch/stage/defect) |
| Hover crosshair w/ exact values | hover any datapoint → exact numbers + source-cell provenance |
| Watchlist / scanner sidebar | **defect/stage/line "watchlist"** — scan all, click to drill |
| Stacked panes, shared x-axis | rejection-rate + volume + defect-mix on one shared timeline |
| Tabular / mono numerals, tight grid | tabular figures, KPI strip, disciplined grid, zero decorative fluff |
| Saveable workspaces | per-role + per-user saved widget layouts (our composition model) |
| Live ticking | periodic refresh + smooth value transitions (no streaming infra needed for V1) |

## 3. The hard rule — two registers, not one
- **Reading (GM / Quality Engineer):** the TradingView terminal — dense, dark, live, interactive.
- **Writing (operator / steward data entry):** the OPPOSITE — big targets, simple, forgiving,
  Hindi/English, autosave, "same as yesterday" prefill, tablet/PC friendly. Applying terminal
  density here would kill data-entry adoption (the thing we just won). Calm form, not cockpit.

## 4. Concrete direction
- **Theme:** dark default (offer light for print/report). One neutral base + green/red semantic +
  one cool accent for selection/links. No gradients-as-decoration.
- **Type:** a clean grotesk for labels + a **tabular/mono** face for all numbers (alignment = the
  "serious" feel). Numbers are the heroes.
- **Layout:** app shell with left workspace nav (role-filtered) + a **persistent top scope bar**
  (period/line/stage/defect) that governs every widget on screen — the TradingView timeframe row.
- **Signature interaction:** keep the verify beam (KPI → source cell); add hover-crosshair exact
  values on every chart; trust badge (verified/assumed/unresolved) on every number.
- **Motion:** restrained — value count-ups, smooth panel transitions on refresh. Alive, not flashy.

## 5. What the meeting changed (pipeline + scope)
- **In-app data entry = PRIMARY pipeline** (client accepted). Forms generated from the learned
  ontology; emit the same canonical events (author provenance). → promote B4.5 ahead of the Excel
  polish; it's now core, not optional.
- **Google Drive data = historical backfill:** one-time bulk import of their existing sheets via
  the D1 ingestion engine to seed history, then live entry ongoing. Excel pipeline = importer, not
  the daily path.
- **Live dashboard** now genuinely feasible (continuous entry feeding the ledger).
- Strategic: owning data entry makes MO!D their **system of record** for quality → deeper moat,
  and flags the CSV/GAMP-5 validation boundary sooner (note, don't fear).

## 6. Open / confirm with client
- Get the Google Drive access + do the historical import first (real data → real design).
- Confirm: which screen do they picture as "the TradingView one" (GM overview? defect explorer?) —
  build that one to full polish as the hero, others follow its language.
- Entry forms: which stages, which fields, who enters, on what device (PC/tablet/phone)?
- Light vs dark for the printed GM report (print likely needs light).

## 7. Next step — DONE (concept built)
Visual concept of the GM overview built: `docs/blueprint/gm-overview-mockup.html` (copy on OS
dashboard: `_Export/moid-gm-overview-mockup.html`). Interactive, TradingView-grade, using
Disposafe's REAL structure (Assembly stages Visual/Balloon/Valve/Final; real defect names Thin
Spod/Struck Balloon/Leakage/Balloon Brust/Bubble; real April/May figures; values elsewhere
illustrative). Demonstrates: dark terminal shell, global scope bar, KPI strip w/ trust badges,
interactive trend chart (hover crosshair, empty-Jan finding flagged), stage watchlist (click →
focus panel), stage bars, defect Pareto w/ 80% line, Data-Health findings (the 3 real anomalies
with Mistake/Intentional/Not-sure adjudication buttons). **This is the D5 design-cues gate
artifact — show it to the GM for sign-off BEFORE building production UI.**

## 8. After sign-off
- Take their feedback on THIS screen → lock the design language → then build the real GM
  overview against live data, then the QE diagnostics view, then the (calm, separate) steward
  entry view. Don't build production UI until they approve the hero screen.
