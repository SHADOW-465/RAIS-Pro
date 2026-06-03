# Graph Report - .  (2026-06-04)

## Corpus Check
- 382 files · ~99,999 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 382 nodes · 600 edges · 50 communities (45 shown, 5 thin omitted)
- Extraction: 83% EXTRACTED · 17% INFERRED · 0% AMBIGUOUS · INFERRED: 101 edges (avg confidence: 0.84)
- Token cost: 205,000 input · 23,000 output

## Community Hubs (Navigation)
- [[_COMMUNITY_Dashboard & Analysis Pipeline|Dashboard & Analysis Pipeline]]
- [[_COMMUNITY_Analyze Route & Provider Chain|Analyze Route & Provider Chain]]
- [[_COMMUNITY_Pipeline Invariants & Rationale|Pipeline Invariants & Rationale]]
- [[_COMMUNITY_Excel Parsing & Header Detection|Excel Parsing & Header Detection]]
- [[_COMMUNITY_Editorial Charts & Containers|Editorial Charts & Containers]]
- [[_COMMUNITY_Metric Computation & Graph Inference|Metric Computation & Graph Inference]]
- [[_COMMUNITY_Verify Nav & API-Split Helpers|Verify Nav & API-Split Helpers]]
- [[_COMMUNITY_Report-Type Aggregation|Report-Type Aggregation]]
- [[_COMMUNITY_Insight Slides & Chart Rendering|Insight Slides & Chart Rendering]]
- [[_COMMUNITY_API Routes & Supabase|API Routes & Supabase]]
- [[_COMMUNITY_Dashboard Interactions & Verify Wiring|Dashboard Interactions & Verify Wiring]]
- [[_COMMUNITY_Layout & Theming Tokens|Layout & Theming Tokens]]
- [[_COMMUNITY_Upload  Chat  Device ID|Upload / Chat / Device ID]]
- [[_COMMUNITY_Upload Zone|Upload Zone]]
- [[_COMMUNITY_AI Backend Health Check|AI Backend Health Check]]
- [[_COMMUNITY_Golden Regression Suite|Golden Regression Suite]]
- [[_COMMUNITY_Session Card|Session Card]]
- [[_COMMUNITY_Icon Primitive|Icon Primitive]]
- [[_COMMUNITY_Pill Primitive|Pill Primitive]]
- [[_COMMUNITY_Beam Overlay|Beam Overlay]]
- [[_COMMUNITY_Analyze Pipeline Node|Analyze Pipeline Node]]

## God Nodes (most connected - your core abstractions)
1. `parseWorkbookBuffer()` - 22 edges
2. `POST()` - 18 edges
3. `computeMetrics()` - 15 edges
4. `parseWorkbookBuffer` - 14 edges
5. `POST handler (analyze route)` - 12 edges
6. `createServerClient()` - 11 edges
7. `inferSheetGraph()` - 11 edges
8. `TrendLine()` - 10 edges
9. `Dashboard component` - 10 edges
10. `parseExcelFilesWithRaw()` - 9 edges

## Surprising Connections (you probably didn't know these)
- `POST handler (analyze route)` --references--> `tryModels AI provider chain`  [INFERRED]
  src/app/api/analyze/route.ts → AGENTS.md
- `3-phase pipeline mental model` --references--> `Analyze Route (compute phase)`  [INFERRED]
  docs/DESIGN-UX-REVAMP.md → src/app/api/analyze/route.ts
- `AI multi-provider failover chain` --references--> `Narrative Route (AI prose phase)`  [INFERRED]
  docs/FEATURES.md → src/app/api/narrative/route.ts
- `Data provenance & verification` --rationale_for--> `findColumn (fuzzy column match)`  [INFERRED]
  docs/FEATURES.md → src/lib/verify-nav.ts
- `Data provenance & verification` --references--> `KPI type (sourceColumn, history, trend)`  [INFERRED]
  docs/FEATURES.md → src/types/dashboard.ts

## Hyperedges (group relationships)
- **Compute/narrative API split with progressive render** — analyze_route, narrative_route, page_fetchNarrative, uxaudit_progressive_reveal [INFERRED 0.85]
- **graph -> compute -> narrative pipeline** — analyze_graph_phase, analyze_compute_phase, narrative_route, features_model_never_maths [INFERRED 0.85]
- **Verify drill-in: KPI -> file -> month -> column beam** — comp_Dashboard, comp_VerifyPanel, comp_DataTable, verifynav_findColumn [EXTRACTED 0.75]
- **Editorial design-system primitives (token-driven UI)** — editorialcharts_trendline, icon_component, pill_component [INFERRED 0.85]
- **Inline-SVG charts shared by domain components** — editorialcharts_trendline, chartcontainer_component, insightslide_component [INFERRED 0.85]
- **Golden-test safety net: parser -> graph -> metrics vs locked fixture** — golden_test, golden_fixture, metrics_computemetrics [INFERRED 0.85]

## Communities (50 total, 5 thin omitted)

### Community 0 - "Dashboard & Analysis Pipeline"
Cohesion: 0.06
Nodes (51): Phase 2: Deterministic Compute, Phase 1: Graph Classification, Analyze Route (compute phase), LLM Graph Sanity Gate, Per-Sheet Dashboard Sections, ChatPanel (Ask RAIS -> insight slides), Dashboard component, computeBeams (verify beam math) (+43 more)

### Community 1 - "Analyze Route & Provider Chain"
Cohesion: 0.1
Nodes (28): buildFallbackMergePlan(), patchOrphans(), POST(), buildPrompt(), POST(), activeBackend(), availableBackends(), getModel() (+20 more)

### Community 2 - "Pipeline Invariants & Rationale"
Cohesion: 0.1
Nodes (34): AI classifies, JS computes (model never does maths), Golden-number fixtures as regression safety net, Schemas are the contract (generateObject + Zod), tryModels AI provider chain, deriveMergePlan (Sources audit), metricsSane (sanity gate), metricsToCharts, metricsToKpis (+26 more)

### Community 3 - "Excel Parsing & Header Detection"
Cohesion: 0.13
Nodes (18): buildHeaderBlock(), detectGranularity(), detectHeaderRow(), extractTimeRange(), isDateLike(), isHeaderLabelRow(), isJunkRow(), isSummaryCandidate() (+10 more)

### Community 4 - "Editorial Charts & Containers"
Cohesion: 0.1
Nodes (28): ChartContainer, DonutLegend (internal), Dashboard (external), buildBezierPath, chartStyle() data-chart-style reader, Donut, DualLine, HorizontalBars (+20 more)

### Community 5 - "Metric Computation & Graph Inference"
Cohesion: 0.13
Nodes (18): baseName(), baseNameForReason(), colsForRole(), colsForStage(), computeMetrics(), detectIsSummary(), detectReportType(), fmtCount() (+10 more)

### Community 6 - "Verify Nav & API-Split Helpers"
Cohesion: 0.13
Nodes (12): fallbackTitle(), withTimeout(), buildFileGroups(), columnTotal(), findColumn(), findContributingSheets(), firstMatch(), normalizeColName() (+4 more)

### Community 7 - "Report-Type Aggregation"
Cohesion: 0.33
Nodes (17): aggAssembly(), aggBalloon(), aggProduction(), aggShopfloor(), aggVisual(), colIndex(), detectHeaderRow(), extractSheet() (+9 more)

### Community 8 - "Insight Slides & Chart Rendering"
Cohesion: 0.16
Nodes (5): buildBezierPath(), buildLinePath(), chartStyle(), TrendLine(), xs()

### Community 9 - "API Routes & Supabase"
Cohesion: 0.27
Nodes (6): DELETE(), GET(), createServerClient(), GET(), GET(), POST()

### Community 10 - "Dashboard Interactions & Verify Wiring"
Cohesion: 0.25
Nodes (6): handleKpiClick(), handler(), pad(), toggleVerify(), findColumn(), normalizeColName()

### Community 11 - "Layout & Theming Tokens"
Cohesion: 0.29
Nodes (5): hexToRgb(), rgbToHex(), shade(), tint(), TweaksProvider()

### Community 12 - "Upload / Chat / Device ID"
Cohesion: 0.28
Nodes (3): handleUploadComplete(), submit(), getDeviceId()

### Community 13 - "Upload Zone"
Cohesion: 0.53
Nodes (4): analyze(), isAccepted(), onDrop(), remove()

### Community 15 - "AI Backend Health Check"
Cohesion: 0.7
Nodes (4): check(), main(), pad(), resolveModel()

### Community 16 - "Golden Regression Suite"
Cohesion: 0.5
Nodes (5): GOLDEN fixture (locked metric truth), golden.test (metrics regression), computeMetrics (external), inferSheetGraph (external), parseWorkbookBuffer (external)

## Knowledge Gaps
- **27 isolated node(s):** `Analyze Route Pipeline (graphâ†’computeâ†’narrative)`, `detectIsSummary`, `deriveMergePlan (Sources audit)`, `isJunkRow (total/subtotal stripping)`, `looksSerialDate (40000-60000 guard)` (+22 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **5 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `POST()` connect `Analyze Route & Provider Chain` to `API Routes & Supabase`, `Metric Computation & Graph Inference`, `Verify Nav & API-Split Helpers`?**
  _High betweenness centrality (0.080) - this node is a cross-community bridge._
- **Why does `computeMetrics()` connect `Metric Computation & Graph Inference` to `Analyze Route & Provider Chain`, `Excel Parsing & Header Detection`?**
  _High betweenness centrality (0.065) - this node is a cross-community bridge._
- **Why does `parseWorkbookBuffer()` connect `Excel Parsing & Header Detection` to `Metric Computation & Graph Inference`?**
  _High betweenness centrality (0.062) - this node is a cross-community bridge._
- **Are the 12 inferred relationships involving `POST()` (e.g. with `availableBackends()` and `tryModels()`) actually correct?**
  _`POST()` has 12 INFERRED edges - model-reasoned connections that need verification._
- **Are the 2 inferred relationships involving `computeMetrics()` (e.g. with `POST()` and `runFile()`) actually correct?**
  _`computeMetrics()` has 2 INFERRED edges - model-reasoned connections that need verification._
- **What connects `Analyze Route Pipeline (graphâ†’computeâ†’narrative)`, `detectIsSummary`, `deriveMergePlan (Sources audit)` to the rest of the system?**
  _27 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Dashboard & Analysis Pipeline` be split into smaller, more focused modules?**
  _Cohesion score 0.06 - nodes in this community are weakly interconnected._