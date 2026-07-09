# Dashboard Redesign Plan — Factory Overview

Goal: the GM answers "healthy or not, where, why, what it costs, what to do" in under
30 seconds without scrolling past the fold; every metric has exactly one home on the
overview; depth lives on the detail pages that already exist.

## 1. Diagnosis — the redundancy map

Audit of `src/app/page.tsx` (cumulative view). Same fact, multiple widgets:

| Fact | Appears today in | Count |
|---|---|---|
| Overall rejection rate | KPI tile + sparkline · FPY tile (it is literally `1 − rate`, inverted sparkline) · "Overall Rejection Trend" chart · "Weekly Rejection Trend" card · "Total" line in Stage-wise trend · exec-summary bullet 1 | 6 |
| Stage breakdown | "Top Rejecting Stage" tile · "Stage Contribution" donut + legend · "Process Flow Overview" · "Stage-wise Rejection Trend" multiline · "Biggest Improvement Opportunity" card · exec-summary bullet 2 · heatmap rows | 7 |
| Defect breakdown | "Top Defect" tile · Defect Pareto · "Defect Trend (Top 5)" · exec-summary bullet 3 · recommended-action card 2 | 5 |
| Size breakdown | "Rejection by Size" bars · "Size Trend" + selector · heatmap columns · worst-size subtitle · recommended-action card 3 | 5 |
| COPQ / savings ₹ | "COPQ Trend" card · exec-summary bullet 4 · Opportunity card ₹ block · every KPI drill-down narrative | 4 |

Structural problems:

- **The "so what" is at the bottom.** The three narrative cards (AI Executive Summary,
  Biggest Improvement Opportunity, Recommended Actions) — the only cards that answer
  the GM's actual question — sit below six rows of charts. All three restate the same
  three facts (worst stage, savings ₹, top action).
- **FPY tile carries zero information.** `fpy = 1 − rejectionRate`; same sparkline flipped.
- **"Weekly Rejection Trend" duplicates the grain switcher.** The topbar D/W/M/FY
  segmented control already re-buckets the main trend chart.
- **Donut vs Process Flow are the same fact twice**, side by side in adjacent rows.
- **The reference screenshot's own flaw to avoid:** it shows a "Healthy" health tile
  and a "YES, INTERVENE" banner simultaneously. Our verdict must be single-sourced
  from `qualityStatus()` so the banner and any status chip can never disagree.

Detail-page coverage (verified): stage-analysis already renders the stage multiline,
donut, and contribution bars; defect-analysis renders the defect trend + Pareto;
size-analysis renders size bars + size trend + selector; copq renders the COPQ trend +
gauge; spc renders the control chart. Nothing removed below is lost — it is one click away.

## 2. Target layout (top → bottom)

```
┌──────────────────────────────────────────────────────────────┐
│ VERDICT BANNER  status · reason · impact ₹ · top action · ▸  │  1st: am I OK?
├──────────┬──────────┬──────────┬──────────┬──────────────────┤
│ Rejection│  COPQ ₹  │ Top Stage│ Top Defect│ Worst Size      │  2nd: the vitals
├──────────┴──────────┴──────┬───┴──────────┴──────────────────┤
│ Overall Rejection Trend    │  Process Flow + per-stage rates │  3rd: direction
├────────────────────────────┼─────────────────────────────────┤   & location
│ Defect Pareto              │  Rejection by Size              │  4th: drivers
├────────────────────────────┴─────────────────────────────────┤
│ Stage × Size heatmap                                         │  5th: interaction
└──────────────────────────────────────────────────────────────┘
     — above-fold budget at 1366×768: banner + KPI strip + top of trend —
```

**Row 0 — Verdict banner** (full width, replaces the three bottom narrative cards)
- Left: status word from `qualityStatus()` ("In Control" / "Intervene") + the
  `execBrief.headline` sentence as the reason.
- Middle: Impact `rupee(m.savings)` · Primary driver (worst stage + rate + share) —
  the existing `execBrief` fields, relabeled.
- Right: top recommended action (from `recommendationCards[0]`) with its severity chip
  and **Create CAPA →**; small data-completeness chip (`m.audit.dataCompleteness`)
  linking to `/audit` (replaces the Audit & Verification card).
- Tone: the banner border/chip uses `--critical` / `--positive` per status; text label
  always present (never color-only).

**Row 1 — KPI strip, 5 tiles** (`repeat(5, minmax(0,1fr))`)
1. **Overall Rejection** — `pct(m.rate)`, sub: `stats.rateDiff` + `checked/rejected`
   counts (counts are currently missing from the cumulative view). Sparkline kept
   (user decision, D1) — instant micro-trend without eye travel to the chart below.
2. **COPQ** — `rupee(m.copq)`, sub: `stats.copqDiff`. → `/copq`
3. **Top Rejecting Stage** — name + rate. → `/stage-analysis`
4. **Top Defect** — name + share. → `/defect-analysis`
5. **Worst Size** — size + rate. → `/size-analysis`
- FPY tile deleted. (No "Worst Machine" tile — machine data doesn't exist in the ledger.)
- Tiles keep their click-to-modal provenance drill-down; each also gets a quiet
  "View analysis →" footer link to its detail page.

**Row 2 — Trend + stages** (`2fr 1fr`)
- **Overall Rejection Trend** (grain-driven, target + mean lines). The only
  overall-trend chart on the page.
- **Process Flow** card, absorbing the donut card's legend: under the flow, one row
  per stage with rate · share · units (the donut's data, denser and rankable). Donut
  card deleted from the overview (still on `/stage-analysis`).

**Row 3 — Drivers** (`1fr 1fr`)
- **Defect Pareto** (kept as-is; the canonical defect view).
- **Rejection by Size** horizontal bars (kept; marginal view the heatmap doesn't
  give at a glance).

**Row 4 — Stage × Size heatmap** (full width, kept — the only cross-dimensional view).

Removed from the overview entirely: FPY tile, Stage Contribution donut card,
Stage-wise Rejection Trend multiline, Defect Trend (Top 5), Size Trend + size
selector, Weekly Rejection Trend, COPQ Trend, Audit & Verification card, and the
three narrative cards. Net: 17 modules → 1 banner + 5 tiles + 4 charts.

**StationView** (per-stage view): drop its FPY tile for the same reason → 3 KPIs
(Rejection Rate, Checked, Rejected). Otherwise unchanged.

## 3. Implementation steps

1. **`src/app/page.tsx`** — restructure the cumulative branch:
   - Add `VerdictBanner` (local component in page.tsx, like `BriefRow`) fed by
     `m.status`, `execBrief`, `recommendationCards[0]`, `m.audit.dataCompleteness`.
     Reuse existing memos; no new math.
   - Delete the JSX for the nine removed modules and the `weekly`, `copqTrend`,
     `defectTrend`, `sizeTrend`, `stageTrend`/`cumTrend` wiring from the `m` memo
     (keep selectors in `analytics.ts` — detail pages use them). Remove now-unused
     `selectedSize` state + its sync effect.
   - Merge donut legend rows into the Process Flow card body.
   - Add COPQ tile; move counts into the rejection tile sub.
2. **`src/components/app/widgets.tsx`** — `Kpi`: optional `href` footer link
   ("View analysis →", `--accent`, stops propagation from the modal onClick).
   Nothing else changes; all styling stays on CSS variables.
3. **StationView** in page.tsx: remove FPY tile.
4. **Verify**: `npx tsc --noEmit`, `npx jest` (130 tests — none cover page layout, so
   expect green), then live preview: verdict banner + full KPI row visible without
   scrolling at 1366×768; grain/date/stage topbar controls still drive the trend;
   Tweaks panel theming still repaints everything; every removed chart reachable in
   one click via its link.

## 4. Design guardrails (register: product)

- Consume CSS variables only; no new Tailwind color utilities (Tweaks panel contract).
- Numbers in `--font-mono`; display serif only for the banner status word.
- No side-stripe accent borders on the banner or action chips (full border + tinted
  chip instead). No gradient text. Severity always chip **and** word.
- Motion: keep the existing `pulse-ring` only on the banner status dot when status is
  "Intervene"; respect `prefers-reduced-motion`.

## 5. Interaction states

| Module | Loading | Empty / sparse | Error | Success / normal |
|---|---|---|---|---|
| Verdict banner | Covered by existing `PageLoader` (whole page) | `execBrief` is null when `exec` < 3 lines: banner degrades to status word + "Not enough history for a full brief — showing latest period only" + completeness chip. Never render an empty banner shell. | n/a (pure derived state) | Status word + reason + impact + action |
| KPI tiles | PageLoader | Top Defect / Worst Size with no data: keep the tile, value "—", sub "No defect data this period — ingest size-wise sheets" (mirrors the existing honest exec-summary line). Never drop tiles (layout must not reflow by data availability). | n/a | value + delta sub + link |
| Trend chart | PageLoader | < 2 points: single-point dot + note "One period of data — trend appears after the next upload" | n/a | line + target + mean |
| Pareto / Size bars / Heatmap | PageLoader | Section hidden entirely (current behavior, kept) — the KPI tile's "—" already tells the story | n/a | chart |
| Whole page | `PageLoader` "Initializing the intelligence ledger…" | Existing "No data yet" empty state with Staging CTA — unchanged, it already teaches the interface | n/a | dashboard |

## 6. Responsive & accessibility

- **Grid behavior:** KPI strip uses `repeat(auto-fit, minmax(190px, 1fr))` so it wraps
  5 → 3+2 → 2-per-row instead of crushing; banner switches to column flex below
  ~1100px (status+reason first, action last). Rows 2–3 collapse to single column
  below ~1024px; heatmap already scrolls horizontally in its own container.
- **Keyboard:** clickable `Kpi`/`Card` divs currently have no keyboard affordance.
  Add `role="button"`, `tabIndex={0}`, Enter/Space handler, and a `:focus-visible`
  outline (2px `var(--accent)`) in `widgets.tsx` — one change, every card inherits.
- **Touch/click targets:** the new "View analysis →" footer links get ≥ 32px hit area
  (padding, not font size).
- **Color-blind safety:** banner status = word + chip + border (never color alone) —
  already in the guardrails; applies to tile tones too (existing `tone` chips keep
  their text subs).
- Modal focus trap: `FloatingDetailModal` behavior unchanged; verify Escape still closes.

## Acceptance criteria

- No metric rendered by more than one module on the overview.
- Verdict + 5 KPIs visible above the fold at 1366×768.
- Banner status and every tone chip derive from the same `qualityStatus`/`targetRej`
  comparisons (no contradictory states possible).
- Build passes, all existing tests pass, provenance modals still open with source rows.

## NOT in scope (considered, deferred)

- **"Worst Machine" tile** (from the reference screenshot) — no machine dimension exists
  in the event ledger; would require new ingestion columns first.
- **Detail-page redesigns** — stage/defect/size/copq/spc pages already carry the evicted
  charts; their own layout polish is a separate pass.
- **DESIGN.md** — the token system lives in AGENTS.md + `TweaksContext`; formalizing it
  into a DESIGN.md (`/impeccable document`) is worthwhile follow-up, not a blocker.
- **Mobile-first layout** — GM usage is desktop; the responsive spec above covers
  graceful degradation, not a dedicated mobile design.

## What already exists (reuse, don't rebuild)

- `Kpi`, `Card`, `LineChart`, `BarsH`, `ProcessFlow`, `StageSizeHeatmap`, `ParetoChart`,
  `FloatingDetailModal` — all layout changes recompose these; no new chart components.
- `qualityStatus`, `execBrief`, `recommendationCards`, `auditSummary` memos in page.tsx —
  the verdict banner is pure recomposition of these.
- Topbar date-range presets + D/W/M/FY grain switcher + stage-view selector (AppShell).
- `PageLoader` and the "No data yet" empty state — unchanged.

## GSTACK REVIEW REPORT

| Review | Trigger | Why | Runs | Status | Findings |
|--------|---------|-----|------|--------|----------|
| CEO Review | `/plan-ceo-review` | Scope & strategy | 0 | — | — |
| Codex Review | `/codex review` | Independent 2nd opinion | 0 | — | — |
| Eng Review | `/plan-eng-review` | Architecture & tests (required) | 0 | — | — |
| Design Review | `/plan-design-review` | UI/UX gaps | 1 | issues_found→fixed | score: 6/10 → 9/10, 3 decisions |
| DX Review | `/plan-devex-review` | Developer experience gaps | 0 | — | — |

- **VERDICT:** DESIGN CLEARED — interaction states, responsive/a11y specs, and layout
  hierarchy added; 3 taste decisions resolved by user (sparkline kept, both size views
  kept, single-action banner). Eng review not run (plan is a single-page recomposition
  of existing components; run `/plan-eng-review` if desired before implementing).

NO UNRESOLVED DECISIONS
