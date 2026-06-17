# MO!D Canonical Spec (repo copy)

Status: working source of truth
Owner: Showmik / RAIS-MO!D build
Last updated: 2026-06-17
Scope: Disposafe pilot, Foley Balloon Catheter rejection intelligence

> **Provenance:** this mirrors the canonical spec authored in the Obsidian vault
> (`personal os/30-Projects/RAIS-Pro/docs/MOID-CANONICAL-SPEC.md`). That vault file
> and this repo copy are kept in sync; this is the single spec for building. Older
> files in `docs/`, `docs/design/`, `docs/trash/`, and `C:\Users\acer\Documents\MO!D`
> are evidence from earlier planning, not active instructions.

## Tonight's clarifications (2026-06-17, build session)
- **Dashboard-first.** App opens on the Dashboard cockpit, never an upload page. Ingestion is a workflow reached from the cockpit, not a gate. (Matches §15 "superseded: upload-first flow".)
- **Visual reference for the cockpit = `C:\Users\acer\Documents\MO!D\moid-gm-overview-mockup-1.html`**, used for layout/components/feel — but per §12 it is a *factory intelligence cockpit*, NOT a literal trading terminal: insights/actions first, strong hierarchy, green/amber/red for status only, a trust badge on every major number. Light AND dark.
- **Ingestion is the demo deliverable (tonight).** The GM wants it to feel "just like Excel," with one addition: a small **per-row comment button** on the extracted/mapped schema so a human can correct the AI's understanding in place (Antigravity-style). Comments persist with the data and resurface in provenance/chat.
- Build everything wired end to end: Excel → parse → human-verifiable mapping (with comments) → canonical events → store.

---

## 0. How To Use This File
When requirements change, do not create a competing PRD. Update this file in three places: (1) add a dated row to §1 Decision Log; (2) change the affected section; (3) move superseded behavior to §15. Classify every new ask as V1 (needed for a believable Disposafe rejection pilot) / V1.5 (useful soon) / V2 (needs new data or confirmation) / Rejected (breaks principles or fakes intelligence).

## 1. Decision Log
| Date | Decision | Why / Evidence | Status |
|---|---|---|---|
| 2026-06-10 | RAIS Pro becomes MO!D V1 | RAIS already proves messy-Excel → traceable rejection analytics | Active |
| 2026-06-11 | Add Findings → Adjudication → Rulebook loop | Client said output was nice but flawed; real data has wrong formulas/totals | Active |
| 2026-06-13 | GM = primary buyer/user; PA/steward = operator | GM's son/PA tested; GM decides usefulness | Active |
| 2026-06-15 | Add size-wise + SOP-linked analysis to V1 | MO!D folder has size-wise workbooks + SOP docs | Active |
| 2026-06-16 | Deployment local/on-prem first | Disposafe network/security context; data-egress sensitivity | Active |
| 2026-06-17 | Dashboard = factory intelligence cockpit (not trading terminal, not static report) | Dashboard review PDF: clean but too report-like; needs insights/actions/trust | Active |
| 2026-06-17 | Ingestion is the first demo build; add per-row comment button | This build session | Active |

## 2. One-Sentence Product Definition
MO!D turns Disposafe's messy rejection paperwork, size-wise rejection files, SOPs, and direct data entry into trustworthy, traceable factory-quality intelligence: what failed, where it came from, why it likely matters, what action to take, and how much value can be recovered.

## 3. Problem Statement
Disposafe lacks a dependable operating layer between scattered quality records and management decisions. Rejection data is spread across monthly Excel files, yearly summaries, size-wise workbooks, daily activity reports, SOPs, and manual formula sheets. Some sheets contain external workbook references, totals, percentages, and formulas that cannot be blindly trusted. Management sees rejection % but not what caused changes, which size/stage/defect deserves attention, which SOP applies, or what to do next. Audit evidence (source cells, calculations, SOPs, corrective actions) is fragmented. V1 converts this into a controlled rejection-intelligence workflow without pretending to be MES/ERP/OEE/predictive.

## 4. Non-Negotiable Principles
1. The LLM never performs arithmetic. It may classify structure, draft narrative, suggest hypotheses, draft rules.
2. All metrics come from deterministic code over source values and canonical events.
3. Source files are read-only. MO!D never edits client Excel.
4. Bad/contradictory data becomes a Finding, not a silent correction.
5. Every number traces to a source cell, formula, external reference, or direct-entry record.
6. The ledger is append-only. Corrections supersede; they never overwrite.
7. Works locally/on-prem first. Cloud LLM use is optional and scrubbed.
8. Useful even if cost data is absent. COPQ enabled only when the client supplies cost assumptions.

## 5. V1 Scope
**Included:** Excel ingestion for the provided rejection/daily-activity/cumulative/yearly/size-wise workbooks; direct data entry; canonical event ledger with provenance; formula/external-ref capture as *claims* (not trusted inputs); deterministic rejection metrics by period/stage/defect/size; defect Pareto; size-wise analysis (Visual, Valve Integrity, Final where files exist); SOP-linked diagnostics (Visual, Valve & Balloon Integrity, Final/Siliconization, Primary Packing, remedial guidance); Findings queue (formula mismatch, bad totals, %-of-%, defect-sum mismatch, unknown labels, missing source, unverifiable external refs); human adjudication (mistake/intentional/unsure); Process Rulebook (recurring adjudications → human-approved rules); Executive Intelligence dashboard; Trust/Reconciliation center; monthly GM review report; Audit ZIP (source CSVs, findings, adjudications, hash manifest).
**Not in V1:** full production optimization; OEE; WIP/VSM automation; machine/operator/shift correlation (unless fields exist + confirmed); predictive quality; full CAPA suite; Company Brain / vector memory.

## 6. User Roles
| Role | Person | Need | V1 Screens |
|---|---|---|---|
| GM / Plant Director | Buyer / decision-maker | What matters, what action, is data trustworthy | Dashboard, Monthly Review, Trust Center |
| Quality Engineer | Technical analyst | Drill stage/defect/size/formula + SOP context | Analytics, Findings, SOP/Defect drilldown |
| Data Steward / PA | Data operator | Upload, map, verify, enter daily records, resolve simple findings | Ingestion, Direct Entry, Verify/Schema |
| Admin | Config owner | Registry, cost assumptions, access, deployment | Settings |

## 7. Data Sources
Primary evidence from `C:\Users\acer\Documents\MO!D`: core rejection workbooks in `DATA/`; monthly analysis in `New folder/ANALYTICAL DATA/REJECTION ANALYSIS 2025-26/`; size-wise in `.../SIZE WISE REJECTION/`; SOPs in `.../SOP/`; `FBC FLOW CHART.pdf`; `RAIS DASHBOARD ANALYSIS REPORT.pdf`; HTML mockups. Observed: daily activity reports have production columns + many external refs; rejection analysis files summarize Visual/Balloon/Valve Integrity/Final by date; cumulative sheets often compute total rejection % by *summing stage %s* (a claim to verify); size-wise folders have FR-size + cumulative sheets; SOP files link to stage/defect diagnostics (index cleanly before deep semantic use).

## 8. Canonical Data Model
Store observations as events; analytics must not care whether Excel or direct entry produced them. Event types: `production_checked` (denominator at stage/period/size); `inspection_rejection` (stated rejected qty); `defect_rejection` (rejected qty by defect label/code); `aggregate_claim` (any workbook-computed total/%/linked value/formula/external ref); `source_file` (immutable upload metadata); `annotation` (human/system comment — **this carries the per-row ingestion comments**); `adjudication`; `correction`.
Required provenance: file path/name, file hash, workbook/sheet, cell/range, formula text (if present), cached value (if present), external ref (if present), row/column/header path, extraction method (heuristic / LLM-assisted / direct-entry), confidence + reason.
> Implementation note: the working Zod/code model lives in `docs/design/d1-contract.ts` + `d3-schemas.ts` (mirrored at `src/lib/contract/`). Event-type names there (`production`/`inspection`/`rejection`/`aggregate-claim`/`annotation`/`correction`) are the code spellings of the above.

## 9. Validation And Findings
Validation is deterministic; the LLM may write a plain-language explanation after a rule fires but never decides whether it fired. V1 Findings: `V-001 formula_external_reference` · `V-002 sum_claim_mismatch` · `V-003 percentage_claim_mismatch` · `V-004 defect_sum_mismatch` · `V-005 percentage_sum_used_as_total` · `V-006 omitted_or_extra_formula_term` · `V-007 unknown_defect_label` · `V-008 missing_source_period` · `V-009 spike_or_outlier` · `V-010 duplicate_or_revised_entry` · `V-011 impossible_count`. Lifecycle: detected → evidence attached → human adjudicates (mistake/intentional/unsure) → optional correction event → repeated patterns can become a drafted Rulebook rule → human activates or rejects.

## 10. Analytics
Total rejection qty + %; stage-wise (Visual, Balloon Inspection, Valve Integrity, Final); defect Pareto by stage/period; size-wise by FR size where data exists; period comparison (day/week/month/FY); worst-stage/defect/size rankings; trust score (verified/assumed/unresolved contribution); optional COPQ (rejected × user-supplied cost). Rules: never use `aggregate_claim` as an input unless explicitly adjudicated accepted; prefer recomputed numerator/denominator over copied %s; keep both "client-stated method" and "system-consistent method" visible when they differ.

## 11. SOP And Root-Cause Layer
Don't auto-claim true root cause; create a guided diagnostic workspace. For a selected stage/defect/size: show trend + Pareto context; related SOP snippets (once indexed); likely checks/questions labeled as hypotheses; let QE/GM record root-cause notes; link follow-up actions to original evidence + SOP section. Initial SOP mappings: Visual → `WI-PRD-25-00 ... (P17).doc`; Final/Siliconization → `WI-PRD-30-00 ... (P24 & P25).doc`; Valve & Balloon Integrity → `WI-QC-15-00 ....doc`; Primary Packing → `WI-QC-25-00 ....doc`; Remedial Actions → `DS-ANX-13 GUIDE FOR REMEDIAL ACTION.doc`.

## 12. UI Direction
A factory-quality intelligence cockpit — not a trading terminal, not a static report. Top-to-bottom V1 layout: (1) Executive Intelligence Panel — 3–5 findings/actions in plain language; (2) KPI Strip — total rejection %, worst stage, rejected qty, trust score, optional cost; (3) Quality Command Center — critical/warning/normal alerts; (4) Trend Analytics — rejection over time by stage + total; (5) Pareto — top defects + cumulative; (6) Size-Wise Analysis — FR-size breakdown + outliers; (7) Stage/Defect Drilldown; (8) SOP / Root-Cause Workspace; (9) Trust / Reconciliation Center — source files, formulas, external refs, unresolved findings; (10) Monthly GM Review — print/export-ready. Principles: legibility beats drama; numbers prominent but actions first; green/amber/red only for status/severity; every major number has a trust badge; drilldowns answer "where did this come from?"; Hindi/English labels on data-entry surfaces.

## 13. Architecture
Next.js web app on local/on-prem server; Postgres or self-host Supabase for the shared append-only ledger; browser clients over LAN; file-ingestion service for Excel; local-first LLM via Ollama/vLLM; optional scrubbed cloud LLM through one egress guard.
```text
Excel / Direct Entry
  -> Source reader
  -> Structure classifier (heuristic first, LLM assist only for semantics)
  -> Human verify/mapping screen (with per-row comments)
  -> Canonical events + aggregate claims
  -> Validation engine -> Findings -> Adjudication / Rulebook
  -> Analytics -> Dashboard / Chat / Report / Audit export
```

## 14. Build Order
1. Freeze this canonical spec. 2. Choose the actual codebase to build on. 3. Source profiler + ingestion registry for the real files. 4. Canonical event store + provenance. 5. Validation rules + fixtures from real known errors. 6. Findings + adjudication. 7. Analytics (stage/defect/size/period/trust). 8. Dashboard cockpit. 9. SOP linkage + diagnostic workspace. 10. Monthly GM review + audit export. 11. Harden local/on-prem deployment + egress guard.
**Status (this repo, branch `moid-v1`):** steps 4–6 partially built and tested — contract + registry + hash + append-only store (memory adapter, 110 tests); Supabase adapter + migration (Codex); emit core; live-clarification checks. **In flight (tonight):** step 3/the ingestion workflow UI end-to-end (Excel → verify-with-comments → events) + dashboard-first shell.

## 15. Deferred / Rejected / Superseded
**Deferred:** OEE; WIP/VSM automation; machine/operator/shift correlation; predictive quality; full CAPA suite; Company Brain / pgvector memory.
**Rejected for V1:** LLM-calculated KPIs; editing source Excel; trusting workbook totals/%s without recompute; fake correlation without machine/operator/shift data; a generic Lean Six Sigma suite before the rejection wedge is dependable.
**Superseded:** upload-first dashboard flow → dashboard-first with ingestion as a workflow; TradingView-heavy styling → factory cockpit with strong hierarchy; full MO!D PRD as V1 → believable rejection-intelligence pilot with visible roadmap.

## 16. Open Questions
**Client:** official total-rejection method (summed stage %s vs recomputed total rejected/checked)? cost assumptions for COPQ (flat per unit / per stage / per size / none)? which size-wise folders are official for the pilot? SOPs as DOCX/PDF for reliable indexing? local-only LLM vs scrubbed cloud? machine/operator/shift/batch/material fields available now or future?
**Internal:** canonical codebase confirmed = this repo; client-facing name MO!D (RAIS internal/history); first demo uses 2025-26 historical rejection analysis vs newer 2026-27 size-wise files?
