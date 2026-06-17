# D5 — Two-Role UX Spec (Steward + GM)

**Status:** v1.0 (2026-06-11) · **Depends on:** D3, D4 · **Gate:** ⛔ HUMAN GATE 2 — review with Showmik before B3/B4 UI work.
**Design system:** the locked editorial direction per `AGENTS.md` — warm paper `--paper`, near-black `--ink`, burnt-orange `--accent`, Fraunces display / Inter Tight UI / JetBrains Mono numbers, flat/outlined/shadowed cards, CSS-variable theming via TweaksContext. (`docs/rais-design-language.md` describes the retired dark/teal system — treat as historical; flagged for archival.)
**Language:** finding cards default English; Tamil toggle is an open client question (D6 input list) — copy is centralized so a string table can be added without redesign.

---

## 1. Information architecture

```
/                     Upload (existing UploadZone, reused)
/session/[id]/health  STEWARD: Data Health queue   ← NEW (B3); default landing after ingest
/session/[id]         GM: decision dashboard        (existing Dashboard.tsx, ported B4)
/session/[id]/report  GM-format printable report    ← NEW (B5, per D6)
```
Routing rule: after an upload, if open findings > 0 the app lands on `/health` ("clear the questions first"); the GM dashboard is always reachable but shows the verification banner (§3.1).

## 2. Steward flow (PA)

### 2.1 Upload → ingestion progress
Reuse `UploadZone` + `ProcessingLoader`. Progress copy changes to pipeline-truthful steps: "Reading workbooks → Understanding tables → Recording events → Checking consistency → Preparing questions". Each step maps to D4 sequence steps 1–6. **Data source:** `/api/ingest` response manifest.

### 2.2 Data Health queue (`/health`)
Masthead (sticky, like dashboard): *"Data Health — {client} {period}"*, completion gate figure: **"87% of rows verified · 6 questions pending · 2 for the GM"** (computed: verified-lineage events / total observation events; open findings count; `requiresGmAuthority` count). **Data sources:** `FindingStore.list()`, `MetricLineage` rollup.

Queue body = **finding cards**, sorted: `critical` first, then magnitude desc; `info` collapsed under "Minor notes (n)". Parked (`unsure`) cards live in a separate strip at the bottom.

### 2.3 Finding card anatomy
```
┌─────────────────────────────────────────────────────────────┐
│ V-006 · CRITICAL · SHOPFLOOR · APRIL 25            [badge]  │  label row, mono
│ The April grand total skips the “Missing Formers” column.   │  question, Fraunces, ~20px
│ Including its 76 trolleys gives 1,626 rejected — the sheet  │  detail, Inter Tight
│ says 1,550.                                                 │
│ ┌───────────── evidence split panel (§4) ─────────────────┐ │
│ │ left: sheet excerpt w/ cells K30, I30 highlighted        │ │
│ │ right: computed comparison table (stated vs recomputed)  │ │
│ └──────────────────────────────────────────────────────────┘ │
│ Possible explanations:                                      │
│  • A column was added after the total formula was written.  │  hypotheses (≤3)
│  • Missing Formers may be deliberately excluded by policy.  │
│ [ It's a mistake ]  [ It's intentional… ]  [ Not sure ]     │  three buttons
│   intentional → mandatory “why” textarea (D3 §2)            │
│   GM-authority verdicts show “→ goes to {GM} to confirm”    │
└─────────────────────────────────────────────────────────────┘
```
**Data sources per card:** `Finding` (question, detail, hypotheses, severity), `FindingEvidence` (cells + provenance snapshot → split panel), escalation flag.

### 2.4 Completion gate
When open count hits 0: full-width card *"All questions answered — the dashboard is fully verified."* CTA → GM dashboard. If parked `unsure` findings exist: *"3 parked questions keep their metrics marked unresolved."*

### 2.5 Walkthroughs for the three real errors (exit criterion)
1. **SHOPFLOOR K30 (V-006)** — card as in §2.3. Steward taps *mistake* → settles (escalation only on *intentional*). Lineage: shopfloor monthly totals → `verified` (analytics compute 1,626 independently; the wrong claim never fed them).
2. **ASSEMBLY YEARLY Q19 (V-005)** — question: *"The yearly report adds three percentages together (5.89 + 0.63 + 2.74 = 9.25%). Computed from the underlying counts, total rejection is 11.38%. Which should your report show?"* *Intentional* routes to GM (it defines his report's arithmetic). GM card carries the steward's recommendation inline.
3. **VISUAL APRIL R34 (V-004)** — question: *"On 30 Apr, 1,708 pieces were rejected but the defect columns only account for 1,544. Where should the missing 164 go?"* Hypotheses: missed tally / uncategorised-below-threshold / inconsistent Others. *Intentional* ("small defects aren't categorised") → LLM drafts rulebook rule scoped `V-004 · VISUAL · Δ < 2% of checked` → steward activates → next month's identical pattern auto-adjudicates.

## 3. GM flow

### 3.1 Decision dashboard (`/session/[id]`, ported Dashboard.tsx)
- **Verification banner** (replaces nothing; sits under masthead): *"Verified to 94% · 2 questions await your call"* → links to GM queue. Hidden at 100%/0.
- **Trust badge on every metric** (KPI cards, chart headers, table columns): a small mark — `verified` (solid ink check), `assumed` (outlined tilde, hover shows the rulebook rationale), `unresolved` (accent ring, hover shows the open question). Click → **lineage trail**: side panel listing contributing events → click event → beam to source cells (existing VerifyPanel/BeamOverlay, retargeted to `Provenance.cells`). **Data sources:** `analytics/*` + `MetricLineage` per metric.
- **Observations & Diagnostics panel — KEPT and upgraded (the current dashboard's centerpiece, `InsightSlide`/narrative).** The two-column "What the data is telling you" (observations) → "What to do about it" (recommendations) stays as the GM's primary reading surface. B4 changes are additive, not a replacement:
  - Every **numeric token inside an observation** (the inline mono chips like `5.88%`, `41,621`, `82,881` in the screenshot) gets the same **trust badge + click-to-lineage** as KPI numbers. The observation *"top rejection reason is BM with 41,621 occurrences"* is now clickable straight to the cells that produced 41,621.
  - Observations are generated **only from adjudicated canonical events** (the narrative LLM cites event ids; it never re-derives numbers — pipeline invariant #1). An observation that depends on an `unresolved`/`assumed` metric inherits that badge, so the GM can see which insights are still provisional.
  - Recommendations keep their checklist + horizon ("Today / This wk / Next wk / 30 days"). Where a recommendation targets a defect (e.g. "investigate BM"), it deep-links to the relevant Pareto bar / finding.
- **Pareto chart — ADDED alongside, not replacing the above** (existing ParetoChart, fed by `analytics/pareto.ts` over adjudicated events only). Defect names from the registry's canonical labels — never raw misspellings. It complements observation #2 ("top rejection reason is BM…") by showing the full ranked distribution; clicking a bar filters the observations/recommendations to that defect.
- **Exceptions strip:** top 3 findings by magnitude this period, read-only (adjudication is the steward's job; GM sees state). This is a *small status row*, distinct from the Observations panel above — it surfaces open data-quality questions, whereas Observations surface analytical insight.
- **Learning indicator:** *"14 questions on first upload → 3 this month"* (`questionsAsked(ingestion)` series + rule-applications count). This is the moat made visible.

> **Section ordering on the GM dashboard (top → bottom):** verification banner → KPI row → **Observations & Diagnostics (primary)** → Pareto → trend charts → exceptions strip → learning indicator → chat. Nothing from the current dashboard is dropped; the redesign *adds* trust/lineage to what's already insightful.

### 3.2 GM authority queue
Same card anatomy as steward queue, filtered to `requiresGmAuthority`, with the steward's recommendation (if any) pre-rendered as a quote. Two-item typical depth; designed as a modal-free single column — the GM should clear it in under a minute.

### 3.3 Chat
Existing ChatPanel; B4 change: every numeric answer appends "· from {n} cells" → click = lineage panel (same component as badge click).

## 4. Evidence split panel (shared component; spec for the B3 build)

Derived from `VerifyPanel` with the fixes from commit 9834817 carried over and verified:
- **Independent scrolling:** left (sheet excerpt) and right (computed comparison / event list) are separate scroll containers; `overscroll-behavior: contain` on both; the page behind does not scroll while the panel is open.
- **Beam clipping:** beams render in an absolutely-positioned overlay scoped to the panel, recomputed on either pane's `scroll` and on `resize` (existing `getBoundingClientRect` approach); a beam whose endpoint scrolls out of view clips at the pane edge (mask), never draws across the masthead. **Remaining case to verify in B3** (not covered by 9834817): endpoint *behind a sticky header inside the pane* — beam must fade under the sticky element, test with the dashboard masthead pinned.
- Sheet excerpt = read-only render of ±6 rows around the evidence cells from the provenance snapshot (no live workbook re-parse), evidence cells filled `--accent` at 12% with mono values.
- Mobile/narrow: panes stack vertically; beams disabled below 720px (tap a cell chip instead).

## 5. Component inventory for B3/B4

| Component | Source | Status |
|---|---|---|
| `FindingCard` | new | B3 |
| `EvidenceSplitPanel` | port of VerifyPanel | B3 |
| `TrustBadge` + `LineagePanel` | new | B4 |
| `VerificationBanner`, `LearningIndicator` | new | B4 |
| `GmQueue` | FindingCard variant | B3 |
| `InsightSlide` / Observations & Diagnostics panel | existing, **kept** — data-port + per-token trust badges | B4 |
| Dashboard, KPICard, ParetoChart, ChatPanel | existing, data-port | B4 |

Every new component consumes CSS variables only (no new theme utility classes), per AGENTS.md hard rules.
