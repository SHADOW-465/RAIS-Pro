# Graph Report - RAIS-Pro  (2026-06-25)

## Corpus Check
- 175 files · ~1,045,335 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 744 nodes · 1170 edges · 83 communities (67 shown, 16 thin omitted)
- Extraction: 86% EXTRACTED · 14% INFERRED · 0% AMBIGUOUS · INFERRED: 163 edges (avg confidence: 0.81)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `065fa3f4`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- [[_COMMUNITY_Community 0|Community 0]]
- [[_COMMUNITY_Community 1|Community 1]]
- [[_COMMUNITY_Community 2|Community 2]]
- [[_COMMUNITY_Community 3|Community 3]]
- [[_COMMUNITY_Community 4|Community 4]]
- [[_COMMUNITY_Community 5|Community 5]]
- [[_COMMUNITY_Community 6|Community 6]]
- [[_COMMUNITY_Community 7|Community 7]]
- [[_COMMUNITY_Community 8|Community 8]]
- [[_COMMUNITY_Community 9|Community 9]]
- [[_COMMUNITY_Community 10|Community 10]]
- [[_COMMUNITY_Community 11|Community 11]]
- [[_COMMUNITY_Community 12|Community 12]]
- [[_COMMUNITY_Community 13|Community 13]]
- [[_COMMUNITY_Community 14|Community 14]]
- [[_COMMUNITY_Community 15|Community 15]]
- [[_COMMUNITY_Community 16|Community 16]]
- [[_COMMUNITY_Community 17|Community 17]]
- [[_COMMUNITY_Community 18|Community 18]]
- [[_COMMUNITY_Community 19|Community 19]]
- [[_COMMUNITY_Community 21|Community 21]]
- [[_COMMUNITY_Community 22|Community 22]]
- [[_COMMUNITY_Community 24|Community 24]]
- [[_COMMUNITY_Community 26|Community 26]]
- [[_COMMUNITY_Community 28|Community 28]]
- [[_COMMUNITY_Community 30|Community 30]]
- [[_COMMUNITY_Community 31|Community 31]]
- [[_COMMUNITY_Community 34|Community 34]]
- [[_COMMUNITY_Community 35|Community 35]]
- [[_COMMUNITY_Community 45|Community 45]]
- [[_COMMUNITY_Community 46|Community 46]]
- [[_COMMUNITY_Community 47|Community 47]]
- [[_COMMUNITY_Community 48|Community 48]]
- [[_COMMUNITY_Community 49|Community 49]]
- [[_COMMUNITY_Community 80|Community 80]]
- [[_COMMUNITY_Community 81|Community 81]]
- [[_COMMUNITY_Community 82|Community 82]]

## God Nodes (most connected - your core abstractions)
1. `createServerClient()` - 37 edges
2. `scopeEvents()` - 26 edges
3. `parseWorkbookBuffer()` - 23 edges
4. `useEvents()` - 17 edges
5. `buildAuditPackage()` - 16 edges
6. `seedFromDisk()` - 16 edges
7. `computeMetrics()` - 15 edges
8. `Card()` - 15 edges
9. `emitMany()` - 13 edges
10. `getStores()` - 12 edges

## Surprising Connections (you probably didn't know these)
- `8 Non-Negotiable Principles (LLM never does maths, append-only ledger, etc.)` --semantically_similar_to--> `Pipeline Invariants (graph→compute→narrative)`  [INFERRED] [semantically similar]
  docs/design/MOID-SPEC.md → AGENTS.md
- `Heuristic Fallback + metricsSane Sanity Gate` --semantically_similar_to--> `Strict Real-Only Data (no synthesized breakdowns)`  [INFERRED] [semantically similar]
  AGENTS.md → docs/2026-06-18-data-pipeline-and-charts-design.md
- `Verify Mode (BeamOverlay bezier trace to source cell)` --semantically_similar_to--> `Provenance Flyout (cell coordinate + file hash + user comments)`  [INFERRED] [semantically similar]
  README.md → docs/MOID-CANONICAL-SPEC.md
- `Ask RAIS Chat + InsightSlide PNG export` --semantically_similar_to--> `Ask RAS Chat (Rejection Advisory System)`  [INFERRED] [semantically similar]
  README.md → docs/MOID-CANONICAL-SPEC.md
- `check()` --calls--> `createServerClient()`  [INFERRED]
  scratch/check-columns.ts → src/lib/supabase.ts

## Hyperedges (group relationships)
- **End-to-End Provenance Traceability Flow** — moid_spec_event_ledger, moid_spec_provenance_flyout, readme_verify_mode, moid_spec_ask_ras, phase1_ledger_migration [INFERRED 0.85]
- **No Fake Numbers Invariant (pipeline-wide)** — agents_md_pipeline_invariants, agents_md_heuristic_sanity_gate, data_pipeline_strict_real, plans_00_index_no_fake_numbers, moid_design_spec_non_negotiables [INFERRED 0.90]
- **Dual-Track Ingestion → Staging → Ledger Pipeline** — moid_spec_staging_grid, plans_status_real_parsers, data_pipeline_merge_not_override, moid_spec_event_ledger, phase1_ledger_migration [INFERRED 0.85]
- **Sub-phase 2a ingestion pipeline** — phase2_parser_router, phase2_dedupe_module, phase2_emitmany, phase2_seed_module [INFERRED 0.85]

## Communities (83 total, 16 thin omitted)

### Community 0 - "Community 0"
Cohesion: 0.07
Nodes (51): copq(), copqTrend(), getFinishedCost(), getStageWeight(), getTargetRejectionRate(), savingsOpportunity(), byDefect(), bySize() (+43 more)

### Community 1 - "Community 1"
Cohesion: 0.05
Nodes (23): checkRecord(), checkSpike(), POST(), emitMany(), classifyRejectionSheets(), toISODate(), POST(), parseRejectionAnalysis() (+15 more)

### Community 2 - "Community 2"
Cohesion: 0.05
Nodes (23): POST(), resolveArchiveDir(), POST(), POST(), DELETE(), GET(), createServerClient(), DELETE() (+15 more)

### Community 3 - "Community 3"
Cohesion: 0.08
Nodes (14): handleMouseMove(), buildBezierPath(), chartStyle(), handleMouseMove(), TrendLine(), xs(), ys(), getBaseSpacing() (+6 more)

### Community 4 - "Community 4"
Cohesion: 0.08
Nodes (18): classifyWithSchema(), extractSchemaFromWorkbook(), resolveStageId(), slugify(), buildHeaderBlock(), colIndexToLabel(), detectGranularity(), detectHeaderRow() (+10 more)

### Community 5 - "Community 5"
Cohesion: 0.1
Nodes (21): fallbackTitle(), POST(), withTimeout(), buildGraphPrompt(), buildManifestPrompt(), buildNarrativePrompt(), buildPrompt(), fmtSeries() (+13 more)

### Community 6 - "Community 6"
Cohesion: 0.09
Nodes (18): canonicalizeEvents(), dayOf(), fileOf(), precedenceOf(), stageOf(), GET(), dateFromFilename(), pad() (+10 more)

### Community 7 - "Community 7"
Cohesion: 0.08
Nodes (11): buildRecords(), handleDeleteLedgerRecord(), handleDuplicateLedgerRecord(), handleRemoveColumn(), handleSaveColumnDraft(), handleSaveSchemaRegistry(), loadLedger(), resetSpreadsheet() (+3 more)

### Community 8 - "Community 8"
Cohesion: 0.09
Nodes (32): AggregateClaimEvent (cumulative as claims, sub-phase 2c), ASSEMBLY REJECTION REPORT.xlsx workbook, classifyRejectionSheets existing function, ingest/date.ts local-date helpers, dedupe.ts module, Defect taxonomy / FORMATE legend, emitMany, api/ingest/route.ts (+24 more)

### Community 9 - "Community 9"
Cohesion: 0.14
Nodes (19): canonicalize(), hashEvent(), hashFinding(), sha256(), sortDeep(), basisFor(), emitStageDay(), envelope() (+11 more)

### Community 10 - "Community 10"
Cohesion: 0.14
Nodes (19): baseName(), baseNameForReason(), colsForRole(), colsForStage(), computeMetrics(), detectIsSummary(), detectReportType(), fmtCount() (+11 more)

### Community 11 - "Community 11"
Cohesion: 0.13
Nodes (11): getTraceRows(), buildFileGroups(), columnTotal(), findColumn(), findContributingSheets(), firstMatch(), normalizeColName(), parseMonth() (+3 more)

### Community 12 - "Community 12"
Cohesion: 0.11
Nodes (8): applyEdit(), buildReviewRows(), reviewRow(), reviewSummary(), stageLabel(), dedupeByPrecedence(), groupKey(), handleUpload()

### Community 13 - "Community 13"
Cohesion: 0.18
Nodes (16): buildChatContext(), buildPrompt(), POST(), activeBackend(), availableBackends(), getModel(), isAvailable(), isRetriable() (+8 more)

### Community 14 - "Community 14"
Cohesion: 0.33
Nodes (17): aggAssembly(), aggBalloon(), aggProduction(), aggShopfloor(), aggVisual(), colIndex(), detectHeaderRow(), extractSheet() (+9 more)

### Community 15 - "Community 15"
Cohesion: 0.12
Nodes (17): Three Cognitive Layers (Immutable Kernel / Declarative Harness / Agentic), LUCID Framework (expansion to automotive/textiles/engineering), Company Brain Vision (Enterprise Cognitive OS), Merge-not-Override: Finding Raised on Conflict, Supabase Durable Persistence as Keystone Fix, Factory Intelligence Cockpit (dashboard-first layout), Ask RAS Chat (Rejection Advisory System), Canonical Append-Only Event Ledger (+9 more)

### Community 17 - "Community 17"
Cohesion: 0.17
Nodes (12): Heuristic Fallback + metricsSane Sanity Gate, Pipeline Invariants (graph→compute→narrative), tryModels AI Provider Failover Chain, Unified Timeline by Real Date (D/W/M/FY grain), Strict Real-Only Data (no synthesized breakdowns), 8 Non-Negotiable Principles (LLM never does maths, append-only ledger, etc.), No Fake Numbers Invariant (empty/locked state for missing data), Analytics Engine: src/lib/analytics/* (single source of math) (+4 more)

### Community 19 - "Community 19"
Cohesion: 0.25
Nodes (3): Card(), srcRows(), toSourceRows()

### Community 22 - "Community 22"
Cohesion: 0.29
Nodes (7): COPQ: Progressive Cost of Poor Quality Formulation, Registry-Driven Stage Model (src/lib/registry/disposafe.ts), 12 FBC Dipping & Assembly Stages (Visual→Final Insp), 8 Defect Modes (Thin Spod, Bubble, Leakage, etc.), Disposafe Health — FBC Dipping Plant Client, First Pass Yield (FPY) + Rolled Throughput Yield (RTY), RC-2: Size dropdown data-driven from m.sizes (not hardcoded)

### Community 34 - "Community 34"
Cohesion: 0.67
Nodes (3): Data Source Families (assembly-daily, rejection-analysis, size-wise, SOPs), Deduplication: size-wise > assembly/rejection > cumulative-claims, Real Parsers (parse-assembly-daily, parse-rejection-analysis, parse-size-wise)

### Community 35 - "Community 35"
Cohesion: 0.67
Nodes (3): Semantic CAPA Memory Graph (vector embeddings, local Ollama), Findings Queue + Rulebook Loop, Findings & Adjudication Queue (Mistake/Intentional/Unsure)

## Knowledge Gaps
- **44 isolated node(s):** `Full structural profile of every workbook in DATA/ for the D1 data contract.  Du`, `Next.js 16 + React 19 + AI SDK v6 Stack`, `Editorial Design Direction (Rejection Report)`, `tryModels AI Provider Failover Chain`, `DashboardConfig (KPIs + charts derived deterministically)` (+39 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **16 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `createServerClient()` connect `Community 2` to `Community 1`, `Community 13`, `Community 5`?**
  _High betweenness centrality (0.169) - this node is a cross-community bridge._
- **Why does `useEvents()` connect `Community 18` to `Community 3`, `Community 7`, `Community 12`, `Community 16`, `Community 19`, `Community 20`, `Community 21`, `Community 26`, `Community 28`, `Community 29`, `Community 30`, `Community 31`?**
  _High betweenness centrality (0.135) - this node is a cross-community bridge._
- **Why does `calculatePareto()` connect `Community 5` to `Community 18`, `Community 31`?**
  _High betweenness centrality (0.100) - this node is a cross-community bridge._
- **Are the 21 inferred relationships involving `createServerClient()` (e.g. with `check()` and `run()`) actually correct?**
  _`createServerClient()` has 21 INFERRED edges - model-reasoned connections that need verification._
- **Are the 20 inferred relationships involving `scopeEvents()` (e.g. with `srcRows()` and `srcRows()`) actually correct?**
  _`scopeEvents()` has 20 INFERRED edges - model-reasoned connections that need verification._
- **Are the 2 inferred relationships involving `parseWorkbookBuffer()` (e.g. with `parseRejectionAnalysis()` and `runFile()`) actually correct?**
  _`parseWorkbookBuffer()` has 2 INFERRED edges - model-reasoned connections that need verification._
- **Are the 11 inferred relationships involving `buildAuditPackage()` (e.g. with `handleExport()` and `byStage()`) actually correct?**
  _`buildAuditPackage()` has 11 INFERRED edges - model-reasoned connections that need verification._