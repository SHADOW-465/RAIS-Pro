# 08 · Validation, Findings & Rulebook

A deterministic gate runs before any record is committed; failures become **Findings** that a human adjudicates; recurring adjudications compile into **rulebook rules** (the only LLM write-path).

## 8.1 Live validation — `checkRecord` (`src/lib/entry/validate-entry.ts`)
`EPS = 0.005`. Returns `ClarificationIssue[]` `{ code, severity (critical|warning|info), field, message, stated, computed }`.
| Rule | Severity | Condition |
|---|---|---|
| **V-013** | critical | any of checked / rejected / a defect value < 0 |
| **V-001** | critical | `rejected > checked` |
| **V-004** | critical/warning | `Σ defect values ≠ rejected`; critical if `|Δ| > 0.05·max(rejected,1)`, else warning |
| **V-003** | warning | stated `REJ%` differs from `(rejected/checked)·100` by > EPS |
| **V-009** | warning | `checkSpike`: `rate > baseline.mean · 3` (σ-mult, needs baseline.n ≥ 3) |

These map to the spec's four math rules: arithmetic balance, defect-sum, mass-balance/Poka-Yoke, 3σ spike.

## 8.2 Finding (`src/lib/contract/d3.ts`) — `D3_SCHEMA_VERSION="1.0.0"`
```
RuleId = "V-001" .. "V-013"      (13 rules)
Severity = critical | warning | info
Finding = {
  findingId (= hashFinding{ruleId,subtype,sorted evidenceEventIds}), schemaVersion, ingestionId,
  ruleId, subtype|null, severity, question, detail,
  evidence: { eventIds[≥1], cells[≥1], provenance, statedValue|null, computedValue|null, magnitude|null },
  hypotheses: {kind: mistake|intentional-practice|unknown, text}[ ≤3 ],
  requiresGmAuthority, occurredOn, recordedAt }
FindingState (derived) = open | adjudicated | rule-compiled | dismissed
```
`magnitude = |Δ|` orders the adjudication queue (biggest discrepancies first).

## 8.3 Adjudication
```
Adjudication = { adjudicationId, findingId, verdict (mistake|intentional|unsure), why,
  author (steward|gm), isRecommendation, correctionEventId|null, recordedAt }
  refine: verdict "intentional" REQUIRES a non-empty why.
```
- **mistake** → a `CorrectionEvent` supersedes the bad event (history preserved).
- **intentional** → annotated, kept (e.g. "20 units carryover from prev shift").
- Comments persist as `AnnotationEvent`s linked to the finding/cells → surfaced in the Ask RAS provenance flyout.

## 8.4 Rulebook (recurring adjudications → rules)
```
RulebookRule = { rulebookRuleId, version, status (draft|active|retired), predicate (RuleScope),
  action: {kind:"auto-adjudicate", verdict, note} | {kind:"suppress", note},
  rationale, bornFromAdjudicationIds[≥1], draftedBy ("llm:<model>" — the ONLY LLM write path),
  activatedBy (steward|gm)|null, createdAt, retiredAt|null }
RuleScope = { clientId, fileFamily?, sheetPattern?, stageId?, defectCode?, periodFrom?, periodTo? }
```
The LLM may **draft** a rule from repeated identical adjudications; a human must **activate** it. Applied rules are logged in `rule_applications`.

## 8.5 Metric lineage (trust propagation)
```
MetricLineage = { state: verified|assumed|unresolved, contributingEventIds, openFindingIds,
  appliedRuleIds, confidenceFloor|null }
```
A KPI with an open critical finding in its lineage is shown as **assumed/unresolved**, not verified — drives the Data Trust Score.
