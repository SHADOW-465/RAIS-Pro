# D4 — Pipeline & Module Architecture

**Status:** v1.0 (2026-06-11) · **Depends on:** D1 (frozen), D2, D3 · **Feeds:** B1–B4

---

## 1. Existing-codebase audit (reuse / port / delete)

The data path is being replaced (SheetSummary→LLM-graph→metrics becomes Events→Validation→Adjudicated analytics). The presentation layer and AI plumbing largely survive.

| Existing | Decision | Why / how |
|---|---|---|
| `src/lib/parser.ts` (xlsx→SheetSummary, junk-row & granularity heuristics) | **Port** | Low-level workbook reading, total-row regexes and date heuristics feed the new `ingest/` row classifier. `SheetSummary` output kept only until B4 switches the dashboard; then the summary shape is internal to ingestion. |
| `src/lib/metrics.ts` (`inferSheetGraph`, `computeMetrics`) | **Port** | `inferSheetGraph` becomes the heuristic producer of `CandidateSheetGraph` (D1). `computeMetrics` is superseded in B4 by `analytics/` over canonical events; deleted after parity test passes. |
| `src/lib/dashboard-builder.ts` (reconcile, sanity gate, KPI/chart mapping) | **Port** | `reconcileGraph` + `metricsSane` pattern is reused verbatim for LLM-vs-heuristic table graphs in ingestion. KPI/chart mapping is rewritten in B4 to read analytics + lineage. |
| `src/lib/merger.ts` (merge-plan) | **Delete (B4)** | Cross-sheet merging is what the canonical event store *is*; a merge plan over summaries has no role. |
| `src/lib/schemas.ts` | **Reuse + extend** | Cross-provider rules already documented here; Candidate* schemas (D1/D3) join it in B1. |
| `src/lib/ai.ts` (`tryModels`, OpenRouter) | **Reuse as-is** | Already "semantics only". All new LLM calls go through it. |
| `src/lib/analysis-utils.ts` (prompt builders) | **Port** | Graph prompt is rewritten to target `CandidateSheetGraph`; narrative prompt survives until B4 then cites events. |
| `src/lib/supabase.ts`, `device-id.ts` | **Reuse as-is** | |
| `src/lib/verify-nav.ts`, `BeamOverlay.tsx`, `VerifyPanel.tsx` | **Reuse + upgrade (B3/B4)** | The beam is product identity. Upgrade: targets resolve from D1 `Provenance.cells` instead of ad-hoc sourceColumn refs; independent-scroll fix verified in D5. |
| `Dashboard.tsx`, `KPICard`, `ChartContainer`, `ParetoChart`, `EditorialCharts` | **Port (B4)** | Visual components stay; data props change to analytics-with-lineage (trust badge on every metric). |
| `UploadZone`, `ProcessingLoader`, `Sidebar`, `SessionCard`, editorial primitives, `TweaksContext` | **Reuse as-is** | |
| `ChatPanel.tsx`, `/api/chat` | **Port (B4)** | Answers must cite event provenance; tool surface changes to query the canonical store. |
| `/api/analyze`, `/api/narrative` | **Replace (B1/B2)** | Become `/api/ingest` (events) + `/api/validate` (findings); narrative survives as a thin prose pass over computed analytics. The LLM-graph + sanity-gate *pattern* inside analyze is ported into ingestion. |
| `/api/sessions/*` | **Reuse + extend** | Session = ingestion run + its findings/dashboard state. |
| `src/__tests__/*` (parser, metrics-infer, golden, verify-nav…) | **Reuse** | Keep green throughout; parser/metrics tests retire with their modules in B4. New golden tests land beside them. |
| `supabase/migrations/*` (sessions schema) | **Reuse + extend** | New append-only tables added; sessions table gains `ingestion_id`. |

## 2. Module map (new code, B1–B3)

```
src/lib/contract/   d1.ts d3.ts            ← frozen schemas (moved from docs/design)
src/lib/registry/   disposafe.ts           ← stage/defect registries (D1 §4), versioned
src/lib/ingest/     reader.ts              ← xlsx → cell grid + formulas (ports parser.ts internals)
                    classify.ts            ← row/table/column classification → CandidateSheetGraph
                                              (heuristic first; LLM assist via tryModels when confidence < 0.7)
                    emit.ts                ← CandidateSheetGraph + grid → D1 events (deterministic; reads
                                              values from cells, LLM never transcribes numbers)
                    ingest.ts              ← orchestrator: file → events + manifest
src/lib/store/      types.ts               ← EventStore / FindingStore / RulebookStore interfaces
                    memory.ts              ← in-memory + JSON-file adapter (tests, local-first)
                    supabase.ts            ← Supabase adapter (same interfaces)
src/lib/validate/   rules/v001.ts … v013.ts← one pure function per D2 rule
                    engine.ts              ← run all rules → Findings; apply active RulebookRules (D3 §3)
src/lib/rulebook/   draft.ts               ← LLM rule drafting (CandidateRuleDraft)
                    apply.ts               ← predicate matching, RuleApplication records
src/lib/analytics/  rejection.ts pareto.ts ← B4: stats over effective adjudicated events + MetricLineage
src/app/api/ingest/route.ts                ← upload → ingest → validate → respond manifest+findings
src/app/api/findings/route.ts              ← queue read, adjudicate write
src/app/api/rulebook/route.ts              ← draft/activate/retire
```

### Core interfaces

```ts
interface EventStore {
  append(events: CanonicalEvent[]): Promise<{ inserted: number; deduped: number }>;
  effective(filter: EventFilter): Promise<CanonicalEvent[]>; // superseded excluded
  byIds(ids: string[]): Promise<CanonicalEvent[]>;
}
interface FindingStore {
  upsert(findings: Finding[]): Promise<void>;        // same findingId = no-op (re-attach)
  list(state?: FindingState): Promise<FindingWithState[]>;
  adjudicate(a: Adjudication): Promise<void>;
}
interface RulebookStore {
  rules(status?: RulebookRuleStatus): Promise<RulebookRule[]>;
  save(rule: RulebookRule): Promise<void>;
  recordApplication(app: RuleApplication): Promise<void>;
}
interface ValidationRule {
  ruleId: RuleId;
  run(ctx: { events: CanonicalEvent[]; registry: ClientRegistry }): Finding[];
}
```

LLM seams (the only two): `classify.ts` (sheet-graph assist, mirrors today's analyze-route pattern incl. reconcile + sanity gate) and `rulebook/draft.ts`. Both via `tryModels`, both schema-validated, both with deterministic fallbacks (heuristic graph / no draft).

## 3. Storage (Supabase DDL draft — append-only)

```sql
create table ingestions (
  ingestion_id text primary key,
  device_id text, started_at timestamptz default now(),
  registry_version text not null, contract_version text not null,
  manifest jsonb not null            -- files, sheets, skipped templates, counts
);
create table raw_files (
  file_hash text primary key, file_name text not null,
  bytes bytea not null, uploaded_at timestamptz default now()
);
create table events (
  event_id text primary key,         -- content hash → natural dedupe
  ingestion_id text references ingestions,
  event_type text not null,
  occurred_start date not null, occurred_end date not null,
  stage_id text, defect_code text,   -- nullable, indexed for analytics
  superseded_by text,                -- only ever set once, by a Correction
  payload jsonb not null             -- full D1 event incl. provenance
);
create index on events (event_type, stage_id, occurred_start);
create table findings (
  finding_id text primary key, ingestion_id text references ingestions,
  rule_id text not null, severity text not null,
  requires_gm boolean not null, payload jsonb not null
);
create table adjudications (
  adjudication_id text primary key, finding_id text references findings,
  verdict text not null, author text not null,
  is_recommendation boolean not null, payload jsonb not null,
  created_at timestamptz default now()
);
create table rulebook_rules (
  rulebook_rule_id text primary key, version int not null,
  status text not null, payload jsonb not null,
  created_at timestamptz default now()
);
create table rule_applications (
  rulebook_rule_id text, finding_id text, ingestion_id text,
  applied_at timestamptz default now(),
  primary key (rulebook_rule_id, finding_id, ingestion_id)
);
-- Append-only enforcement: revoke UPDATE/DELETE from app roles on events,
-- findings, adjudications, rule_applications; events.superseded_by is set via
-- a security-definer function called only by the adjudication path.
```

B1 ships the `memory.ts` adapter (tests + local dev run against it); the Supabase adapter and migration land in the same phase behind the same interface, exercised by one integration test when env keys exist (skipped otherwise).

## 4. One upload run, end to end

```
UploadZone ──POST /api/ingest (file bytes)
  1 reader.ts        xlsx → grids (values + formulas + merges)
  2 classify.ts      heuristic CandidateSheetGraph per sheet
                     └─ low confidence? → tryModels(LLM graph) → reconcile → sanity gate
  3 emit.ts          graph + grid → D1 events (obs + AggregateClaims + provenance)
  4 EventStore.append           (content-hash dedupe → idempotent re-upload)
  5 validate/engine  V-001..V-013 over effective events → Findings
  6 rulebook/apply   active rules → auto-adjudications, suppressions, RuleApplications
  7 respond          { manifest, findingCounts, queue } → UI routes steward to Data Health
Steward queue ──POST /api/findings (adjudication)
  8 FindingStore.adjudicate     (annotation event; maybe Correction proposal)
  9 rulebook/draft   (LLM) → draft card → human activates → active next run
Dashboard (B4) ── analytics/* over effective adjudicated events + MetricLineage
  every number → lineage trail → BeamOverlay → cells
```

Failure posture: any LLM failure degrades to heuristics (step 2) or absence (step 9); steps 3–8 are deterministic and must not throw on any DATA workbook (B1 exit criterion).
