# MO!D Build Status

Living tracker of what's implemented vs planned. Branch: `moid-v1`. Updated 2026-06-18.
Spec: `docs/design/MOID-SPEC.md` · Plans: `docs/plans/00-INDEX.md` … `07`. Tests: **126 green**, `tsc` clean.

## ✅ Done (committed + tested)

### Foundation / data model
- **Canonical contract** — `src/lib/contract/d1.ts` (events, registries, CostConfig), `d3.ts` (findings/adjudication/rulebook), `hash.ts` (content-hash ids: identity-based eventId → idempotent re-ingest; evidence-order-independent findingId). Mirrors `docs/design/*.ts`.
- **Registry** — `src/lib/registry/disposafe.ts`: rejection stages + defect alias map (incl. real misspellings) + `resolveDefect`/`activeStageIds`. (⚠ currently 4 stages — needs Eye Punching added, see Pending.)
- **Append-only store** — `src/lib/store/`: `EventStore/FindingStore/RulebookStore` interfaces (`types.ts`); memory adapter (`memory.ts`, idempotent append, Correction-aware `effective()`, derived finding state); Supabase adapter (`supabase.ts`) + migration (`supabase/migrations/20260615000000_schema.sql`, append-only RLS); `index.ts` selector (Supabase if env else process-singleton memory).

### Ingestion (the demo)
- **Emit core** — `src/lib/ingest/emit.ts`: `StageDayRecord → canonical events` (production / inspection(rejected) / rejection / aggregate-claim), provenance + confidence + ids.
- **Classifier** — `src/lib/ingest/from-rejection-sheets.ts`: parsed rejection workbooks → records + human-verifiable mapping preview (stage-per-sheet shape).
- **Live clarification** — `src/lib/entry/validate-entry.ts`: point-in-time + spike checks (rejected>checked, negatives, defect-sum V-004, % V-003, spike V-009).
- **UI + API** — `src/app/ingest/page.tsx` (upload → verify mapping table **with per-row comment button** → confirm → summary), `src/app/api/ingest/route.ts` (emit + store + checks). `src/app/page.tsx` now **dashboard-first** (ingest is a CTA, not a gate). `comment` icon + status-color tokens added.

### Analytics engine (plan 02 — the backbone)
- `src/lib/analytics/`: `scope.ts` (filter + FY period bucketing + prevWindow), `rejection.ts` (rate/totals/fpy/byStage/trend/stageTrend/weeklyTrend), `defect.ts` (byDefect Pareto / defectTrend / bySize — empty-state when absent), `index.ts`.
- **`/api/events`** — serves the effective ledger to the engine.
- Multi-provider AI — `src/lib/ai.ts` (NVIDIA NIM + OpenRouter w/ fallback).

### Tests
`src/__tests__/`: `store`, `ingest-emit`, `ingest-classify`, `analytics` (+ pre-existing parser/metrics/golden). Reconciled to the GM's real April-2025 numbers.

## 🔜 Next (queued, per plan build order)
1. **Shell + shared components** (plans 01 + 06): TopBar w/ global Scope filters, LeftNav, StatusBar, DataTrustScore; `ScopeProvider` + `useAnalytics` hook (fetches `/api/events`); chart set (Line/Bar/Pareto/Donut/Sparkline/Gauge) + primitives (KpiCard/StatusCard/DataTable/TrustBadge/EmptyState/LockedModule). Inline SVG, tokens only.
2. **Dashboard cockpit** (plan 04): compose from selectors + components; cost-gated widgets hidden; empty-states.
3. **Analytics screens** (plan 05): Stage/Size/Defect shared scaffold; SPC (V1.5).

## ⏳ Not started
- **Trust/status/narrative selectors** (plan 02 remainder): `trust.ts` (trustScore/auditSummary), `status.ts` (qualityStatus/thresholds + SPC limits), `cost.ts` (copq/savings — cost-gated), `narrative.ts` (de-identified LLM context).
- **Data Entry full form + Staging publish-to-analytics** (plan 03): extend `StageDayRecord`/emit with `acceptedGood`+`rework`; route `checkRecord` issues into `FindingStore`.
- **Secondary** (plan 07): Audit Trail, Settings (registry/cost/thresholds), Reports/export, Ask RAS, Process Flow page, COPQ page, CAPA stub.
- **B-sec**: egress guard + scrubber + local-LLM default (MOID-SPEC §12 / security).
- **Registry fix**: add Eye Punching stage (effectiveFrom 2025-11-01) → 5 stages per mockup.

## Notes / decisions in force
- Numbers come only from the analytics engine; screens never compute. One shared component set (no bespoke charts). No fake data — absent data → empty/locked state.
- Cost (COPQ/savings) hidden until `CostConfig.enabled`. Machine/operator/shift correlation = V2, captured-not-analyzed until enough tagged data.
