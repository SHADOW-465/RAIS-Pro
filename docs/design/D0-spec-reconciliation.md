# D0 — Spec Reconciliation & Current Truth

**Status:** v1.0 (2026-06-17) · **Read this before D1–D6 or any `docs/*-exhaustive` doc.**
**Why this exists:** requirements have evolved across several doc generations (old `docs/trash/design/D1–D10`, the data-grounded `docs/design/D1–D6`, and the newest `docs/*-exhaustive` set). They conflict. This doc is the single pointer to what is *currently* true, what is kept, what is deferred, and what is rejected — with the evidence for each call. When a future decision changes things, update **this** file first.

**Primary evidence used here:**
- The real client workbooks (`DATA/` + `DATA/profile_d1_output.md`, 6 workbooks / 47 sheets, profiled).
- The GM's own analysis files: `MO!D/New folder/ANALYTICAL DATA/REJECTION ANALYSIS 2025-26/*` — **what he actually wants**.
- The GM's target UI/export mockups: `MO!D/moid-gm-overview-mockup-1.html` (TradingView-style dashboard), `MO!D/moid-monthly-report-mockup.html` (print/export), `MOID-BLUEPRINT.md` (2026-06-13 reconciliation).

---

## 1. The three decisions made after D1–D6 (capture so they don't get lost)

### Decision 1 — In-dashboard data entry is now a first-class ingestion path
The GM approved collecting data **directly in the dashboard** (not only via Excel upload). So ingestion is now **dual-path**, both emitting the *same* canonical events (D1):
- **(a) Direct entry** — structured forms in the dashboard with the proper rejection fields (per stage: date, quantity checked, rejection qty, and the defect breakdown), plus an **"Add field" button** so the steward can extend the form when the sheet grows a new column (mirrors the real-world drift we saw — e.g. Eye Punching appearing mid-year). Direct-entry events carry `extractedBy: "direct-entry"`.
- **(b) Excel pipeline — KEEP.** Do **not** remove the existing upload/parse pipeline; the demo depends on loading their real Excel values to show the system working on their own data. Both paths coexist permanently.
- **AI clarification loop (the "company brain" seed):** when entered or ingested data doesn't make sense — at a single point (e.g. rejection > checked, a negative, a stage % wildly off its own history) or across a collection (a day 3× the month's mean, a stage suddenly flat) — the system **asks for clarification** rather than silently accepting. This is the D2/D3 Findings + adjudication loop applied live at entry time, not a new mechanism.
- **Human-verifiable extracted schema + comments:** the schema MO!D infers from an unstructured Excel file must be **displayed, editable, and verifiable by a human** before it's trusted. Each inferred mapping/spec row gets a **comment affordance** (like Antigravity's per-spec comment button) so the user can correct the AI in place ("this column is Valve Integrity, not Balloon"). Comments are retained and surface later (see §4).

### Decision 2 — Rejections only, for now (production is out of scope)
The GM said production is running smoothly; **focus only on rejections**. His own `REJECTION ANALYSIS` files confirm the exact model he thinks in:

| What his files contain | Implication |
|---|---|
| Per **stage** (Visual, Balloon Inspection, Valve Integrity, Final): `DATE · QUANTITY CHECKED · REJECTION · %` | The atom is **(stage, day, checked, rejected) → %**. No accept/hold/downgrade/rework split required for v1. |
| Monthly sheet: per-day, the 4 stage %s + **Total Rejection %** | Dashboard trend = daily total rejection % + per-stage %. |
| Yearly sheet: per-month, 4 stage %s + Total | Monthly rollup view. |

So for v1 we **do not** model the 12-stage production line, RTY, OEE, mass-balance across production stages, or COPQ-by-cost-weight. The four **rejection inspection stages** are the universe.

### Decision 3 — App in one sentence, and where things live
Gets data (dual ingestion) → **maps its own schema for verification** (editable, verifiable, exportable) → builds the necessary dashboard elements → shows everything traceably for **daily monitoring and audit**. Specifics:
- **Export** uses the `moid-monthly-report-mockup.html` format (P1 Monthly Quality & Rejection Report, P2 Stage-wise Loss Analysis, P3 Defect & Variation Pareto deep-dive). **Drop the mockup's P4 "Data Health & Sign-off" page from the export.**
- **Data Health & "where did this come from" live in the Ask RAIS chat instead** (see §4), not on the printed report.

---

## 2. Ask RAIS chat — provenance & data-health as a conversational feature

Per Decision 3, the lineage/data-health capability moves into the **Ask RAIS** chat:
- When the user asks "where did this number come from?", RAIS **searches the event store**, pulls the answer, and the response carries a **"View source" button at the bottom**.
- Clicking **View source** shows exactly where it came from — file/sheet/cell (Excel path) or the direct-entry record — reusing the existing verify-beam/provenance bridge (D1 `Provenance.cells`).
- The response **also surfaces any comments/notes captured during editing** about discrepancies on that data (the Antigravity-style comments from §1, plus adjudication notes from D3). So a number's answer includes *both* its origin *and* the human commentary on its trustworthiness.

This replaces the standalone "Data Health screen" framing from D5 §2 for v1: the steward still adjudicates findings, but the GM/user reaches provenance and health **through chat**, on demand.

---

## 3. Data ingestion layer design (the part that was unclear)

A concrete shape for the dual-path ingestion + verification surface. All of it emits D1 canonical events; none of it lets the model do arithmetic.

```
        ┌─────────────────────────── INGEST ───────────────────────────┐
        │                                                               │
 (a) Excel upload ─► reader (xlsx→grid+formulas) ─► classify (heuristic │
        │              first; LLM assist on low confidence) ─► CANDIDATE │
        │              SCHEMA  ───────────────┐                         │
        │                                     ▼                         │
        │                          ┌──────────────────────┐             │
 (b) Direct entry ─► form (per-    │  SCHEMA VERIFY VIEW   │  human      │
        │            stage fields, │  - inferred mappings  │  edits +    │
        │            + Add field)  │  - per-row COMMENT btn │  comments   │
        │                          │  - editable / export  │             │
        │                          └──────────┬───────────┘             │
        │                                     ▼ (confirmed)             │
        │                          emit D1 events (provenance, source)  │
        └─────────────────────────────────────┬─────────────────────────┘
                                               ▼
                         VALIDATE (D2 rules) ─► FINDINGS ─► live clarification
                         "this doesn't look right — is it…?" (D3 adjudication)
                                               ▼
                              CANONICAL EVENT STORE (immutable)
                                               ▼
                         analytics ─► TradingView-style dashboard + Ask RAIS
```

Design notes:
- **One verification surface for both paths.** Whether a row came from Excel inference or a typed form, it lands in the same editable "schema verify" view before commit. Excel's value is the inferred mapping is *pre-filled*; direct entry starts blank. Either way the human confirms, and can leave comments that travel with the data.
- **"Add field" = registry extension, not a schema hack.** Adding a field maps to adding a stage/defect column in the client registry (D1 §4) with an `effectiveFrom` date — so historical rows stay valid and the new column appears going forward. This is the same drift mechanism the real data already forced.
- **AI clarification is just Findings, fired early.** Point-in-time checks (rejection > checked, negative, % off own history) and across-collection checks (daily spike vs mean, stage flatlines) are D2 rules (V-001/V-004/V-009-style) run at entry/ingest time; each unresolved one becomes a clarification prompt (D3 card). No separate "anomaly AI" to build.
- **Comments are typed annotations.** Reuse D1 `Annotation` / D3 adjudication records (author `steward`/`gm`, free text). A comment on a schema row is an annotation targeting that provenance; it's what §4's chat surfaces later.

---

## 4. UI direction (supersedes the dark/IBM-Plex specs)

- **Target look:** TradingView-inspired, per `moid-gm-overview-mockup-1.html` — period segment (D/W/M/FY), context pills (Period/Line/Stage), KPI strip, main "FBC Quality Rejection Rate %" trend, "Stage Watchlist" (select-to-focus), "Rejections by Stage" volume bars, "Top Defect Categories (Pareto)", and a "Data Quality & Process Reconciliation Alerts" card. Not a pixel clone — finetune with modern-UI cues (smooth transitions, pillbox cards, clean buttons).
- **Light AND dark mode both required.** (The mockup is dark; we must support both.)
- This **overrides** the contradictory typography/theme in `rais-PRD.md` / `disposafe-prd-exhaustive.md` (Newsreader + IBM Plex, dark-only) and the retired teal/dark `docs/trash/rais-design-language.md`. Reconcile against the locked editorial tokens in `AGENTS.md` (CSS-variable theming so the toggle works); where the TradingView mockup and the editorial system differ, **the mockup wins for layout, the editorial tokens win for color/type**, and both must theme via CSS vars.

---

## 5. Keep / Defer / Reject — the exhaustive docs, feature by feature

| Feature (source doc) | Call | Reason / evidence |
|---|---|---|
| Messy-Excel → provenance-backed events; doubt-as-feature; adjudication→rulebook | **KEEP** | Core thesis; matches D1–D3; in every doc. |
| Per-stage rejection %, daily + monthly + yearly | **KEEP (now the core)** | This *is* the GM's own `REJECTION ANALYSIS` format. |
| Pareto of defect categories | **KEEP** | In his files + mockup-1; the "8 Wastes → Defects" wedge. |
| Provenance bridge / verify beam / trust badges | **KEEP** | Exists in code; product identity; now reached via chat (§4 of decisions). |
| In-dashboard data entry + Add field | **KEEP (newly primary)** | Decision 1. |
| AI clarification on bad data | **KEEP** | Decision 1; implemented as early-fired Findings, not new tech. |
| Human-verifiable inferred schema + comments | **KEEP** | Decision 1. |
| 4-page monthly report export (minus sign-off page) | **KEEP** | Decision 3; `moid-monthly-report-mockup.html`. |
| ALCOA+ framing / audit traceability | **KEEP** | Medical-device plant; our immutable ledger already delivers it. |
| One-click audit ZIP (CSV + SHA-256 manifest) | **KEEP (light)** | Buildable from data we have; strong regulatory hook. |
| Explain toggle / L0–L1–L2 layered depth | **KEEP** | Good dual-audience UX (GM + engineer). |
| COPQ in rupees | **DEFER (now top-blocked)** | High value, blocked on a client-confirmed ₹/unit. The PA review's "quantify impact" (§7 point 5) depends on this — so getting one ₹/unit is now the **#1 client follow-up**. Add as config the moment the GM gives a number. |
| 12-stage production line, RTY, FPY-across-line | **DEFER/REJECT for v1** | Decision 2 — production is out of scope; his files don't track it. |
| OEE tracker (availability/performance) | **DEFER (V3)** | No shift-time/downtime data exists in any file. |
| Correlation engine (machine/operator/batch/shift) | **DEFER (V2)** | None of these fields exist in the source data; would need new capture. |
| WIP/VSM buffer & carrying-cost tracking | **DEFER (V2+)** | No WIP data in any file. |
| SPC control charts (UCL/LCL/Nelson) | **DEFER (V2)** | Reasonable on rejection % later; not v1-critical. |
| Company Brain / pgvector CAPA semantic memory / LUCID | **DEFER (vision)** | v3 narrative; don't let it shape v1 schema beyond the rulebook tables we already have. |
| Local-LLM / air-gapped + scrubbing proxy | **DEFER (deployment-time)** | Real for this client, but a deployment decision; current repo uses AI Gateway/OpenRouter. Confirm on-prem vs cloud with client (open Q). |
| `CHECK (qty_checked = qty_accepted + qty_hold + qty_rejected)` DB constraint | **REJECT** | Directly contradicts doubt-as-feature: real rows routinely don't balance; that must be a **Finding**, never an insert-time rejection. |
| Dark-only theme + Newsreader/IBM Plex | **REJECT** | Superseded by §4 (TradingView layout + editorial tokens + light/dark). |
| The "negative rejections / 33.9% May-18 / blank Chlorination" pathology list | **REJECT as canonical** | Not found in the actual files; use the **real** errors instead (shopfloor omitted-column total, yearly summed-percentages, VISUAL stated-REJ ≠ sum-of-reasons). |
| Conflicting stage lists across docs (12 vs 12' vs 23) | **REJECT; use one** | v1 stage set = the 4 rejection stages from his files: Visual, Balloon Inspection, Valve Integrity, Final. |

---

## 6. Impact on the existing D1–D6 artifacts

- **D1 (contract):** still valid — `Inspection`/`Rejection` events and the registry cover the rejection-only model directly. The 6-disposition richness stays in the schema but v1 only populates `rejected` (+ `checked` via `Production`-as-checked-count). Stage registry narrows to the 4 rejection stages for v1; keep `effectiveFrom` for "Add field" drift.
- **D2 (rules):** rejection-relevant rules stay front-and-center (V-002 totals, V-003 %, V-004 stated-vs-reasons, V-005 summed-%, V-006 omitted column, V-007 defect aliases, V-009 date/anomaly, V-011 errors). Cross-production-stage conservation (V-001 full, V-008 handoff) **deprioritized** to V2 with the production model.
- **D3 (findings/rulebook):** unchanged and now also powers the **live clarification** at entry time and the **chat comments** surfacing.
- **D4 (architecture):** add the **direct-entry path** and the **schema-verify-with-comments** surface as first-class modules; otherwise intact.
- **D5 (UX):** re-skin to the TradingView mockup + light/dark; move Data Health/provenance into **Ask RAIS chat**; keep the Observations & Diagnostics panel (already corrected); the steward finding-cards become the live-clarification UI.
- **D6 (report):** template = the 4-page mockup **minus** the sign-off/data-health page; keep print trust marks.

## 7. PA dashboard review outcomes (2026-06-17)

The PA reviewed the **current live** RAIS-pro dashboard (`MO!D/RAIS DASHBOARD ANALYSIS REPORT.pdf`). Headline: *"it currently feels more like a digital report than an executive decision-making dashboard."* This is precisely the gap the redesign targets, so the review is validation + concrete refinement, not a pivot. Mapping and resolutions:

| PA point (priority) | Resolution |
|---|---|
| 1. AI executive insights at top, plain language **(HIGH)** | Already core (Observations & Diagnostics panel, kept). Confirms it sits **at the top**, above the fold. |
| 2. Rejection Rate = primary KPI; **trend vs previous period**; color status **(HIGH)** | Matches rejection-only + "rejection_rate leads." **ADD:** period-over-period delta indicator (▲/▼ vs prior month, colored) on every KPI — cheap, we already compute monthly trend. |
| 3. Reduce hero/header height **(HIGH)** | Resolved by re-skinning to the dense TradingView `mockup-1`; the tall "Executive Briefing" hero is removed. |
| 4. Insight caption under each chart | **ADD:** a one-line plain-language takeaway beneath *each* visualization (LLM writes the prose from computed numbers; never the number). Extends the single panel to per-chart. |
| 5. Recommended actions + **quantify impact** | "What to do about it" recommendations stay. Quantified ₹ impact **stays blocked on a client ₹/unit** (open-Q 1) — this review makes that the top client follow-up. |
| 6. Green/amber/red visual hierarchy | **Reconcile, don't reject:** add semantic **status tokens** (`--status-good/warn/bad`) used only for state/threshold signaling, distinct from the brand burnt-orange accent. Legitimate within the editorial system; keeps the Tweaks panel working (CSS vars). |
| 7. Trust scorecard with confidence scores | **ADD a dashboard trust scorecard** (glanceable: "% verified · checks passed · open questions · confidence"), sourced from D3 lineage states. **This amends Decision 3:** provenance is *both* a dashboard summary scorecard **and** per-number drill-down in Ask RAIS chat (View Source) — not chat-only. |

Net new build items from this review: (a) KPI period-delta indicators, (b) per-chart insight captions, (c) dashboard trust scorecard, (d) semantic status-color tokens. All fold into the dashboard re-skin; none require new engine work (they read existing analytics + D3 lineage).

## 8. Open questions (for the next client touchpoint)

1. **(Top priority)** One real **₹/unit** (and rework cost, if any) to unlock COPQ — without it the PA's highest-value "quantify impact" ask (§7.5) cannot render.
2. **On-prem/air-gapped vs cloud** deployment → decides local-LLM vs AI Gateway.
3. **Hindi labels** scope for direct-entry forms (client is Delhi; Hindi/English).
4. Confirm the 4 rejection stages are the complete v1 set, and whether "Final" = the assembly-file Final or a separate sheet.
5. Does the GM want the **Total Rejection %** computed his way (sum of stage %s, which we've flagged as mathematically loose) or the consistent count-based figure, shown with an endnote? (V-005 territory — a GM-authority call.)
