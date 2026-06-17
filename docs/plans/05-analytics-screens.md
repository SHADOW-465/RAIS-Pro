# 05 — Analytics Screens (Stage / Size / Defect / SPC)

Mockups 4 & 5 show Stage Analysis in full; Size, Defect, SPC follow the same frame. All read plan-02 selectors; all share the plan-06 components + a common `<AnalyticsScreen>` scaffold (tabs + KPI strip + right-rail filters). Build the scaffold once.

## Common scaffold
- **Header:** title + Monthly/Weekly/Daily grain toggle (writes `scope.grain`) + Filters button.
- **Tabs:** Overview · Stage/Size/Defect Performance · Trend Analysis · Contribution Analysis · Pareto · Drill Down. (Tab set parameterized by screen.)
- **KPI strip** (6): Total Input, Total Rejected, Overall Rejection %, FPY, Total Rework, Net Good Output — each value · delta vs prev · sparkline. Sources: `byStage`/`rejectionRate`/`fpy` aggregates.
- **Right rail:** Select Stages (checkboxes → `scope.stageIds`), Additional Filters (Product, Size, Machine, Operator — Machine/Operator **disabled** with "captured from new entries" until data exists), Reset/Apply, Info panel (counts, last updated).

## Stage Analysis (`/analytics/stage`)
- **Overview tab:** Stage Performance Summary table (`byStage`: input/accepted/rejected/rej%/FPY/rework/yield/contribution%) + Stage-wise Rejection % Trend (`stageTrend`) + Stage Pareto (`byStage` sorted, bar+cum line via `ParetoChart`) + Stage Contribution donut (`byStage` contributionPct) + Key Insights (`narrativeContext` filtered to stage dimension).
- **Stage Performance / Trend / Contribution / Pareto tabs** = focused views of the same selectors.
- **Drill Down tab:** pick a stage → its defects (`byDefect` scoped to stage), its daily rows, its findings, lineage to source.

## Size Analysis (`/analytics/size`)
Same scaffold over `bySize` / `sizeTrend`. FR-size table + bars + trend + size-contribution + outliers (sizes whose rej% > mean+kσ). **Whole screen empty-states** when no size-tagged events (size-wise files not ingested) — a clear "Ingest size-wise files to enable" panel, not blanks.

## Defect Analysis (`/analytics/defect`)
Same scaffold over `byDefect` / `defectTrend`. Pareto table + Top-5 trend + defect-by-stage matrix + per-defect drill (which stages/sizes/dates). Empty-state when no per-defect events.

## SPC & Control Charts (`/analytics/spc`) — V1.5
p-chart / np-chart of rejection rate over time with mean + UCL/LCL (3σ) computed deterministically; out-of-control points flagged. Nelson-rule run detection later. Build after V1 screens; it reuses `trend` + a `controlLimits` helper added to `analytics/status.ts`. Not on the critical path.

## Rules
- No screen computes a metric — only selector calls. Adding a metric = add a selector (plan 02) + a test, then render.
- Tables/charts are plan-06 components with data props; no bespoke SVG per screen.
- Filters mutate Scope (plan 01); data updates reactively. Machine/Operator filters are inert until those fields are populated — render disabled, never error.
