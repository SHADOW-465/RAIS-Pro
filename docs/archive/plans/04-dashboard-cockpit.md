# 04 — Dashboard Cockpit (mockup 1)

The GM landing screen. Every widget below lists: **source selector (plan 02) · component (plan 06) · gated state**. The screen is pure composition — it computes nothing.

## Top intelligence row (4 cards)
| Card | Source | Component | Notes |
|---|---|---|---|
| AI Executive Summary (bullets) | `narrativeContext(scope)` → LLM | `InsightPanel` | bullets reference only metrics in context; each numeric token gets a trust badge + click-to-lineage |
| Recommended Actions (numbered + View All) | `narrativeContext` → LLM | `ActionList` | "View All" → `/capa` (V1.5 stub). Plain suggestions, no CAPA backing in V1 |
| Monthly COPQ Impact (gauge) | `copq(scope)` | `GaugeCard` | **cost-gated**: hidden if `copq()===null`; row reflows to 3 cards |
| Quality Status (At Risk) | `qualityStatus(scope)` | `StatusCard` | green/amber/red from thresholds; "View Details" → findings |

## KPI strip (5 cards, each: value · delta vs prev · sparkline · trust badge)
Rejection Rate `rejectionRate` · Total Rejections `totalRejected` · FPY `fpy` · COPQ `copq` (cost-gated, hidden if null) · Savings Opportunity `savingsOpportunity` (cost-gated). Component: `KpiCard` (plan 06). Rejection Rate is visually dominant. Sparkline = `trend(scope, metric)` last 12.

## Trend row
- **Rejection Trend (Monthly)** + target line → `trend(scope,'rejectionRate')` + `thresholds.target`; `LineChart`.
- **Stage-wise Rejection Trend** (multi-line) → `stageTrend(scope)`; `LineChart` multi-series.
- **Process Flow Overview** (right) → `byStage(scope)` rows (checked/rej/yield %) + a Finished-Good summary; `ProcessFlowList` (vertical stage cards with yield %).

## Analysis row
- **Stage-wise Rejection (YTD)** horizontal bars → `byStage`; `BarChart` horizontal.
- **Defect Pareto (All Stages)** table → `byDefect(scope)`; `ParetoTable`. Empty-state when no per-defect events.
- **Defect Trend (Top 5)** → `defectTrend(scope,5)`; `LineChart`. Empty-state likewise.

## Size & cadence row
- **Size-wise Rejection (YTD)** bars → `bySize(scope)`; empty-state if no size data.
- **Size-wise Rejection Trend (selected FR)** → `sizeTrend(scope, size)`; size picker.
- **Weekly Rejection Trend (current month)** → `weeklyTrend(scope)`; `BarChart`.
- **COPQ Trend (Monthly)** → `trend(scope,'copq')`; **cost-gated**, hidden if no cost.

## Right column
- **Audit & Verification** → `auditSummary(scope)` (source files, validation %, formula integrity %, manual overrides, completeness %) + "View Audit Trail" → `/audit`; `AuditPanel`.

## Bottom status bar (shell, plan 01)
Active Alerts / Pending CAPA / Overdue / Data Anomalies / Ask RAS — live counts from findings.

## Responsiveness & states
12-col grid; cards reflow to 1–2 col under 1100px. Cost-gated widgets that hide must not leave grid holes — the grid is defined over *present* widgets. Every widget: loading skeleton, empty-state (defined per widget above), error inline. First-render chart draw-in only.

## Narrative guardrail
The LLM summary/actions are generated server-side from `narrativeContext` and cached per scope; they regenerate on scope change (debounced). If the LLM is unavailable, the panels fall back to a deterministic templated summary built from the same context (so the dashboard is never blank). The model may never output a number absent from the context.
