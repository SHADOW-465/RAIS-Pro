# Plan: Additional visualizations (inline-SVG widgets)

## Constraint
No chart libraries (AGENTS.md bans Chart.js/recharts/etc.). All charts are
hand-rolled inline SVG in `src/components/app/widgets.tsx`, themed via CSS vars,
with the shared hover tooltip (`ChartTip` + `hoverIndexFromEvent`) and vertical
date labels already established there. New widgets follow that pattern (a
position:relative wrapper, viewBox SVG, `ChartTip` on hover). Export `ChartTip`/
`hoverIndexFromEvent` from widgets so new charts reuse them.

## Priority 1 — build first (high value, low effort, domain-fit)

### 1. Real Pareto chart `ParetoChart` (bars + cumulative line)
- Input: `DefectRow[]` from `byDefect()` (already has `rejected`, `pct`, `cumPct`).
- Render: descending bars (rejected qty), a right-axis cumulative-% line, and a
  dashed 80% reference line; color the "vital few" bars (cumPct ≤ 80) accent, the
  rest muted. Hover → defect, qty, %, cum%.
- Use on the dashboard "Defect Pareto" card and `src/app/defect-analysis/page.tsx`
  (replace the table-only view; keep the table beneath as detail). Depends on the
  defect-parsing fix (`plan-defect-parsing-fix.md`) so it has data.

### 2. Donut `Donut` (composition share)
- Input: `{ label, value, color? }[]`.
- Render: SVG arcs (stroke-dasharray on a circle) with a center total; legend with
  %; hover → slice label + value + %.
- Uses: rejection share **by stage** (`byStage` contributionPct) and **by defect**
  (top-N + "Other"). Place on dashboard Row 4 and Stage/Defect pages.

### 3. Heatmap `Heatmap` (hotspots)
- Input: rows (e.g. defect labels) × cols (periods from `defectTrend`/`stageTrend`)
  → matrix of values; color scale low→high (CSS var ramp).
- Render: grid of `<rect>`s, axis labels (cols vertical), hover → row·col·value.
- Uses: defect × month, and stage × month rejection-rate. Best single view for
  "where/when are the spikes." Add to Defect Analysis + a dashboard card.

## Priority 2 — strong follow-ups
- **Process funnel `Funnel`**: units entering each FBC inspection stage
  (Visual→Balloon→Valve→Final) with attrition bars; pairs with `ProcessFlow` /
  `FBC_PROCESS`. Shows where yield is lost.
- **Bullet charts `Bullet`**: actual vs target per stage in one compact stacked row
  (better than one `GaugeChart` per metric); uses `getTargetRejectionRate()`.
- **Stacked bars `StackedBar`**: stage (or defect) composition per period — total +
  mix over time.
- **Calendar heatmap `CalendarHeatmap`**: daily rejection-rate grid for a month/FY;
  reveals weekday/shift patterns. Feed from daily `trend(grain:"day")`.

## Integration notes
- All respect the global header scope (`resolveScope` → grain + date + stageView),
  so each new chart automatically renders per-stage/period like the rest.
- Keep within the editorial design (flat/outlined, CSS-var colors, JetBrains Mono
  numbers); reuse `SERIES_COLORS`.
- Each chart gets the shared `ChartTip` hover; dense x-axes use the vertical-label
  treatment already in `LineChart`/`MultiLine`.

## Build order & acceptance
1. ParetoChart (after defect fix) → dashboard + defect page show 80/20 bars+cum line.
2. Donut → stage & defect share render with hover.
3. Heatmap → defect×month hotspots render.
4. Funnel, Bullet, StackedBar, CalendarHeatmap as follow-ups.
- Each: `npx tsc` clean, no console errors, renders with real data and per the
  active View/date scope; a lightweight render test where practical.

## Files
`src/components/app/widgets.tsx` (export ChartTip/hoverIndexFromEvent + new
components, or split into `widgets/` if it grows), `src/app/page.tsx`,
`src/app/defect-analysis/page.tsx`, `src/app/stage-analysis/page.tsx`,
`src/app/size-analysis/page.tsx`.
