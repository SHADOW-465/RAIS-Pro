# Grain Contract — Frozen Decisions (v1)
**Client: Disposafe · Source: response grain.pdf + follow-up (A12 option 3)**  
**Status: WORKING AGREEMENT (button answers; formal name sign-off still blank)**  
**Date locked: 2026-07-15**

Use this file as the engineering source of truth. Do not re-open confirmed items without a new client note.

---

## Identity of a fact

Every stored number is one observation:

`when + stage + size? + batch? + measure|defect + qty + source`

- Never invent or interpolate missing values.
- Provenance (file/sheet/cell or manual entry) always retained.

---

## Confirmed dimensions

| ID | Rule |
|---|---|
| A1 | **Batch** = lot/batch number on the sheet (e.g. `25A28`), not trolley, not “the whole day.” |
| A2 | Same batch may appear on **multiple stages** — separate facts per stage. |
| A3 | Batch is **optional**; day-only rows are valid (`batch = null`). |
| A4 | **Size** and **batch** are independent. |
| A5 | **Shift** is metadata, not the primary KPI axis. |
| A6 | Machine / operator / supervisor are optional tags; not required for rejection math. |

---

## Aggregation

| ID | Rule |
|---|---|
| A7 | Same stage·day·size, different batches → **separate rows** in batch view; **sum** for day/month KPIs. |
| A8 | Prefer **per-size rows** over redundant whole-line totals (avoid double count). |
| A10 | Re-upload of the same file is **idempotent**. |
| A11 | Sheet **%** is a claim only; dashboard **recomputes** rate from checked & rejected. |
| A13 | Batch view shows **unmerged** batch lines. |
| A14 | Monthly dashboard **sums across batches**. |
| A24 | One batch with multiple sizes → **keep size split** (not one rolled batch total). |

---

## Product shape

| ID | Rule |
|---|---|
| A15 | Default home = **Factory overview** (all quality gates, current period). |
| A16 | Primary gates v1: **Visual, Balloon, Valve Integrity, Final**. |
| A17 | French sizes **6–24 FR**. |
| A18 | Fiscal year starts **April** (Apr–Mar). |
| A20 | Detailed size-wise book **beats** monthly summary book. |
| A21 | Two “official” numbers from different depts → **flag conflict**; human adjudicates; no silent pick. |
| A22 | Header spelling variants map to **one defect code** after verify; keep raw text for audit. |
| A23 | MLP order agreed: trustworthy upload + day/batch views + provenance + no double count + export. SPC/COPQ/CAPA/AI multi-plant later. |

---

## Changed rules (client ✗)

### A9 + A19 — Manual vs Excel conflict

**Not** “manual always wins.”

**Rule:** Prefer the source that is **more detailed and specific**.  
If manual is more detailed → manual. Else → Excel.  
If unclear → **do not auto-pick**; surface both and ask the user (aligned with A21).

*Detail heuristics for a suggested default (not a silent force):* has size split, has batch, has defect breakdown, finer grain / more complete columns.

### A12 — Σ defects ≠ Rejected  **← locked by follow-up**

**Client choice: option (3).**

| Step | Behavior |
|---|---|
| 1 | **Detect** imbalance: `sum(defect qtys) ≠ rejected` (when both present). |
| 2 | **Warn** (data issue) — do not silently rewrite. |
| 3 | **Always ask the user** with **both options shown**: |
| | **(1)** Set Rejected = sum(defects) |
| | **(2)** Leave Rejected as-is and treat defect breakdown as incomplete |
| 4 | Apply the chosen fix **only after explicit approval**. |
| 5 | Keep original values + choice in audit/provenance where possible. |

**Do not implement silent (1) or silent (2).**  
**Do not auto-apply a “logical” fix without the dialog.**

UI sketch (staging review / data-entry invalid row):

```text
Defect sum (12) ≠ Rejected (15)

  ( ) Set Rejected = 12  (match defect columns)
  ( ) Keep Rejected = 15  (treat defects as incomplete)

  [ Apply after I confirm ]
```

---

## Implementation checklist (from this freeze)

- [ ] Batch table / batch-scoped analytics (A7, A13, A14, A24)
- [ ] Conflict resolution: detail-based suggestion + human pick for manual vs Excel (A9, A19)
- [ ] A12 dialog: always show options (1) and (2); apply only on confirm
- [ ] Keep existing: size-over-line (A8), idempotent upload (A10), recompute % (A11), factory home (A15)

---

## Still open (process, not product rules)

- Formal named sign-off on the HTML panel was blank — product rules above are still the working agreement from their button answers + A12 option 3.
