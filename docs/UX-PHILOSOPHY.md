# RAIS-Pro / MO!D — UX Philosophy (v3)

**Status:** Governing product doctrine · Refined 2026-07-21 after adversarial critique  
**Supersedes:** v2 essay (investigation-first manifesto). v3 keeps what survived challenge; operationalizes what failed.  
**Not this document:** Screen layouts, visual redesigns, component libraries.

**Target vs current:** This is **target product law**. Shipped `AppShell` peer Analysis routes and PRODUCT-MAP “KEEP” pages are **as-is debt** until migrated under these laws — not counter-evidence that the laws are wrong.

---

## 1. Thesis

> **Simple + powerful** means: at every moment the user faces **one job-relevant question** in plant language, with **ledger-backed truth** (or an honest next step), a **ranked path deeper**, and **no requirement to become a BI analyst** — while full analytical power remains reachable without losing context.

Simplicity is not fewer capabilities.  
Simplicity is **fewer simultaneous questions**, **stable interaction grammar**, and **role-filtered chrome**.

---

## 2. What this product is

An **operational evidence system** for a regulated plant (ISO 13485 / CDSCO):

```
capture → verify/adjudicate → append-only ledger →
answer → decide/own → prove
```

Not a chart catalog. Not an Excel clone. Not “smart” silent reconciliation.

UX is the human face of the architecture: **trust under operational pressure**.

---

## 3. What survived critique (do not reopen lightly)

| Claim | Why it holds |
|---|---|
| Users open under **pressure**, not data tourism | Situation awareness (Endsley); shop-floor + audit reality |
| **Plant language** only (gate, lot, FR, FY Apr–Mar, ₹) | Extraneous load from jargon (Sweller); Grain Contract law |
| **Capture quality bounds all insight** | Garbage-in / falsification incentive (Disposafe #1) |
| **Trust is continuous** — provenance, no false success | ALCOA+; one bad number collapses reliance |
| **Capability ≠ navigation budget** | Hick’s law; enterprise module sprawl (classic SAP failure mode) |
| **System asks; never assumes** on conflicts (A12/A21) | Automation bias; forensic defensibility |
| **Same ledger, role-shaped first jobs** | Fiori-style role spaces over one truth |

---

## 4. What v2 got wrong (fixed in v3)

| Failure | Fix |
|---|---|
| One **universal** funnel for all roles | **Role × primary path** (shared vocabulary, different order/home) |
| Integrity only as investigation step 4 | **Integrity gates Capture and qualifies Understand** |
| Continuity without **work objects** | First-class **Investigation / Finding / Entry session** state |
| Hide depth with no **discoverability** | Depth hidden by moment/role, never unsearchable to the right role |
| No expert mid-entry | **Mid-path entry** + search/recents legal |
| “Okay in 5s” without semantics | **Default comparison frame** required for Status |
| Three rooms as slogans | Rooms + **objects** + **global scope chrome** + **ritual modes** |
| Manifesto length | **Ten principles** + short laws; essays cut |

---

## 5. Foundational principles (the operating system)

### F1 — Ledger truth or honest next step
Nothing presents as success unless **events exist on the ledger** (or a hard error / explicit “not ready” with the exact next action). Recomputed values are labeled. Sheet % is a claim (A11). Demo/fake KPIs banned.

### F2 — Trust chrome is universal; analysis chrome is contextual
Every quantity can answer “where did you come from?” in **≤ 2 interactions**, via one **identical, boring** provenance pattern. Analytical density (Pareto, SPC, heatmaps) appears only when relevant to the active job and locus — never as equal-weight permanent peers of status.

### F3 — Plant language is the system language
Labels, filters, empty states, and exports use gates, lots/batches, FR sizes, FY Apr–Mar, dispositions, and ₹. Analytics jargon is forbidden where plant terms exist. Technique names (SPC, Pareto) are allowed **only after locus is known** or for expert re-entry — never as primary IA.

### F4 — Role × primary path (not one funnel for all)
Shared **question vocabulary**; different **homes and order**.

| Role | Home question | Primary path (ordered) | Usually skips until needed |
|---|---|---|---|
| **Operator** | What do I log now? | Capture → Integrity (inline) → Confirm (ledger) | Cost, full cause, audit pack |
| **Supervisor** | What’s blocked / needs my call? | Attention queue → Adjudicate → Confirm | Deep correlation |
| **QE** | What’s abnormal, and why? | Status → Locus → Cause → Integrity (signal) → Cost → Action → Proof | Admin config |
| **QA Manager** | What’s unresolved / audit-risky? | Queue → Integrity → Action/ownership → Proof pack | Day-to-day entry |
| **GM** | Are we okay, and what’s the ₹ / who owns it? | Status → Cost → Ownership → Proof pack | Deep cause unless exception |

**Shared vocabulary of steps** (reuse names everywhere):  
`Status · Locus · Cause · Integrity · Cost · Action · Proof · Capture`

### F5 — Integrity is a gate, not only a chapter
- **Capture integrity** (A12, mass balance, negatives, conflicts): resolved or explicitly escalated **before** facts are treated as clean ledger truth.  
- **Signal integrity** during investigation: “can I trust this spike?” remains a step when chasing anomalies.  
- **Hard law:** Understand must not present a **trustworthy “okay”** verdict for a scope that still has **open integrity conflicts** in that scope. Status may show “blocked / needs adjudication” — never green calm over dirty data.

### F6 — One job in attention; many jobs in the product
At any moment the UI optimizes for **one primary job question**. Concurrent open work (parked investigations, open findings, draft entries) is allowed as **parked objects**, not as equal competing chrome. Chunk working memory: ≤ ~4 simultaneous high-salience items (Cowan).

### F7 — Progressive depth with mid-path entry
Default depth = answer for the role’s home. Deeper steps are intentional.  
Experts and rituals may **enter mid-path** (e.g. “Visual · June · size concentration”) without replaying Status theater — provided **scope context is visible** and they can move up/down the path.  
Linear wizard-only flows are banned for investigation.

### F8 — Context is a first-class object
Period (D/W/M/FY), gate/stage, size, batch, starting metric, plant/line (when multi-site), and claim-vs-recomputed must **survive** navigation, share, interrupt, and handoff.  
Investigations that matter for review/CAPA are **addressable work objects** (stable identity / URL or equivalent), not modal-only smoke.

### F9 — Decision support = ranked few + one next step
State situation → rank ≤ few drivers (worst gate, top defect, worst size, open conflicts) → one role-appropriate next step → evidence one step away.  
“More charts” is not insight. AI prose **follows** deterministic numbers; never invents KPIs; **degraded mode = numbers-only is a complete product**. Verdict language for “okay/abnormal” uses an explicit **default comparison frame** (prior period and/or client threshold and/or control limits) — never designer taste alone.

### F10 — Growth as depth; destinations need jobs **and** retire rules
New capability lands as depth, evidence type, or role emphasis **inside an existing job question** by default.  
New top-level destination requires: (1) a genuinely new **user job**, (2) which role homes there, (3) what existing surface is **retired or demoted**.  
Complexity budget = concurrent top-level jobs a role sees — not engine count.

---

## 6. Information architecture laws

### 6.1 Three rooms (jobs), not seventeen modules

| Room | Job | Contains (examples of depth, not peer apps) |
|---|---|---|
| **Capture** | Put truth on the ledger | Batch/day entry, validation, A12 dialog, Excel bulk/history (secondary) |
| **Understand** | Status → investigate | Status surface, locus/cause depth, SPC/COPQ as steps, trends, compare |
| **Govern** | Own, prove, configure | Findings queue, CAPA, audit pack, authority-bound schema/cost |

Furniture inside rooms can be rich. Rooms stay few.

### 6.2 Global scope chrome (lenses, not destinations)

Always in plant language: **period grain · date range · quality gate · (plant/line when needed)**.  
One truth source: the ledger. Lenses never imply a second truth.

### 6.3 Work objects (enterprise object model)

| Object | Why |
|---|---|
| **Entry session / draft** | Interrupt-resilient capture on shared terminals |
| **Finding** | Conflict/validation as owned work, not toast |
| **Investigation** | Continuable, shareable chase with scope stack |
| **CAPA / action** | Ownership and due state |
| **Audit package** | Proof ritual artifact |

Fiori/Atlassian-style: users navigate **objects + jobs**, not only abstract “questions.”

### 6.4 Exception / attention channel

Unresolved, unowned, integrity-blocked, and threshold breaches are a **first-class queue**, not buried under equal chart weight. (Siemens-style interrupt channel; QA Manager home.)

### 6.5 Discoverability without module sprawl

Depth must remain findable via: attention rail / next-step links, **search & jump** (batch, defect, finding), **recents / pinned investigations**, and optional command palette.  
Law: *Hidden from the wrong moment; searchable to the right role.*

### 6.6 Ritual modes (standing work without peer apps)

Weekly SPC review, monthly GM pack, audit defense are **ritual modes** over the same rooms/objects — saved scopes and export shapes — not permanent sidebar siblings named after techniques.

### 6.7 Environment classes (device/context)

| Class | Chrome law |
|---|---|
| **Operator terminal** | Capture + inline integrity only; no schema, no dense analytics |
| **QE desk** | Full Understand depth + Govern as needed |
| **Meeting / projection** | Status + Cost + Ownership; large type; stable shared scope |

Shared-PC reality: identity, draft privacy, and walk-away resume are **UX laws**, not only future RBAC tickets.

### 6.8 Interaction grammar (consistency)

Across rooms, the same verbs mean the same thing: **select → inspect (provenance) → act (confirm) → park/hand off**. Ranking, filtering, and period change behave identically wherever they appear. Question-first IA without shared grammar produces seventeen mini-products.

---

## 7. Cognitive load doctrine

| Load type | How MO!D handles it |
|---|---|
| **Intrinsic** (hard plant work) | Structure by path/objects; don’t pretend yield math is “simple” |
| **Extraneous** (bad design) | Eliminate module inventory, jargon, dual truth sources, false success |
| **Germane** (learning) | Consistent grammar; empty states teach the **job**, not the architecture |

**Working memory:** ≤4 high-salience items at a decision point.  
**Interrupt law:** Any workflow longer than one uninterrupted attention span defines **durable draft + one-action resume**.

---

## 8. Multi-role, scale, and decision speed

| Criterion | How philosophy addresses it |
|---|---|
| Cognitive load | F3–F6, §7 |
| Scale to many features | F10, rooms, depth, ritual modes, search |
| Progressive disclosure | F7, F2 |
| Context preservation | F8, work objects |
| Discoverability | §6.5 |
| Consistency | §6.8, plant language |
| Multiple roles | F4, environment classes |
| Navigation | Jobs/rooms/objects — not engines |
| Faster decisions | F9 + integrity gate + attention queue |

---

## 9. Anti-patterns (banned)

1. Subsystem-as-destination (nav item because a module exists)  
2. Success without ledger events  
3. Silent conflict resolution  
4. Green “okay” over open integrity conflicts in scope  
5. Same dense chrome for every role/environment  
6. Modal-**only** investigations for shareable/review work (peek modals OK)  
7. Equal visual weight for status, eight charts, and admin on first load  
8. Capture mixed with schema governance for operators  
9. Fake density (demo KPIs, invented AI numbers)  
10. Growth that adds destinations without retire/demote  
11. Requiring users to understand MOD vs events vs staging to finish a daily job  
12. Linear-only investigation (no mid-path entry, no park/resume)

---

## 10. Build governance checklist

Before shipping or changing a surface:

1. **Job** — Which role’s home or path step is this? (F4)  
2. **Question** — One plant-language job question in attention? (F6)  
3. **Truth** — Ledger-backed or honest next step? (F1)  
4. **Integrity** — Can this show “okay” with open conflicts? (must be no) (F5)  
5. **Provenance** — Every number ≤2 interactions, same pattern? (F2)  
6. **Context** — Which object carries period/gate/size/batch across leave/share? (F8)  
7. **Next** — Ranked next step for this role? (F9)  
8. **Entry** — Can experts mid-enter without losing scope? (F7)  
9. **Growth** — Depth or new destination? If new: job + role + retire? (F10)  
10. **Environment** — What must be absent on operator terminal? (F4, §6.7)

If unanswered, not ready.

---

## 11. Comparison anchors (for future design reviews)

| System | Steal | Don’t steal |
|---|---|---|
| **SAP Fiori** | Role spaces, object pages, explicit confirm for critical acts | Portal module catalogs |
| **Siemens industrial** | Alarm/exception channels, HMI focus under stress | Over-dense SCADA chrome for GM |
| **Atlassian** | Issue/object as work unit, queue IA | Jira sprawl as feature inventory |
| **Linear** | Job-first home + command/search expert re-entry | Consumer polish over plant gravity |
| **Stripe Dashboard** | Explainable money numbers, clear status | Generic SaaS marketing density |
| **Apple HIG** | Interrupt/resume, clarity of primary action | Consumer metaphors that hide industrial risk |
| **One UI / Fluent / MD3** | Consistency, density modes, progressive complexity | Material/Fluent visual kits as product identity |

---

## 12. Relationship to other docs

| Doc | Role |
|---|---|
| `PRODUCT.md` | Register, users, purpose (Impeccable) |
| `docs/PRODUCT-MAP.md` | Runtime keep/cut; migrate toward this IA |
| `docs/GRAIN-CONTRACT-DECISIONS.md` | Frozen plant rules — never contradict |
| `docs/build-spec/18-correctness-invariants.md` | Numerical truth |
| `docs/UX-IMPLEMENTATION-PLAN.md` | Near-term builds; must not reintroduce peer-module IA without demotion plan |

---

## 13. Acceptance tests (doctrine → falsifiable)

*Prioritized after critique: both Role × path and Integrity gate as gates; full expert layer; top fixes only (not full nav migration yet).*

### A. Integrity gate (F5) — P0

| ID | Test | Pass |
|---|---|---|
| IG-1 | Scope has open A12/conflict findings | Status/home **must not** show trustworthy “okay/green” for that scope; must show blocked/needs adjudication |
| IG-2 | Operator completes entry with defect sum ≠ rejected | Both options shown; apply only on confirm; choice in provenance |
| IG-3 | Mass-balance / cross-gate issue in scope | Surfaced as Finding/queue item, not silent accept |
| IG-4 | After conflicts resolved | “Okay” / normal Status allowed again for that scope |

### B. Role × primary path (F4) — P0

| ID | Test | Pass |
|---|---|---|
| RP-1 | Each role has a documented **home question** and ordered path (table in F4) | Spec exists; no role forced through full QE funnel |
| RP-2 | Operator environment class | Schema, hard-reset, dense multi-chart Analysis **absent** |
| RP-3 | GM path | Can reach Status → Cost → Ownership → Proof pack without Cause depth |
| RP-4 | QE path | Can walk Status → … → Proof with context preserved |
| RP-5 | QA Manager path | Can land on attention/findings queue as home |

*(Until real auth exists: environment class or explicit persona switch is an acceptable interim proxy — not “everyone sees everything.”)*

### C. Investigation object + context (F8) — P1

| ID | Test | Pass |
|---|---|---|
| IO-1 | Active investigation carries period + gate + size/batch + starting metric | Survives navigation within Understand |
| IO-2 | Shareable/resumable identity | URL or equivalent; not modal-only for review-grade chases |
| IO-3 | Park / resume | User can leave and return without re-setting scope |

### D. Expert layer (F7 + §6.5) — P1, full aggression

| ID | Test | Pass |
|---|---|---|
| EX-1 | Mid-path entry | Deep link to locus/cause (e.g. gate + period + size view) without replaying Status |
| EX-2 | Search / jump | Find batch id, defect, or finding without sidebar archaeology |
| EX-3 | Recents or pins | Last N investigations or pinned scopes one action away |
| EX-4 | Optional command palette | Jump by plant-language job or object name (not only module names) |

### E. Decision semantics (F9) — P1

| ID | Test | Pass |
|---|---|---|
| DS-1 | “Okay / abnormal” uses documented default comparison frame | Prior period and/or client threshold and/or control limits — written and consistent |
| DS-2 | AI narrative unavailable | Numbers-only Status remains complete and trustworthy |

### Out of scope for this acceptance slice

Full AppShell three-room migration, demoting all Analysis peers, multi-plant chrome, bilingual IA — track separately; do not block A–E.

---

## 14. Closing

Manufacturing users already know how to chase a bad batch.  
Software should **respect that expertise**, make honest capture the easy path, rank what matters, and prove every number — without forcing a module map into working memory.

**Build for:**

> *What must I do now? Is it okay? Where? Why? Is it honest? What’s the ₹? Who owns it? Prove it.*

Everything else is depth, search, or noise.
)