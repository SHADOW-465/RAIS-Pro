# RAIS-Pro — Intelligent Manufacturing Assistant

**AI Architecture Blueprint**
Status: design (no implementation). Grounded in the current codebase.
Audience: eng, product, plant stakeholders.

---

## 0. Reading this document

This is not a plan to bolt a chatbot onto the side of RAIS-Pro. It is a plan to
make the dashboard **itself** intelligent by orchestrating primitives that
*already exist* in this repo. Every layer below names the real file it builds
on. If a section proposes something new, it says so explicitly.

The single most important idea:

> **The AI never produces a number, a metric, or a fact. It produces
> *intent* and *navigation*. All facts come from the deterministic engine that
> already runs today.**

RAIS-Pro is an event-sourced quality-analytics platform. It already has:

| Existing primitive | File | What it gives the AI for free |
|---|---|---|
| Append-only canonical event store w/ provenance + confidence | `src/lib/store/types.ts`, `src/lib/contract/d1.ts` | The single source of truth. Every fact traces to an `eventId`, a `provenance.file`, and a `confidence.basis`. |
| Deterministic analytics selectors | `src/lib/analytics/{rejection,defect,cost,size,pareto,scope,trust,integrity}.ts` | Pure functions the AI can call as tools. Numbers come from here, never the model. |
| Serializable investigation scope | `src/lib/analytics/investigation-state.ts` | A UI action **already is a data object** (`grain·from·to·stage·size·batch·metric`) → URL. |
| Deterministic navigation/search index | `src/lib/analytics/search-index.ts` | The AI's "where does this live" tool, already written and persona-filtered. |
| Trust scoring from confidence basis | `src/lib/analytics/trust.ts` | Source attribution + confidence, already computed. |
| Verified-figures-only grounding | `src/app/api/chat/route.ts` | The "never invent a number" contract, already enforced in the current chat. |
| Role model | `src/lib/persona.ts` | Operator / Supervisor / QE / QA / GM scoping for what the AI may show or do. |
| Provider cascade | `src/lib/ai.ts` (`tryModels`) | Resilient LLM access; the AI plane is already fault-tolerant. |

The work is **orchestration**, not invention. That is why this architecture is
achievable without a rewrite, and why it will feel native rather than bolted-on.

---

## 1. AI Product Philosophy

### 1.1 The one-sentence product

> An experienced production engineer who has read every row of your data,
> knows exactly which screen answers your question, opens it for you, and shows
> you the evidence — and who will say *"the data doesn't support that"* rather
> than guess.

### 1.2 Design tenets

1. **Intent over interface.** The user says "why did rejection spike in
   April" — not "open Defect Analysis, set grain=month, filter April, open the
   Pareto." The AI translates the former into the latter. The interface is the
   AI's instrument, not the user's obstacle.

2. **The model classifies and narrates. The engine computes.** This is the
   pipeline invariant already written into `AGENTS.md` ("The model never does
   maths"). The AI plane extends it: the model decides *what to look at* and
   *how to explain it*; deterministic code decides *what is true*.

3. **Navigation is an answer.** When the best response to "show me the worst
   gate this week" is to open Stage Analysis scoped to the worst gate, the AI
   *does that* — it doesn't paste a paragraph. The dashboard is the response
   surface.

4. **Every claim is traceable or it isn't made.** Confidence and provenance
   ride along with every figure (`confidence.basis`, `provenance.file`). The
   assistant surfaces them, never hides them.

5. **Trust is earned by restraint.** An assistant that occasionally says "I
   can't verify that" is worth more than one that always answers. In a plant,
   a confident wrong number gets someone paged at 3am — or ships a defect.

6. **Role-aware, not one-size.** An operator gets "log this batch"; a GM gets
   "COPQ is up ₹4.2L, driven by Size 24Fr balloon rejects." Same engine,
   different altitude — governed by `persona.ts`.

7. **Progressive autonomy.** v1 proposes and executes reversible UI actions
   (navigate, filter, highlight). It never mutates data, files a CAPA, or
   changes a target without explicit human confirmation. Autonomy expands only
   as trust is measured.

### 1.3 What it is NOT

- Not a text box that regurgitates the dashboard as prose.
- Not a source of numbers. It has no arithmetic authority.
- Not a replacement for the analytics screens — it is the fastest path *to*
  them.
- Not a general LLM. It refuses questions outside the plant's verified data
  rather than free-associating.

---

## 2. AI System Architecture

### 2.1 The three planes

```
┌─────────────────────────────────────────────────────────────────┐
│  PRESENTATION PLANE  (React 19 / Next 16 App Router)             │
│  Dashboard · analytics screens · InvestigationController ·       │
│  Copilot dock · highlight/focus overlays · CommandPalette        │
└───────────────▲───────────────────────────────┬─────────────────┘
                │ UI-action objects              │ current UI state
                │ (InvestigationState + navKey)  │ (scope, persona, screen)
┌───────────────┴───────────────────────────────▼─────────────────┐
│  ORCHESTRATION PLANE  (the "assistant" — stateless per turn)     │
│  Intent → Plan → Tool calls → Narrate. Emits actions, never      │
│  facts. Runs the agentic loop (§8). Talks to the LLM via         │
│  tryModels(). This is the ONLY plane that touches an LLM.        │
└───────────────▲───────────────────────────────┬─────────────────┘
                │ tool calls (typed, pure)       │ verified results
┌───────────────┴───────────────────────────────▼─────────────────┐
│  DETERMINISTIC PLANE  (already exists today)                    │
│  Event store (append-only) · analytics selectors · scope ·      │
│  trust · search-index · registry. Pure functions over events.   │
│  NO LLM ever runs here. This plane owns all truth.              │
└─────────────────────────────────────────────────────────────────┘
```

**The firewall between plane 2 and plane 3 is the whole product.** The LLM can
only *request* computations by name and *read* their verified outputs. It can
never write a number into a KPI, a chart series, or a report figure. This is
the codified version of the existing rule in `chat/route.ts`.

### 2.2 Why "specialized layers," not one prompt and not ten microservices

The brief asks whether these should be separate agents or one orchestrated
system. **Answer: one orchestrated planner with specialized *tools* and a few
specialized *sub-prompts* — not a swarm of independent agents.** Justification:

- **Separate autonomous agents** (a "Navigation Agent," a "Downtime Agent"
  each with their own memory/LLM loop) multiply latency, cost, and failure
  surface, and fragment context. On free-tier rate-limited backends
  (`ai.ts`), N agents = N× the throttling risk. Rejected.
- **A single monolithic prompt** that tries to do intent + retrieval +
  reasoning + narration in one shot can't enforce the firewall — it invites the
  model to "just compute it." Rejected.
- **Chosen: one orchestrator, many tools, a few role-specialized prompts.**
  The "layers" in the brief (Intent Understanding, Analytics Interpreter,
  Evidence Retrieval, UI Action Planner, etc.) are implemented as **stages of
  one pipeline** and **typed tools**, not as separate services. This keeps
  context unified, latency to a single planning round-trip plus deterministic
  tool calls, and the firewall trivially enforceable (tools are pure JS; the
  model only sees their outputs).

The one place a *second* model call is justified is **narration**, which runs
after the facts are locked (§8). That mirrors the current analyze route's
graph → compute → narrative shape.

### 2.3 The "layers" from the brief, mapped to this architecture

| Brief's proposed layer | How it is realized here | New or existing |
|---|---|---|
| Intent Understanding | Pipeline stage 1: classify intent + extract entities into an `InvestigationState` skeleton | New (thin) |
| Context Manager | Context Envelope assembled from live UI state + memory (§5) | New (thin) |
| Navigation Agent | `search-index.ts` used as a **tool**, not an agent | **Exists** |
| Analytics Interpreter | Selector tools in `src/lib/analytics/*` invoked by name | **Exists** |
| Manufacturing Knowledge Layer | Static knowledge packs (§4) injected into the planner prompt | New (data) |
| Recommendation Engine | Deterministic rule pack + LLM framing over verified deltas | New (mostly rules) |
| Evidence Retrieval | Provenance/confidence pull from events + `trust.ts` | **Exists** |
| UI Action Planner | Emits `{ navKey, InvestigationState, highlights }` action objects | New (thin) |
| Report Generator | Existing report screens + narrative pass over verified figures | Mostly exists |
| Conversation Memory | Layered memory (§5), most of it derived from URL + localStorage | Partly exists |

The net-new code is small and mostly *glue and data*. That is the point.

---

## 3. Agent Architecture

### 3.1 Topology: orchestrator + tools + specialist prompts

```
                       ┌────────────────────────┐
   user turn  ───────▶ │   ORCHESTRATOR         │
   + context envelope  │   (single planning LLM │
                       │    call via tryModels) │
                       └───┬───────────────┬────┘
             tool calls    │               │  specialist prompt
        (typed, pure JS)   │               │  (narration only,
                           ▼               ▼   post-fact)
             ┌─────────────────────┐   ┌──────────────────┐
             │  DETERMINISTIC TOOLS │   │  NARRATOR         │
             │  (registry §3.2)     │   │  (verified figs   │
             └─────────────────────┘   │   → prose)        │
                                        └──────────────────┘
```

- **Orchestrator**: one LLM call that receives the user turn + context
  envelope + the tool registry manifest + relevant knowledge packs, and returns
  a **structured plan** (Zod-validated, per the schemas-are-the-contract rule):
  which tools to call with which args, what to navigate to, what to highlight.
  It does *not* return prose figures.
- **Deterministic tools**: pure functions. No LLM. Registry in §3.2.
- **Narrator**: a second, cheap LLM call (`fast: true` in `tryModels`) that
  turns the *already-computed* verified results into an engineer's explanation.
  Constrained exactly like `chat/route.ts` today: every number must be one of
  the supplied verified figures.

This is a **plan-act-narrate** loop, not a free-running ReAct agent. For a
manufacturing tool where wrong = expensive, bounded is correct (see §8.4 for
why unbounded ReAct is rejected here).

### 3.2 Tool registry (the AI's hands)

Every tool is a pure TypeScript function that already exists or is a thin
wrapper. The orchestrator sees a **manifest** (name, description, arg schema,
which persona may call it) and can only call by name. Contracts, not code:

**Read tools (facts):**
- `getRejectionMetrics(scope)` → wraps `analytics/rejection.ts`
- `getDefectPareto(scope)` → wraps `analytics/pareto.ts` + `defect.ts`
- `getCOPQ(scope)` → wraps `analytics/cost.ts`
- `getSizeBreakdown(scope)` → wraps `analytics/size.ts`
- `getStageMetrics(scope)` → per-gate rejection/FPY
- `getTrend(metric, scope)` → period series via `scope.periodsIn` + selector
- `getTrustScore(scope)` → `analytics/trust.ts`
- `getAuditSummary(scope)` → `analytics/trust.ts`
- `getProvenance(eventIds)` → pulls `provenance` + `confidence` from the store
- `compareScopes(metric, scopeA, scopeB)` → deterministic delta (e.g. gate A vs
  B, shift A vs B, this month vs `prevWindow`)

**Locate tools (where):**
- `findTargets(query, persona)` → `analytics/search-index.ts` (already built)
- `resolveEntity(text)` → map "24 french / 24Fr / size 24" → canonical size id
  via the registry (`RegistryRow.sizes`) and `search-index` fuzzy match

**Act tools (hands on the UI — reversible only in v1):**
- `navigate(navKey, InvestigationState)` → builds href via
  `investigationHref()` and calls the existing `goInvestigation()`
- `applyScope(InvestigationState)` → patch `TweaksContext` via
  `investigationToTweaksPatch()` without leaving the screen
- `highlightKPI(kpiId)` / `focusChart(chartId)` → presentation-plane overlay
- `openDrilldown(entityRef)` / `openSourceCell(cellRef)` → verify-mode beam
  (the existing `sourceColumn` → column-header mapping)
- `openReport(scope)` / `queueReport(scope)`

**Write tools (guarded — always require explicit human confirm, never in v1
auto-exec):**
- `proposeCAPA(finding)`, `setTarget(metric, value)`, `logEntry(...)`. These
  return a *draft* the user approves in the existing UI, never a committed
  mutation. This maps to the existing Findings/Adjudication human-in-loop model
  (`contract/d3.ts`).

**Tool safety rules (enforced in the orchestration plane, not the prompt):**
- A tool the current persona may not call is **absent from the manifest** the
  model sees (defense in depth over `persona.navAllow`).
- Every read tool returns results tagged with provenance so evidence retrieval
  is automatic (§9).
- Act tools that change what the user sees are logged to conversation memory as
  "the AI drove here" so the user always knows why the screen moved.

### 3.3 Why the narrator is a separate call

Splitting *planning* from *narration* lets us:
- run planning on the `main` model and narration on `fast` (cost/latency),
- re-run narration with a stricter grounding prompt if it drifts (cheap retry),
- keep the firewall crisp: the narrator physically never sees a tool that
  computes — only a frozen bundle of verified figures, exactly like
  `buildChatContext()` does now.

---

## 4. Knowledge Architecture

The AI needs four kinds of knowledge. **None of it is the plant's operational
numbers** (those come from tools). Knowledge here is *structural and semantic* —
how the app and the domain are shaped.

### 4.1 Representation strategy

| Knowledge | Representation | Why | Source of truth |
|---|---|---|---|
| **Application Map / Screen Map** | Static registry: `navKey → { route, purpose, whatItAnswers, kpisShown, filtersAccepted, drilldowns }` | Small, stable, human-authored; the model reads it as JSON in-prompt | Extend `search-index.ts` DESTINATIONS with richer metadata |
| **Navigation Graph** | Edges: from screen X you can drill to Y carrying scope Z | Lets the AI plan multi-hop journeys (dashboard → defect → source cell) | Derived from InvestigationState transitions already encoded in hrefs |
| **Analytics Registry** | `metricId → { selectorTool, definition, unit, goodDirection, formula-in-words, sourceEvents }` | The AI must know *which tool answers which question* and what "good" means | New data file; one row per selector in `analytics/*` |
| **Metric Definitions** | Plain-language + formula-in-words per metric (rejection rate, FPY, COPQ, Cpk…) | So the AI explains like an engineer and never re-derives math | New; authored once, versioned with schemas |
| **Business Glossary** | Synonym map: "reject/rejection/NC/nonconformance", "gate/stage/inspection point", "24Fr/24 french/size 24" | Intent understanding + entity resolution | Extend the `keywords` already in `search-index.ts` + `RegistryRow` aliases |
| **Manufacturing Knowledge Pack** | Curated domain rules: SPC Western Electric rules, Pareto 80/20 logic, FPY vs yield, COPQ categories, common balloon-catheter defect causes | So recommendations read as shop-floor knowledge, not generic LLM text | New static pack, plant-tunable |
| **Entity Relationships** | Batch → stage → size → defect → cost, and event lineage | Powers "trace this reject to its source" and comparisons | Already implicit in `CanonicalEvent` shape + `search-index` entity index |
| **Component Registry** | `kpiId / chartId → addressable UI handle` for highlight/focus | So `highlightKPI` / `focusChart` have stable targets | New: stable ids on existing KPI/Chart objects (`types/dashboard.ts`) |

### 4.2 Two knowledge tiers

1. **Static knowledge** (screen map, glossary, metric definitions, mfg pack):
   authored, versioned in-repo, injected into the planner prompt as compact
   JSON. Changes only when the app or plant vocabulary changes. This is what
   makes the assistant *understand the software and the domain*.
2. **Live knowledge** (what data exists right now: which batches, gates, sizes,
   defect codes are present): derived on the fly from the event store, exactly
   as `search-index.ts` already builds its entity sets. Never hardcoded.

**Key decision:** the screen/analytics registries are *hand-authored data*, not
LLM-generated. A 15-row screen map that is correct beats an auto-discovered one
that is 90% correct — because the AI's navigation is only as trustworthy as
this map. It is cheap to maintain (one row per screen) and it is the backbone
of "the AI knows where everything lives."

### 4.3 Registry as the extensibility seam

New module later (OEE, Downtime, Machine Analysis)? You add: one screen-map
row, one analytics-registry row pointing at the new deterministic selector,
glossary synonyms, and (optionally) a mfg-knowledge entry. **No orchestrator
change, no prompt surgery.** The planner discovers the new capability from the
manifest. This is how §10's roadmap lands without redesign.

---

## 5. Context Architecture (Memory)

The brief asks to separate several memories and decide what persists. Most of
this **already exists as URL state + localStorage** — we formalize it into a
**Context Envelope** assembled fresh each turn.

### 5.1 The Context Envelope (what the orchestrator receives every turn)

```
ContextEnvelope {
  persona           // from persona.ts (role → altitude + allowed tools)
  currentScreen     // navKey of where the user is now
  currentScope      // live InvestigationState (grain·from·to·stage·size·batch·metric)
  visibleFigures    // the verified KPIs/charts currently on screen (for "why is THIS high")
  recentInvestigations  // listInvestigationRecents() — last 8, already in localStorage
  conversationTurns // rolling window of this session's Q/A (summarized if long)
  dataAvailability  // live entity sets: which batches/gates/sizes/defects exist
}
```

### 5.2 Memory tiers — persistence policy

| Memory | Holds | Lifetime | Where it lives | Persists? |
|---|---|---|---|---|
| **Turn context** | The single question + freshly assembled envelope | One turn | Request scope | No |
| **Conversation memory** | This session's Q/A, resolved entities ("we're talking about April, Size 24Fr") | Session | Client state, summarized when long | Session only |
| **Dashboard context** | Current screen + `currentScope` (grain, dates, stage, size, batch, metric) | Live | **URL query params** (already: `investigation-state.ts`) | Yes — it *is* the URL, shareable/deep-linkable |
| **Current filters / selected machine / shift / product** | Active scope dimensions | Live | `TweaksContext` + URL (`Scope` already has `shift/machineIds/productIds` slots, ignored until events carry them) | Yes, in URL |
| **Recent investigations** | Last 8 scoped views the user visited | Rolling | `localStorage` (`moid_investigation_recents`) | Yes, device-local |
| **Long-term learned preferences** | "This GM always wants COPQ in ₹L", default grain, saved investigations/pins | Durable | Supabase (extend existing persistence) | Yes, per user |
| **Plant-learned aliases** | Sheet/file-name → stage mappings the company taught the app | Durable | `RegistryRow.stageAliases` (already exists) | Yes, per tenant |

### 5.3 What must NOT persist

- **Raw LLM reasoning traces** beyond the current session (privacy + they're not
  authoritative).
- **Any figure the AI stated** as a stored "fact" — figures are always recomputed
  from events, never cached as truth. A cached number is a stale number.
- **Cross-user conversation content** — memory is per user/role, never pooled.

### 5.4 The elegant part

Because dashboard context is **the URL**, three things fall out for free:
1. Every AI-driven view is a shareable link ("here's what I found" = a URL).
2. "Continue where I left off" is just re-parsing `InvestigationState`.
3. The AI's short-term memory of "what are we looking at" is *the same object*
   the UI uses — no separate, drift-prone AI state. This is already how
   `goInvestigation()` and `useApplyInvestigationFromUrl` work.

---

## 6. Navigation Architecture (the AI operates the dashboard)

### 6.1 The core realization

**A navigation action is already a data object in this codebase.**
`InvestigationState` + a `navKey` fully specifies "go to this screen, scoped
this way." `investigationHref()` turns it into a URL; `goInvestigation()`
executes it and records a recent. So the AI's "navigate" capability is:

> emit a validated `{ navKey, InvestigationState, highlights[] }` object → the
> existing router executes it.

No new navigation engine. The AI plans in the *same vocabulary the UI already
speaks*.

### 6.2 The UI-Action vocabulary (what the AI can drive)

| Action | Mechanism (existing or thin new) | Reversible? | Confirm needed? |
|---|---|---|---|
| Navigate to page | `goInvestigation(push, path, state)` | Yes | No |
| Apply / change filters in place | `investigationToTweaksPatch()` → `TweaksContext` | Yes | No |
| Change grain (D/W/M/FY) | Tweaks patch (`grain`) | Yes | No |
| Highlight a KPI | Presentation overlay on stable `kpiId` | Yes | No |
| Focus / isolate a chart | Presentation overlay on `chartId` | Yes | No |
| Open a drill-down | Existing drill-down routes carrying scope | Yes | No |
| Reveal evidence (source cell) | Verify-mode beam (`sourceColumn` → cell rect) | Yes | No |
| Compare machines / shifts / gates | `compareScopes()` tool → split view | Yes | No |
| Open original spreadsheet | Existing raw-file route + provenance ref | Yes | No |
| Generate / queue a report | Report screens | Yes | Confirm (it's outward-facing) |
| Log entry / file CAPA / set target | Draft → existing human-approve UI | **No (data mutation)** | **Always confirm** |

### 6.3 Guardrails on autonomy

- **v1 executes reversible view actions automatically** (navigate, filter,
  highlight, compare, reveal evidence). These cost nothing to undo — the user
  is one click / back-button from where they were, and the recents stack
  records the jump.
- **Any data mutation or outward-facing action** (CAPA, target change, report
  send, data entry) produces a **draft the human confirms** in the existing UI.
  The AI never commits. This aligns with the platform's append-only,
  human-adjudicated design (`FindingStore.adjudicate`, corrections supersede).
- **Persona gates the action set.** An operator's AI can't open COPQ or set
  targets because those tools aren't in the operator's manifest (`persona.ts`).
- **Every AI-driven navigation is narrated.** "I opened Defect Analysis for
  April because the spike is concentrated there" — so the screen never moves
  mysteriously.

### 6.4 Navigation planning example

User (on Dashboard, GM persona): *"Why is COPQ up this month?"*

Plan the orchestrator emits:
```
tools:   [ getCOPQ(scopeThisMonth), getCOPQ(prevWindow), getDefectPareto(scopeThisMonth) ]
action:  navigate("copq", { grain:"month", from, to, metric:"copq" })
highlight: ["copq-total-kpi"]
followups: focusChart("copq-by-defect")
```
Narrator (over verified results only): "COPQ is ₹X, up ₹Y (Z%) vs last month.
80% of the increase is Size 24Fr balloon rejects at the Valve Integrity gate."
Every number is from the tool outputs; none from the model.

---

## 7. Conversation Architecture

### 7.1 Voice: the engineer, not the LLM

The narrator prompt is tuned to a **plant engineer register**: direct, numeric,
cause-oriented, comfortable saying "I can't tell from this data." Concretely:

- Leads with the number and the direction ("Rejection is 3.1%, up 0.4pt").
- Names the driver, not just the metric ("driven by the Balloon gate").
- Points at the next move ("worth checking the Size 24Fr batches from week 2").
- Never hedges with LLM filler ("it's important to note", "as an AI").
- Refuses cleanly when data can't answer ("No downtime events are logged for
  April, so I can't attribute that").

### 7.2 Conversation categories → tool + screen mapping

| Category | Typical question | Tools | Lands on | Evidence shown |
|---|---|---|---|---|
| Production | "How many units passed final this week?" | `getStageMetrics` | Stage Analysis | Gate counts, source cells |
| Quality | "What's our FPY trend?" | `getTrend("fpy")` | Process Flow | Period series |
| Downtime | "Which line lost the most time?" *(future)* | `getDowntime` | Downtime *(future)* | Event log |
| Rejection | "Why did rejects spike in April?" | `getRejectionMetrics`, `getDefectPareto` | Defect Analysis | Pareto + source rows |
| Machine health | "Is machine 3 trending bad?" *(future)* | `getMachineMetrics` | Machine Analysis *(future)* | Per-machine series |
| Root cause | "What's driving Size 24Fr rejects?" | `getDefectPareto(size=24Fr)`, `compareScopes` | Defect + Size split | Pareto, provenance |
| Reports | "Give me the April quality pack" | `getMultiple`, `openReport` | Reports | Full verified pack |
| Comparisons | "Compare Balloon vs Valve gate" | `compareScopes` | Stage split view | Both gates, delta |
| Trend analysis | "Rejection over the last 12 months" | `getTrend`, `periodsIn` | SPC / trend | Control chart, limits |
| Verification | "Where does this 3.1% come from?" | `getProvenance` | Verify-mode beam | Exact source cells |
| Recommendations | "What should I fix first?" | Pareto + rule pack | Defect Analysis | 80/20 evidence |

### 7.3 Turn shape

Each assistant turn returns a small structured object the UI renders:
```
AssistantTurn {
  narration        // engineer-voice prose, grounded in verified figures
  actionsTaken     // what the AI drove (navigate/filter/highlight) + why
  evidence         // provenance refs + confidence per cited figure
  suggestedNext    // 2-3 next investigations as one-tap InvestigationStates
  confidence       // overall answerability signal (§9.3)
}
```
`suggestedNext` items are **executable** — each is an `InvestigationState` the
user taps to run, turning "next steps" from advice into navigation. This is the
existing `recents`/jump-target pattern, pointed forward instead of backward.

### 7.4 Where it lives in the UI

Evolve the current `/chat` ("Ask RAIS/MOID") from a standalone page into a
**dockable copilot** available on every screen (a slide-over, ⌘K-adjacent to the
existing CommandPalette). It reads the current screen's context envelope, so
"why is *this* high" works with `this` = whatever KPI is on screen. The
standalone page remains for long-form investigations.

---

## 8. Agentic Workflow

### 8.1 The pipeline

The brief's proposed pipeline is close. Here it is, refined to enforce the
firewall and match this codebase:

```
 User turn
    │
    ▼
[1] Intent + Entity Extraction ──► partial InvestigationState + category
    │        (LLM, structured output; classify only — no facts)
    ▼
[2] Context Assembly ────────────► ContextEnvelope (§5.1)  [pure]
    │
    ▼
[3] Plan ────────────────────────► { tool calls, nav action, highlights }
    │        (LLM planner; Zod-validated; chooses tools by name only)
    ▼
[4] Tool Execution ──────────────► verified results + provenance  [pure, no LLM]
    │        (analytics selectors + search-index + trust)
    ▼
[5] Sanity / Answerability Gate ─► can the results actually answer? [pure]
    │        (if no → skip narration, return honest "can't verify")
    ▼
[6] Navigate + Apply UI actions ─► existing goInvestigation / tweaks / overlays
    │
    ▼
[7] Narrate ─────────────────────► engineer-voice prose over verified figs ONLY
    │        (LLM narrator, fast model, grounded like chat/route.ts today)
    ▼
[8] Evidence + Suggested Next ───► provenance refs + executable next scopes [pure]
    │
    ▼
 AssistantTurn → UI
```

### 8.2 Why this order (differences from the brief's version)

- **Context assembly (2) precedes planning (3).** The planner must know where
  the user is and what's on screen before it decides what to do. "Why is this
  high" is unanswerable without it.
- **A Sanity/Answerability Gate (5) sits between tools and narration.** This is
  the firewall's teeth. If the tools didn't return data that answers the
  question, we **do not narrate a guess** — we say what's missing. This mirrors
  Phase-2's 422-if-no-KPIs and `metricsSane()` gate in the existing analyze
  pipeline. The brief's linear version had reasoning flow straight into
  explanation with no such gate; that's where a manufacturing assistant would
  hallucinate. Added deliberately.
- **Navigation (6) happens before narration (7).** The screen updates, *then*
  the AI explains what it did and found. Feels like a colleague reaching over to
  open the right tab, then talking.
- **Narration only ever sees frozen verified figures**, never the tools. Same
  guarantee as `buildChatContext()`.

### 8.3 Failure and degradation

- LLM backend throttled → `tryModels` cascades (Groq→NVIDIA). Already built.
- All backends down → **the deterministic path still works**: intent falls back
  to keyword routing via `search-index.ts`, and the assistant returns "here are
  the verified metrics for that scope" from tool outputs with no narration. The
  current `chat/route.ts` rule-based fallback is exactly this instinct. The
  product degrades to a very good search + metrics box, never to nonsense.
- Ambiguous intent → the AI asks one crisp clarifying question (e.g. "Which
  gate?") rather than guessing, and offers the entity options it found.

### 8.4 Is plan-act-narrate optimal, or should it be free ReAct?

**Considered and rejected: an unbounded ReAct/autonomous multi-step agent** that
loops tool→think→tool until "satisfied." Reasons for a plant tool:
- **Latency/cost**: each loop = an LLM round-trip on rate-limited free tiers.
  Bounded planning is one planning call + N *parallel* pure tool calls + one
  narration call. Predictable.
- **Auditability**: a fixed pipeline is explainable ("it always does these
  steps"); a free agent's path is different every time — bad for a system whose
  whole value proposition is traceability.
- **Safety**: bounded stages make the firewall and the persona/action gates
  trivial to enforce at known choke points.

**Where bounded planning needs more than one hop** (e.g. "find the worst gate,
then break *it* down by size"), the planner is allowed a **small fixed budget of
sequential tool rounds (≤3)** — enough for genuine multi-hop root-cause, capped
so it can't wander. This is the pragmatic middle: structured, with just enough
agency for real investigations. Start at 1 hop; raise the cap only if evaluation
shows multi-hop questions need it.

---

## 9. Trust & Explainability Strategy

Trust is the product. This section is not optional polish.

### 9.1 The chain of custody

Every figure the assistant states can be walked back:
```
stated figure → verified tool output → deterministic selector → scoped events
             → each event's provenance.file + confidence.basis → source cell
```
This chain already exists end to end: `CanonicalEvent` carries `provenance` and
`confidence`; `trust.ts` aggregates `confidence.basis` into a trust score;
verify-mode already draws a beam from a KPI's `sourceColumn` to the source cell.
The AI **surfaces** this chain; it doesn't create it.

### 9.2 Source attribution (automatic, not opt-in)

- Every read tool returns results *already tagged* with the events/provenance
  they came from. So when the narrator cites a figure, the `evidence` block of
  the turn is populated deterministically — the model doesn't decide what the
  evidence is; the tool does.
- "Show me where this comes from" is a first-class action (`getProvenance` +
  verify-mode beam), one tap from any AI-stated number.

### 9.3 Confidence — three sources, no LLM self-scoring

The model is **not** asked "how confident are you" (LLM self-confidence is
noise). Confidence is computed:

1. **Data confidence**: from `trust.ts` — the fraction of underlying events with
   `basis: exact|heuristic` vs `assumed|unresolved`. If the answer rests on
   low-trust events, the assistant says so.
2. **Coverage confidence**: does the scope actually contain data for the
   question? (e.g. asking about downtime when no downtime events exist → low
   coverage → honest "not logged"). Computed at the Answerability Gate.
3. **Resolution confidence**: did entity resolution land cleanly ("Size 24Fr"
   matched exactly) or fuzzily ("did you mean 24Fr or 22Fr")? From
   `search-index` scores.

Displayed as a plain badge ("High — 98% verified events, exact match"), never a
false-precision percentage the user can't interpret.

### 9.4 The refusal contract

The assistant **must** decline rather than fabricate when:
- No tool answers the question (unknown metric/module).
- The scope has no relevant events (coverage = 0).
- Entity resolution is ambiguous and can't be safely guessed.

Refusals are specific and actionable: *"I don't see downtime data for April —
downtime isn't being logged yet. I can show rejection and COPQ for that period
instead."* This is the current `chat/route.ts` instinct ("say so plainly in a
bullet instead of guessing") promoted to a hard architectural gate (§8.2, step
5).

### 9.5 Verification workflow

For any high-stakes figure (report numbers, GM-facing KPIs), a one-tap "verify"
opens the existing source-cell beam and the audit summary (`auditSummary` in
`trust.ts`): files processed, validation checks, formula integrity, manual
overrides. The AI's job is to *route the user to verification instantly*, making
"trust but verify" a two-second action rather than a spreadsheet archaeology
dig.

---

## 10. Future Expansion Roadmap

The architecture is designed so each future capability is **a new set of
registry rows + a new deterministic selector**, not an AI redesign. The
orchestrator, memory, navigation vocabulary, trust chain, and firewall are all
capability-agnostic.

### 10.1 The extension recipe (same for every item below)

1. Add the deterministic selector(s) as pure functions over events (or over a
   new event type appended to the store).
2. Register: one screen-map row, one analytics-registry row, glossary synonyms,
   optional mfg-knowledge entry, stable component ids for highlight/focus.
3. The planner discovers the new tools from the manifest. **Zero orchestrator
   changes.**

`Scope` already reserves the seams: `shift`, `productIds`, `machineIds`,
`operatorIds` are present in `scope.ts`, "ignored by selectors until events
carry them." That is the extensibility contract, already written down.

### 10.2 Roadmap

| Capability | What's new | What's reused | Notes |
|---|---|---|---|
| **New analytics modules** (OEE, Downtime, Machine Analysis, Shift Analysis) | New event types + selectors + registry rows | Entire AI plane, `Scope.shift/machineIds` seams | These are "just more tools." First expansion. |
| **Predictive Maintenance** | Forecast selector (deterministic model or stats), "risk" event type | Trust chain (predictions carry `confidence.basis: predicted`), narration | Predictions are clearly labeled as such and never conflated with measured facts. |
| **Digital Twin** | State model + simulation tool; "what-if" scope variant | Compare-scopes pattern (actual vs simulated), navigation | Twin is another read-tool the planner can call. |
| **IoT / sensor integration** | Streaming ingest → append events; new selectors | Append-only store, provenance model (sensor = a `provenance` source) | Sensor readings become events with their own confidence basis. |
| **ERP / MES integration** | Ingest adapters → events; cross-reference tools | Event store, entity resolution | Work orders/BOM become entities in `search-index`. |
| **Computer Vision** (defect images) | Vision classifier → defect events w/ confidence; image evidence | Evidence retrieval (image = a provenance artifact), defect analytics | CV output is a low-`basis` event until human-adjudicated (`FindingStore`). |
| **Scheduling Optimization** | Optimizer tool returning proposals | Draft-then-confirm guardrail (§6.3) | Proposals are drafts; humans commit. Never auto-schedules. |
| **Voice interaction** | Speech-to-text front-end | Entire pipeline unchanged (text in, actions out) | Voice is an input adapter; the orchestrator doesn't know or care. |
| **Multi-agent collaboration** | Only if a capability genuinely needs an independent long-running loop (e.g. a monitoring agent) | Tool registry as the shared contract | Deferred deliberately; the single-orchestrator model covers current needs. Add specialist agents only when measured need appears, and have them call the *same* tools. |
| **Remote plant monitoring** | Multi-tenant scope + alerting selectors | Persona/role model, trust chain | GM watches N plants; scope gains a `plantId` seam like the shift/machine ones. |

### 10.3 What we deliberately will not do early

- No autonomous data mutation. Ever, until trust is measured and the human-in-
  loop model explicitly extended.
- No swarm of independent agents for its own sake (§2.2, §10.2).
- No caching of AI-stated figures as facts (§5.3).
- No LLM in the deterministic plane.

---

## Appendix A — Net-new work vs reuse (build estimate posture)

| Layer | Mostly reuse | Net-new (thin) | Net-new (data/authoring) |
|---|---|---|---|
| Deterministic plane | ✅ all of it | — | — |
| Tool registry | ✅ selectors, search-index, trust | Tool manifest + wrappers | — |
| Orchestrator | `tryModels`, schema pattern | Planner + gate stages | Planner/narrator prompts |
| Knowledge | search-index keywords, registry aliases | — | Screen map, analytics registry, glossary, mfg pack |
| Context/memory | investigation-state, tweaks, recents, persona | Context Envelope assembler | Long-term prefs (Supabase) |
| Navigation | goInvestigation, hrefs, tweaks patch | Highlight/focus overlays, action executor | Stable kpi/chart ids |
| Conversation UI | `/chat` page, CommandPalette | Dockable copilot slide-over | Voice tuning |
| Trust | trust.ts, provenance, verify-beam | Evidence-block assembler | — |

The heavy engineering already exists. The assistant is a planning layer, a set
of tool wrappers, a handful of authored knowledge files, and a few UI overlays.

## Appendix B — The firewall, stated once more

The model may **classify**, **plan**, and **narrate**. It may **request**
computations by name and **read** their verified outputs. It may **not**
compute, invent, cache, or assert any manufacturing figure. Every number the
user sees traces to a deterministic selector over provenance-tagged events. This
single rule is what separates "an experienced engineer beside you" from "a
chatbot that sounds confident." It is already the law in `chat/route.ts`; this
architecture makes it the law everywhere.
