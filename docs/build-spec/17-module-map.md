# 17 · Module Map (file → role → key exports)

## Contract / model
| File | Role | Exports |
|---|---|---|
| `src/lib/contract/d1.ts` | Canonical event union + registries (Zod) | `CanonicalEvent`, `ProductionEvent`, `InspectionEvent`, `RejectionEvent`, `AggregateClaimEvent`, `AnnotationEvent`, `CorrectionEvent`, `CarryoverEvent`, `DispatchEvent`, `Period`, `Provenance`, `ClientRegistry`, `CostConfig` |
| `src/lib/contract/d3.ts` | Findings / adjudication / rulebook | `Finding`, `RuleId`(V-001..013), `Adjudication`, `RulebookRule`, `MetricLineage` |
| `src/lib/contract/hash.ts` | Identity hashing | `hashEvent`, `hashFinding`, `canonicalize`, `sortDeep`, `sha256` |
| `src/lib/store/types.ts` | Store-facing `Event` re-export + filters | `Event`, `EventStore`, `EventFilter` |

## Ingestion
| File | Role |
|---|---|
| `parsers/index.ts` | `recordsFromBuffer`, re-exports |
| `parsers/types.ts` | `routeFamily`, `PRECEDENCE`, `SourceFamily`, `PrecededRecord` |
| `parsers/parse-size-wise.ts` | per-FR Visual / Valve+Balloon (content detection) |
| `parsers/parse-rejection-analysis.ts` | → `classifyRejectionSheets` |
| `parsers/parse-assembly-daily.ts` | fixed-column daily (unused) |
| `parsers/dedupe.ts` | `dedupeByPrecedence` |
| `parsers/reconcile.ts` | `reconcileConflicts` |
| `ingest/emit.ts` | `emitMany`, `emitStageDay`, `StageDayRecord`, `SourcedValue` |
| `ingest/schema-extractor.ts` | `extractSchemaFromWorkbook`, `classifyWithSchema` |
| `ingest/from-rejection-sheets.ts` | `classifyRejectionSheets`, `toISODate` |
| `ingest/date.ts` | `dateFromFilename`, `toLocalISODate` |
| `ingest/review.ts` | `buildReviewRows`, `reviewSummary`, `applyEdit` |
| `lib/parser.ts` | `detectHeaderRow`, `buildHeaderBlock`, `normalizeHeaders`, `parseWorkbookBuffer` |

## Analytics
| File | Exports |
|---|---|
| `analytics/canonical.ts` | **`canonicalizeEvents`** |
| `analytics/rejection.ts` | `aggregate`, `rejectionRate`, `totalChecked`, `totalRejected`, `fpy`, `byStage`, `trend`, `stageTrend`, `weeklyTrend` |
| `analytics/defect.ts` | `byDefect`, `defectTrend`, `bySize` |
| `analytics/size.ts` | `sizeTrend` |
| `analytics/cost.ts` | `copq`, `savingsOpportunity`, `copqTrend`, `STAGE_WEIGHTS` |
| `analytics/trust.ts` | `trustScore`, `auditSummary` |
| `analytics/status.ts` | `qualityStatus` |
| `analytics/scope.ts` | `scopeEvents`, `periodKey`, `periodLabel`, `periodsIn`, `prevWindow`, `DEFAULT_SCOPE` |
| `analytics/narrative.ts` | `narrativeContext` |

## Registry / AI / store / export
| File | Role |
|---|---|
| `registry/disposafe.ts` | `DISPOSAFE_REGISTRY`, `resolveDefect`, `activeStageIds` |
| `ai.ts` | `tryModels`, `getModel`, `resolveModel`, `availableBackends` |
| `schemas.ts` | LLM Zod schemas (cross-provider rules) |
| `analysis-utils.ts` | prompt builders |
| `store/{index,memory,supabase,seed,supabase-mappers}.ts` | backends + seeding |
| `entry/validate-entry.ts` | `checkRecord`, `checkSpike` |
| `audit-package.ts` | `buildAuditPackage` |

## Routes & UI
| Path | Role |
|---|---|
| `app/api/{events,ingest,chat,hard-reset,archive-upload,schema,sessions}/` | API |
| `app/*` | screens (§10.2) |
| `components/{editorial,app}/`, `TweaksContext` | design system + shell |

## Legacy (DO NOT EXTEND)
`app/api/analyze`, `lib/metrics.ts`, `lib/dashboard-builder.ts`, `components/Dashboard.tsx`, `lib/merger.ts`.

## Verification
`scripts/{diagnose-analytical,audit-verify,ground-truth}.ts`; `src/__tests__/*`.
