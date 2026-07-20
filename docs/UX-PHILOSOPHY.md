# RAIS-Pro / MO!D — UX Philosophy

**Status:** Derived 2026-07-20 from first-principles research across product docs
(PRODUCT-MAP, GRAIN-CONTRACT-DECISIONS, disposafe-problems, the 2026-07-01 GM
review audit, SESSION-HANDOFF) and the current codebase (AppShell nav, staging,
data-entry, analytics pages).
**Role:** Reusable decision framework for every future screen, module, and
workflow. Not a redesign spec. Not a component library.

---

## 1. What this product actually is

Not a dashboard. It is an **operational evidence system** for a regulated
factory (ISO 13485 / CDSCO). The core loop is:

```
capture facts (entry / Excel) → verify & adjudicate → ledger →
answer operational questions → decide & act → prove it to an auditor
```

Everything in the architecture already says this: append-only events,
provenance on every fact, deterministic math, "model never does maths," View
Source, audit package export. **The UX philosophy must be the interface
expression of the same value the architecture encodes: trust.** The GM review
confirmed it — the client is not asking for more charts; they are asking for
this system to be *simpler, safer, and more governed*.

## 2. Who the users are and how they actually work

| User | Enters with | Cadence | Tolerance for complexity |
|---|---|---|---|
| Operator / production engineer | "Log today's batch for my gate" | Daily, minutes | Near zero — busy terminal, no analytics vocabulary |
| Quality engineer | "Why did Visual spike? Which defect, size, batch?" | On anomaly, weekly | High — wants depth, drilldowns, evidence |
| QA manager | "Are we audit-ready? What's unresolved?" | Weekly + audit panic | Medium — wants queues, sign-off, exports |
| GM / plant head | "Is the factory okay? What does it cost me? Who owns the fix?" | Monthly review + exceptions | Low — wants 5 numbers, 3 losses, owners |
| Factory owner | "Trend, ₹ impact, risk exposure" | Quarterly | Lowest |

Two structural facts about their thinking:

1. **They enter with a question, not a chart type.** The natural investigation
   path is *Overview → what's wrong → why → evidence → action*. Nobody wakes up
   wanting "Size Analysis"; they want "which size is bleeding money this month
   and is it the same defect as last month."
2. **They think in the plant's language**: lots/batches (`25A28`), quality
   gates (Visual, Balloon, Valve, Final), FR sizes 6–24, FY Apr–Mar, rupees.
   The Grain Contract froze this. The calendar-first, analytics-vocabulary UI
   is the residue of the tool's history, not the users' mental model.

## 3. Where the current UX breaks (observed, not assumed)

- **Overload at capture points.** Staging mixes upload + schema mapping +
  validation + comments + publish in one screen; data-entry historically mixed
  operator entry + ledger editing + schema admin. The people with the least
  complexity tolerance face the most complexity.
- **Flat navigation as feature inventory.** ~17 sidebar items at one level
  (Dashboard, Workbooks, Staging, five analysis pages, SPC, COPQ, CAPA, Chat,
  Audit, Schema…). Navigation communicates the codebase's history, not the
  user's tasks. Every new era added a page; none retired one.
- **Context evaporates.** Drilldowns are modals with no URL; an investigation
  can't be shared, resumed, or cited in a review meeting. Raw-sheet
  verification lived in sessionStorage. Filters (grain/stage/date) are global
  chrome, disconnected from "the question I'm chasing."
- **False success states.** Workbooks page "looks like success" after an Excel
  upload that produced zero events — the exact trust failure the ledger exists
  to prevent, reproduced in the UI.
- **Hierarchy inversion on the dashboard.** Executive summary prose, KPI
  strip, 8+ chart sections compete equally; "what needs attention today" is
  derivable but not stated.
- **Same chrome for every role.** A hard-coded Quality Manager profile serves
  operator, engineer, and GM the same dense cockpit.

## 4. The philosophy

**Simplicity is not fewer features. Simplicity is that at every moment, the
screen contains exactly what the user's current question needs — and a visible,
trustworthy path to the next question.** Power stays; it moves *behind* the
question instead of beside it.

Seven principles, each earned from this product specifically:

### P1 — Trust is the interface, not a feature
Every number visible anywhere must be able to answer "where did you come from?"
within two interactions, and must never appear at all if the system can't back
it (D9: honest empty states; no demo numbers). *Why here:* falsified logs are
Disposafe's stated problem #1; ALCOA+ is the purchase justification; a single
unverifiable KPI poisons trust in all of them. View Source is the moat —
generalize it from a modal feature into a universal affordance.

### P2 — One question per surface
Every screen, card, and drilldown level answers exactly one operational
question, named in its title in plant language ("Which gate is losing the most
this month?"), and offers the *next* question as its exits. Navigation is
organized by question/task, not by chart type or subsystem. *Why here:*
users' questions are few and stable (is it okay → what's wrong → why → cost →
who fixes it → prove it), while analytical capability grows unboundedly. Pinning
IA to questions is what lets the feature set grow without the surface growing.

### P3 — Progressive disclosure along the investigation path
The default depth is the answer; detail is one intentional step down, always in
the fixed narrative order **what happened → why → cost → evidence → action**.
The factory overview (A15) answers "okay or not" in five seconds; everything
else is reached *from* a problem, not from a menu. SPC, COPQ, defect Pareto,
size heatmaps are steps inside an investigation, not sibling destinations.
*Why here:* the GM's own review ranked "simpler layout" and dense-UX complaints
above new capability; the 2026-07-01 investigation-UX plan already proved every
narrative step exists in computed data — this is ordering, not building.

### P4 — Role shapes the surface
An operator terminal (capture + confirm), an engineer workbench (investigate +
adjudicate), and a management cockpit (status + cost + owners + export) are
different *surfaces over the same ledger*, not one surface with everything.
Complexity is hidden by role and authority, not buried in menus — schema
governance and destructive actions never render for people who shouldn't hold
them. *Why here:* the users' complexity tolerances differ by an order of
magnitude, and the client explicitly asked for "authority-wise reserved
rights"; RBAC is a UX principle before it is a security one.

### P5 — Capture deserves the best UX in the product
Data entry is the front door and the daily habit; analytics is the payoff.
Entry must speak the shop floor's grain (batch-first, per-gate, per-size),
validate inline against the ledger's rules, and cost minutes, not attention.
*Why here:* the product contract is now entry-first; every downstream insight
is bounded by capture quality; the incentive to falsify shrinks when honest
entry is the easiest path. A tool operators resent produces the dirty data the
system exists to eliminate.

### P6 — The system asks; it never assumes
Ambiguity (defect-sum ≠ rejected, dept-vs-dept conflicts, manual-vs-Excel) is
surfaced as an explicit human decision with both options shown, applied only on
confirmation, and recorded in provenance (A12 option 3, A21, A9/A19). Warnings
are a workqueue with ownership and status, not toasts. *Why here:* the client
literally chose "always ask" over auto-fix; in a regulated plant, a silent
"smart" correction is indistinguishable from tampering. Adjudication *is* a
core workflow, so give it first-class workflow UX.

### P7 — Honest states, always
Success means events on the ledger; anything less renders as "not done yet,
here's the next step." Empty states name the exact action and data source that
would fill them. Processing states show real pipeline phases. Numbers the
system recomputed (A11: sheet % is a claim) are labeled as recomputed. *Why
here:* the Workbooks false-success and empty-dashboard-after-upload incidents
are this product's specific recurring failure mode, and each occurrence burns
the exact trust the product sells.

## 5. The growth rule (how it stays simple as it gets powerful)

**New capability must land as a deeper answer inside an existing question — a
new step, dimension, or evidence type in the investigation path — never as a
new top-level destination by default.** The count of top-level surfaces is the
complexity budget; spending it requires demonstrating a genuinely new *user
question* (not a new analysis technique). Correlation engines, VSM/WIP
diagnostics, multi-plant comparison, CAPA memory — every roadmap item in the
problem statement maps onto an existing question (why / where / cost / act) and
should ship as depth, not breadth. This is the single rule that prevents the
next three eras of the codebase from re-creating today's 17-item sidebar.

## 6. Anti-patterns (banned)

- Adding a nav item because a subsystem exists (Workbooks-style "internal organ
  as a page").
- Modal-only drilldowns for anything worth sharing in a review meeting —
  investigations get URLs.
- Any success indication not backed by ledger events.
- Auto-resolving data conflicts, however "obvious."
- Showing operators governance/admin controls, or GMs raw adjudication noise.
- Analytics vocabulary where plant vocabulary exists (say "gate," "lot,"
  "FY 25-26," "₹"; not "dimension," "aggregate," "series").
- A chart that doesn't state which question it answers.

## 7. How to apply this doc

Before building or changing a screen, answer in one line each:
1. Which single question does this surface answer, in plant language? (P2)
2. Which role is it for, and what must therefore be absent? (P4)
3. What is the step-down path what→why→cost→evidence→action? (P3)
4. Can every number on it reach its source in ≤2 interactions? (P1)
5. What does it show when the honest answer is "nothing yet"? (P7)
6. Is any ambiguity auto-resolved anywhere on it? (must be no) (P6)
7. Is this depth inside an existing question, or a new top-level surface —
   and if the latter, which new user question justifies the budget? (§5)

If a proposal can't answer these, it isn't ready — regardless of how good it
looks.
