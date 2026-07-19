# 06 — Shared Component Library (the anti-bloat contract)

The single defense against "too many features / clotted codebase / production errors." Every screen composes these; **no bespoke charts or one-off cards.** Inline SVG only (no Chart.js/recharts — AGENTS.md). All consume CSS tokens (theme + status), never hardcoded hex.

## Charts (`src/components/charts/`) — one of each, data-driven
| Component | Props | Used by |
|---|---|---|
| `LineChart` | `series: {label,points:[{x,y}],color}[]`, `target?`, `multi` | rejection/stage/defect trends |
| `BarChart` | `bars:[{label,value,color?}]`, `horizontal?` | stage/size YTD, weekly |
| `ParetoChart` | `items:[{label,value,cumPct}]` | stage/defect pareto |
| `DonutChart` | `slices:[{label,value,color}]`, `centerLabel` | contribution, defect summary, record distribution |
| `Sparkline` | `points:number[]`, `tone` | KPI cards |
| `GaugeCard` | `value, max, label, tone` | COPQ impact (cost-gated) |

Each: fixed viewBox, responsive width, `prefers-reduced-motion`-aware draw-in, accessible `<title>`, tooltip on hover, empty-state slot. They are dumb — no data fetching, no metric math.

## Cards / primitives (`src/components/ui/`)
- `KpiCard` — value · label · delta(±, colored by good-direction) · `Sparkline` · `TrustBadge`. Dominant variant for the lead KPI.
- `StatusCard` — green/amber/red status + message + link.
- `InsightPanel` / `ActionList` — narrative bullets / numbered actions; numeric tokens wrapped as trust-badged chips.
- `DataTable` — sortable columns, numeric `tabular-nums`, total row, row-status coloring, per-row action slot (powers staging + performance tables).
- `TrustBadge` — ✓/≈/? + hover lineage; click → `LineagePanel` (events → source cell via the existing verify beam).
- `EmptyState` — icon + message + optional CTA (the canonical "no data / locked" renderer; every gated widget uses this).
- `LockedModule` — disabled card with one-line promise + "Coming" tag (V2 modules).
- `RightRailFilters` — the checkbox/select filter group (analytics screens).
- Shell: `TopBar`, `LeftNav`, `StatusBar`, `DataTrustScore`, `AskRasLauncher` (plan 01).

## Conventions
- Reuse existing editorial primitives where they already exist (`Icon`, cards, beam/`VerifyPanel`) — extend, don't duplicate. The current `EditorialCharts.tsx` is the starting point for the chart set; consolidate into the table above rather than adding new chart files per screen.
- A component renders one thing; data shaping happens in plan-02 selectors. If a screen needs a new visual, add it here (shared), never inline.
- Theme + status colors via tokens only; verified by a lint rule / review (no `#` hex in `src/components` except token definitions).

## Why this matters
Bounded surface = bounded bugs. ~6 charts + ~10 primitives cover all 5 mockups. New screens are composition, not new rendering code, so production errors stay localized and the codebase doesn't sprawl.
