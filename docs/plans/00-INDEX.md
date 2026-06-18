# MO!D Dashboard — Implementation Plan Index

Status: active · 2026-06-18 · Source of truth for *spec* = `docs/design/MOID-SPEC.md` (mirrors the vault canonical spec). These plans translate the approved mockup (5 screens) into a buildable, **sustainable** dashboard.

## The plans
| # | File | Covers |
|---|---|---|
| 00 | this | Scope map, mockup↔spec reconciliation, build order, anti-bloat rules |
| 01 | `01-shell-and-global-state.md` | App shell, nav, global filters, routing, theming, trust score, status bar |
| 02 | `02-analytics-engine.md` | The deterministic backbone: selectors over canonical events; every metric's formula + provenance; scoping/trust |
| 03 | `03-ingestion-entry-staging.md` | Data Entry + Staging & Review screens, wired to the built ingestion/emit/store |
| 04 | `04-dashboard-cockpit.md` | The main Dashboard screen, widget by widget |
| 05 | `05-analytics-screens.md` | Stage / Size / Defect Analysis screens |
| 06 | `06-shared-components.md` | The shared primitive library (charts/cards/tables) — the anti-bloat contract |
| 07 | `07-deferred-and-secondary.md` | Process Flow, COPQ & Savings, SPC, CAPA, Reports, Ask RAS, Audit Trail, Settings |

## Non-negotiable build rules (prevent the "clotted codebase / production errors" failure)
1. **One analytics engine.** Every number on every screen comes from selectors in `src/lib/analytics/` (plan 02). Screens/components NEVER compute metrics inline. One formula, one place, one test.
2. **One component library.** All charts/cards/tables are the shared primitives in plan 06 (inline SVG only — no Chart.js/recharts per AGENTS.md). No per-screen bespoke charts.
3. **No fake numbers.** Every displayed value traces to canonical events (plan 02) or is explicitly a config/threshold. If the data to back a widget isn't present, the widget shows a defined **empty/locked state** — never invented data. Mockup numbers are placeholders.
4. **Feature gating by data availability** (the table below). A widget renders live only when its inputs exist; otherwise it renders its gated state. This is what keeps scope honest and the build shippable.
5. **Build V1 fully before V1.5.** A small dependable dashboard beats a broad broken one.

## Stage model reconciliation
Mockup shows **5 stages**: Visual Inspection, Eye Punching, Balloon Testing, Valve Integrity, Final Inspection. Canonical §10 named 4; the real DATA adds Eye Punching from 2025-11. **Resolution:** stages are registry-driven (`src/lib/registry/disposafe.ts`); update the registry to the 5 stages with `effectiveFrom` for Eye Punching (2025-11-01). Screens render whatever stages the registry + data contain — never hardcode 4 or 5.

## Mockup widget → classification & data gating
V1 = build now, data-backed · V1.5 = computable, secondary, build after V1 · V2 = locked module (needs data we don't capture yet).

| Widget (screen) | Class | Backing data / gate |
|---|---|---|
| Rejection Rate, Total Rejections, FPY KPIs | **V1** | events (checked, rejected, accepted-good) |
| Rejection Trend (monthly), Stage-wise trend, Weekly trend | **V1** | events by period/stage |
| Stage-wise rejection (YTD bars), Process Flow Overview (checked/rej/yield) | **V1** | events by stage |
| Defect Pareto, Defect Trend (Top 5) | **V1 where defect data exists** | per-defect events (VISUAL reason matrix, size-wise files); else empty-state |
| Size-wise Rejection (YTD + FR trend) | **V1 where size data exists** | size-tagged events (SIZE WISE REJECTION files); else empty-state |
| AI Executive Summary, Recommended Actions, Key Insights | **V1** | LLM narrative over computed metrics (never computes numbers) |
| Quality Status (At Risk) | **V1** | threshold rules over rejection rate / findings |
| Audit & Verification panel, Data Trust Score | **V1** | findings + lineage + ingestion manifest (plan 02 trust) |
| Data Entry form + Staging & Review | **V1** | the built ingestion/emit/store (plan 03) |
| Stage Analysis screen (tabs, tables, contribution) | **V1** | analytics engine |
| Monthly COPQ Impact, COPQ Trend, COPQ & Savings, Savings Opportunity | **V1.5 — cost-gated** | hidden unless `CostConfig.enabled`; ₹ = rejected × user cost. No cost → widgets hidden, KPI strip reflows. |
| SPC & Control Charts | **V1.5** | p/np-chart over rejection rate; Nelson rules later |
| Process Flow (detailed page) | **V1.5** | the overview panel is V1; full interactive flow later |
| Reports (monthly GM export) | **V1.5** | export of V1 analytics (MOID-SPEC §10) |
| Ask RAS chat | **V1.5** | LLM Q&A + View Source over events |
| Audit Trail (full page) | **V1** | append-only event/finding/adjudication log |
| Settings | **V1** | registry, cost config, thresholds, users |
| Operator / Machine / Shift filters & correlation | **V2** | only meaningful once Data Entry captures these (it does, going forward); analytics stays disabled until enough tagged data. Filters render disabled with a "captured from new entries" note. |
| CAPA & Actions (full suite), Recommended-action → CAPA links | **V2** | basic "actions list" stub in V1.5; full CAPA project mgmt deferred (spec §15) |

## Build order
1. Plan 02 analytics engine + plan 06 components (the backbone). 2. Plan 01 shell. 3. Plan 03 entry/staging (wire to built ingestion). 4. Plan 04 dashboard. 5. Plan 05 analytics screens. 6. Plan 07 V1 items (Audit Trail, Settings, Reports), then V1.5 (cost/COPQ, SPC, Ask RAS), then V2 locked stubs.

## Mockup elements explicitly handled / corrected
- **COPQ everywhere** → cost-gated; the demo plant hasn't given ₹/unit, so these hide by default (no fake ₹). Enable in Settings when a cost is entered.
- **Machine M3 / Night-shift operator insights** (in the AI summary) → these are *examples of the V2 correlation feature*; V1 narrative must not assert machine/operator causes unless that data is present. Narrative prompt is constrained to available dimensions (plan 02 §narrative).
- **Numbers (13.90%, ₹3.24L, 1,86,945, FPY 86.1%)** → illustrative; real values come from ingested events.
- **"Disposable Baddi" plant / FBC Line 1 / multi-line selectors** → single client/line for the pilot; plant/line selectors render but are single-option until multi-line data exists.
- **Notifications (4), RK user, roles** → auth/users is thin in V1 (Settings-managed); notifications = open findings/alerts count (real), not a separate system.
