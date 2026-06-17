# MO!D — Master Specification (single source of truth)

**Status:** FINAL for build · v2 · 2026-06-17
**This is the ONE file.** Everything about this app lives here — scope, decisions, data model, ingestion, validation, findings, cost, analytics, chat, export, architecture, **security/deployment**, and the full **UI/UX design** for building in Antigravity. The only other build artifacts are the two machine-readable schema files referenced in §4 ([`d1-contract.ts`](d1-contract.ts), [`d3-schemas.ts`](d3-schemas.ts)) — those are code, not separate specs.
**Ownership:** logic / architecture / code / security = the engineering side (implemented from §1–§12, §15). UI = built in Antigravity from §13.

---

## Table of contents
1. What MO!D is · 2. Principles · 3. Decision log (what's in / deferred / rejected) · 4. Data model · 5. Ingestion (dual path) · 6. Validation rules → Findings · 7. Findings / adjudication / rulebook · 8. Cost model (optional) · 9. Analytics, chat & provenance · 10. Export · 11. Architecture & storage · 12. Security, deployment & data-egress · 13. UI/UX design spec · 14. Build order & status · 15. Open questions

---

## 1. What MO!D is

MO!D turns Disposafe's existing **rejection** paperwork (messy Excel + manual entry) into trustworthy, traceable, optionally money-denominated rejection intelligence. It ingests data two ways, infers and lets a human verify a clean schema, records everything as an **immutable, provenance-tagged event ledger**, runs **deterministic** rejection analytics, raises **Findings** when data doesn't make sense (doubt is a feature), learns per-client **rules** from how humans resolve findings, and presents it in a TradingView-style decision dashboard + an exportable monthly report. **The model never does arithmetic; source data is read-only; every number traces to its cell or entry.**

Client: **Disposafe Health and Life Care Limited**, Foley Balloon Catheter (FBC) plant, Ballabgarh/Delhi NCR. Buyer: the **GM** (lean-minded). Regulated: ISO 13485 + CDSCO MDR-2017; data integrity = ALCOA+ / 21 CFR Part 11.

## 2. Principles (non-negotiable)

1. **LLM = semantics only** (classify columns, draft narrative, draft rules). **All numbers from deterministic code.**
2. **Source data is read-only.** Disagreements become **Findings**, never silent corrections, and never insert-time rejection of "bad" rows.
3. **Every number is traceable** to a source cell (Excel) or a direct-entry record.
4. **Append-only.** Events/findings/adjudications are immutable; corrections *supersede*, never overwrite.
5. **Rejection-only for v1** (§3).
6. **Safe by construction** — proprietary data never leaves the LAN; the LLM never receives raw counts/identifiers (§12).

## 3. Decision log — in / deferred / rejected

Requirements evolved across several earlier doc generations (archived in `docs/trash/`). This is the settled position with the evidence.

**Three decisions made late (after the first design pass):**
- **D-1 Dual ingestion.** In-dashboard direct-entry forms are now first-class (GM approved direct collection); the Excel upload pipeline is **kept** (demo loads their real files). Both emit the same events. Inferred schema from messy Excel is **human-displayed, editable, verifiable with per-row comments** (Antigravity-style). Bad data triggers AI **clarification** = validation Findings fired early.
- **D-2 Rejections only.** GM said production is smooth — skip it. His own `REJECTION ANALYSIS` files prove the model: per inspection **stage**, per day, `CHECKED → REJECTION → %`, rolled to **Total Rejection %**, daily/monthly/fiscal-year.
- **D-3 App flow.** Dual ingest → map own schema (editable/verifiable/exportable) → dashboard → all traceable for daily monitoring + audit. Export = the 3-page monthly report. Data-health & "where did this come from" live in **Ask RAIS chat** (with View Source), plus a glanceable dashboard trust scorecard.

**Kept:** messy-Excel→provenance events; doubt-as-feature; adjudication→rulebook; per-stage rejection % (daily/monthly/yearly); defect Pareto; verify beam / trust badges; dual ingestion + Add-field; AI clarification; human-verifiable schema + comments; 3-page report export; ALCOA+ traceability; one-click audit ZIP; Explain toggle + L0/L1/L2 layered depth; KPI period-deltas; per-chart insight captions; dashboard trust scorecard; semantic status colors.

**Deferred (locked modules in the UI — visible roadmap, not built):** 12-stage production line / RTY / FPY-across-line; OEE; correlation engine (machine/operator/batch/shift); WIP/VSM; SPC control charts; Company-Brain / pgvector CAPA memory / LUCID. None has supporting data in the current files.

**Rejected:** the `CHECK(qty_checked = accepted+hold+rejected)` DB constraint (it would reject the messy rows that must become Findings); dark-only Newsreader/IBM-Plex theme (superseded by §13); the hypothetical pathology list (negative rejections / "33.9% May-18" / blank Chlorination — not in the real files; use the real errors in §6); conflicting 12-vs-23 stage lists (use the 4 rejection stages in §4).

## 4. Data model (canonical events)

Machine-readable: [`d1-contract.ts`](d1-contract.ts) (events, registries, cost), [`d3-schemas.ts`](d3-schemas.ts) (findings/rulebook). The implemented copies live at `src/lib/contract/d1.ts` + `d3.ts`.

**Scope universe.** Stages (the only four): `visual` (P17), `balloon` (P18), `valve-integrity` (P20), `final` (P24). Defects: registry canonical set + enumerated alias maps incl. real misspellings (`THIN SPOD`→THSP, `BALLOON BRUST`→BLBR, `STRUCK BALLOON`→STBL, …); unknown label → Finding (V-007), never invented. Fiscal year April–March.

**Events** (each carries the envelope below):
- **`production`** — quantity *checked* at a stage on a day (the denominator). `{stageId, quantity, unit, batchNo?, size?}`.
- **`inspection`** (`disposition=rejected`) — the stated stage reject total.
- **`rejection`** — rejected qty attributed to a defect. `{stageId, defectCode|null, defectCodeRaw, quantity, …}`.
- **`aggregate-claim`** — any value the sheet *computed* (totals, %s, cross-sheet/file pulls). **Never an analytics input** — only fuel for validation. Holds `claimKind`, `statedValue` (incl. error strings like `#DIV/0!`), `formulaText`, `cachedValue`.
- **`annotation`** — human/system notes incl. schema-verify comments and adjudication verdicts.
- **`correction`** — supersedes a prior event (only via confirmed adjudication).
- (`carryover`, `dispatch` exist in the schema; unused in v1.)

**Envelope (all events):** `eventId` (content hash → idempotent re-ingest), `schemaVersion`, `ingestionId`, `occurredOn` (Period `{kind, start, end}`), `provenance`, `confidence` (`exact|heuristic|llm|external-cached`, last capped ≤0.5), `extractedBy` (`heuristic|llm:<model>|direct-entry`), `recordedAt`, `supersededBy`.

**Provenance:** `file, fileHash, sheet, tableId, cells[], headerPath[], rowLabel, formulaText, cachedValue, externalRef` — or a direct-entry ref. Powers the verify beam and View Source.

**Registries (per client, versioned):** stages (with `effectiveFrom` for drift / "Add field"), defects (canonical + aliases), and optional **CostConfig** (§8).

**Identity hashing:** `eventId = hash(eventType, occurredOn, provenance, payload)` — excludes envelope noise (recordedAt/ingestionId/etc.) so the same observation re-ingests to the same id (idempotent). `findingId = hash(ruleId, subtype, sorted evidence eventIds)` — re-runs re-attach, no duplicate questions.

## 5. Ingestion — dual path, one verification surface

Both paths emit the same canonical events via the shared `emitStageDay` transform (deterministic — wraps already-read values in events; never invents numbers).

**(a) Excel pipeline (kept — demo depends on it):** `reader` (xlsx → grid + formulas + merges) → `classify` (heuristic `CandidateSheetGraph` first; LLM assist only when heuristic confidence < 0.7, then `reconcileGraph` + sanity gate so a hallucinated graph is discarded) → `emit` (reads values from the cells the graph identified; the LLM never transcribes numbers).

**(b) Direct entry (now primary):** forms generated from the registry — per stage: date, quantity checked, rejection qty, per-defect breakdown. **"Add field" button** appends a stage/defect column to the registry with an `effectiveFrom` date (history stays valid). Emits `extractedBy: "direct-entry"`.

**One verification surface:** both land in an editable **schema-verify view** before commit. Excel pre-fills the inferred mapping; direct entry starts blank. The human confirms each mapping/row and can leave **comments** (typed annotations) correcting the AI. Comments persist and resurface in chat (§9). Confirmed schema is **exportable** (JSON/CSV).

## 6. Validation engine → Findings

Pure functions over the event store; the LLM only attaches hypothesis prose to an already-fired Finding. The same checks run **live at entry time** (the "company brain asks for clarification" — asking, not accusing) and in batch.

Rules: **V-002** sum-claim recompute · **V-003** %-claim recompute · **V-004** stated reject vs Σ defect reasons · **V-005** percentage-of-percentages · **V-006** omitted/extra total-formula term · **V-007** defect-code below confidence · **V-009** date/period anomalies + spikes · **V-010** near-duplicate / edited-cell re-ingest · **V-011** error values & unverifiable externals · **V-013** unknown rows / impossible counts (negatives, rejected > checked).

**The three real errors found in their files (acceptance fixtures, the demo ammunition):** shopfloor grand total omits a column (V-006); yearly Total = sum of stage %s (V-005); VISUAL Apr-30 stated reject 1708 vs reasons summing 1544 (V-004). Also real: the GM's yearly file shows Oct with all four stage %s identical (copy-paste error → V-009/V-010).

Deprioritized to the (deferred) production phase: full stage-conservation V-001, stage-handoff V-008.

## 7. Findings → adjudication → rulebook (the learning loop / moat)

- **Finding** (immutable; content-hashed id → re-attach): ruleId, severity (`critical|warning|info`), plain-language `question` + `detail`, `evidence` (event ids + cells + stated vs computed + magnitude), ≤3 `hypotheses` (`mistake|intentional-practice|unknown`), `requiresGmAuthority`.
- **Adjudication** (a specialized annotation; never edits source): verdict `mistake|intentional|unsure`, mandatory `why` for intentional, author `steward|gm`, `isRecommendation` (a steward recommendation doesn't settle a GM-authority finding), optional spawned `Correction`.
- **RulebookRule:** predicate (ruleId + scope on file-family/sheet/stage/defect/period [+ structural param e.g. omitted column]) + action (`auto-adjudicate` verdict | `suppress`) + human `rationale` + `bornFromAdjudicationIds`. **LLM drafts, human activates; drafts never act.** Applied after rules fire, before the queue renders → matched findings become `rule-compiled` (no card). Drives the visible "questions are dropping" metric.
- **Lineage states** (drive dashboard trust): `verified` / `assumed` (rulebook auto-adjudication or external-cached/user-entered cost) / `unresolved` (open or `unsure`). A metric's badge = worst contributor.
- **Escalation:** V-005 / V-006 `intentional` verdicts (they change the GM's own reporting math) require GM authority; most others are steward-settleable.

## 8. Cost model (optional, user-supplied)

`CostConfig` is **opt-in input**, not a precondition. The user enters (wherever relevant in the UI) a flat `finishedUnitCostInr` and/or `perStage` ₹/unit, optional `reworkCostPerUnitInr`; a toggle turns cost on.
- Enabled → deterministic `rejectionCost(stage, period) = Σ rejectedQty × costPerUnit(stage)`; surfaces as a "₹ lost to rejections" KPI, per-stage cost, and a report loss column.
- Disabled/absent → all cost UI **hides**; nothing invented; any cost figure's lineage is `assumed` (user-entered constant), labeled as such.

This unblocks COPQ immediately for anyone who fills the field — no dependency on a single client number.

## 9. Analytics, chat & provenance

- **Analytics** (pure functions over *effective adjudicated* events): per-stage rejection % (daily/monthly/FY), Total Rejection %, rejection volume by stage, **Pareto** of defect categories (canonical labels), period-over-period deltas, optional ₹ cost. Plus a narrative pass (LLM writes prose from computed numbers — exec insights, per-chart captions, recommendations).
- **Ask RAIS chat** = where provenance & data-health live. "Where did this come from?" → searches the event store, answers, and the response carries a **"View Source"** button → verify-beam to the exact file/sheet/cell or direct-entry record, **and** shows any editing comments / adjudication notes about that data.
- **Dashboard trust scorecard** = the glanceable complement (% verified · checks passed · open questions · confidence), from lineage states.

## 10. Export

3-page A4 monthly report (the sign-off/data-health page from the old mockup is dropped — that capability is in chat): **P1** Monthly Quality & Rejection Report (letterhead, doc-control strip, exec summary, daily Total Rejection % chart, stage status grid); **P2** Stage-wise Loss Analysis (per-stage bars, consolidated register table, + ₹ loss column only if cost enabled); **P3** Defect & Variation Pareto deep-dive + weekly trend. Inline print trust marks `✓`/`≈`/`?` + footer legend + endnote table. Browser print-to-PDF (no server PDF dep); a print writes a system annotation (audit trail). Separate **audit ZIP** (CSVs + SHA-256 `manifest.json`).

## 11. Architecture & storage

```
src/lib/contract/    d1.ts d3.ts hash.ts        ← schemas + content-hash ids
src/lib/registry/    disposafe.ts               ← stages/defects/costConfig, effectiveFrom
src/lib/ingest/      reader · classify · emit · ingest   (Excel; heuristic+LLM assist)
src/lib/entry/       form-model · validate-entry         (direct entry + live clarification)
src/lib/store/       EventStore · FindingStore · RulebookStore  (memory adapter + Supabase adapter)
src/lib/validate/    rules/v00x.ts · engine.ts
src/lib/rulebook/    draft.ts (LLM) · apply.ts
src/lib/analytics/   rejection.ts · pareto.ts · cost.ts · lineage.ts
src/lib/security/    scrubber.ts · egress-log.ts          (§12)
src/lib/ai.ts        tryModels + egress guard, local-LLM default (§12)
src/app/api/         ingest · entry · findings · rulebook · chat · export/audit-pack
```
- **Reuse from current code:** `parser.ts` internals → `ingest/reader`; `metrics.inferSheetGraph` → `classify` heuristic; `dashboard-builder.reconcileGraph`/`metricsSane` → sanity gate; `ai.ts tryModels`; verify beam / VerifyPanel → chat View Source + scorecard drill-down. **Delete:** `merger.ts` (the ledger is the merge).
- **Storage** (Postgres on-prem; self-host Supabase keeps existing `@supabase/supabase-js` code, or plain Postgres behind the same `store/` interface): append-only `ingestions, raw_files, events, findings, adjudications, rulebook_rules, rule_applications, registry, cost_config`. **No** balance CHECK constraint (→ Finding). UPDATE/DELETE revoked on event/finding tables; `superseded_by` set only via the adjudication path.
- **Failure posture:** any LLM failure degrades to heuristics (classify) or absence (rule draft); ingest→store→validate→adjudicate is deterministic and must not throw on any real workbook.

## 12. Security, deployment & data-egress

**Client constraints:** IP-sensitive medical-device plant; DNS sinkholes block public sites; outbound internet denied by default; must protect compounding formulas, true rates/volumes, operator/machine IDs, SKU economics, batch numbers. They *can* grant a **narrow firewall exception** — only if we prove no leakage.

**Deployment decision — self-hosted on-prem WEB APP** (not cloud SaaS, not per-PC desktop):
- Runs on one local box inside the LAN; browsers reach `https://moid.local` over wired LAN (factory-CA TLS). No public-internet dependency, so DNS blocks/jammers are irrelevant.
- Not cloud SaaS (LAN can't reach it; data egress is the fear). Not Electron/Tauri desktop (product is multi-user with a shared ledger; a kiosk shortcut to the LAN URL is fine as an "app icon").
- Distribution: a Docker image (or `next build` standalone + Postgres) IT runs locally; offline-installable updates.

**LLM data-egress contract (the heart):** the LLM is a structure/prose assistant, never a data processor.
- **It is used for two seams only:** (1) classify column headers/structure → roles; (2) write narrative from already-computed, de-identified figures.
- **May ever leave the box:** column header strings + table shape (client tokens pseudonymized); de-identified aggregates (percentages, ranks, trends); generic defect category names.
- **Must NEVER leave:** raw counts/volumes, batch numbers, operator/machine IDs, SKU codes/economics, ₹ figures, file names/hashes, raw workbook bytes.
- **Enforced two ways:** **structurally** (compute and LLM layers don't share inputs — no code path puts a raw quantity into a prompt) and via a **fail-closed scrubber gate** (pseudonymizes; reversible map kept local; blocks the call if any deny-listed pattern survives).

**Two operating modes (deploy-time flag `MOID_LLM_MODE`):**
- **Mode A — fully local (default, zero egress):** LLM via **Ollama/vLLM** on the LAN. No packet leaves. Works today with no firewall change — this is what we demo/ship first.
- **Mode B — scrubbed cloud fallback (opt-in, needs the exception):** outbound LLM calls go **only** through the **egress guard** to a **single whitelisted host**, carrying only scrubbed allow-listed content, with zero-retention/no-training flags. Everything else stays local in both modes.

**Egress guard (single chokepoint; no other code calls an LLM `fetch`):** (1) one-host allowlist, fail-closed; (2) scrubber applies pseudonymization and rejects if anything sensitive survives; (3) **outbound audit log** — every call writes an immutable local record of the exact scrubbed payload + hash; (4) **dry-run preview** — show IT exactly what *would* be sent without sending; (5) no-retention headers on every Mode-B call.

**Compliance mapping (ALCOA+ / 21 CFR Part 11):** Original = raw workbook bytes stored unmodified; Attributable = user+timestamp on every entry/adjudication; Contemporaneous = server-stamped `recordedAt`; Accurate/Legible = deterministic recompute, discrepancies→Findings; Integrity = append-only ledger, supersede-don't-edit, row+file hashes, audit ZIP; Data residency = all proprietary data on the LAN (Mode A always; Mode B only scrubbed aggregates leave); Access trail = local audit log incl. every outbound payload.

**"Get-unblocked" dossier for their IT/security (turns the exception into an easy yes):** data-flow diagram (LAN-only default; Mode-B = single host, scrubbed); allowlist profile (one host, 443, deny-all-else); **sample scrubbed payloads** from dry-run (literal bytes: headers + percentages + `[ID-n]`, zero raw data); the deny-list + fail-closed guarantee; an outbound audit-log sample; provider zero-retention/no-training evidence; and lead with **Mode A** — "if you grant nothing, it still fully works locally," reframing the exception as an optional upgrade.

**Build tasks:** `src/lib/ai.ts` local-default + route cloud via egress guard; `src/lib/security/scrubber.ts` (pseudonymize + de-tokenize + fail-closed deny-list verifier); `src/lib/security/egress-log.ts` (append-only outbound log + dry-run); prompt builders assert allow-listed inputs only; a **guard test proving no raw quantity/identifier can reach a prompt**; Dockerfile + on-prem run docs.

## 13. UI/UX design spec (build this in Antigravity)

**Principles:** decision-support not a report (insight + "what to do" lead); legible-first (numbers are heroes, tabular, min 14px UI text); L0→L1→L2 layered depth; trust always visible; **light AND dark**, all color via tokens (no hardcoded hex) so the Tweaks panel works.

**Theming.** Identity = editorial (**Fraunces** display/serif, **Inter Tight** UI, **JetBrains Mono** numbers with `tabular-nums`; burnt-orange `--accent` `#C8421C` for brand only). Layout density/feel = **TradingView** (compact cards, segmented controls, pill chips, 150–200ms transitions). Conflict rule: mockup wins layout, editorial wins color/type. Tokens (both themes): `--paper, --surface, --surface-2, --ink, --ink-2, --ink-3, --border, --border-strong, --accent`, semantic **status** tokens `--status-good/warn/bad` (+ `-bg`, used only for thresholds/trend/severity/lineage — never the brand accent), `--chart-1..n`. Theme toggle in topbar, persists, defaults to system; charts/print flip to ink-on-white.
Type scale: KPI hero 26–28px · section 20–22px · card title 14–15px · body 14px · label 11px uppercase tracked · mono table 11–12px.

**Landing / default route — CHANGED from the current app.** The existing RAIS app opens on an Excel-upload page (upload is a blocking gate). **MO!D opens directly on the Dashboard** (`/` → dashboard). Ingestion is no longer a gate — it's a secondary action reached from the rail (Data Entry / Verify) and the topbar **"+"**. Rationale: the GM/steward return daily to *monitor*, not to upload; the live ledger persists between sessions, so the dashboard always has data to show. The old upload-first screen is removed; Excel upload becomes one tab inside the ingestion flow (kept for the demo). **First-run only** (empty ledger, no events yet): the dashboard shell still renders, with a centered empty-state card prompting "Add your first rejection data → Data Entry / Upload Excel." After any data exists, open = populated dashboard, never the upload page again.

**App shell.** Sticky **topbar:** logo · segmented period **D|W|M|FY** · context pills (Period / Line "Foley Balloon Catheter (FBC)" / Stage) · **Explain** toggle · theme toggle · **Export** · **"+"** new ingestion. **Left rail:** Dashboard (default) · Data Entry · Verify/Schema · Report (collapsible to icons). **Ask RAIS** floating button → slide-over chat, everywhere. **Scope is global:** changing period/stage pills re-scopes every screen instantly.

**Dashboard (top→bottom):**
1. **Insight bar (L0):** slim band, 2–4 AI key findings in plain language, each with a verdict chip (`HIGH`/`WATCH`/`OK`, status-colored), clickable to the relevant chart. ~2 lines tall (compact hero).
2. **KPI strip:** **Rejection Rate is the dominant card** (larger, accent top-rule). Each card: hero number, label, **period-over-period delta** (`▲1.8pp`/`▼0.4pp`, colored by good direction — down is good), status dot, trust badge (`✓`/`≈`/`?` → lineage). KPIs: Total Rejection %, worst-stage %, total rejected qty, (if cost enabled) ₹ lost. Cost card hidden when cost off.
3. **Main trend chart** "FBC Quality Rejection Rate %" (per-stage % + Total lines, inline SVG) + **one-line insight caption** below.
4. **Stage watchlist** (select-to-focus rows: %, sparkline, delta, status) → drives the Focus panel; default = worst stage.
5. **Rejections by stage** (horizontal volume bars + caption).
6. **Top defect categories (Pareto)** (bars + cumulative line in `--accent`, 80% marker, canonical labels; click a bar filters the dashboard to that defect).
7. **Observations & Diagnostics panel (KEEP — analytical core):** two columns "What the data is telling you" (numbered observations) → "What to do about it" (recommendations with horizon chip Today/This wk/Next wk/30 days). Every inline number is a trust-badged chip. If cost enabled, recommendations quantify ₹ impact.
8. **Focus panel:** selected stage's trend, top defects, open findings, lineage shortcut.
9. **Trust scorecard:** big % verified + rows (checks passed N/M, sources complete, open questions K, confidence bar) → click opens chat data-health.
10. **Data Quality & Reconciliation Alerts:** list of open Findings (severity-colored), each an inline finding card.
Empty/loading: skeletons; if no data, prompt → Data Entry/Upload.

**Data Entry screen:** registry-driven form (Date, Quantity Checked, Rejection Qty, defect breakdown sub-grid), big touch-friendly inputs (tablet-ok), Hindi sub-labels beside English. **"Add field"** button (label + effective date → registry). **Inline live-clarification chips** as the user types (rejected>checked, negative, defect-sum≠reject, spike) — non-blocking, become Findings, asking-not-accusing. Collapsible optional **Cost** section (off by default).

**Verify / Schema screen:** two-pane independently-scrolling split — left = source (Excel sheet excerpt with mapped cells highlighted `--accent-bg`, or entered rows), right = inferred **mapping table** (source header → role + confidence chip + re-map dropdown). **Per-row comment** affordance (Antigravity-style thread → saved as annotations, resurface in chat; count badge). **Verify beam** from a selected mapping row to its source cell; beams clip at pane edges; below 720px panes stack and beams disable (tap cell chip). Low-confidence rows float to top. Actions: Confirm (commit), Export schema, Re-map, Comment.

**Finding card** (alerts list / focus / entry clarifications): label row (`V-006 · CRITICAL · SHOPFLOOR · APRIL`, status-colored) · question (Fraunces ~18px) · detail · "View evidence" (expands the split panel inline) · ≤3 hypotheses · three buttons **[It's a mistake] [It's intentional…] [Not sure]** (intentional reveals a required note; GM-authority shows "→ goes to GM to confirm"). `unsure` parks it. After enough adjudications, a **rule-draft card** appears: plain-language drafted rule + [Activate]/[Edit]/[Discard] (drafts never act until activated).

**Trust badge + lineage (cross-cutting):** badge beside any number (`✓` quiet / `≈` outlined, hover=rule rationale or "user-entered cost" / `?` status-warn ring, hover=open question; worst-contributor wins). Click → lineage slide-over (contributing events → pick one → verify beam to source cell/entry + comments). Same component the chat "View Source" opens.

**Ask RAIS chat:** slide-over, everywhere. Conversational Q&A over the data; every answer citing a number ends with **"View Source"** → lineage panel (file/sheet/cell or entry record + editing comments/discrepancy notes). Data-health on demand ("is this month trustworthy?" → verified/assumed/unresolved summary + links to findings). Numbers are mono chips with trust badges; answers saveable as insight snippets.

**Explain mode:** topbar toggle; when on, every metric/chart/KPI shows an inline plain-language definition (GM layman + engineer share one screen). Off by default, persists.

**Export/report:** print view at `/report`, chrome hidden, light forced; the 3 pages of §10; print trust marks + endnote table; "PAGE x / 3" footers, repeating thead, `break-inside: avoid`, ~14mm margins; Print button → browser PDF + audit annotation; separate Audit ZIP action.

**Locked/future modules:** render as disabled cards with a one-line promise + "Coming" tag (Production/RTY, OEE, Correlation, WIP/VSM, SPC, CAPA memory) — visible roadmap, zero fake UI.

**Responsive & states:** desktop-first; tablet for Data Entry; below 720px panels stack / beams off / KPI strip scrolls / rail collapses. Every data component has loading (skeleton), empty (prompt), error (inline, never a raw stack), populated. Motion 150–200ms, chart draw-in on first render, respect `prefers-reduced-motion`.

**Component checklist:** Topbar(periodSeg, pills, Explain, theme, Export, +) · LeftRail · InsightBar · KpiCard(delta+status+badge) · TrendChart+Caption · StageWatchlist+WatchRow · VolumeBars · ParetoChart · ObservationsPanel · FocusPanel · TrustScorecard · AlertsList · FindingCard · RuleDraftCard · DataEntryForm+AddFieldControl+CostInputs · SchemaVerifySplit(SourcePane/MappingTable/CommentThread/VerifyBeam) · TrustBadge+LineagePanel · AskRaisPanel+ViewSourceButton · ExplainTooltip · ReportP1/P2/P3+PrintLegend · LockedModuleCard · ThemeToggle. All consume tokens; none hardcode color.

## 14. Build order & status

B1 store + dual ingestion (+ schema-verify + cost) → B-sec security (egress guard + scrubber + local-LLM default) → B2 validation engine + Findings + live clarification (fixture = the 3 real errors) → B3 adjudication + rulebook → B4 analytics + dashboard (§13) → B5 export + audit ZIP → B6 hardening + demo. Golden tests per workbook family; idempotent re-ingest.

**Done so far (branch `moid-v1`):** contract + registry + hash + append-only store (memory adapter); emit core; live-clarification checks. 110 tests green. **Next:** wire the 6 real Excel workbooks → events (golden ingest test) + Supabase adapter; the security egress guard; then B2.

## 15. Open questions (client)

1. A real ₹/unit to seed `CostConfig` defaults (otherwise users self-enter; cost just starts empty).
2. Will they provision a small local GPU box for Mode-A model quality, or do we run a smaller local model / lean on Mode-B? Which single host to allowlist if Mode-B.
3. Hindi label scope for direct-entry forms (Delhi; Hindi/English).
4. Confirm the 4 rejection stages are complete and that "Final" maps to one source.
5. Total Rejection % his way (sum of stage %s) vs consistent count-based, with an endnote (V-005 — GM call).
6. IT/security approver + whether they want the §12 dossier before or at the pilot meeting.
