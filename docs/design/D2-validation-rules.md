# D2 — Validation Rule Catalog

**Status:** v1.0 (2026-06-11) · **Depends on:** D1 (frozen v1.0.0) · **Feeds:** D3 (findings), B2 (engine)

Every rule is a **pure function** over the canonical event store (D1 events + registries). No LLM in the logic path — the LLM's only role is attaching *hypothesis templates* to an already-fired Finding. Severities: `critical` (numbers in the GM report would be wrong), `warning` (inconsistency needs adjudication before the affected metric can be "verified"), `info` (notable, doesn't gate verification).

Common output shape (full schema in D3): a **Finding** carries `ruleId`, severity, plain-language question, evidence event ids + cells, computed vs stated magnitudes, and 1–3 LLM hypotheses tagged `mistake | intentional-practice | unknown`.

Conventions in pseudocode: `E` = effective event set (superseded excluded), `claims` = AggregateClaim events, `obs` = observation events (Production/Inspection/Rejection), `reg` = client registry. `≈` means equal within `epsilon = 0.005` for percentages (display rounding) and exact for integer counts.

---

## V-001 — Stage conservation (dispositions vs checked)

- **Inputs:** `Production`, `Inspection` per (stageId, period, batchNo?)
- **Logic:**
  ```
  for each (stage, period[, batch]) with a Production event P:
    dispSum = Σ Inspection.quantity where same key, disposition ∈ {accepted, rejected, hold, downgrade}
    if dispSum > P.quantity        → fire (overflow)
    if dispSum < P.quantity AND no hold/downgrade events exist for key
                                   → fire (leak: unaccounted quantity)
  ```
- **Severity:** overflow `critical`; leak `warning`
- **Finding:** "On {date} at {stage}, {dispSum} pieces were dispositioned but only {qty} were checked" (or "…{missing} pieces are unaccounted for").
- **Hypotheses:** mistake: "transcription/typo in one of the columns"; intentional: "re-checked items counted twice (rework loop)"; intentional: "remainder carried to next day uninspected".
- **Real example:** ASSEMBLY `APRIL 25` R8: VISUAL QTY 12039, ACPT 10946, REJ 847 → 11793 ≠ 12039; 246 pieces unaccounted (no hold column at this stage). Fires *leak*.

## V-002 — AggregateClaim sum recomputation

- **Inputs:** `AggregateClaim(claimKind=sum)`, obs events in the claim's period/stage scope
- **Logic:**
  ```
  recomputed = Σ matching obs quantities (period, stage, defect scope from claim)
  if claim.statedValue is error-string → fire V-011 instead
  if recomputed ≠ statedValue → fire, magnitude = |Δ|
  ```
- **Severity:** `critical` if the claim feeds a monthly/yearly total, else `warning`
- **Finding:** "The sheet's {aggregation} total in {cell} says {stated}, but the rows above sum to {recomputed} (difference {Δ})."
- **Hypotheses:** mistake: "total formula range omits/overlaps rows"; intentional: "total includes rows from another sheet/period".
- **Real example:** SHOPFLOOR `APRIL 25` B30 (`=SUM(B4:B29)` = 1562 trolleys) vs Σ row totals K = 1626 — combined with V-006 below this is the demo Finding.

## V-003 — Percentage claim recomputation

- **Inputs:** `AggregateClaim(claimKind=percentage)`, the numerator/denominator obs or claims its formula references
- **Logic:**
  ```
  parse formulaText refs → resolve to events by provenance cell map
  recomputed = num/den*100  (den=0 → expect error string; see V-011)
  if |recomputed − statedValue| > 0.005 → fire
  also: if cachedValue ≠ statedValue context (formula-vs-cached divergence
        after re-evaluation) → fire at warning
  ```
- **Severity:** `warning`
- **Finding:** "{cell} shows {stated}% but {num}/{den}×100 = {recomputed}%."
- **Hypotheses:** mistake: "stale cached value — workbook saved without recalculation"; intentional: "percentage computed against a different base (e.g. checked vs received)".
- **Real example:** ASSEMBLY `APRIL 25` E6 `=D6/B6*100` cached 9.5975… vs D6/B6 = 1054/10982 = 9.5975 ✓ (passes); the rule's *failure* example is any stale-cache divergence — and VISUAL `APRIL 25` F-col percentages whose REJ base is the derived E column (see V-012 interplay).

## V-004 — Stated rejection vs sum of defect reasons

- **Inputs:** `Inspection(disposition=rejected)`, `Rejection` per (stage, period[, batch])
- **Logic:**
  ```
  reasons = Σ Rejection.quantity for key
  stated  = Inspection(rejected).quantity for key
  if reasons ≠ stated → fire, magnitude |Δ|, direction (under/over-attributed)
  ```
- **Severity:** `warning` (`critical` if Δ > 5% of stated)
- **Finding:** "On {date}, {stated} pieces were rejected but the reason columns account for {reasons} ({Δ} {un|over}-attributed)."
- **Hypotheses:** mistake: "a defect column was missed while tallying"; intentional: "small defects below a threshold aren't categorised"; intentional: "'Others' bucket used inconsistently".
- **Real example (known failure):** VISUAL `APRIL 25` R34 (2025-04-30): stated REJ E34 = 1708; reasons G..AA sum = 1544; 164 unattributed. **Must fire in B2 acceptance fixture.**

## V-005 — Percentage-of-percentages (invalid aggregation method)

- **Inputs:** `AggregateClaim(claimKind∈{percentage,derived})` whose `formulaText` references only other percentage-claim cells
- **Logic:**
  ```
  refs = parse(formulaText); if all refs resolve to percentage claims
  and operator is + or AVERAGE → fire (sum/average of ratios with unequal bases)
  recompute correct value from underlying counts for the Finding message
  ```
- **Severity:** `critical`
- **Finding:** "{cell} adds percentages together ({refs}); the mathematically consistent figure from the underlying counts is {correct}%, not {stated}%."
- **Hypotheses:** mistake: "ratios added as if they were counts"; intentional: "GM wants a 'stage severity index', not a true rate" (→ GM-authority escalation per D3).
- **Real example (known failure):** ASSEMBLY `YEARLY 2025-26` Q19 `=E19+I19+M19` → 9.25%, vs true total rejection rate 276725/2432089 ≈ 11.38% — *and* per-month Q6 `=E6+I6+M6` same pattern. **Must fire in B2 acceptance fixture.**

## V-006 — Omitted/extra term in total formula

- **Inputs:** `AggregateClaim(sum|derived)` with `formulaText` of form `=A+B+…` or `=SUM(range)`, plus the table's column registry (which defect/disposition columns exist)
- **Logic:**
  ```
  expectedTerms = data columns of the table's defect/component group
  actualTerms   = parse(formulaText)
  if actualTerms ⊂ expectedTerms (missing) or ⊃ (extra) → fire, name the columns
  ```
- **Severity:** `critical`
- **Finding:** "The grand total in {cell} skips column {col} ('{header}'); including it gives {corrected} instead of {stated}."
- **Hypotheses:** mistake: "column added after the formula was written and never included"; intentional: "'{header}' is tracked but deliberately excluded from the total" (→ GM-authority).
- **Real example (known failure):** SHOPFLOOR `APRIL 25` K30 `=C30+D30+E30+F30+G30+H30+J30` omits **I30 (Missing Formers, 76)** → 1550 vs 1626. **Must fire in B2 acceptance fixture.**

## V-007 — Defect-code resolution below confidence threshold

- **Inputs:** `Rejection` events where `defectCode = null` or `confidence.score < 0.8`
- **Logic:** group unresolved `defectCodeRaw` strings per ingestion; one Finding per distinct raw label.
- **Severity:** `warning`
- **Finding:** "Column '{raw}' on {sheet} doesn't match any known defect category. Closest known: {suggestions}."
- **Hypotheses:** mistake: "misspelling of {candidate}"; intentional: "a genuinely new defect category — add to registry".
- **Real example:** BALLOON `APRIL 25` headers `BALLOOM BRUST` / `BALLOON BRUST` (alias-listed, resolve) — but a *future* variant like `BALON BURST` would fire; v1 seed test uses a synthetic unseen label against the real sheet.

## V-008 — Stage-handoff conservation (DAG sequence)

- **Inputs:** `Production`/`Inspection` across adjacent stages per `reg.stages[].upstream`, same period
- **Logic:**
  ```
  for each edge (up → down), period:
    downChecked = Production(down, period).quantity
    upAccepted  = Inspection(up, accepted, period).quantity
    if downChecked > upAccepted (+ carryover-in if Carryover events exist)
      → fire (material appeared from nowhere)
    persistent downChecked < upAccepted across ≥ N=5 consecutive days → fire info (WIP building up)
  ```
- **Severity:** overflow `warning`; WIP buildup `info`
- **Finding:** "{down} checked {downChecked} on {date}, but {up} only accepted {upAccepted} — {Δ} more than was available."
- **Hypotheses:** intentional: "previous day's accepted stock processed today (1-day WIP lag)"; mistake: "row entered against the wrong date"; intentional: "rework re-entering the line".
- **Real example:** ASSEMBLY `APRIL 25` R8: BALLOON CHKD F8 = 10746 vs VISUAL ACPT C8 = 10946 (passes ≤); R13 (2025-04-07): BALLOON CHKD 4553 = VISUAL ACPT 4553 ✓; but `MAY 25` R8 (2025-05-03): BALLOON CHKD 6642 > VISUAL ACPT 2280 → fires with Δ=4362 (almost certainly WIP lag — the canonical *intentional* adjudication demo).

## V-009 — Date/period anomalies

- **Inputs:** all events' `occurredOn` + provenance (sheet name, row class)
- **Logic (sub-checks, one rule id, distinct finding subtypes):**
  ```
  a. day outside host sheet's month (after D1 §5.3 normalization)
  b. serial-decoded date implausible (< 2024-01-01 or > today+1y)
  c. week period not covered by its member days; week crossing month without
     a period-bridge Carryover
  d. duplicate calendar day within one sheet/table
  e. data present on a row marked SUNDAY/HOLIDAY marker in the same table
  ```
- **Severity:** b,d `warning`; a,c,e `info`
- **Finding:** subtype-specific plain-language question.
- **Real example:** VISUAL `JULY 25` weekly totals referencing `'AUGUST 25'` (subtype c — fires until the bridge is adjudicated/rule-compiled); VISUAL sheet `4-2-25` whose B4 serial 45692 = 2025-02-04, predating the APRIL-start workbook FY (subtype a, info).

## V-010 — Duplicate / near-duplicate ingestion

- **Inputs:** event store across ingestions
- **Logic:**
  ```
  identical eventId → idempotent skip, NO finding (expected re-upload)
  near-duplicate: same (type, stage, period, batch, defect) key + same provenance
  cell but different quantity → fire (the file was edited between uploads)
  same key from a DIFFERENT file/sheet → fire info (two sources claim the
  same observation — e.g. ASSEMBLY's VISUAL block vs VISUAL file, see D1 §9 Q1)
  ```
- **Severity:** edited-cell `warning`; cross-source `info`
- **Finding:** "This cell previously said {old} (uploaded {date}); it now says {new}. Which is correct?" — adjudication produces a `Correction`.
- **Real example:** cross-source: ASSEMBLY `APRIL 25` B6 (VISUAL QTY 10982, 2025-04-01) vs VISUAL `APRIL 25` B9-region REC. QTY for the same day — same observation, two files. Fires `info` pending D1 §9 Q1.

## V-011 — Error values and unverifiable externals

- **Inputs:** `AggregateClaim` with error-string `statedValue` or `externalRef ≠ null`; `Dispatch`
- **Logic:**
  ```
  "#DIV/0!" with zero denominator events       → info (benign: idle day)
  "#DIV/0!"/"#REF!" feeding a higher total     → warning (poisons rollup)
  externalRef ≠ null → info finding ONCE per (file, externalRef workbook):
    "values come from {workbook} which wasn't uploaded; they stay 'assumed'"
  ```
- **Severity:** as above
- **Real example:** ASSEMBLY `JULY 25` R12 (2025-07-06, all-zero day) E12 `#DIV/0!` → benign info; CUMULATIVE `Sheet1` C4 `='[1]APRIL 25'!$N$32` → external info; ASSEMBLY `YEARLY` rows JAN–MAR 26 `#DIV/0!` in a TOTAL-feeding column → warning.

## V-012 — Derived-column consistency (REJ = REC − (ACCEPT + HOLD))

- **Inputs:** `Inspection` family per key where the source column was formula-derived (`claimKind=derived` sibling claim exists)
- **Logic:** recompute the derivation from sibling observation events; if the *written* derived value ≠ recomputation → fire. Also fire `info` when REJ is derived rather than counted (a *policy* fact worth one-time adjudication: "is rejection ever counted directly?").
- **Severity:** mismatch `warning`; derivation-policy `info` (once per table family)
- **Real example:** VISUAL `APRIL 25` E-col `=B−(C+D)` — consistent (passes), fires the one-time `info` policy finding.

## V-013 — Unknown rows / unclassifiable structure

- **Inputs:** ingestion row-classification output (D1 §5.4), `CandidateSheetGraph`
- **Logic:** any `unknown` row class, any table whose extraction confidence < 0.7, any non-template sheet yielding zero events → fire.
- **Severity:** `warning`
- **Finding:** "Rows {n–m} on {sheet} couldn't be understood — what are they?"
- **Real example:** VISUAL `APRIL 25` R37 — unlabeled row of floats (0.5, 0.5, 0.1, …) under the % row; plausibly per-defect tolerance targets. **Must reach adjudication, not be dropped.**

---

## Coverage matrix (exit criteria)

| Known real error (D1 §2 row 5) | Rule | Acceptance fixture |
|---|---|---|
| SHOPFLOOR K30 omits col I | **V-006** (+V-002 corroborates) | `B2` fixture #1 — expected Finding: omitted column `I` ("Missing Formers"), stated 1550 vs corrected 1626 |
| ASSEMBLY YEARLY Q19 sums percentages | **V-005** | `B2` fixture #2 — expected Finding: stated 9.25% vs true 11.38% |
| VISUAL R34 reasons ≠ stated REJ | **V-004** | `B2` fixture #3 — expected Finding: 1544 vs 1708, Δ=164 |
| `#DIV/0!` cells | V-011 | benign vs rollup-poisoning split |
| Cross-file cached pulls | V-011 | external-workbook info finding |
| Mid-year stage drift | (no rule needed — registry handles; V-013 catches unregistered drift) | |

Rule→Finding wiring, lifecycle, and escalation (steward vs GM authority per rule) are specified in D3. Notably: V-005 and V-006 `intentional` verdicts escalate to GM (process-policy); V-001/V-004/V-008/V-009/V-010 are steward-settleable.
