# Graph Report - RAIS-Pro  (2026-05-28)

## Corpus Check
- 48 files · ~229,505 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 114 nodes · 126 edges · 29 communities (27 shown, 2 thin omitted)
- Extraction: 88% EXTRACTED · 12% INFERRED · 0% AMBIGUOUS · INFERRED: 15 edges (avg confidence: 0.8)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `bc417412`
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
- [[_COMMUNITY_Community 10|Community 10]]

## God Nodes (most connected - your core abstractions)
1. `createServerClient()` - 11 edges
2. `POST()` - 8 edges
3. `getDeviceId()` - 7 edges
4. `parseExcelFilesWithRaw()` - 7 edges
5. `TrendLine()` - 6 edges
6. `getModel()` - 6 edges
7. `activeBackend()` - 4 edges
8. `buildManifestPrompt()` - 4 edges
9. `buildPrompt()` - 4 edges
10. `applyMergePlan()` - 4 edges

## Surprising Connections (you probably didn't know these)
- `handleUploadComplete()` --calls--> `parseExcelFilesWithRaw()`  [INFERRED]
  src/app/page.tsx → src/lib/parser.ts
- `POST()` --calls--> `activeBackend()`  [INFERRED]
  src/app/api/analyze/route.ts → src/lib/ai.ts
- `POST()` --calls--> `getModel()`  [INFERRED]
  src/app/api/analyze/route.ts → src/lib/ai.ts
- `POST()` --calls--> `createServerClient()`  [INFERRED]
  src/app/api/analyze/route.ts → src/lib/supabase.ts
- `GET()` --calls--> `createServerClient()`  [INFERRED]
  src/app/api/sessions/route.ts → src/lib/supabase.ts

## Communities (29 total, 2 thin omitted)

### Community 0 - "Community 0"
Cohesion: 0.25
Nodes (9): buildFallbackMergePlan(), patchOrphans(), POST(), buildManifestPrompt(), buildPrompt(), applyMergePlan(), fmtNum(), mergedResultToPromptText() (+1 more)

### Community 1 - "Community 1"
Cohesion: 0.21
Nodes (4): buildLinePath(), chartStyle(), TrendLine(), xs()

### Community 2 - "Community 2"
Cohesion: 0.27
Nodes (6): DELETE(), GET(), createServerClient(), GET(), GET(), POST()

### Community 3 - "Community 3"
Cohesion: 0.31
Nodes (6): detectGranularity(), extractTimeRange(), isDateLike(), isSummaryCandidate(), parseExcelFiles(), parseExcelFilesWithRaw()

### Community 5 - "Community 5"
Cohesion: 0.32
Nodes (3): handleUploadComplete(), submit(), getDeviceId()

### Community 6 - "Community 6"
Cohesion: 0.39
Nodes (5): hexToRgb(), rgbToHex(), shade(), tint(), TweaksProvider()

### Community 7 - "Community 7"
Cohesion: 0.53
Nodes (4): buildPrompt(), POST(), activeBackend(), getModel()

## Knowledge Gaps
- **2 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `createServerClient()` connect `Community 2` to `Community 0`?**
  _High betweenness centrality (0.038) - this node is a cross-community bridge._
- **Why does `POST()` connect `Community 0` to `Community 2`, `Community 7`?**
  _High betweenness centrality (0.019) - this node is a cross-community bridge._
- **Why does `getModel()` connect `Community 7` to `Community 0`?**
  _High betweenness centrality (0.015) - this node is a cross-community bridge._
- **Are the 6 inferred relationships involving `createServerClient()` (e.g. with `POST()` and `GET()`) actually correct?**
  _`createServerClient()` has 6 INFERRED edges - model-reasoned connections that need verification._
- **Are the 5 inferred relationships involving `POST()` (e.g. with `activeBackend()` and `getModel()`) actually correct?**
  _`POST()` has 5 INFERRED edges - model-reasoned connections that need verification._
- **Are the 2 inferred relationships involving `getDeviceId()` (e.g. with `handleUploadComplete()` and `submit()`) actually correct?**
  _`getDeviceId()` has 2 INFERRED edges - model-reasoned connections that need verification._