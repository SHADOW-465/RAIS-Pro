# Graph Report - .  (2026-06-01)

## Corpus Check
- 235 files · ~99,999 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 235 nodes · 376 edges · 35 communities (33 shown, 2 thin omitted)
- Extraction: 85% EXTRACTED · 15% INFERRED · 0% AMBIGUOUS · INFERRED: 55 edges (avg confidence: 0.85)
- Token cost: 84,000 input · 9,949 output

## Community Hubs (Navigation)
- [[_COMMUNITY_Pipeline Invariants & Rationale|Pipeline Invariants & Rationale]]
- [[_COMMUNITY_Analyze Route & AI Provider Chain|Analyze Route & AI Provider Chain]]
- [[_COMMUNITY_Excel Parsing & Date Handling|Excel Parsing & Date Handling]]
- [[_COMMUNITY_Metric Computation & Graph Inference|Metric Computation & Graph Inference]]
- [[_COMMUNITY_Report-Type Aggregation|Report-Type Aggregation]]
- [[_COMMUNITY_Prompt Builders & Legacy Merge|Prompt Builders & Legacy Merge]]
- [[_COMMUNITY_Editorial Charts & Slides|Editorial Charts & Slides]]
- [[_COMMUNITY_API Routes & Supabase|API Routes & Supabase]]
- [[_COMMUNITY_Dashboard & Verify Table|Dashboard & Verify Table]]
- [[_COMMUNITY_Layout & Theming Tokens|Layout & Theming Tokens]]
- [[_COMMUNITY_Upload  Chat  Device ID|Upload / Chat / Device ID]]
- [[_COMMUNITY_AI Backend Health Check|AI Backend Health Check]]
- [[_COMMUNITY_Analyze Route Pipeline Node|Analyze Route Pipeline Node]]

## God Nodes (most connected - your core abstractions)
1. `parseWorkbookBuffer()` - 19 edges
2. `POST()` - 15 edges
3. `computeMetrics()` - 15 edges
4. `POST handler (analyze route)` - 12 edges
5. `createServerClient()` - 11 edges
6. `inferSheetGraph()` - 11 edges
7. `parseWorkbookBuffer` - 10 edges
8. `inferSheetGraph (heuristic classifier)` - 9 edges
9. `computeMetrics (deterministic arithmetic)` - 9 edges
10. `tryModels()` - 8 edges

## Surprising Connections (you probably didn't know these)
- `POST handler (analyze route)` --references--> `tryModels AI provider chain`  [INFERRED]
  src/app/api/analyze/route.ts → AGENTS.md
- `AI classifies, JS computes (model never does maths)` --rationale_for--> `computeMetrics (deterministic arithmetic)`  [INFERRED]
  AGENTS.md → src/lib/metrics.ts
- `ground-truth.ts (independent oracle)` --semantically_similar_to--> `detectReportType`  [INFERRED] [semantically similar]
  scripts/ground-truth.ts → src/lib/metrics.ts
- `metricsSane (sanity gate)` --conceptually_related_to--> `AI classifies, JS computes (model never does maths)`  [INFERRED]
  src/lib/dashboard-builder.ts → AGENTS.md
- `ground-truth.ts (independent oracle)` --semantically_similar_to--> `parseWorkbookBuffer`  [INFERRED] [semantically similar]
  scripts/ground-truth.ts → src/lib/parser.ts

## Hyperedges (group relationships)
- **graph â†’ compute â†’ narrative pipeline** — metrics_inferSheetGraph, schemas_SheetGraphSetSchema, dashboard_reconcileGraph, dashboard_metricsSane, metrics_computeMetrics, schemas_NarrativeSchema [EXTRACTED 0.95]
- **Golden-number regression safety net** — ground_truth_oracle, derive_golden_script, fixtures_GOLDEN, test_golden [EXTRACTED 0.90]
- **Spreadsheet ingestion & cleaning chain** — parser_parseWorkbookBuffer, parser_detectHeaderRow, parser_isJunkRow, parser_looksSerialDate, parser_normalizeHeaders [EXTRACTED 0.90]

## Communities (35 total, 2 thin omitted)

### Community 0 - "Pipeline Invariants & Rationale"
Cohesion: 0.11
Nodes (33): AI classifies, JS computes (model never does maths), Golden-number fixtures as regression safety net, Schemas are the contract (generateObject + Zod), tryModels AI provider chain, deriveMergePlan (Sources audit), metricsSane (sanity gate), metricsToCharts, metricsToKpis (+25 more)

### Community 1 - "Analyze Route & AI Provider Chain"
Cohesion: 0.16
Nodes (20): buildFallbackMergePlan(), patchOrphans(), POST(), buildPrompt(), POST(), activeBackend(), availableBackends(), getModel() (+12 more)

### Community 2 - "Excel Parsing & Date Handling"
Cohesion: 0.11
Nodes (10): detectGranularity(), detectHeaderRow(), extractTimeRange(), isDateLike(), isSummaryCandidate(), looksSerialDate(), normalizeHeaders(), parseExcelFiles() (+2 more)

### Community 3 - "Metric Computation & Graph Inference"
Cohesion: 0.15
Nodes (19): baseName(), baseNameForReason(), colsForRole(), colsForStage(), computeMetrics(), detectIsSummary(), detectReportType(), fmtCount() (+11 more)

### Community 4 - "Report-Type Aggregation"
Cohesion: 0.33
Nodes (17): aggAssembly(), aggBalloon(), aggProduction(), aggShopfloor(), aggVisual(), colIndex(), detectHeaderRow(), extractSheet() (+9 more)

### Community 5 - "Prompt Builders & Legacy Merge"
Cohesion: 0.21
Nodes (8): buildGraphPrompt(), buildNarrativePrompt(), buildPrompt(), fmtSeries(), applyMergePlan(), fmtNum(), mergedResultToPromptText(), roundSig()

### Community 6 - "Editorial Charts & Slides"
Cohesion: 0.21
Nodes (4): buildLinePath(), chartStyle(), TrendLine(), xs()

### Community 7 - "API Routes & Supabase"
Cohesion: 0.27
Nodes (6): DELETE(), GET(), createServerClient(), GET(), GET(), POST()

### Community 9 - "Layout & Theming Tokens"
Cohesion: 0.39
Nodes (5): hexToRgb(), rgbToHex(), shade(), tint(), TweaksProvider()

### Community 10 - "Upload / Chat / Device ID"
Cohesion: 0.32
Nodes (3): handleUploadComplete(), submit(), getDeviceId()

### Community 12 - "AI Backend Health Check"
Cohesion: 0.7
Nodes (4): check(), main(), pad(), resolveModel()

## Knowledge Gaps
- **10 isolated node(s):** `Analyze Route Pipeline (graphâ†’computeâ†’narrative)`, `detectIsSummary`, `deriveMergePlan (Sources audit)`, `detectHeaderRow (score-based)`, `isJunkRow (total/subtotal/legend strip)` (+5 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **2 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `parseWorkbookBuffer()` connect `Excel Parsing & Date Handling` to `Metric Computation & Graph Inference`?**
  _High betweenness centrality (0.100) - this node is a cross-community bridge._
- **Why does `computeMetrics()` connect `Metric Computation & Graph Inference` to `Analyze Route & AI Provider Chain`?**
  _High betweenness centrality (0.084) - this node is a cross-community bridge._
- **Why does `inferSheetGraph()` connect `Metric Computation & Graph Inference` to `Analyze Route & AI Provider Chain`, `Excel Parsing & Date Handling`?**
  _High betweenness centrality (0.065) - this node is a cross-community bridge._
- **Are the 12 inferred relationships involving `POST()` (e.g. with `availableBackends()` and `tryModels()`) actually correct?**
  _`POST()` has 12 INFERRED edges - model-reasoned connections that need verification._
- **Are the 2 inferred relationships involving `computeMetrics()` (e.g. with `POST()` and `runFile()`) actually correct?**
  _`computeMetrics()` has 2 INFERRED edges - model-reasoned connections that need verification._
- **Are the 6 inferred relationships involving `createServerClient()` (e.g. with `POST()` and `GET()`) actually correct?**
  _`createServerClient()` has 6 INFERRED edges - model-reasoned connections that need verification._
- **What connects `Analyze Route Pipeline (graphâ†’computeâ†’narrative)`, `detectIsSummary`, `deriveMergePlan (Sources audit)` to the rest of the system?**
  _10 weakly-connected nodes found - possible documentation gaps or missing edges._