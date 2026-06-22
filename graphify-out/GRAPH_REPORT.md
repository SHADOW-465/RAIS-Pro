# Graph Report - .  (2026-06-20)

## Corpus Check
- Large corpus: 309 files · ~1,106,125 words. Semantic extraction will be expensive (many Claude tokens). Consider running on a subfolder, or use --no-semantic to run AST-only.

## Summary
- 605 nodes · 896 edges · 67 communities (55 shown, 12 thin omitted)
- Extraction: 86% EXTRACTED · 14% INFERRED · 0% AMBIGUOUS · INFERRED: 121 edges (avg confidence: 0.81)
- Token cost: 109,930 input · 0 output

## Community Hubs (Navigation)
- [[_COMMUNITY_Ingestion & Validation|Ingestion & Validation]]
- [[_COMMUNITY_COPQ & Cost Analytics|COPQ & Cost Analytics]]
- [[_COMMUNITY_API Routes & Supabase Store|API Routes & Supabase Store]]
- [[_COMMUNITY_Dashboard UI & Charts|Dashboard UI & Charts]]
- [[_COMMUNITY_Event Canonicalizer & Dedup|Event Canonicalizer & Dedup]]
- [[_COMMUNITY_Schema Extraction & Headers|Schema Extraction & Headers]]
- [[_COMMUNITY_Formatting & Trace Helpers|Formatting & Trace Helpers]]
- [[_COMMUNITY_Rejection Parsing & Taxonomy|Rejection Parsing & Taxonomy]]
- [[_COMMUNITY_Deterministic Metrics Engine|Deterministic Metrics Engine]]
- [[_COMMUNITY_Staging Review & Precedence Dedup|Staging Review & Precedence Dedup]]
- [[_COMMUNITY_AI Prompts & Dashboard Builder|AI Prompts & Dashboard Builder]]
- [[_COMMUNITY_Event Hashing & Emit|Event Hashing & Emit]]
- [[_COMMUNITY_AI Backend & Chat|AI Backend & Chat]]
- [[_COMMUNITY_Product Vision & Strategy|Product Vision & Strategy]]
- [[_COMMUNITY_page.tsx|page.tsx]]
- [[_COMMUNITY_page.tsx|page.tsx]]
- [[_COMMUNITY_Pipeline Invariants (graph→compute→narra|Pipeline Invariants (graph→compute→narra]]
- [[_COMMUNITY_12 FBC Dipping & Assembly Stages (Visual|12 FBC Dipping & Assembly Stages (Visual]]
- [[_COMMUNITY_profile_for_d1.py|profile_for_d1.py]]
- [[_COMMUNITY_TweaksProvider|TweaksProvider]]
- [[_COMMUNITY_Real Parsers (parse-assembly-daily, pars|Real Parsers (parse-assembly-daily, pars]]
- [[_COMMUNITY_Findings & Adjudication Queue (MistakeI|Findings & Adjudication Queue (Mistake/I]]
- [[_COMMUNITY_Editorial Design Direction (Rejection Re|Editorial Design Direction (Rejection Re]]
- [[_COMMUNITY_Audit ZIP Package (SHA-256 manifest, ALC|Audit ZIP Package (SHA-256 manifest, ALC]]
- [[_COMMUNITY_Payload De-Identification Middleware (ps|Payload De-Identification Middleware (ps]]
- [[_COMMUNITY_L0L1L2 Layered Depth UX Model (Glance|L0/L1/L2 Layered Depth UX Model (Glance/]]
- [[_COMMUNITY_MO!D Implementation Plan Index (7 plans,|MO!D Implementation Plan Index (7 plans,]]
- [[_COMMUNITY_Next.js 16 + React 19 + AI SDK v6 Stack|Next.js 16 + React 19 + AI SDK v6 Stack]]
- [[_COMMUNITY_Build Status 160 green tests, tsc clean|Build Status: 160 green tests, tsc clean]]
- [[_COMMUNITY_dedupeByPrecedence|dedupeByPrecedence]]

## God Nodes (most connected - your core abstractions)
1. `createServerClient()` - 26 edges
2. `parseWorkbookBuffer()` - 23 edges
3. `scopeEvents()` - 22 edges
4. `computeMetrics()` - 15 edges
5. `Card()` - 13 edges
6. `seedFromDisk()` - 12 edges
7. `POST()` - 11 edges
8. `inferSheetGraph()` - 11 edges
9. `periodsIn()` - 11 edges
10. `emitMany()` - 10 edges

## Surprising Connections (you probably didn't know these)
- `8 Non-Negotiable Principles (LLM never does maths, append-only ledger, etc.)` --semantically_similar_to--> `Pipeline Invariants (graph→compute→narrative)`  [INFERRED] [semantically similar]
  docs/design/MOID-SPEC.md → AGENTS.md
- `Heuristic Fallback + metricsSane Sanity Gate` --semantically_similar_to--> `Strict Real-Only Data (no synthesized breakdowns)`  [INFERRED] [semantically similar]
  AGENTS.md → docs/2026-06-18-data-pipeline-and-charts-design.md
- `Verify Mode (BeamOverlay bezier trace to source cell)` --semantically_similar_to--> `Provenance Flyout (cell coordinate + file hash + user comments)`  [INFERRED] [semantically similar]
  README.md → docs/MOID-CANONICAL-SPEC.md
- `Ask RAIS Chat + InsightSlide PNG export` --semantically_similar_to--> `Ask RAS Chat (Rejection Advisory System)`  [INFERRED] [semantically similar]
  README.md → docs/MOID-CANONICAL-SPEC.md
- `check()` --calls--> `resolveModel()`  [INFERRED]
  scripts/check-ai.ts → src/lib/ai.ts

## Hyperedges (group relationships)
- **End-to-End Provenance Traceability Flow** — moid_spec_event_ledger, moid_spec_provenance_flyout, readme_verify_mode, moid_spec_ask_ras, phase1_ledger_migration [INFERRED 0.85]
- **No Fake Numbers Invariant (pipeline-wide)** — agents_md_pipeline_invariants, agents_md_heuristic_sanity_gate, data_pipeline_strict_real, plans_00_index_no_fake_numbers, moid_design_spec_non_negotiables [INFERRED 0.90]
- **Dual-Track Ingestion → Staging → Ledger Pipeline** — moid_spec_staging_grid, plans_status_real_parsers, data_pipeline_merge_not_override, moid_spec_event_ledger, phase1_ledger_migration [INFERRED 0.85]
- **Sub-phase 2a ingestion pipeline** — phase2_parser_router, phase2_dedupe_module, phase2_emitmany, phase2_seed_module [INFERRED 0.85]

## Communities (67 total, 12 thin omitted)

### Community 0 - "Ingestion & Validation"
Cohesion: 0.06
Nodes (20): checkRecord(), checkSpike(), POST(), emitMany(), classifyRejectionSheets(), toISODate(), POST(), parseRejectionAnalysis() (+12 more)

### Community 1 - "COPQ & Cost Analytics"
Cohesion: 0.1
Nodes (40): copq(), copqTrend(), getFinishedCost(), getStageWeight(), getTargetRejectionRate(), savingsOpportunity(), byDefect(), bySize() (+32 more)

### Community 2 - "API Routes & Supabase Store"
Cohesion: 0.06
Nodes (19): POST(), resolveArchiveDir(), POST(), DELETE(), GET(), createServerClient(), GET(), POST() (+11 more)

### Community 3 - "Dashboard UI & Charts"
Cohesion: 0.05
Nodes (3): Card(), x(), y()

### Community 4 - "Event Canonicalizer & Dedup"
Cohesion: 0.09
Nodes (18): canonicalizeEvents(), dayOf(), fileOf(), precedenceOf(), stageOf(), GET(), dateFromFilename(), pad() (+10 more)

### Community 5 - "Schema Extraction & Headers"
Cohesion: 0.1
Nodes (17): classifyWithSchema(), extractSchemaFromWorkbook(), slugify(), buildHeaderBlock(), colIndexToLabel(), detectGranularity(), detectHeaderRow(), extractTimeRange() (+9 more)

### Community 6 - "Formatting & Trace Helpers"
Cohesion: 0.1
Nodes (14): getTraceRows(), buildBezierPath(), chartStyle(), TrendLine(), buildFileGroups(), columnTotal(), findColumn(), findContributingSheets() (+6 more)

### Community 7 - "Rejection Parsing & Taxonomy"
Cohesion: 0.09
Nodes (32): AggregateClaimEvent (cumulative as claims, sub-phase 2c), ASSEMBLY REJECTION REPORT.xlsx workbook, classifyRejectionSheets existing function, ingest/date.ts local-date helpers, dedupe.ts module, Defect taxonomy / FORMATE legend, emitMany, api/ingest/route.ts (+24 more)

### Community 8 - "Deterministic Metrics Engine"
Cohesion: 0.11
Nodes (19): baseName(), baseNameForReason(), colsForRole(), colsForStage(), computeMetrics(), detectIsSummary(), detectReportType(), fmtCount() (+11 more)

### Community 9 - "Staging Review & Precedence Dedup"
Cohesion: 0.11
Nodes (8): applyEdit(), buildReviewRows(), reviewRow(), reviewSummary(), stageLabel(), dedupeByPrecedence(), groupKey(), handleUpload()

### Community 10 - "AI Prompts & Dashboard Builder"
Cohesion: 0.17
Nodes (15): fallbackTitle(), POST(), withTimeout(), buildGraphPrompt(), buildNarrativePrompt(), fmtSeries(), calculatePareto(), deriveMergePlan() (+7 more)

### Community 11 - "Event Hashing & Emit"
Cohesion: 0.21
Nodes (18): canonicalize(), hashEvent(), hashFinding(), sha256(), sortDeep(), basisFor(), emitStageDay(), envelope() (+10 more)

### Community 12 - "AI Backend & Chat"
Cohesion: 0.2
Nodes (15): buildChatContext(), buildPrompt(), POST(), activeBackend(), availableBackends(), getModel(), isAvailable(), isRetriable() (+7 more)

### Community 13 - "Product Vision & Strategy"
Cohesion: 0.12
Nodes (17): Three Cognitive Layers (Immutable Kernel / Declarative Harness / Agentic), LUCID Framework (expansion to automotive/textiles/engineering), Company Brain Vision (Enterprise Cognitive OS), Merge-not-Override: Finding Raised on Conflict, Supabase Durable Persistence as Keystone Fix, Factory Intelligence Cockpit (dashboard-first layout), Ask RAS Chat (Rejection Advisory System), Canonical Append-Only Event Ledger (+9 more)

### Community 16 - "Pipeline Invariants (graph→compute→narra"
Cohesion: 0.17
Nodes (12): Heuristic Fallback + metricsSane Sanity Gate, Pipeline Invariants (graph→compute→narrative), tryModels AI Provider Failover Chain, Unified Timeline by Real Date (D/W/M/FY grain), Strict Real-Only Data (no synthesized breakdowns), 8 Non-Negotiable Principles (LLM never does maths, append-only ledger, etc.), No Fake Numbers Invariant (empty/locked state for missing data), Analytics Engine: src/lib/analytics/* (single source of math) (+4 more)

### Community 17 - "12 FBC Dipping & Assembly Stages (Visual"
Cohesion: 0.29
Nodes (7): COPQ: Progressive Cost of Poor Quality Formulation, Registry-Driven Stage Model (src/lib/registry/disposafe.ts), 12 FBC Dipping & Assembly Stages (Visual→Final Insp), 8 Defect Modes (Thin Spod, Bubble, Leakage, etc.), Disposafe Health — FBC Dipping Plant Client, First Pass Yield (FPY) + Rolled Throughput Yield (RTY), RC-2: Size dropdown data-driven from m.sizes (not hardcoded)

### Community 25 - "Real Parsers (parse-assembly-daily, pars"
Cohesion: 0.67
Nodes (3): Data Source Families (assembly-daily, rejection-analysis, size-wise, SOPs), Deduplication: size-wise > assembly/rejection > cumulative-claims, Real Parsers (parse-assembly-daily, parse-rejection-analysis, parse-size-wise)

### Community 26 - "Findings & Adjudication Queue (Mistake/I"
Cohesion: 0.67
Nodes (3): Semantic CAPA Memory Graph (vector embeddings, local Ollama), Findings Queue + Rulebook Loop, Findings & Adjudication Queue (Mistake/Intentional/Unsure)

## Knowledge Gaps
- **44 isolated node(s):** `Full structural profile of every workbook in DATA/ for the D1 data contract.  Du`, `Next.js 16 + React 19 + AI SDK v6 Stack`, `Editorial Design Direction (Rejection Report)`, `tryModels AI Provider Failover Chain`, `DashboardConfig (KPIs + charts derived deterministically)` (+39 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **12 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `createServerClient()` connect `API Routes & Supabase Store` to `Ingestion & Validation`, `AI Prompts & Dashboard Builder`?**
  _High betweenness centrality (0.184) - this node is a cross-community bridge._
- **Why does `emitMany()` connect `Ingestion & Validation` to `COPQ & Cost Analytics`, `Event Hashing & Emit`?**
  _High betweenness centrality (0.105) - this node is a cross-community bridge._
- **Why does `Card()` connect `Dashboard UI & Charts` to `Staging Review & Precedence Dedup`?**
  _High betweenness centrality (0.097) - this node is a cross-community bridge._
- **Are the 15 inferred relationships involving `createServerClient()` (e.g. with `POST()` and `POST()`) actually correct?**
  _`createServerClient()` has 15 INFERRED edges - model-reasoned connections that need verification._
- **Are the 2 inferred relationships involving `parseWorkbookBuffer()` (e.g. with `parseRejectionAnalysis()` and `runFile()`) actually correct?**
  _`parseWorkbookBuffer()` has 2 INFERRED edges - model-reasoned connections that need verification._
- **Are the 16 inferred relationships involving `scopeEvents()` (e.g. with `copq()` and `savingsOpportunity()`) actually correct?**
  _`scopeEvents()` has 16 INFERRED edges - model-reasoned connections that need verification._
- **Are the 2 inferred relationships involving `computeMetrics()` (e.g. with `POST()` and `runFile()`) actually correct?**
  _`computeMetrics()` has 2 INFERRED edges - model-reasoned connections that need verification._