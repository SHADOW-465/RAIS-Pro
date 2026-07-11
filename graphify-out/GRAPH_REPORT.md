 # Graph Report - RAIS-Pro  (2026-07-11)

## Corpus Check
- 220 files · ~6,536,066 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 828 nodes · 1383 edges · 73 communities (67 shown, 6 thin omitted)
- Extraction: 87% EXTRACTED · 13% INFERRED · 0% AMBIGUOUS · INFERRED: 175 edges (avg confidence: 0.8)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `97c22e0f`
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
- [[_COMMUNITY_Community 20|Community 20]]
- [[_COMMUNITY_Community 23|Community 23]]
- [[_COMMUNITY_Community 24|Community 24]]
- [[_COMMUNITY_Community 25|Community 25]]
- [[_COMMUNITY_Community 30|Community 30]]
- [[_COMMUNITY_Community 32|Community 32]]
- [[_COMMUNITY_Community 33|Community 33]]

## God Nodes (most connected - your core abstractions)
1. `scopeEvents()` - 27 edges
2. `parseWorkbookBuffer()` - 24 edges
3. `useEvents()` - 22 edges
4. `createServerClient()` - 22 edges
5. `emitMany()` - 17 edges
6. `getStores()` - 17 edges
7. `buildAuditPackage()` - 16 edges
8. `computeMetrics()` - 13 edges
9. `MemoryRegistryStore` - 13 edges
10. `rejectionRate()` - 12 edges

## Surprising Connections (you probably didn't know these)
- `check()` --calls--> `resolveModel()`  [INFERRED]
  scripts/check-ai.ts → src/lib/ai.ts
- `main()` --calls--> `availableBackends()`  [INFERRED]
  scripts/check-ai.ts → src/lib/ai.ts
- `kpi()` --calls--> `rejectionRate()`  [INFERRED]
  scripts/diagnose-analytical.ts → src/lib/analytics/rejection.ts
- `kpi()` --calls--> `totalChecked()`  [INFERRED]
  scripts/diagnose-analytical.ts → src/lib/analytics/rejection.ts
- `kpi()` --calls--> `totalRejected()`  [INFERRED]
  scripts/diagnose-analytical.ts → src/lib/analytics/rejection.ts

## Communities (73 total, 6 thin omitted)

### Community 0 - "Community 0"
Cohesion: 0.07
Nodes (54): copq(), copqTrend(), getFinishedCost(), getStageWeight(), getTargetRejectionRate(), savingsOpportunity(), byDefect(), bySize() (+46 more)

### Community 1 - "Community 1"
Cohesion: 0.05
Nodes (24): POST(), resolveArchiveDir(), POST(), getRowStore(), getDatasetStore(), SupabaseRowStore, GET(), POST() (+16 more)

### Community 2 - "Community 2"
Cohesion: 0.05
Nodes (25): canonicalize(), hashEvent(), hashFinding(), sha256(), sortDeep(), basisFor(), emitStageDay(), envelope() (+17 more)

### Community 3 - "Community 3"
Cohesion: 0.06
Nodes (23): POST(), checkRecord(), checkSpike(), emitMany(), POST(), dedupeByPrecedence(), groupKey(), DELETE() (+15 more)

### Community 4 - "Community 4"
Cohesion: 0.06
Nodes (30): classifyRejectionSheets(), toISODate(), buildReviewRows(), classifyWithSchema(), extractSchemaFromWorkbook(), extractSizesFromWorkbook(), resolveSize(), resolveStageId() (+22 more)

### Community 5 - "Community 5"
Cohesion: 0.09
Nodes (10): handleMouseMove(), buildBezierPath(), handleMouseMove(), xs(), ys(), getBaseSpacing(), hoverIndexFromPixels(), shouldShowLabel() (+2 more)

### Community 6 - "Community 6"
Cohesion: 0.13
Nodes (20): dateFromFilename(), pad(), toLocalISODate(), sheetGrid(), headerSections(), norm(), recordsFromBuffer(), findHeaderRow() (+12 more)

### Community 7 - "Community 7"
Cohesion: 0.11
Nodes (19): baseName(), baseNameForReason(), colsForRole(), colsForStage(), computeMetrics(), detectIsSummary(), detectReportType(), fmtCount() (+11 more)

### Community 8 - "Community 8"
Cohesion: 0.13
Nodes (14): weekOfMonthBounds(), confirmDiscardIfDirty(), getFieldPropertyForCol(), goToPeriod(), updateCell(), isoDate(), pickRow(), bucketsInMonth() (+6 more)

### Community 9 - "Community 9"
Cohesion: 0.14
Nodes (14): knownStage(), normalizeAliasKey(), recognizeSheetStage(), recognizeStage(), recognizeStageScored(), basisKey(), groupIntoDatasets(), deriveTitle() (+6 more)

### Community 10 - "Community 10"
Cohesion: 0.12
Nodes (14): handlePublish(), handleSave(), today(), isNewStageLabel(), resolveConfirmPresetId(), sourced(), toNumber(), toStageRecords() (+6 more)

### Community 11 - "Community 11"
Cohesion: 0.12
Nodes (11): for(), classifyFormula(), classifyRole(), columnType(), dominantFormulaClass(), looksSerialDate(), profileColumn(), profileTable() (+3 more)

### Community 12 - "Community 12"
Cohesion: 0.12
Nodes (13): columnSourceRows(), openAudit(), srcRows(), toSourceRows(), calculatePareto(), deriveMergePlan(), metricsSane(), metricsToCharts() (+5 more)

### Community 13 - "Community 13"
Cohesion: 0.14
Nodes (13): canonicalizeEvents(), dayOf(), fileOf(), isDirectEntry(), precedenceOf(), stageOf(), GET(), GET() (+5 more)

### Community 14 - "Community 14"
Cohesion: 0.13
Nodes (12): confirmLeaveEntryGrid(), handleDeleteLedgerRecord(), handleDuplicateLedgerRecord(), handlePresetChange(), handleRemoveColumn(), handleSaveColumnDraft(), handleSaveSchemaRegistry(), loadLedger() (+4 more)

### Community 15 - "Community 15"
Cohesion: 0.1
Nodes (3): MemoryDatasetStore, sortDatasets(), SupabaseDatasetStore

### Community 16 - "Community 16"
Cohesion: 0.13
Nodes (7): applyEdit(), defectKey(), reviewRow(), reviewSummary(), stageLabel(), matchAgainstPresets(), tokensOf()

### Community 17 - "Community 17"
Cohesion: 0.2
Nodes (15): buildChatContext(), buildPrompt(), POST(), activeBackend(), availableBackends(), getModel(), isAvailable(), isRetriable() (+7 more)

### Community 18 - "Community 18"
Cohesion: 0.33
Nodes (17): aggAssembly(), aggBalloon(), aggProduction(), aggShopfloor(), aggVisual(), colIndex(), detectHeaderRow(), extractSheet() (+9 more)

### Community 20 - "Community 20"
Cohesion: 0.23
Nodes (4): useEvents(), GenericDatasetView(), Dashboard(), useRegistry()

### Community 23 - "Community 23"
Cohesion: 0.22
Nodes (3): EventsProvider(), RegistryProvider(), TweaksProvider()

## Knowledge Gaps
- **6 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `useEvents()` connect `Community 20` to `Community 32`, `Community 33`, `Community 5`, `Community 8`, `Community 10`, `Community 12`, `Community 14`, `Community 16`, `Community 19`, `Community 21`, `Community 22`, `Community 23`, `Community 27`, `Community 30`, `Community 31`?**
  _High betweenness centrality (0.264) - this node is a cross-community bridge._
- **Why does `handleUpload()` connect `Community 4` to `Community 16`, `Community 3`, `Community 6`?**
  _High betweenness centrality (0.174) - this node is a cross-community bridge._
- **Why does `createServerClient()` connect `Community 1` to `Community 3`, `Community 15`?**
  _High betweenness centrality (0.147) - this node is a cross-community bridge._
- **Are the 21 inferred relationships involving `scopeEvents()` (e.g. with `srcRows()` and `srcRows()`) actually correct?**
  _`scopeEvents()` has 21 INFERRED edges - model-reasoned connections that need verification._
- **Are the 2 inferred relationships involving `parseWorkbookBuffer()` (e.g. with `parseRejectionAnalysis()` and `runFile()`) actually correct?**
  _`parseWorkbookBuffer()` has 2 INFERRED edges - model-reasoned connections that need verification._
- **Are the 2 inferred relationships involving `useEvents()` (e.g. with `Dashboard()` and `GenericDatasetView()`) actually correct?**
  _`useEvents()` has 2 INFERRED edges - model-reasoned connections that need verification._
- **Are the 12 inferred relationships involving `createServerClient()` (e.g. with `POST()` and `POST()`) actually correct?**
  _`createServerClient()` has 12 INFERRED edges - model-reasoned connections that need verification._