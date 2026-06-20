# 07 · Analytics Engine (`src/lib/analytics/`)

Pure, deterministic functions over `canonicalizeEvents(events)`. **The model never produces any number here.** Screens import from `analytics/index.ts` only; never recompute inline.

## 7.1 Scope & period (`scope.ts`)
```
Scope = { dateFrom?, dateTo?, stageIds?, sizes?, grain: "day"|"week"|"month"|"fy", shift?, productIds?, ... }
DEFAULT_SCOPE = { grain: "month" }
scopeEvents(events, scope): filter by date OVERLAP (e.end < dateFrom → out; e.start > dateTo → out),
   stageIds (events without a stage pass), sizes (events without a size pass).
periodKey(iso, grain): day→iso; month→YYYY-MM; fy→"FY"+(m≥4?y:y-1)+"-"+(yy+1); week→YYYY-MM-W{week-of-month}
   // FY = April–March; week = week-OF-MONTH (floor((d-1)/7)+1), NOT ISO week.
prevWindow(scope): the immediately-prior equal-length window (for vs-previous deltas).
```

## 7.2 Core aggregate (`rejection.ts`)
```ts
aggregate(events) → { checked, good, rework, rejected }
  // sum production→checked, inspection(accepted)→good, inspection(rework)→rework,
  //     inspection(rejected)→rejected; per-defect rejection events → defectRej.
  // if rejected===0 && defectRej>0: rejected = defectRej   (fallback, NOT additive)
```

`perStageAgg(events, registry)` = per registry stage, `aggregate(events filtered to that stageId)` → `{stageId, checked, rejected, rate=rej/chk}`. **The funnel is never summed across stages** (same unit at each gate).

## 7.3 Headline KPIs (exact formulas)
| KPI | Formula | Note |
|---|---|---|
| **Rejection Rate** | `Σ over stages (rejectedₛ / checkedₛ)` | Client "Total Rejection %" convention; matches YEARLY sheet (Apr 14.18%). NOT overall rej÷chk. |
| **Total Checked** | entry stage (first stage with checked>0 = Visual) `.checked` | NOT Σ across stages. |
| **Total Rejected** | `aggregate(scoped).rejected` (Σ all stages) | a count. |
| **FPY** | `Πₛ (1 − rateₛ)` over stages with checked>0 | rolled-throughput yield. FPY and rejection rate intentionally do **not** sum to 100% (Π(1−r) ≥ 1−Σr). |

## 7.4 byStage / byDefect / size
```
byStage(events, scope) → per stage:
  { checked, rejected, rejRate = rej/chk,
    yield = (checked - rejected)/checked = 1 - rejRate,   // NEVER good/checked (good is partial → ~0%)
    contributionPct = rejected / (Σ all-stage rejected) * 100 }

byDefect(events, scope) → Pareto: filter eventType==="rejection", group by (defectCode ?? "raw:"+raw),
  sum quantity, sort desc, cumulative %. Label = registry label if resolved else raw verbatim.
  defectTrend(events, scope, topN=5): top-N defect qty per period.

bySize(events, scope) → per size: { checked, rejected, rejRate }   (in defect.ts)
sizeTrend(events, scope, size) → per period: rejected/checked for that size   (in size.ts)
```

## 7.5 Trends & SPC
```
trend(events, scope, metric="rejectionRate") → per period (Σ-stage rate). weeklyTrend = grain "week".
stageTrend(events, scope) → per period, per-stage rate map.
SPC (screen): X-bar chart; LCL/mean/UCL computed on-the-fly from active trend points;
   Western Electric rule violations counted live.
```

## 7.6 Cost & savings (`cost.ts`)
```
STAGE_WEIGHTS = { visual:0.6, eye-punching:0.7, balloon:0.8, valve-integrity:0.9, final:1.0 }
getFinishedCost()  → localStorage "rais_settings_finished_cost", default 20.0 (₹/unit)
getTargetRejectionRate() → "rais_settings_target_rejection" (percent), default 0.10
getStageWeight(s,d) → "rais_settings_weight_<s>", else default

copq(events, scope) = { value: Σ rejectedₛ × (finishedCost × weightₛ), byStage }
savingsOpportunity = max(
   targetGap = (currentRate>target ? (currentRate−target)×totalChecked×finishedCost : 0),
   improvement = copq.value × 0.25 )
   // currentRate here = totalRejected / totalChecked(entry)
copqTrend(events, scope): copq per period bucket.
```
**Costs are never hardcoded** — dynamic inputs in Settings / forms.

## 7.7 Trust & status
```
trustScore(events, scope) → { pct, verified, assumed, unresolved }
  basis exact|heuristic → verified; external-cached → assumed; else unresolved.
  pct = verified/total*100 (1 dp), fallback 98.4 when empty.
auditSummary(events, scope) → { sourceFilesProcessed = "N/N", manualOverrides = #correction events,
  dataValidationChecks 96, formulaIntegrity 94, dataCompleteness 98 (display constants) }
qualityStatus(events, scope) → "at-risk" if rate>target(0.10); "watch" if rate>watch(0.05); else "ok"
   (targets from localStorage rais_settings_target_rejection / _watch_rejection)
```

## 7.8 Narrative context (`narrative.ts`)
`narrativeContext(events, scope)` packages `{ rejectionRate, totalChecked, totalRejected, worstStage (max rejRate), topDefects[3]{label,pct}, topSizes[3]{size,rate} }` for the AI prose layer. The exec-summary "Top defect drivers" line renders these — and shows an **honest "unavailable" note when `topDefects` is empty**, never "Unknown, Unknown, Unknown".
