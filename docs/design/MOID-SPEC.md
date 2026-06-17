# MO!D — Finalized Functional & Architecture Spec (v1)

**Status:** FINAL for build · 2026-06-17 · Supersedes the fragmented D1–D6 (archived in `docs/trash/design/`).
**Companion:** [`MOID-DESIGN-SPEC.md`](MOID-DESIGN-SPEC.md) (UI/UX, for Antigravity) · machine contract: [`d1-contract.ts`](d1-contract.ts), [`d3-schemas.ts`](d3-schemas.ts) · decision history: [`D0-spec-reconciliation.md`](D0-spec-reconciliation.md).
**Ownership:** this doc + the schemas are the **build contract for logic/architecture/code** (my domain). UI is specified separately in the design spec.

---

## 1. What MO!D is (one paragraph)

MO!D turns Disposafe's existing **rejection** paperwork (messy Excel + manual entry) into trustworthy, traceable, optionally money-denominated rejection intelligence. It ingests data two ways, infers and lets a human verify a clean schema, records everything as an **immutable, provenance-tagged event ledger**, runs **deterministic** rejection analytics, surfaces **Findings** when data doesn't make sense (doubt is a feature), learns per-client **rules** from how humans resolve those findings, and presents it all in a TradingView-style decision dashboard + an exportable monthly report. **The model never does arithmetic; source data is read-only; every number traces to its cell or entry.**

## 2. Non-negotiable principles

1. **LLM = semantics only** (classify columns, draft narrative, draft rules). **All numbers from deterministic code.**
2. **Source data is read-only.** Disagreements become **Findings**, never silent corrections. No insert-time rejection of "bad" rows — they're ingested and flagged.
3. **Every number is traceable** to a source cell (Excel) or a direct-entry record.
4. **Append-only.** Events/findings/adjudications are immutable; corrections *supersede*, never overwrite.
5. **Rejection-only for v1.** Production line, RTY, OEE, mass-balance-across-production are out of scope (see §3).

## 3. Scope — rejection only

The GM's own `REJECTION ANALYSIS` files define the universe: per **inspection stage**, per day, `QUANTITY CHECKED → REJECTION → %`, rolled to a **Total Rejection %**, viewable daily / monthly / fiscal-year (April–March).

**v1 stages (the only ones):** `visual` (P17), `balloon` (P18), `valve-integrity` (P20), `final` (P24).
**Defect categories:** the registry's canonical set with alias maps (Thin Spod, Struck Balloon, Leakage, Balloon Burst, Bubble, 90/10, Pinhole, Coagulum, Surface Defect, Raised Wire, Black Mark, Webbing, Missing Formers, Others, + VISUAL's extended legend). Unknown labels → Finding, never invented.

Out of scope for v1 (documented as locked modules in the UI, not built): production/dipping stages, RTY/FPY-across-line, OEE, correlation engine, WIP/VSM, SPC charts, CAPA vector memory. Rationale and revisit triggers in `D0-spec-reconciliation.md` §5.

## 4. Data model (canonical events)

Full Zod in `d1-contract.ts`. The events that matter for v1:

- **`Production`** — quantity *checked* at a stage on a day (the denominator). `{stageId, quantity, unit, batchNo?, size?}`.
- **`Rejection`** — rejected quantity, optionally attributed to a defect. `{stageId, defectCode?, defectCodeRaw, quantity, ...}`. A day's stage rejection is one Rejection (total) and/or several per-defect Rejections.
- **`Inspection(disposition=rejected)`** — the stated reject total when a sheet gives it directly; reconciled against per-defect Rejections by V-004.
- **`AggregateClaim`** — any value the sheet *computed* (totals, %s, cross-sheet/file pulls). **Never an analytics input** — only fuel for validation. Holds `formulaText`, `statedValue` (incl. error strings like `#DIV/0!`), `cachedValue`.
- **`Annotation`** — human/system notes incl. schema-verify comments and adjudication verdicts.
- **`Correction`** — supersedes a prior event (only via confirmed adjudication).

Every event carries the envelope: `eventId` (content hash → idempotent re-ingest), `occurredOn` (Period), `provenance` (`file/sheet/tableId/cells/headerPath/rowLabel/formulaText/cachedValue/externalRef` **or** direct-entry ref), `confidence` (`exact|heuristic|llm|external-cached`, the last capped ≤0.5), `extractedBy` (`heuristic|llm:<model>|direct-entry`).

Registries (per client, versioned): **stages** (with `effectiveFrom` for drift / "Add field"), **defects** (canonical + enumerated aliases), and the optional **`CostConfig`** (§8).

## 5. Ingestion — dual path, one verification surface

Both paths emit the same canonical events.

**(a) Excel pipeline (kept — demo depends on it):** `reader` (xlsx → grid + formulas + merges) → `classify` (heuristic `CandidateSheetGraph` first; LLM assist via `tryModels` only when heuristic confidence < 0.7, then `reconcileGraph` + sanity gate so a hallucinated graph is discarded) → `emit` (deterministic: reads values out of the cells the graph identified; the LLM never transcribes numbers).

**(b) Direct entry (now primary):** structured forms generated from the registry — per stage: date, quantity checked, rejection qty, per-defect breakdown. **"Add field" button** = add a stage/defect column to the registry with an `effectiveFrom` date (history stays valid). Emits events with `extractedBy: "direct-entry"`.

**One verification surface:** both land in an editable **schema-verify view** before commit. Excel pre-fills the inferred mapping; direct entry starts blank. The human confirms each mapping/row and can leave **comments** (typed `Annotation`s) correcting the AI ("this column is Valve Integrity, not Balloon"). Comments persist and resurface in chat (§9). The confirmed schema is **exportable** (JSON/CSV).

## 6. Validation engine → Findings

Pure functions over the event store; the LLM only attaches hypothesis prose to an already-fired Finding. Rejection-relevant rules (full catalog + pseudocode in the archived D2; reproduced for the engine in code):

- **V-002** AggregateClaim sum recompute (stated total ≠ Σ rows).
- **V-003** percentage claim recompute (stated % ≠ recomputed; stale-cache divergence).
- **V-004** stated reject vs Σ defect reasons (real failure: VISUAL Apr-30 1708 vs 1544).
- **V-005** percentage-of-percentages (real failure: yearly Total = sum of stage %s).
- **V-006** omitted/extra term in a total formula (real failure: shopfloor K30 skips a column).
- **V-007** defect-code resolution below confidence.
- **V-009** date/period anomalies (serial dates, week-crossing-month, dupes, data on SUNDAY/HOLIDAY).
- **V-010** near-duplicate / edited-cell re-ingestion (identical eventId = idempotent skip).
- **V-011** error values & unverifiable externals (`#DIV/0!`, cross-file cached pulls, Dispatch).
- **V-013** unknown rows / unclassifiable structure.

**Live clarification = these rules fired at entry/ingest time.** Point-in-time (rejection > checked, negative, % far off the stage's own history) and across-collection (a day 3× the period mean, a stage flatlining, the "all-4-stages-identical" copy-paste error seen in the GM's Oct yearly row) checks each raise a Finding the user is asked to clarify. Same mechanism, earlier.

Deprioritized to a later production phase: V-001 full stage conservation, V-008 stage-handoff (need the production model).

## 7. Findings → adjudication → rulebook (the learning loop / moat)

Full Zod in `d3-schemas.ts`.
- **Finding** (immutable; `findingId = hash(ruleId, subtype, sorted eventIds)` → re-ingest re-attaches, no duplicate questions): ruleId, severity (`critical|warning|info`), plain-language `question` + `detail`, `evidence` (event ids + cells + stated vs computed + magnitude), ≤3 `hypotheses` (`mistake|intentional-practice|unknown`), `requiresGmAuthority`.
- **Adjudication** (a specialized `Annotation`, never edits source): verdict `mistake|intentional|unsure`, mandatory `why` for intentional, author `steward|gm`, optional spawned `Correction`.
- **RulebookRule**: predicate (ruleId + scope on file-family/sheet/stage/defect/period [+ structural param e.g. omitted column]) + action (`auto-adjudicate` verdict | `suppress`) + human `rationale` + `bornFromAdjudicationIds`. **LLM drafts, human activates; drafts never act.** Applied after rules fire, before the queue renders → matched findings become `rule-compiled` (no card). Drives the visible "questions are dropping" metric.
- **Lineage states** (drive dashboard trust): `verified` / `assumed` (rulebook auto-adjudication or external-cached) / `unresolved` (open or `unsure`). A metric's badge = worst contributor.
- **Escalation:** V-005 / V-006 `intentional` verdicts (they change the GM's own reporting math) require GM authority; most others are steward-settleable. Matrix in `d3-schemas.ts` / archived D3 §5.

## 8. Cost model (optional, user-supplied — resolves the COPQ blocker)

`CostConfig` (in `d1-contract.ts`) is **opt-in input**, not a precondition:
- The user enters, wherever relevant in the UI, either a flat `finishedUnitCostInr` and/or `perStage` ₹/unit (value-add rises down the line), and optional `reworkCostPerUnitInr`. A toggle `enabled` turns cost calculations on.
- When enabled: deterministic `rejectionCost(stage, period) = Σ rejectedQty × costPerUnit(stage)` (per-stage override else finished cost). Surfaces as a "₹ lost to rejections" KPI, per-stage cost, and the report's loss column.
- When absent/disabled: all cost UI **gracefully hides**; nothing is invented; lineage of any cost figure is `assumed` (user-entered constant) and labeled as such.

This makes COPQ available immediately for anyone who fills the field, with no dependency on a single number from the client.

## 9. Analytics, chat & provenance

- **Analytics** (pure functions over *effective adjudicated* events): per-stage rejection % (daily/monthly/FY), Total Rejection %, rejection volume by stage, **Pareto** of defect categories (canonical labels), period-over-period deltas, optional ₹ cost. Plus the narrative pass (LLM writes prose from computed numbers — exec insights, per-chart captions, recommendations).
- **Ask RAIS chat** is where provenance & data-health live (not the printed report): when asked "where did this come from?", RAIS searches the event store, answers, and the response carries a **"View Source"** button → opens the verify-beam to the exact file/sheet/cell or direct-entry record, **and** shows any editing comments / adjudication notes about that data's discrepancies.
- **Dashboard trust scorecard** (PA review): a glanceable summary (% verified · checks passed · open questions · confidence) from lineage states — the at-a-glance complement to the chat drill-down.

## 10. Export

Monthly report = the `moid-monthly-report-mockup.html` format, **3 pages** (drop the mockup's Data-Health/Sign-off page; that capability lives in chat): P1 Monthly Quality & Rejection Report, P2 Stage-wise Loss Analysis, P3 Defect & Variation Pareto deep-dive. Print trust marks (`✓` verified / `≈` assumed / `?` unresolved) inline with an endnote table. Browser print-to-PDF (no server PDF dep). A print writes a system `Annotation` (audit trail). One-click **audit ZIP** (CSVs + SHA-256 `manifest.json`) for compliance.

## 11. Architecture & storage

```
src/lib/contract/    d1.ts d3.ts              ← schemas (from docs/design)
src/lib/registry/    disposafe.ts             ← stages/defects/costConfig, versioned, effectiveFrom
src/lib/ingest/      reader · classify · emit · ingest   (Excel path; heuristic+LLM assist)
src/lib/entry/       form-model · validate-entry         (direct-entry path)
src/lib/store/       EventStore · FindingStore · RulebookStore (memory adapter + Supabase adapter, same interface)
src/lib/validate/    rules/v00x.ts · engine.ts (+ live-clarification entrypoint)
src/lib/rulebook/    draft.ts (LLM) · apply.ts
src/lib/analytics/   rejection.ts · pareto.ts · cost.ts · lineage.ts
src/app/api/         ingest · entry · findings · rulebook · chat · export/audit-pack
```
- **Reuse from current code:** `parser.ts` internals → `ingest/reader`; `metrics.inferSheetGraph` → `classify` heuristic; `dashboard-builder.reconcileGraph`/`metricsSane` → graph sanity gate; `ai.ts tryModels` as-is; verify beam / VerifyPanel → chat View Source + scorecard drill-down. **Delete:** `merger.ts` (merge plan is what the ledger does). Detail in archived D4.
- **Storage** (Supabase, append-only): `ingestions, raw_files, events, findings, adjudications, rulebook_rules, rule_applications` + `registry`/`cost_config`. No `CHECK` that forces qty balance (rejected → Finding, never insert error). UPDATE/DELETE revoked on event/finding tables; `superseded_by` set only via the adjudication path. DDL in archived D4 §3.
- **Failure posture:** any LLM failure degrades to heuristics (classify) or absence (rule draft); ingest→store→validate→adjudicate is deterministic and must not throw on any real workbook.

## 12. Build order

B1 store + dual ingestion (+ schema-verify + cost config) → B2 validation engine + Findings + live clarification (acceptance fixture = the 3 real errors) → B3 adjudication + rulebook → B4 analytics + dashboard (per design spec) → B5 export + audit ZIP → B6 hardening + demo. Golden tests per workbook family; idempotent re-ingest.

## 13. Open questions (client)

1. **(Top)** A real ₹/unit to seed `CostConfig` defaults (otherwise users still self-enter; cost just starts empty).
2. On-prem/air-gapped vs cloud → local-LLM vs AI Gateway.
3. Hindi label scope for direct-entry forms (Delhi; Hindi/English).
4. Confirm the 4 rejection stages are complete and that "Final" maps to one source.
5. Total Rejection % his way (sum of stage %s) vs consistent count-based, with an endnote (V-005, GM call).
