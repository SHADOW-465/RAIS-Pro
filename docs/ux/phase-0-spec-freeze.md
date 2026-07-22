# Phase 0 — Spec freeze (acceptance foundations)

**Status:** Frozen for Phase 1 implementation · 2026-07-21  
**Doctrine:** `docs/UX-PHILOSOPHY.md` v3 §13 (IG-*, RP-*, IO-*, EX-*, DS-*)  
**Not this doc:** Visual layout or full nav migration.

---

## 1. Role × primary path (RP-1…5)

Source of truth remains the F4 table in `docs/UX-PHILOSOPHY.md`. Operational summary:

| Role id | Home question | Ordered path | Environment class |
|---|---|---|---|
| `operator` | What do I log now? | Capture → Integrity (inline) → Confirm | Operator terminal |
| `supervisor` | What’s blocked / needs my call? | Attention queue → Adjudicate → Confirm | QE desk (subset) |
| `qe` | What’s abnormal, and why? | Status → Locus → Cause → Integrity (signal) → Cost → Action → Proof | QE desk |
| `qa` | What’s unresolved / audit-risky? | Queue → Integrity → Action → Proof pack | QE desk |
| `gm` | Are we okay, and what’s the ₹ / who owns it? | Status → Cost → Ownership → Proof pack | Meeting / projection |

**Interim proxy (until auth):** persona/environment switch may hide chrome (Phase 3). Phase 1 does **not** require the switch — only that Status/integrity rules match all roles (no greenwash).

**Shared step vocabulary:**  
`Status · Locus · Cause · Integrity · Cost · Action · Proof · Capture`

---

## 2. Default comparison frame for Status (DS-1)

When labeling **okay / watch / at-risk** (metric quality only — after integrity gate):

| Layer | Source | Default | Effect |
|---|---|---|---|
| **Primary threshold** | Client target rejection rate | `rais_settings_target_rejection` or **10%** | rate > target → `at-risk` |
| **Watch threshold** | Client watch line | `rais_settings_watch_rejection` or **5%** | rate > watch (and ≤ target) → `watch` |
| **Secondary frame** | Prior period of the **same grain** | Immediate previous day/week/month/FY bucket with data | Reason text includes Δ vs prior when available |
| **Integrity override** | Open integrity issues in scope | See §3 | Forces `blocked` — never `ok` |

**Not in v1 Status:** Western Electric / SPC as the sole “abnormal” definition (SPC remains depth).  
**AI:** Optional narrative only; numbers-only Status is complete (DS-2).

---

## 3. Integrity gate semantics (IG-1…4)

**Hard law:** Understand must not present trustworthy **ok** for a scope that still has **open integrity issues** in that scope.

### Issue kinds (deterministic from ledger events in Phase 1)

| Code | Meaning | Open when |
|---|---|---|
| **V-004** | Defect sum ≠ rejected | Same stage·day·size has both inspection(rejected) and defect `rejection` events, and Σ defects ≠ rejected qty |
| **V-014** | Mass balance | For date·size·batch, checked(N+1) > available(N) on gate chain Visual → Balloon → Valve Integrity → Final |
| **external** | Open findings (optional input) | Caller passes open critical findings (e.g. V-010 conflicts) |

Lifecycle: Phase 1 treats event-derived mismatches as **open** until data is corrected (superseding events remove the mismatch). Explicit adjudication store is not required for the Status gate in this phase.

**States:**

| `QualityState` | Meaning |
|---|---|
| `blocked` | Open integrity issue(s) in scope — needs adjudication/fix |
| `at-risk` | No integrity block; rate > target |
| `watch` | No integrity block; rate > watch, ≤ target |
| `ok` | No integrity block; rate ≤ watch |

---

## 4. Investigation state shape (IO-1…3, EX-1)

Minimal addressable scope for share / resume / mid-path entry:

```ts
/** Serialized investigation / Understand scope (URL query or session). */
export interface InvestigationState {
  grain: "day" | "week" | "month" | "fy";
  /** Inclusive ISO dates; omit = latest period heuristic */
  from?: string; // yyyy-mm-dd
  to?: string;
  /** Quality gate; omit / "cumulative" = all gates */
  stage?: string;
  size?: string;   // e.g. Fr16
  batch?: string;  // e.g. 25A28
  /** Metric that started the chase */
  metric?: "rate" | "fpy" | "copq" | "defect" | "size" | "stage" | string;
  /** Optional human label for recents */
  label?: string;
}
```

**URL convention (Phase 3 implement):**  
`?grain=month&from=2026-06-01&to=2026-06-30&stage=visual&size=Fr16&batch=25A28&metric=rate`

**Phase 1–2:** Type + `investigationHref` / `goInvestigation` / recents in
`src/lib/analytics/investigation-state.ts`; apply via
`useApplyInvestigationFromUrl` on analysis pages. No full AppShell rewrite.

---

## 5. Phase 1 deliverables mapped to tests

| ID | Deliverable |
|---|---|
| IG-1, IG-4 | `qualityStatus` → `blocked` when integrity open; metric ok after clean |
| IG-2 | A12 dialog already in `BatchMatrixEntry` (verify only) |
| IG-3 | `massBalanceIssues` on ingest (already wired) + event-side V-014 in integrity scan |
| DS-1 | Comparison frame in status reason + this freeze |
| RP-* | Documented here; chrome proxy later |
| IO-* | Type exported; URL wiring Phase 3 |
)