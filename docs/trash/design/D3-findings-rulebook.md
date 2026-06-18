# D3 — Findings, Adjudication & Rulebook Schema

**Status:** v1.0 (2026-06-11) · **Depends on:** D1 (frozen), D2 · **Companion:** [`d3-schemas.ts`](d3-schemas.ts) · **Feeds:** D4 (storage), B2/B3

---

## 1. Finding lifecycle

```
            ┌──────────── dismissed (steward, with reason) ─────────────┐
open ──► adjudicated ──► rule-compiled (a RulebookRule now auto-answers it)
  │            │
  │            └─ verdict=unsure keeps lineage "unresolved"; finding stays
  │               visible in the queue's "parked" section
  └─ re-ingestion of identical data re-attaches to the SAME finding
     (findingId is content-hashed like eventIds) — no duplicate questions
```

- Findings are **immutable rows**; lifecycle state is *derived* from the presence of adjudication/rulebook records referencing them, never mutated in place (same append-only discipline as D1 §6).
- A finding references evidence by **event ids and cells** (provenance snapshot embedded, so cards render without re-reading the workbook).
- `findingId = hash(ruleId, subtype, evidence eventIds sorted)` — stable across re-runs.

## 2. Adjudication

An adjudication is a D1 `Annotation` event specialized by the fields D1 already reserved (`findingId`, `verdict`); D3 adds the queue semantics:

- **Verdicts:** `mistake` (the sheet is wrong; optionally birth a `Correction` event — only a human-confirmed step, see §4), `intentional` (practice is deliberate; the *why* text is mandatory and becomes rulebook raw material), `unsure` (parked; metric lineage stays `unresolved`).
- **Author role:** `steward` or `gm`. A finding requiring GM authority (per the escalation matrix §5) accepts a steward *recommendation* but only a GM adjudication settles it.
- **Never edits source events.** Verdict `mistake` does not change a number anywhere; it (a) marks the affected claims' lineage and (b) may propose a `Correction` event that the steward explicitly confirms, which *supersedes* (D1 §6) — analytics then read the replacement.

## 3. Rulebook

A **RulebookRule** turns an adjudication pattern into an automatic answer for future ingestions.

- **Machine side:** a *predicate* (which findings it matches: ruleId + scope selectors on stage/sheet-family/period/defect) and an *action* (`auto-adjudicate` with a fixed verdict + note, or `suppress` for benign-noise findings like V-011 idle-day `#DIV/0!`).
- **Human side:** `rationale` (plain language, shown wherever the rule acts), `provenance` (the adjudication ids that birthed it), `scope` (client-wide vs stage vs sheet-family vs period-bounded).
- **Birth path:** LLM drafts the rule from the adjudication's why-text (this is the *only* LLM write-path in D3) → steward (or GM, if GM-authority) reviews the draft → `active`. Drafts never act.
- **Effect:** on every later validation run, active rules are applied *after* rules fire and *before* the queue renders: matched findings are recorded as `rule-compiled` with a pointer to the rule. The card never appears — this is the "ask less over time" loop, measured by `questionsAsked(ingestion)` trending down.
- Rules are versioned and deactivatable (`retired`), never deleted; a retired rule's past auto-adjudications remain on the record.

## 4. Lineage states (consumed by B4 dashboard)

Every metric aggregates the lineage of the events it reads:
- `verified` — all contributing observations untouched by open findings, or settled `mistake`-with-confirmed-Correction / `intentional`-with-rationale.
- `assumed` — depends on a rulebook auto-adjudication or an `external-cached` source (D1 cap; Dispatch can never exceed this).
- `unresolved` — at least one open or `unsure` finding touches a contributing event.
The metric badge = worst state among contributors (`unresolved > assumed > verified`).

## 5. Escalation matrix

| Rule | Steward settles | GM authority required when |
|---|---|---|
| V-001, V-004, V-009, V-010, V-012, V-013 | ✓ all verdicts | — |
| V-002, V-003 | ✓ `mistake` | verdict `intentional` (totals deliberately non-conserved = reporting policy) |
| V-005 (summed %), V-006 (omitted column) | ✓ `mistake` | verdict `intentional` (changes how the GM's own report computes) |
| V-007 (new defect label) | recommends | registry change activation (new category affects Pareto) |
| V-008 (handoff overflow) | ✓ `intentional` (WIP lag) | `intentional` claiming rework loops (process claim) |
| V-011 external workbook | ✓ acknowledge | decision to request source files from client |

## 6. Worked end-to-end trace (exit-criterion walkthrough, real data)

**The shopfloor K30 error**, start to finish:

1. **Ingest** SHOPFLOOR `APRIL 25` → among others: 9 `Rejection` totals' claims and `AggregateClaim` ev-K30 `{claimKind:"derived", statedValue:1550, formulaText:"=C30+D30+E30+F30+G30+H30+J30", aggregation:"monthly", provenance:{file:"SHOPFLOOR REJECTION REPORT.xlsx", sheet:"APRIL 25", tableId:"t1", cells:["K30"]}}`.
2. **Validate** — V-006 parses the formula, compares terms against the table's defect-column group `{C..J}`, finds `I` missing → Finding `f-…` severity `critical`:
   - question: *"The April grand total skips the 'Missing Formers' column (76 trolleys). Including it gives 1,626, not 1,550. Should Missing Formers count toward total rejection?"*
   - evidence: ev-K30 + the nine column-total events; cells `K30`, `I30`, `C30:J30`.
   - hypotheses: `mistake` "column added after the formula was written"; `intentional` "Missing Formers tracked but excluded from rejection by policy".
3. **Queue** — V-006 `intentional` is GM-authority, so the card shows in the steward queue with verdict buttons; choosing *Intentional* routes it to the GM queue, choosing *Mistake* settles it at steward level.
4. **Steward adjudicates `mistake`** ("formula error — total must include all defect columns"). Annotation event written; finding state → `adjudicated`; affected monthly-total lineage → the claim is marked wrong, and since analytics never read claims (D1 hard rule), the dashboard's own computed total (1,626) now renders `verified` with a footnote badge linking the finding.
5. **Rulebook draft** — LLM proposes: predicate `{ruleId:"V-006", scope:{file-family:"SHOPFLOOR", column:"I"}}`, action `auto-adjudicate verdict=mistake`, rationale *"Shopfloor grand totals must include every defect column; the source formula is known-stale."* Steward activates.
6. **Re-ingest next month** — same structural error in `MAY 25`'s total row → V-006 fires → rulebook matches → `rule-compiled`, no card. Question count drops; dashboard shows *"1 question auto-answered by your rulebook"*.

## 7. Schemas

See [`d3-schemas.ts`](d3-schemas.ts): `Finding`, `FindingEvidence`, `Hypothesis`, `Adjudication` (refines D1 `AnnotationEvent`), `RulebookRule`, `RulePredicate`, `RuleAction`, `LineageState`, plus the derived `FindingState`. LLM-facing draft shapes (`CandidateHypothesis`, `CandidateRuleDraft`) follow the cross-provider constraints (D1 §7).
