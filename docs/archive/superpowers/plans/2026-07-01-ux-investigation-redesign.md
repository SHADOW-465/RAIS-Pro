# Plan 9 — Investigation-Oriented UX Redesign

**Builds on:** the existing Cumulative dashboard (`src/app/page.tsx`), existing selectors (`src/lib/analytics/rejection.ts`), existing editorial primitives. **Branch:** `feat/universal-schema-ingestion`.

## Design translation (read first — this reframes the brief onto real data)

The user relayed feedback (via ChatGPT) asking for an "investigation, not visualization" workspace: Overview → Problem ID → Root Cause → Evidence → Action, with traffic-light KPIs, progressive drill-down, and charts that each answer one specific question. That brief references **OEE, downtime, machine, and operator** breakdowns — **none of that data exists** anywhere in the uploaded corpus (no machine/operator/downtime columns in any file). Fabricating those metrics would violate this codebase's hard rule that the model/UI never invents numbers. This plan translates the *information architecture* onto what's real:

| Brief's concept | Real analog used here |
|---|---|
| OEE | First Pass Yield (`fpy`, already computed) |
| Downtime / Cost Impact | COPQ (`copq`, already computed) |
| Top Bottleneck | Worst-performing **stage** (`worstStageByRejs`, already computed) |
| Machine / Operator drill-down | **Stage → Size → Defect code → Date** (the real dimensions in this data) |
| Traffic-light KPIs | Already exist (`tone="good"/"bad"/"warn"` on `Kpi`) — needs to be the PRIMARY visual language of the landing view |
| Chart-per-question | Pareto (what causes losses) and Trend (improving/worsening) already exist correctly framed; **Heatmap** (where concentrated) is genuinely missing — build it; Process Flow (where stuck) already exists |
| Traceability | Already exists (`FloatingDetailModal` "View Source") |
| Plain-language insight + action | Already exists globally (AI Executive Summary + Recommended Actions) — needs to also exist **per-KPI**, inside the drill-down |
| Visual style ("control room, not BI") | Already satisfied by the LOCKED editorial design system (`AGENTS.md`) — **do not change the visual skin**, flat/outlined cards + Fraunces/Inter Tight are correct and must stay. This plan is information-architecture work, not a re-skin. |

**Hard constraint from `AGENTS.md`:** no Chart.js, no lucide-react, no framer-motion, no new Tailwind color utilities — reuse the existing inline-SVG editorial chart components and CSS-variable theming exactly as the rest of the codebase does.

## What changes, concretely

### 1. Overview strip (top of Cumulative view) — lean, traffic-light-first

Restructure the CURRENT Row 1 (4-card "intelligence cockpit") + Row 2 (5-KPI strip) in `src/app/page.tsx` into ONE compact overview row of 4-5 large `Kpi` tiles, in this fixed order, each already computed and already tone-aware — do not compute anything new here, just reorder/resize what exists:
1. Rejection Rate (`m.rate`, existing tone logic)
2. First Pass Yield (`m.fpy`, existing tone logic) — the OEE-analog
3. COPQ / Cost Impact (`m.copq`, existing tone) — the cost-impact metric
4. Top Bottleneck — the worst-performing stage by rejection rate (`worstStageByRejs`, already computed; add its rejection rate as the tile's sub-value)
5. Quality Status (existing `m.status` gauge — keep as the 5th tile, it's already a clean traffic-light indicator)

The existing "AI Executive Summary" and "Recommended Actions" cards move to directly BELOW this strip (still visible, not deleted) — they remain the narrative summary of the whole page, but no longer compete visually with the KPI tiles for top billing.

### 2. New: Stage × Size heatmap ("where are problems concentrated")

Add one new chart answering the "where" question, using data that already exists (`byStage` + rows filtered by size, or a new small selector combining both). Read `src/lib/analytics/rejection.ts`'s `byStage`/`bySize` signatures first — if a stage×size cross-tab selector doesn't exist, add ONE new pure function `stageBySize(events, scope): { stage: string; size: string; rejRate: number }[]` following the exact style/conventions of the neighboring selectors in that file (same `Scope`/`scopeEvents` usage), then render it as a simple grid/table with cell background intensity mapped to rejection rate (reuse the existing CSS variable palette — e.g. interpolate between `--positive-weak`/`--warning-weak`/`--critical`-ish tones already used elsewhere for tone, do not introduce new hardcoded hex colors per `AGENTS.md`).

Place this new heatmap card in the existing "Row 3: Pareto & Stage Donut" grid area (add as a third card, or its own row directly below — use judgment on the cleanest existing-grid fit, verify visually in the browser).

### 3. Per-KPI drill-down narrative in `FloatingDetailModal`

Today, clicking a KPI opens `FloatingDetailModal` with a title, an ad-hoc insight string/array, one chart, and (for most) a "View Source" table. Restructure the CONTENT passed into `openModal(...)` for the primary KPIs (Rejection Rate, FPY, COPQ, Top Bottleneck) to follow a fixed narrative order, using ONLY already-computed values (no new computation needed beyond simple lookups already available in `m`):

1. **What happened** — the headline stat, already the `insight` string.
2. **Why** — the top contributing stage/size/defect for this metric (already computable from `m.stages`/`m.sizes`/`m.defects`, sorted desc — most of this data is already sorted this way; just surface the top entry explicitly as a labeled line, e.g. "Driven mainly by: Visual Inspection (41% of total)").
3. **Cost impact** — if the metric isn't COPQ itself, show the COPQ figure alongside it for context (`rupee(m.copq)`), so every drill-down surfaces cost, not just count.
4. **Evidence** — the existing "View Source" table (`sourceRows`) — already present, do not change its mechanism, just ensure it's positioned as this 4th narrative step, not floating disconnected.
5. **Recommended action** — reuse the EXISTING `recommendations` array logic, but filter/prioritize it to the ONE recommendation most relevant to the clicked metric (e.g. Rejection Rate's drill-down surfaces the highest-rejection-stage recommendation; COPQ's drill-down surfaces the savings-opportunity line) rather than showing the same global list every time.

This is a content-ordering and labeling change inside the modal's `insight`/`content` construction in `page.tsx`, NOT a rewrite of `FloatingDetailModal.tsx` itself (its container/beam/source-table mechanics are unrelated and must stay untouched) — unless a genuinely necessary small prop is missing (e.g. a way to pass a structured 5-part narrative instead of a loose string; if so, add ONE new optional prop, keep the existing `insight`/`children` props working exactly as before for any caller that doesn't use it, to avoid touching every other `openModal` call site in the file).

### 4. Everything else stays, just demoted to "progressive disclosure"

Trend charts, defect Pareto, stage donut, process flow, size-wise breakdowns, weekly/COPQ trends, and the audit panel are NOT deleted — they remain below the Overview strip, in their current grid arrangement, exactly as they compute today. This plan reorders/relabels the TOP of the page and enriches the DRILL-DOWN; it does not remove any existing capability.

## Verification (this is a visual/UX plan — browser verification is the primary acceptance test, more so than for any prior plan)

1. Start the dev server, load the Cumulative dashboard with real persisted/ingested data (use whatever's already in the event store from this session, or ingest one real file via Staging → Publish if the store is currently empty).
2. Confirm the Overview strip shows 4-5 large tiles in the specified order, each showing a real, correctly-toned (green/red/amber) value.
3. Click each of the 4 primary KPIs; confirm the drill-down modal shows the 5-part narrative (what/why/cost/evidence/action) with REAL numbers, not placeholders, and that "View Source" still works.
4. Confirm the new Stage×Size heatmap renders with real data and sensible color intensity (worse cells visually read as worse).
5. Confirm nothing below the fold (trends, Pareto, process flow, size-wise, audit) regressed — spot check 2-3 of them render as before.
6. Screenshot the new Overview strip, one drill-down modal, and the heatmap. Report what real numbers appeared.

## Done criteria
- `npx tsc --noEmit` clean; full `npx jest` — zero regressions vs. the Plan 8 baseline (this plan is presentation-layer + at most one new pure selector, so any new selector should get a small unit test following the existing `analytics`-test conventions if one exists, otherwise browser verification suffices for the purely presentational pieces).
- Browser verification completed per above, with screenshots and real numbers reported.
- No new Chart.js/lucide-react/framer-motion/hardcoded-hex-color additions (confirm via a quick grep of the diff for `chart.js`, `lucide`, `framer-motion`, and raw `#`-hex additions outside existing CSS-variable definitions).
