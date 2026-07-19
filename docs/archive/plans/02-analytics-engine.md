# 02 — Analytics Engine (the backbone)

Every number on every screen flows through here. Pure functions over canonical events; no React, no I/O, no LLM. Deterministic + unit-tested. (MOID-SPEC §2, §10.)

## Inputs
- `events = store.effective(filter)` — append-only ledger, superseded excluded (already built, plan exists in `src/lib/store`).
- `registry` (stages, defects, sizes) + `costConfig` (optional).
- A `Scope` (global filter state, plan 01): `{ plant, line, dateFrom, dateTo, shift?, stageIds?, sizes?, productIds?, machineIds?, operatorIds?, grain: 'day'|'week'|'month'|'fy' }`.

## Event → analytics mapping
Data Entry / ingestion emit per stage-day-(size?):
- `production` → **input/checked** qty (denominator).
- `inspection(accepted)` → **good** qty; `inspection(rework)` (mapped from `hold`) → **rework** qty; `inspection(rejected)` → **rejected** qty.
- `defect_rejection` (`rejection` events) → rejected qty by `defectCode` (+ `size`, `stageId`).
- `aggregate_claim` → **never** read here (validation only).

> Data-model note for plan 03: Data Entry captures Input / Good / Rework / Rejected per stage. Emit maps Good→inspection(accepted), Rework→inspection(rework), Rejected→inspection(rejected). FPY needs Good; current emit only had checked+rejected — extend emit + `StageDayRecord` with `acceptedGood` and `rework` (nullable) before plan 04. Optional `size`, `operator`, `machine`, `shift` ride on provenance/metadata for V2 dims.

## Core selectors (the public API of `src/lib/analytics/`)
All take `(events, scope, registry)` and return plain data + provenance. Names are stable; screens import these only.

| Selector | Returns | Formula |
|---|---|---|
| `rejectionRate(scope)` | `{ value, sourceEventIds }` | Σrejected ÷ Σchecked (entry-stage or all per scope) |
| `totalRejected(scope)` | qty | Σ rejected |
| `fpy(scope)` | % | Σgood ÷ Σchecked (per stage) or RTY = Πstage FPY for line-level |
| `byStage(scope)` | `[{stageId,label,checked,rejected,good,rework,rejRate,yield,contributionPct}]` | per-stage sums; contribution = stageRejected ÷ totalRejected |
| `byDefect(scope)` | `[{defectCode,label,rejected,pct,cumPct}]` desc | Pareto; cumPct running sum |
| `bySize(scope)` | `[{size,checked,rejected,rejRate}]` | per FR size; empty when no size-tagged events |
| `trend(scope, metric)` | `[{period,value}]` | metric bucketed by scope.grain |
| `stageTrend(scope)` | `[{period, perStage:{stageId:rejRate}}]` | per-stage series |
| `defectTrend(scope, topN=5)` | `[{period, perDefect:{code:qty}}]` | top-N defects over time |
| `weeklyTrend(scope)` | `[{week,value}]` | current-month weeks |
| `qualityStatus(scope)` | `'good'|'watch'|'at-risk'` | thresholds (Settings): rejRate vs target + open critical findings |
| `copq(scope)` | `{ value, byStage } \| null` | `null` when `!costConfig.enabled`; else Σ rejected×costPerUnit(stage) |
| `savingsOpportunity(scope)` | `₹ \| null` | cost-gated: (rejRate − target) × checked × cost |
| `trustScore(scope)` | `{ pct, verified, assumed, unresolved }` | lineage rollup (below) |

## Trust / lineage (powers Data Trust Score + Audit & Verification + per-number badges)
Each event has `confidence` + may be touched by a Finding/adjudication. A metric's lineage = worst of its contributing events: `verified` (no open finding, confidence exact/heuristic) / `assumed` (rulebook auto-adjudication, external-cached, or user-entered cost) / `unresolved` (open or `unsure` finding). `trustScore.pct = verified ÷ total contributing`. Audit & Verification panel = counts from the ingestion manifest + findings store (source files, validation checks passed, formula integrity = % claims that recomputed clean, manual overrides = correction events, data completeness = present periods ÷ expected).

## Period & scope
- One date utility: bucket events by `grain` using FY April–March. Week = ISO week within the selected month for `weeklyTrend`.
- Scope filtering is applied once (`scopeEvents(events, scope)`); selectors operate on the filtered set. `vs prev period` deltas = run the selector on the immediately-prior equal-length window; return `{value, delta, direction}`.
- Machine/operator/shift filters: applied only if events carry those fields; otherwise the filter is a no-op flagged `disabledReason: 'not captured yet'` (plan 01 disables the control).

## Narrative inputs (for AI Executive Summary / Recommended Actions / Key Insights)
A `narrativeContext(scope)` builder returns ONLY computed, de-identified aggregates (rates, ranks, deltas, top defects/stages/sizes) — never raw counts of sensitive dims, never machine/operator unless present. The LLM writes prose from this; it cannot introduce a number not in the context (plan 04 §narrative + MOID-SPEC §12 egress). If a dimension (machine/operator) is absent, it's not in the context, so the model can't assert "Machine M3".

## File layout & tests
```
src/lib/analytics/
  scope.ts        scopeEvents + period bucketing + prev-window
  rejection.ts    rejectionRate, totalRejected, fpy, byStage, trend, stageTrend, weeklyTrend
  defect.ts       byDefect, defectTrend
  size.ts         bySize, sizeTrend
  cost.ts         copq, savingsOpportunity (cost-gated, returns null when disabled)
  trust.ts        trustScore, auditSummary
  status.ts       qualityStatus, thresholds
  narrative.ts    narrativeContext
  index.ts        re-exports
```
Tests: golden values reconciled against the GM's own monthly/yearly REJECTION ANALYSIS files (e.g. April stage %s) so a regression fails loudly; cost selectors return null without config; size/defect selectors return `[]` (→ empty-state) when those events absent. Reuse the existing golden-test pattern.
