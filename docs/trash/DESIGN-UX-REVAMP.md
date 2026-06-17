# RAIS Pro — UX & Feature Design Document (for a full UI/UX revamp)

> **Status:** Source-of-truth specification for rebuilding the entire UI from scratch.
> **Audience:** Whoever (or whatever — e.g. an agent in Antigravity driving Gemini 3.5 Flash) rebuilds the interface.
> **Scope of this doc:** *What the product does, why, and how it should feel* — feature by feature, flow by flow, state by state — plus the contracts the new UI must bind to and the principles it must honor. It is deliberately **visual-implementation-agnostic**: the current "editorial newspaper" skin is being retired, but the *jobs the UI performs* are not.

---

## 0. How to use this document

1. Read §1–§4 to absorb the product, the users, and the **non-negotiable invariants**. If a new design breaks an invariant, it is wrong regardless of how good it looks.
2. §5 is the end-to-end narrative — the spine of the experience.
3. §6 is the screen/IA map. §7 is the per-feature catalog (the bulk).
4. §8 (data contracts) and §9 (state matrices) are what you actually wire the components to. The backend and data shapes are **staying the same**; only the presentation is being rebuilt.
5. §10–§13 cover motion, voice, accessibility, and the *open* visual direction.
6. §14 is the functional component inventory (old → new mapping). §15 lists known gaps to fix during the rebuild. §16 is build handoff notes.

Everything here is grounded in the current implementation; §15 explicitly flags where the current implementation is weak so the revamp can improve, not just re-skin.

---

## 1. The product in one paragraph

**RAIS Pro — "The Rejection Report"** ingests messy, real-world manufacturing **rejection/inspection spreadsheets** (multi-sheet `.xlsx/.xls/.csv`, one sheet per month, embedded subtotals, legend rows, holidays written into cells) and turns them into an **executive-grade quality diagnostic** in under ~30 seconds: headline KPIs (rejection rate, checked/accepted/rejected/hold quantities), charts (rate-by-stage, top defect reasons, monthly trend), a written brief, ranked insights, and recommended actions. Its differentiator is **trust**: every number is computed deterministically from the raw rows (never invented by the model), and the user can flip into **Verify mode** to trace any KPI back to the exact source column in the original spreadsheet via an animated beam. A follow-up **chat** turns questions into saveable "insight slides."

It is built for a regulated, audit-sensitive context (pharma/medical-device GMs). "Looks credible" is not enough — it must **be** correct and **provable**.

---

## 2. Users & jobs-to-be-done

| User | Context | Primary job | Success looks like |
|---|---|---|---|
| **Plant GM / Quality Head** (primary) | Monthly quality review; not a data analyst | "Tell me how this cycle went and what to act on, fast." | Reads the brief + KPIs in <1 min; trusts the numbers; leaves with 2–4 actions. |
| **Quality Engineer / Analyst** | Prepared the spreadsheets | "Prove these numbers are right; show me where they came from." | Uses Verify mode to reconcile a KPI to source cells; checks the merge audit. |
| **Reviewer / Auditor** | Receives the report later | "Was anything double-counted or excluded? On what basis?" | Reads the Sources & merge audit; opens the saved session. |

**Core jobs (in priority order):**
1. Get a correct executive read of a rejection cycle in seconds.
2. Trust and verify every headline number against the raw data.
3. Understand *why* (top reasons, trend, per-stage) and *what to do*.
4. Ask follow-ups and capture the answers.
5. Come back to a past diagnostic and share it.

---

## 3. Core principles (design these in, on purpose)

1. **Truth over polish.** The product earns its existence by being correct and auditable. A beautiful screen that obscures provenance is a regression. (Competing tools produce slick infographics with self-contradictory numbers; our wedge is *provable* numbers.)
2. **Provenance is a first-class feature, not a footnote.** Every KPI knows its source column; the merge audit is always reachable; Verify mode is one click away.
3. **Executive read in 30 seconds.** The top of the report must answer "how did we do?" before any scrolling. Progressive disclosure for the rest.
4. **The model writes prose, never math.** All quantities come from deterministic computation. The UI must visually distinguish *computed facts* (KPIs, charts) from *AI narrative* (brief, insights, recommendations) so users calibrate trust correctly. Label AI-authored prose as such.
5. **Graceful with ugly data.** Real inputs have subtotal rows, holidays-as-text, shifting columns, `#DIV/0!`. The UI must degrade gracefully (empty/partial states) and never show "random numbers."
6. **Calm, confident, editorial-in-spirit.** Dense but legible; numerals are the heroes. (The *spirit* — confident, print-quality, numerals-forward — survives the revamp even though the specific skin does not.)

### 3a. Non-negotiable invariants (must survive the revamp)

- **KPI → source-column traceability** (Verify beams) must remain. KPIs carry a `sourceColumn`; the verify panel renders the raw sheet and highlights/links that column.
- **Sources & merge audit** must remain visible and honest (included sheets, excluded sheets + reasons, merge strategy, warnings).
- **Computed vs. AI content distinction** must be legible.
- **Deterministic numbers**: the UI never re-derives or "rounds for looks" in a way that contradicts the engine. Formatting only.
- **Sticky context on scroll-heavy screens** (report masthead, verify panel header) — both screens are long.
- **No blocking on AI for numbers**: KPIs/charts render from the deterministic result even if narrative is thin.

---

## 4. The pipeline the UI sits on top of (mental model)

The UI renders the output of a 3-phase server pipeline (`/api/analyze`). You do **not** need to rebuild this — but the UI's information design should mirror it:

```
Upload (client parse, SheetJS)
   → Phase 1 GRAPH      : classify each column's ROLE (checked / accepted / rejected / hold / reason / date / ignore)
                           — heuristic baseline + LLM graph, kept only if it passes a sanity gate
   → Phase 2 COMPUTE    : deterministic JS arithmetic over raw rows → KPIs, charts, monthly trend, reason pareto, merge plan
   → Phase 3 NARRATIVE  : the model writes prose ONLY (title, summary, insights, recommendations, alerts)
   → Dashboard renders  : computed numbers + AI prose + Verify beams
```

Implication for UX: **the numbers and the words come from different trust tiers.** Reflect that.

---

## 5. End-to-end experience (the spine)

1. **Arrive** → a calm landing ("Morning briefing") with a single primary action: drop spreadsheets. Past diagnostics ("Archive") sit below.
2. **Queue files** → drag/drop or browse; see queued files; confirm with "Analyze."
3. **Compile** → a progress screen narrates the pipeline (reading → extracting → context → AI → render).
4. **Read the report** → masthead + "The brief" (title, executive summary, reading chips, table of contents) → **The numbers** (KPIs) → **The picture** (charts) → **insights** → **recommendations** → **sources & merge audit** → colophon.
5. **Verify** → click "Verify data": the report splits; KPIs become clickable; clicking one highlights its source column in the raw sheet on the right and draws a beam connecting them.
6. **Ask** → the "Ask RAIS" dock turns a question into an insight slide appended to the report; save it as a PNG.
7. **Return / share** → the session persists; reopen it from the Archive or via its URL.

---

## 6. Information architecture & screen map

```
/  (Home)
├─ Header / brand
├─ Greeting ("Morning briefing → Good morning.")
├─ UploadZone           ← primary action
└─ Archive (Recent diagnostics)   ← grid of SessionCards → /session/:id

(Processing)            ← full-screen, transient, replaces Home during analyze

Report (rendered inline after analyze, OR at /session/:id)
├─ Masthead (sticky)    ← brand, title, [Verify data] [Export] [New analysis]
├─ The brief            ← title, executive summary, reading chips, "In this issue" TOC
├─ 01 · The numbers     ← KPI grid
├─ 02 · The picture     ← charts
├─ (Drill-downs)        ← inserted insight slides from chat
├─ 03 · Five things to know   ← insights
├─ 04 · What to do this week  ← recommendations
├─ 0n · Sources & merge audit ← SourcesPanel
├─ Colophon
├─ Ask RAIS dock (fixed, bottom)      ← hidden in Verify mode
└─ Verify split-pane (right)          ← appears in Verify mode: raw DataTable + beams

/session/:id           ← same Report screen, hydrated from persistence

Tweaks panel (dev/no-chrome overlay, ⌘. )   ← live theming — see §7.10 & §15
```

**Navigation model:** essentially two screens (Home and Report) plus transient Processing and an overlay (Verify) and a dock (Chat). No deep nav tree. Routing: `/` and `/session/:id`. Keep it this flat.

---

## 7. Feature catalog (descriptive UX)

Each feature below lists: **purpose · what the user sees & does · behavior/logic · states · data it binds to · revamp notes.**

### F1 — Landing / "Morning briefing"
- **Purpose:** orient and funnel to one action; surface recent work.
- **User sees/does:** brand/header; a warm greeting headline + one sentence ("Drop in this cycle's plant reports and you'll have an executive read in under thirty seconds."); the upload zone; below it, an "Archive → Recent diagnostics" grid if any sessions exist.
- **Behavior:** on mount, fetch sessions for this browser's `deviceId`. Each archive card shows title, file names, slide count, and a 2-KPI preview; clicking opens `/session/:id`.
- **States:** *first-time* (no archive → upload only); *returning* (archive grid populated); *loading sessions* (don't flash an empty archive — withhold until loaded).
- **Binds to:** `GET /api/sessions?deviceId=…` → `[{id, title, created_at, files[], dashboard.kpis[], insight_slides count}]`.
- **Revamp notes:** the "View all" affordance currently does nothing (§15). Greeting is static ("Good morning." regardless of time) — make it real or drop the time framing.

### F2 — Upload & queue (`UploadZone`)
- **Purpose:** accept one or more spreadsheets reliably.
- **User sees/does:** a large drop target ("Drop spreadsheets here, or **browse files**"); accepted types `.xlsx .xls .csv`; helper text "Multiple files welcome — rollup sheets are auto-detected and excluded from totals"; constraints "up to 50 MB · 12 files per session." Drag-over highlights the zone. Dropped/selected files appear as a **queued list** (filename, size, type, remove button) with "Clear all"; a primary **"Analyze with RAIS"** button + "Estimated 12–25 sec."
- **Behavior:** filter to accepted extensions; dedupe by filename; multi-file; clicking the zone opens the file picker.
- **States:** *idle*, *drag-over* (accent border + tint), *queued* (list + analyze CTA), *rejected file type* (currently silently ignored — §15: should tell the user).
- **Binds to:** local `File[]`; on analyze, files are parsed client-side then posted.
- **Revamp notes:** add explicit feedback for unsupported/oversized files; show per-file parse status; consider a sample/demo file for first-run.

### F3 — Processing / "Compiling" (`ProcessingLoader`)
- **Purpose:** hold attention during the ~12–25 s pipeline and set expectations.
- **User sees:** a spinner and a 5-step vertical timeline: **Reading spreadsheets** (client parse) → **Extracting data structures** (column inference) → **Building analysis context** (merge planner / dedupe rollups) → **Running AI analysis** (insight/narrative) → **Rendering report**. Steps flip pending → running → done.
- **States:** sequential progress to completion.
- **Revamp notes (important, §15):** today these steps are a **time-based animation** (fixed delays), *not* tied to real pipeline progress — so it can finish "Done" while the server is still working (we observed the loader sitting at all-done while the narrative call ran). The rebuild should drive this from **actual** phase signals (parse done, analyze response received) or at minimum not claim "Done" before the response returns. This is a credibility issue for a trust-first product.

### F4 — The Report (the core deliverable) (`Dashboard`)
The report is one long, print-like document. Sub-features:

**F4.1 Masthead (sticky)** — brand/nameplate, the analysis **title** as a pill, and actions: **Verify data** (only present when raw sheets are available), **Export** (print), **New analysis** (reset), plus a back affordance. A meta line shows "RAIS Pro · {date} · {n} KPIs · {m} figures · ● compiled just now." Must stay sticky (scroll-heavy).

**F4.2 The brief (lead story)** — eyebrow "The brief"; the **title**; the **executive summary** (AI prose, 1 paragraph); a row of **reading chips**: *Outlook* ("Steady" / "Action required" when alerts exist), *Confidence* ("AI-generated" — see §15), *Reading time*, *Analyst* ("RAIS · Pro"); and an **"In this issue" table of contents** built dynamically from the sections that actually have content.

**F4.3 The numbers — KPI grid** (`KPICard`) — the hero. Each card: **label** (eyebrow), **trend** indicator (improving / declining / stable, with icon + semantic color — note the editorial inversion: a *declining* rejection rate is *good*), the **value** in large numerals + unit, a **context** line (the formula, e.g. "Σ rejected ÷ entry-stage checked", or a source tag), and an optional **sparkline** from `history`. In Verify mode the cards become **clickable** and show an **active** treatment (accent edge + pointer marker). Grid is 3-up normally, 2-up in Verify.
  - The standard KPIs: **Rejection rate** (leads), **Rejected qty**, **Checked qty**, and when non-zero **Accepted qty**, **Hold qty**.

**F4.4 The picture — charts** (`ChartContainer` + inline SVG charts) — figure-numbered cards ("Fig. 01"), each a title + chart + optional caption. Chart kinds in use: **rejection rate by stage** (bar), **top rejection reasons** (horizontal bar, top ~8), **rejection rate trend** (line, monthly). Charts are **inline SVG** (no chart library), purely from computed series. 2-up normally, 1-up in Verify or when only one chart.

**F4.5 Insights — "Five things to know"** — a numbered list (01, 02, …) of AI sentences; numeric tokens in each sentence are emphasized. Up to ~7.

**F4.6 Recommendations — "What to do this week"** — a checklist; each item gets a time-horizon tag (Today / This wk / Next wk / 30 days). Up to ~6.

**F4.7 Alerts** — when present, a prominent danger banner at the very top of the body (first/critical alert). Also flips the brief's "Outlook" chip to "Action required."

**F4.8 Colophon** — a closing rule with "RAIS Pro · Compiled {time} · End of report."

- **States (report-level):** *full* (all sections), *partial* (only sections with data render; TOC adapts), *no charts/insights* (sections omitted), *alerts present* (banner + outlook), *session vs. fresh* (title may come from saved session).
- **Binds to:** `DashboardConfig` (see §8).

### F5 — Verify Data (the trust feature) (`Dashboard` verify mode + `DataTable` + `BeamOverlay`)
- **Purpose:** let anyone prove a KPI against the raw spreadsheet.
- **User sees/does:** clicking **Verify data** splits the screen — report on the left (KPIs now clickable, grid compresses to 2-up, chat dock hidden to keep focus), the **raw data table** on the right (sheet tabs if multiple, a meta strip "{rows} rows · {cols} cols", sticky header, row numbers). Clicking a KPI:
  1. resolves the KPI's `sourceColumn` to an actual column in a raw sheet via **fuzzy matching** (normalize case/spaces/punctuation, then exact → partial),
  2. **highlights** that column (header + cells) and scrolls it into view,
  3. draws an **animated bezier beam** from the KPI card to the column header (`getBoundingClientRect` on both endpoints).
- **Behavior:** beams recompute on left/right scroll and window resize. A tweak (`showBeams`) can disable the beam (highlight still works). Clicking the active KPI again clears it.
- **States:** *verify off* (default), *verify on / no KPI selected* (table shown, nothing highlighted), *KPI selected + column matched* (highlight + beam), *KPI selected + no match* (highlight/beam suppressed — should message, §15), *no raw data* (Verify button hidden entirely).
- **Binds to:** `RawSheet[]` (client-held), `KPI.sourceColumn`.
- **Revamp notes (§15):** Verify depends on raw sheets stashed in **`sessionStorage`** at upload time, so **opening a shared link or an older session in a different browser has no raw data → Verify is unavailable.** This is a real limitation; the revamp should decide whether raw rows are persisted/fetched so Verify works on any device. Also: a "no source column matched" state needs a visible explanation rather than silently drawing nothing.

### F6 — Sources & merge audit (`SourcesPanel`)
- **Purpose:** make the aggregation honest and reviewable.
- **User sees/does:** a collapsible "The Receipts — Sources & merge audit" section with three columns: **Included** (each sheet → the group it merged into), **Excluded** (each excluded sheet + the reason, e.g. "summary/rollup sheet — excluded to avoid double-counting") with the **merge strategy** ("Sum across all included sources" / "kept separate"), and **Warnings**.
- **States:** *exclusions present / none*, *warnings present / none*, *collapsed / expanded*.
- **Binds to:** `MergePlan` (groups, excludedSheets[{sheet, reason}], crossFileStrategy, warnings).
- **Revamp notes:** this is a trust centerpiece — keep it dignified and scannable, not buried. Consider linking each included sheet to its tab in Verify mode.

### F7 — Ask RAIS (chat dock) + Insight slides (`ChatPanel`, `InsightSlide`)
- **Purpose:** follow-up Q&A that produces durable, shareable artifacts.
- **User sees/does:** a docked bar at the bottom (open by default; collapsible to a floating "Ask RAIS" button). Shows 4 **suggested questions** as chips ("What stands out this cycle?", "Which factor explains most of the change?", "Forecast the next cycle.", "Compare segments side-by-side."), a text input, and an **Ask** button. Submitting (chip or typed) returns an **insight slide** that gets appended to the report under "From your questions / Drill-downs." Each slide: a "Drill-down" tag, the **question** (italic), **Save as PNG** + remove, a **headline**, 1–2 **charts**, 3–4 **bullets** (numeric tokens emphasized), and a footer with generated time.
- **Behavior:** `POST /api/chat` with the question + dataset summary + current KPIs → an insight-slide object (schema-validated; model uses only numbers present in the data). If a `sessionId` exists, the slide is persisted. A plain-text reply degrades into a headline-only slide. **Save as PNG** rasterizes the slide (`html2canvas`, 2× scale) and downloads it.
- **States:** *open / collapsed*, *idle*, *asking* (disabled input, "Asking…"), *slide returned*, *plain-text fallback*, *error* (inline message, e.g. "Model could not produce a valid slide. Rephrase and try again."), *hidden* (in Verify mode).
- **Binds to:** `POST /api/chat` → `{type:"slide", slide:{question, headline, charts[], bullets[], createdAt}}`; persistence `POST /api/sessions/:id/slides`.
- **Revamp notes:** there is no running transcript — each answer is a standalone slide (intentional). Keep that model, but make the relationship between "ask" and "the slide that appeared up there" obvious (it currently appends far above the dock). Consider scroll-to-new-slide.

### F8 — Sessions / Archive / persistence / deep links
- **Purpose:** durable diagnostics, revisitable and shareable by URL.
- **Behavior:** after analyze, if the server persisted a session, the app stashes the parsed raw sheets in `sessionStorage` (`rais_raw_{id}`) and routes to `/session/:id`; otherwise it renders inline. `/session/:id` hydrates the dashboard, merge plan, data summary, and saved slides from the API, and raw sheets from `sessionStorage` (if present in this browser). Sessions are scoped to a `deviceId` (browser-local UUID).
- **States:** *loading*, *loaded*, *error* ("Could not load session" card with back-home), *loaded but no raw sheets* (Verify unavailable).
- **Binds to:** `GET /api/sessions`, `GET /api/sessions/:id`, slides under `/api/sessions/:id/slides`.
- **Revamp notes (§15):** persistence is "best effort"; identity is a device UUID, not an account, so "sharing a link" only shows the report to others (and only if they're allowed) and never the Verify raw data. Decide the intended sharing/identity model in the revamp.

### F9 — Export
- **Purpose:** take the report out of the app.
- **Today:** the masthead **Export** triggers the browser **print** dialog (the layout has print styles: static masthead, hidden buttons, avoid-break cards). Insight slides export individually as **PNG**.
- **Revamp notes:** consider a real "Export PDF" and "Export report as PNG/share image" path rather than relying on the browser print dialog; ensure charts (inline SVG) and beams render correctly in export.

### F10 — Tweaks panel (live theming) (`TweaksContext`, `TweaksPanel`)
- **Purpose (today):** a dev/demo control panel (opened via ⌘. / Ctrl+. or a FAB; auto-mounts in dev or `?tweaks=1`) to live-tune the look: **density** (compact/comfortable/spacious), **background warmth** (light/warm/paper), **accent color** (swatches + custom), **heading font** (Fraunces/Newsreader/Instrument Serif/Playfair), **chart style** (filled/outline/minimal), **card style** (flat/outlined/shadow), and a **show beams** toggle. Applies instantly via `<body>` data-attributes + CSS variables.
- **Revamp decision (§17):** decide whether this is (a) dropped, (b) kept as an internal dev tool, or (c) productized into real user preferences (e.g. density + theme). The underlying idea — **token-driven theming via CSS variables** — is worth keeping structurally even if the panel itself changes, because it makes the whole UI themeable cheaply.

---

## 8. Data contracts the UI binds to (unchanged by the revamp)

The new UI must render these shapes. Numbers arrive **pre-computed and pre-formatted** where noted.

```ts
DashboardConfig {
  dashboardTitle: string
  executiveSummary: string          // AI prose
  kpis: KPI[]
  charts: Chart[]
  insights: string[]                // AI prose, numeric tokens worth emphasizing
  recommendations: string[]         // AI prose
  alerts: string[]                  // critical → banner
}

KPI {
  label: string
  value: string | number            // display value (already formatted)
  unit?: string | null              // e.g. "%", "units"
  trend: -1 | 0 | 1                 // -1 declining, 0 stable, 1 improving (semantics are domain-aware: falling rejection = improving)
  context: string                   // formula / explanation line
  sourceColumn?: string | null      // ← Verify beam target
  delta?: string | null             // e.g. "+0.42 pt"
  history?: number[] | null         // sparkline series (3–12 pts)
  source?: string | null            // short source tag
}

Chart {
  title: string
  type: "line" | "bar" | "horizontalBar" | "area" | "pie" | "doughnut" | "radar"
  description?: string | null
  data: { labels: string[]; datasets: { label: string; data: number[] }[] }
}

InsightSlide {
  id?: string; sessionId: string; question: string
  headline: string
  charts: InsightChart[]   // 1–2
  bullets: string[]        // 3–4
  createdAt: string        // ISO
}

RawSheet { name: string; fileName: string; columns: string[]; rows: Record<string, unknown>[] }   // Verify source data

MergePlan {
  groups: { label: string; sheets: string[] }[]
  excludedSheets: { sheet: string; reason: string }[]
  crossFileStrategy: "sum" | "separate"
  warnings: string[]
}
```

**Endpoints:** `POST /api/analyze` (summaries → DashboardConfig + sessionId + mergePlan), `POST /api/chat` (question → insight slide), `GET /api/sessions[?deviceId]`, `GET /api/sessions/:id`, `POST /api/sessions/:id/slides`.

**Trust-tier tagging for the UI:** treat `kpis`, `charts`, and `MergePlan` as **computed/auditable**; treat `executiveSummary`, `insights`, `recommendations`, `alerts`, and insight-slide prose as **AI-authored**. The redesign should make this distinction perceivable.

---

## 9. State matrices (design all of these, not just the happy path)

**Global / data-quality states the UI must handle gracefully:**
- No KPIs survived computation (pipeline returns 422) → a clear, non-alarming "we couldn't read usable numbers from these files" screen with what to check (header rows, file type), not a blank report.
- Some sections empty (no charts, or no history for sparklines, or no reasons) → omit the section; TOC adapts.
- Alerts present → banner + outlook chip.
- Single sheet vs. many → merge audit still shown ("All Data").
- Raw data absent (older/shared session) → Verify hidden, with an explanation rather than a missing button mystery.

**Per-screen:**

| Screen | empty | loading | success | partial | error |
|---|---|---|---|---|---|
| Home | no archive → upload only | sessions loading (withhold archive) | archive grid | — | sessions fetch failed (degrade silently to upload) |
| Upload | idle drop zone | — | files queued | unsupported file (must message) | oversized/parse fail (must message) |
| Processing | — | 5-step timeline | hands off to report | — | analyze failed → **proper error screen** (today it's a JS `alert()` — §15) |
| Report | "no usable data" state | (covered by Processing) | full report | sections omitted | render fallback |
| Verify | verify off | — | KPI→column beam | KPI with no column match (message) | no raw data (Verify unavailable, explained) |
| Chat | suggested chips | "Asking…" | slide appended | plain-text → headline slide | inline error |
| Session | — | ProcessingLoader reused | hydrated report | no raw → no Verify | "Could not load session" card |

---

## 10. Interaction & motion

- **Verify beam:** the signature interaction. A drawn (animated stroke) bezier from KPI to source column; recomputes live on scroll/resize; must feel precise, not decorative. Keep it crisp and fast; respect `prefers-reduced-motion` (offer highlight-only).
- **Section reveal / fade-up** on content entry — subtle, fast.
- **Pulse/active states** on selected KPI in Verify.
- **Spinner / progress** during compile (but tie to real progress — §15).
- All motion currently pure CSS/SVG (no animation library) — fine to keep that constraint for performance, or adopt a lightweight one in the revamp; either way keep it tasteful and reduced-motion aware.

---

## 11. Content & voice

Current voice is **newspaper/editorial**: "The Rejection Report," "The brief," "The numbers," "The picture," "Five things to know," "What to do this week," "The Receipts," "compiled just now," "End of report." It is distinctive and on-brand for "an executive read."

**For the revamp:** the voice can evolve, but keep these *functional* content jobs:
- A one-line, plain-language **executive summary** at the very top.
- KPIs labeled in **business terms** with a **formula/explanation** line (this is part of trust).
- Insights as **short, number-anchored sentences**.
- Recommendations as **actions with a time horizon**.
- The merge audit in **honest, specific language** (name the excluded sheet and the reason).
- Always label AI-written prose as AI-generated.

---

## 12. Accessibility, responsive, performance

- **Accessibility:** semantic headings/sections (the report is a document — use real heading hierarchy); keyboard operability for KPIs-as-buttons in Verify, the chat, and the upload zone; visible focus; color is **never the only** signal for trend/alert (pair with icon/text); `prefers-reduced-motion` for beams/animations; sufficient contrast (the warm-paper palette must still pass AA for body text and numerals).
- **Responsive:** the split-pane Verify is desktop-first; define a mobile/tablet story (stacked verify? tap-to-reveal source? or "verify is desktop-only" with a clear message). The report itself should reflow to a single column gracefully. KPI grid: 3-up → 2-up → 1-up.
- **Performance:** charts are inline SVG; raw tables can be large (hundreds of rows) — virtualize or cap with "showing N rows." Beams use `getBoundingClientRect`; throttle scroll handlers. Keep first paint of the brief + KPIs fast; don't block on chart/beam work.

---

## 13. Visual design direction for the revamp (open — choose deliberately)

The current skin (warm paper, near-black ink, Fraunces/Lora serifs, Inter Tight UI, JetBrains Mono numerals, burnt-orange `#C8421C`, flat/outlined cards, **not** glassmorphism) is being **retired**. You are free to choose a new visual language. Whatever you pick, satisfy the principles in §3 and these constraints:

- **Numerals are the hero.** Pick a typeface system where large numbers read beautifully and tabular figures align (KPIs, tables, sparklines).
- **A clear trust vocabulary.** Visually separate *computed facts* from *AI prose* (e.g. distinct surface, an "AI" marker, or a quiet watermark) so a GM never confuses a model sentence for a measured number.
- **Token-driven theming.** Drive color/spacing/typography through CSS variables (or your framework's token system) so density/theme can flex and the Tweaks idea (if kept) stays cheap.
- **Print/Export-quality.** The report must look intentional when exported (PDF/PNG/print).
- **Calm density.** It's a dense report; use rhythm, rules, and whitespace so it's scannable, not cramped.
- **Accent semantics.** Reserve a strong accent for *action/attention* (alerts, the active verify column/beam, the primary CTA). Don't spend it everywhere.

Provide at least: a type scale, a color/token set (light + the trust-tier surfaces; consider dark mode as a decision), KPI card spec, chart styling spec (still inline-SVG-friendly), table/verify styling, and the beam styling.

---

## 14. Functional component inventory (old → rebuild)

Rebuild these *functions* (names/structure are yours to change):

| Function | Current component | Must still do |
|---|---|---|
| App brand/header | `EditorialHeader` | brand, date, identity |
| Upload | `UploadZone` | multi-file drop/browse, queue, validate, analyze CTA |
| Progress | `ProcessingLoader` | narrate real pipeline progress to completion |
| Report shell | `Dashboard` | masthead (sticky) + sectioned document + verify orchestration + chat mount |
| KPI | `KPICard` | label, value+unit, trend (icon+color+text), formula/context, sparkline, verify-clickable/active, expose ref for beam |
| Chart | `ChartContainer` + `EditorialCharts` (TrendLine/Vertical/Horizontal/Donut + Sparkline) | render line/bar/horizontalBar/(pie/doughnut) from `{labels, datasets}`, inline SVG, figure caption |
| Insights/Recs | inline in `Dashboard` | numbered insights; actions with time horizons; emphasize numeric tokens (safely — §15) |
| Alert | `StatusAlert` | prominent danger banner |
| Verify table | `DataTable` (+ `findColumn`) | sheet tabs, sticky header, row numbers, fuzzy column match + highlight + scroll-into-view, expose header refs |
| Beam | `BeamOverlay` | animated bezier KPI↔column, recompute on scroll/resize, reduced-motion fallback |
| Sources audit | `SourcesPanel` | included/excluded(+reason)/strategy/warnings, collapsible |
| Chat | `ChatPanel` | suggested chips, input, ask, error/loading, collapse |
| Insight slide | `InsightSlide` | question, headline, 1–2 charts, 3–4 bullets, Save-as-PNG, remove |
| Archive tile | `SessionCard` | title, files, slide count, KPI preview, open |
| Icons | `Icon` | line-stroke icon set |
| Theming | `TweaksContext`/`TweaksPanel` | token-driven theming (productize or keep dev-only — §17) |

---

## 15. Known gaps to fix during the revamp (don't just re-skin these)

1. **Processing loader is fake.** It's a timed animation, not real progress, and can show "Done" while the server is still computing. Drive it from actual phase signals. *(Trust-critical.)*
2. **Verify data is browser-bound.** Raw sheets live only in `sessionStorage` from the original upload, so Verify is unavailable on shared links / other devices / older sessions. Decide whether to persist/fetch raw rows so Verify always works.
3. **Analyze failure uses `alert()`.** Replace with a proper, on-brand error state that tells the user what to check.
4. **Silent upload rejections.** Unsupported/oversized files are dropped with no feedback.
5. **"No source-column match" in Verify is silent.** Clicking a KPI that can't be matched draws nothing and explains nothing.
6. **"View all" archive link is non-functional.** Either implement an archive page or remove it.
7. **`bolden()` injects HTML via `dangerouslySetInnerHTML`.** It emphasizes numbers in AI text; re-implement with safe rendering (tokenized React nodes) in the rebuild.
8. **Confidence chip is hardcoded "AI-generated"; reading time is a guess** from insight count. Either make them meaningful or simplify.
9. **Export is just `window.print()`.** Consider real PDF/share-image export that includes charts cleanly.
10. **Identity is an anonymous device UUID.** No accounts/auth; "sharing" semantics are undefined. Decide the model.
11. **Trust-tier distinction is weak.** Computed numbers and AI prose look the same; the new design should separate them.

---

## 16. Build handoff notes (Antigravity + Gemini 3.5 Flash)

- **Keep the backend & data contracts (§8) fixed.** This is a **front-end/UX rebuild**; the pipeline (`/api/analyze`, `/api/chat`, `/api/sessions/*`), schemas, and the deterministic metrics engine stay. Bind the new components to the shapes in §8.
- **Feed the agent this document** plus §8 (contracts) and §9 (states) as the spec; have it produce, in order: (1) a token/design-system foundation per §13, (2) the two screens (Home, Report) with all §9 states, (3) Verify mode + beams (the hard part — validate the `getBoundingClientRect` math and reduced-motion path), (4) Chat + Insight slides + export, (5) Sessions/Archive.
- **Definition of done per screen:** every state in §9 implemented; invariants in §3a intact; numbers formatted but never re-derived; AI prose labeled; reduced-motion honored; keyboard-operable; exports cleanly.
- **Acceptance test (must pass):** upload `DATA/VISUAL INSPECTION REPORT 2025.xlsx` → report shows **Rejection rate 5.88%, Checked 2,732,719, Rejected 160,812** with **BM** as the top reason; clicking the "Checked qty" KPI in Verify highlights the `REC. QTY` column and draws a beam; the merge audit lists `YEARLY 2024-25` as **excluded (rollup)**. If the numbers differ, the build (or its data binding) is wrong. *(These are the verified-correct values from the current engine.)*
- **Guardrails:** don't reintroduce a heavyweight chart library if inline SVG suffices; don't move number formatting into the model; don't hide provenance to simplify a screen.

---

## 17. Open design decisions to settle before/while building

1. **Identity & sharing:** anonymous device, or real accounts? Determines whether sessions/Verify work cross-device.
2. **Verify on mobile:** stacked, tap-to-reveal, or desktop-only with a graceful message?
3. **Tweaks panel:** drop / keep dev-only / productize into user preferences (density + theme + reduced-motion)?
4. **Dark mode:** in or out for v1?
5. **Export target:** print-only, or first-class PDF + share-image?
6. **Chat model:** standalone slides only (current), or also a lightweight transcript?
7. **Visual language:** how far from the editorial heritage to go — evolve it, or a clean break? (Either is allowed; decide deliberately and document the chosen tokens.)

---

*This document describes the product as it functions today (verified against the codebase) and the constraints/intent for rebuilding its interface. Implementation specifics of the current editorial skin are intentionally omitted where they don't constrain the rebuild; the data contracts (§8), invariants (§3a), states (§9), and acceptance test (§16) are the parts that must be honored exactly.*
