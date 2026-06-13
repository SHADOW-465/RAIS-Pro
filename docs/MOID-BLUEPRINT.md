# MO!D — The One-Page-of-Truth Blueprint

**Read this first.** Everything in `docs/` hangs off this map. Companion visual:
`docs/blueprint/index.html` (open in browser). Updated 2026-06-13.

Client: **Disposafe** (medical-device manufacturer — disposables; dipping/balloon/valve/
assembly lines) in **Delhi** → UI language **Hindi/English**. Buyer: **GM** (lean-minded — just
ran an internal Lean/Kaizen session). Front: the student presents (GM's son, insider data
access); we build.

---

## 1. WHAT IT IS (one sentence)
MO!D turns the quality paperwork Disposafe already produces (rejection registers, inspection
reports, messy Excel) into trustworthy, traceable, money-denominated operational intelligence —
making their existing Lean practices automatic and continuous.

## 2. WHY IT'S USEFUL FOR THE GM — in his own Lean vocabulary
His deck covered: 5S, 8 Wastes, Standard Work, Visual Management, VSM, Kaizen, Kanban,
Poka-Yoke, Six Sigma/DMAIC, JIT, TPM, and metrics (Lead/Cycle time, FPY, OEE, Inventory turns).
Map each to MO!D — this is the "how is this useful for me" answer:

| His Lean concept | What MO!D does for it | Status |
|---|---|---|
| **8 Wastes → Defects** | The wedge: full rejection analytics (Pareto, trends, stage-wise) | NOW |
| **Visual Management** | The dashboard IS digital visual management — one glass for the plant | NOW |
| **Six Sigma / DMAIC** | Measure+Analyze automated: deterministic metrics, Pareto, drill-downs; Define/Improve supported by findings & CAPA-shaped recommendations | V1 |
| **FPY (his deck, slide 29)** | Computed automatically from his own sheets — incl. RTY across stages, which Excel hides | V1 |
| **Standard Work** | Ontology + Process Rulebook: his factory's actual practice, codified and applied consistently | V1 |
| **Kaizen** | Findings → adjudication → improvement actions = a continuous-improvement engine with memory | V1 |
| **Poka-Yoke** | Digital poka-yoke for DATA: validation engine catches wrong totals/summed %/missing columns before they reach a decision | V1 |
| **VSM** | The process graph (stages, buffers, rework loops) = auto-generated current-state VSM | V2 |
| **SPC / control charts** | p/np/c-charts on rejection rates; common- vs special-cause alerts | V2 |
| **OEE** | Quality factor now; Availability/Performance when machine/downtime data arrives | V3 |
| **TPM / JIT / Kanban** | Out of scope until real-time data exists — honest roadmap, not vapor | V3+ |

## 3. WHAT EXISTS NOW (current app, verified from code/docs 2026-06-12)
- Upload `.xlsx/.xls/.csv`, multi-file (~12) + multi-sheet; client-side parsing (data stays local).
- Messy-sheet hardening: header detection, multi-row header merge, junk/subtotal stripping,
  serial-date handling, text-in-numeric tolerance, rollup-sheet exclusion (no double-count).
- Report-family detection: visual / assembly / balloon-valve / shopfloor / cumulative / yearly.
- **LLM classifies, never computes**: column-role graph by model + golden-tested heuristic
  fallback + sanity gate (LLM graph discarded if numbers drift). All metrics deterministic.
- Narrative (exec summary, insights, recommendations, alerts) written from computed numbers.
- **Verify mode**: bezier beam from any KPI to its source column. The trust signature.
- Chat follow-ups → saveable insight slides (PNG).
- Stack: Next.js 16, React 19, TS, Tailwind 4, AI SDK v6 + Zod generateObject, AI Gateway
  (Sonnet/Haiku) w/ Ollama fallback, Supabase best-effort, SheetJS.

## 4. WHAT V1 (PILOT) ADDS — the build in flight
Master plan: `docs/plans/2026-06-11-complete-app-plan.md` (D1✅ → D2–D7 → B1–B6 → `moid-v1-rc1`).
- **Canonical event ledger** (D1, drafted): immutable atomic events w/ cell provenance,
  6 dispositions (accept/reject/rework/hold/scrap/downgrade), lot identity, AggregateClaims
  (sheet totals = claims to verify, never inputs).
- **Validation engine + Findings** (D2): recompute every claimed total/%; conservation, DAG,
  defect-alias checks. Seeded with 3 REAL errors found in their files (shopfloor total omits a
  column; yearly report sums percentages; VISUAL stated REJ ≠ sum of reasons) — demo ammunition.
- **Adjudication + Process Rulebook** (D3): human answers Mistake/Intentional/Unsure →
  immutable annotations → compiled per-client rules → system asks less every month (the moat).
- **4 roles, personalized dashboards** (D7): Data Steward (PA — upload/entry/data-health),
  Quality Engineer (Pareto/trends/drill), Plant Director (GM — KPIs, ₹, exceptions, HIS-format
  printable report), Admin. RBAC as data; widgets composed, not duplicated.
- **In-app data entry** (second pipeline): forms generated from the learned ontology; emits the
  same events (`source: direct-entry`); Excel pipeline coexists forever.
- **Scoped analysis** (the GM's "few rows" request): global scope selector — any period/stage/
  batch/defect slice recomputes instantly. Minitab's use-case, zero data prep.
- **Financial-lite**: ₹/unit config → every chart speaks money (COPQ).
- **Trust badges everywhere**: verified / assumed-by-rule / unresolved → lineage to cell.

## 5. ARCHITECTURE (the spine, one diagram)
```
Excel/CSV upload ─┐                                   ┌─ Steward queue (findings)
Direct entry ─────┤→ Ingestion (LLM labels only)      ├─ QE diagnostics (Pareto/trends/scoped)
                  │→ CANONICAL EVENT LEDGER (immutable, provenance, lots)
                  │→ Validation engine (deterministic) → FINDINGS
                  │→ Adjudication → PROCESS RULEBOOK (re-applied each ingest)
                  └→ Analytics (pure functions) → role dashboards / reports / chat
Principles: model never does arithmetic · source data read-only · every number traceable ·
doubt is a feature (findings, not silent fixes) · pipelines-blind analytics.
```

## 6. COMPLIANCE FRAME (Disposafe = medical device, confirmed)
ISO 13485 QMS + Medical Device Rules 2017 (CDSCO; MD-5/MD-9 by class) — NOT drug Schedule M.
Data integrity: **ALCOA+** and 21 CFR Part 11 expectations → our immutable ledger, audit
trail (who/what/when), and cell-level traceability are *compliance assets*, not just features.
Recommendations output **CAPA-shaped** (problem→root cause→corrective+preventive→owner→due→
effectiveness) so MO!D becomes part of their audit evidence. If MO!D ever becomes system of
record → CSV/GAMP-5 validation enters scope (flag, don't fear).

## 7. FUTURE SCOPE (honest sequencing)
- **V2:** SPC control charts · correlation engine (machine/shift/operator/supplier ↔ defect) ·
  fishbone + 5-Why assistants (LLM-draft, human-confirm) · visual process map (auto-VSM) ·
  full CAPA tracking.
- **V3:** FMEA/RPN · Kaizen project generator · OEE with downtime data · predictive quality ·
  real-time/sensor pipeline.
- Each appears in the UI as a **locked module** with a one-line promise — visible roadmap,
  zero fake UI.

## 8. DOC MAP (where everything lives — kill the clutter)
| Doc | What it is |
|---|---|
| `docs/MOID-BLUEPRINT.md` | **This file — start here** |
| `docs/blueprint/index.html` | Visual mindmap of this blueprint |
| `docs/plans/2026-06-11-complete-app-plan.md` | THE executable master plan (D-phases → B-phases) |
| `docs/design/D1-data-contract.md` + `d1-contract.ts` | Canonical event model (drafted, freeze pending) |
| `docs/design/D7-application-design-directives.md` | Roles, suite architecture, UI laws, V1/V2/V3 mapping |
| `docs/design/D8-discovery-field-guide.md` | Exhaustive client-discovery question + artifact guide (RAIS + MO!D scoping) |
| `docs/design/moid-prd-extracted.txt` | The master PRD vision (destination, not route) |
| `docs/FEATURES.md` | Current app behavior spec (what's already true) |
| `docs/plans/pareto_implementation_plan.md` | Superseded → folded into B4 |
| `DATA/profile_d1_output.md` | Structural profile of all 6 client workbooks (evidence) |
| Older docs (`rais-PRD`, `DESIGN-*`, `UX-AUDIT`, stitch mockups) | Historical/reference — design language still applies |
| Vault `_Builds/` + `_Export/rais-pro-presentation-pack-2026-06-13.md` | Strategy summaries + presentation pack |

## 9. IMMEDIATE NEXT (as of 2026-06-12)
1. Presentation (~tomorrow): pack ready; demo = their data + the 3 real findings + scoped
   analysis via chat; capture requirements verbatim; get GM report sample + ₹/unit + process map.
2. Build: continue master plan D2 onward (agent-executable, 2 human gates).
3. Confirm at meeting: device class & licence (MD-5/9), rework tracked?, measurements digital?,
   on-prem vs cloud, Tamil labels.
