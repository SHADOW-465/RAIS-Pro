# RAIS Pro → MO!D V1 — Complete-App Execution Plan

**Date:** 2026-06-11 · **Status:** active master plan
**Run instruction for the executing agent:** work through phases IN ORDER, top to bottom,
in one continuous effort. Do NOT stop after a single artifact. A phase is done only when its
**Exit criteria** all pass; then immediately start the next phase. Only the two ⛔ HUMAN GATES
require pausing for Showmik's input — everything else proceeds autonomously. Commit at every
phase boundary (conventional commits, e.g. `design(d2): …`, `feat(b1): …`).

**Source of truth already produced (read these first):**
- `docs/design/D1-data-contract.md` + `docs/design/d1-contract.ts` (event model, draft v0.1)
- `DATA/profile_d1_output.md` (structural evidence for all 6 workbooks / 47 sheets)
- Vault context (if available): `_Builds/rais-verification-loop-design.md`,
  `_Builds/rais-architecture-design-plan.md` in the personal-os vault.

**Non-negotiable principles (apply to every phase):**
1. Source Excel data is read-only; disagreements become Findings, never corrections.
2. LLM = semantics, hypotheses, rule drafting. Deterministic code = ALL arithmetic.
3. Every number in the UI traces to cells (provenance from D1).
4. Two personas: **GM** (buyer; decision view, his report format) and **PA/steward**
   (adjudication queue operator). No engineer-facing jargon in either UI.
5. TDD: every engine behavior gets a failing test first, fixtures cut from real DATA files.

---

## Phase D1F — Freeze the data contract
1. Self-review `D1-data-contract.md` against the decision-gate checklist: every §2 evidence
   row has a contract consequence; `d1-contract.ts` typechecks; every event type has ≥1 real
   example from `DATA/`; open questions in §9 are marked non-blocking or resolved.
2. Bump to v1.0.0, mark **frozen**. Breaking changes hereafter require a new minor/major +
   migration note.
**Exit criteria:** contract marked frozen; `npx tsc --noEmit` passes on `d1-contract.ts`.
⛔ **HUMAN GATE 1 — only if** self-review finds a §9 open question that genuinely blocks
ingestion design (e.g. ambiguous disposition semantics). Otherwise proceed.

## Phase D2 — Validation Rule Catalog → `docs/design/D2-validation-rules.md`
For EACH rule: id (`V-xxx`), inputs (event types), deterministic logic (pseudocode),
severity, the Finding it emits, LLM hypothesis templates, and a REAL example from
`DATA/profile_d1_output.md` that triggers it. Minimum catalog:
- conservation per stage/batch/period (in vs out, accepted+rejected+hold+downgrade ≤ checked)
- AggregateClaim recomputation (sum claims, % claims, cross-sheet/file pulls; flag
  formula-vs-cached divergence, `#DIV/0!`)
- stated-REJ vs sum-of-defect-reasons reconciliation (known real failure: VISUAL)
- percentage-of-percentages detection (known real failure: yearly report)
- omitted-column totals (known real failure: shopfloor K30)
- defect-code resolution confidence below threshold
- sequence/DAG checks incl. stage-handoff carryover (stage N+1 checked > stage N accepted)
- date/period anomalies (serials, week-crossing-month, FY boundaries)
- duplicate/re-ingestion detection (eventId hash collisions are EXPECTED idempotency, define
  the rule for near-duplicates)
**Exit criteria:** every known real error from D1 §2 row 5 is covered by a rule; each rule
has a worked example with expected Finding output.

## Phase D3 — Findings, Adjudication & Rulebook Schema → `docs/design/D3-findings-rulebook.md` + `d3-schemas.ts`
- Finding lifecycle: `open → adjudicated → rule-compiled | dismissed`; immutable, references
  evidence events + cells.
- Adjudication event: verdict (`mistake | intentional | unsure`), free-text why, author role
  (steward | gm), timestamps. Never edits source events.
- Rulebook rule: machine-applicable predicate + parameters + human-readable rationale +
  provenance (which adjudications birthed it) + scope (client/stage/period). LLM drafts,
  human confirms before activation.
- Escalation matrix: which finding types the steward may settle vs which require GM
  authority (process-policy: e.g. "totals intentionally non-conserved at stage X").
**Exit criteria:** Zod schemas typecheck; a worked end-to-end trace exists on paper: real
shopfloor K30 error → V-rule fires → Finding → steward adjudicates "mistake" → dashboard
lineage shows it.

## Phase D4 — Pipeline & Module Architecture → `docs/design/D4-architecture.md`
1. **Audit the existing codebase first** (`src/`, current ingestion/dashboard/chat/beam
   code): list what is reused as-is, what is ported onto the canonical store, what is
   deleted. Be ruthless; the data path is being replaced.
2. Component design: ingestion (LLM parsing → D1 events) → validation engine (D2, pure
   functions) → findings store → adjudication API → rulebook applier → canonical event store
   → analytics modules (rejection stats, Pareto) → presentation. Define module boundaries as
   TypeScript interfaces; storage layout (Supabase tables mirroring D1/D3 schemas,
   append-only); where the existing OpenRouter LLM layer plugs in (semantics only).
3. Sequence diagram for one upload run end-to-end.
**Exit criteria:** doc names every module with its interface, storage schema DDL drafted,
reuse/port/delete decision recorded for every existing src/ directory.

## Phase D5 — Two-role UX spec → `docs/design/D5-ux-spec.md`
Respect the existing design language (`docs/rais-design-language.md`, DESIGN-SYSTEM.md).
- **Steward flow:** upload → ingestion progress → Data Health queue (finding cards:
  plain-language question, evidence in the verify-data split panel, three buttons:
  Mistake / Intentional / Not sure + note) → completion gate ("87% verified · 6 pending").
- **GM flow:** decision dashboard (trends, exceptions, Pareto, trust badges on every metric:
  verified / assumed-by-rule / unresolved → click = lineage trail to cells), short GM
  authority queue, "questions are decreasing" indicator.
- Spec the split-panel fix verification (independent scrolling; beams clip correctly — partly
  done in commit 9834817, verify and spec remaining cases).
- Wireframes as low-fi HTML or annotated markdown — enough for unambiguous build, no more.
**Exit criteria:** every screen names its data sources (which D1/D3 queries feed it); a
finding card walkthrough exists for 3 real DATA errors.
⛔ **HUMAN GATE 2 — design cues review:** present D5 (+ D4 summary) to Showmik before
building UI. Build phases B1–B2 may start in parallel while waiting, since they are UI-free.

## Phase D6 — GM-format report template spec → `docs/design/D6-report-template.md`
Blocked input: sample of the GM's current report (Showmik to obtain via PA). If unavailable,
design the template SYSTEM (section/field model, trust-mark placement, print stylesheet,
PDF export) with a placeholder default template, and mark the GM clone as a fill-in task.
**Exit criteria:** template model spec'd; print stylesheet requirements listed; does NOT
block build phases.

---

## Phase B1 — Canonical store + ingestion engine
- Implement D1 schemas + Supabase (or local-first) append-only store.
- Ingestion: parse all 6 DATA workbooks → events. Heuristic parsing first (the profile
  shows structures are learnable); LLM assist only where heuristics report low confidence
  (header semantics, defect alias resolution). Registries (stages, defects) seeded from
  the profile, with `effectiveFrom` drift support.
- Golden tests: for each workbook family, fixture sheet → expected event counts/samples;
  idempotent re-ingestion (same eventIds).
**Exit criteria:** all 6 workbooks ingest without throwing; event counts match profile
expectations; `npm test` green; no AggregateClaim ever enters an analytics query path.

## Phase B2 — Validation engine + findings
- Implement every D2 rule as a pure function over the event store; emit Findings per D3.
- Acceptance fixture: the three KNOWN real errors (shopfloor omitted column, yearly summed
  percentages, VISUAL REJ ≠ reasons) MUST each produce exactly the expected Finding.
**Exit criteria:** known-errors fixture passes; full DATA run produces a findings report
(`docs/design/B2-first-findings-run.md`) listing every finding with evidence — this doc is
demo material for the client.

## Phase B3 — Adjudication + rulebook
- Steward queue UI per D5 (cards, split-panel evidence, three buttons), adjudication events,
  GM escalation queue, rulebook compilation (LLM-drafted rule → human confirm → active),
  rulebook auto-application on next ingestion (re-run validation; previously adjudicated
  patterns don't re-ask).
**Exit criteria:** end-to-end test: ingest → finding → adjudicate "intentional" → rule
created → re-ingest same file → that finding does not reopen; question count visibly drops.

## Phase B4 — Analytics + GM dashboard on the canonical store
- Port rejection statistics to read ONLY adjudicated canonical events; implement the Pareto
  engine (supersedes `docs/plans/pareto_implementation_plan.md` — reconcile, don't duplicate).
- GM decision dashboard with trust badges + lineage drill-down to cells (reuse/upgrade the
  bezier beam); chat answers cite event provenance.
**Exit criteria:** every dashboard number clickable to source cells; metrics computed from
events match hand-verified values for one month of one workbook (document the hand check).

## Phase B5 — Reports + print
- Implement D6 template system + print stylesheet + PDF export; default template now, GM
  clone when the sample arrives.
**Exit criteria:** print preview of a monthly report is clean A4; trust marks visible.

## Phase B6 — Hardening + demo
- Full pipeline run on all 6 workbooks; fix stragglers; performance sanity (ingestion of the
  largest workbook < ~2 min).
- Write `docs/DEMO-SCRIPT.md`: the live demo = upload their own messy sheet → system asks 3
  intelligent questions → adjudicate live → dashboard updates with trust badges → print the
  GM-format report.
- Update README + AGENTS.md to reflect the new architecture.
**Exit criteria:** demo script executed start-to-finish once without manual intervention;
all tests green; repo committed and tagged `moid-v1-rc1`.

---

## Progress log (executing agent: append one line per phase completion)
- 2026-06-11: D1 drafted v0.1 (pre-plan).
