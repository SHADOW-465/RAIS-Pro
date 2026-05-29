# Graph Report - RAIS-Pro  (2026-05-29)

## Corpus Check
- 49 files · ~231,235 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 125 nodes · 153 edges · 30 communities (28 shown, 2 thin omitted)
- Extraction: 88% EXTRACTED · 12% INFERRED · 0% AMBIGUOUS · INFERRED: 19 edges (avg confidence: 0.8)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `f0ace2f9`
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
- [[_COMMUNITY_Community 9|Community 9]]
- [[_COMMUNITY_Community 11|Community 11]]

## God Nodes (most connected - your core abstractions)
1. `createServerClient()` - 11 edges
2. `POST()` - 10 edges
3. `tryModels()` - 8 edges
4. `availableBackends()` - 7 edges
5. `getModel()` - 7 edges
6. `getDeviceId()` - 7 edges
7. `parseExcelFilesWithRaw()` - 7 edges
8. `TrendLine()` - 6 edges
9. `activeBackend()` - 6 edges
10. `main()` - 4 edges

## Surprising Connections (you probably didn't know these)
- `main()` --calls--> `availableBackends()`  [INFERRED]
  scripts/check-ai.ts → src/lib/ai.ts
- `handleUploadComplete()` --calls--> `parseExcelFilesWithRaw()`  [INFERRED]
  src/app/page.tsx → src/lib/parser.ts
- `POST()` --calls--> `applyMergePlan()`  [INFERRED]
  src/app/api/analyze/route.ts → src/lib/merger.ts
- `POST()` --calls--> `createServerClient()`  [INFERRED]
  src/app/api/analyze/route.ts → src/lib/supabase.ts
- `GET()` --calls--> `createServerClient()`  [INFERRED]
  src/app/api/sessions/route.ts → src/lib/supabase.ts

## Communities (30 total, 2 thin omitted)

### Community 0 - "Community 0"
Cohesion: 0.3
Nodes (12): buildFallbackMergePlan(), patchOrphans(), POST(), buildPrompt(), POST(), activeBackend(), availableBackends(), getModel() (+4 more)

### Community 1 - "Community 1"
Cohesion: 0.21
Nodes (4): buildLinePath(), chartStyle(), TrendLine(), xs()

### Community 2 - "Community 2"
Cohesion: 0.27
Nodes (6): DELETE(), GET(), createServerClient(), GET(), GET(), POST()

### Community 3 - "Community 3"
Cohesion: 0.27
Nodes (5): buildPrompt(), applyMergePlan(), fmtNum(), mergedResultToPromptText(), roundSig()

### Community 4 - "Community 4"
Cohesion: 0.31
Nodes (6): detectGranularity(), extractTimeRange(), isDateLike(), isSummaryCandidate(), parseExcelFiles(), parseExcelFilesWithRaw()

### Community 6 - "Community 6"
Cohesion: 0.32
Nodes (3): handleUploadComplete(), submit(), getDeviceId()

### Community 7 - "Community 7"
Cohesion: 0.39
Nodes (5): hexToRgb(), rgbToHex(), shade(), tint(), TweaksProvider()

### Community 9 - "Community 9"
Cohesion: 0.7
Nodes (4): check(), main(), pad(), resolveModel()

## Knowledge Gaps
- **2 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `createServerClient()` connect `Community 2` to `Community 0`?**
  _High betweenness centrality (0.046) - this node is a cross-community bridge._
- **Why does `POST()` connect `Community 0` to `Community 2`, `Community 3`?**
  _High betweenness centrality (0.030) - this node is a cross-community bridge._
- **Why does `availableBackends()` connect `Community 0` to `Community 9`?**
  _High betweenness centrality (0.025) - this node is a cross-community bridge._
- **Are the 6 inferred relationships involving `createServerClient()` (e.g. with `POST()` and `GET()`) actually correct?**
  _`createServerClient()` has 6 INFERRED edges - model-reasoned connections that need verification._
- **Are the 7 inferred relationships involving `POST()` (e.g. with `availableBackends()` and `tryModels()`) actually correct?**
  _`POST()` has 7 INFERRED edges - model-reasoned connections that need verification._
- **Are the 2 inferred relationships involving `tryModels()` (e.g. with `POST()` and `POST()`) actually correct?**
  _`tryModels()` has 2 INFERRED edges - model-reasoned connections that need verification._
- **Are the 2 inferred relationships involving `availableBackends()` (e.g. with `main()` and `POST()`) actually correct?**
  _`availableBackends()` has 2 INFERRED edges - model-reasoned connections that need verification._