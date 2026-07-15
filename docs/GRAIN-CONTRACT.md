# Grain Contract — MO!D / RAIS-Pro  
**Client: Disposafe (Foley Balloon Catheter line) · Status: ASSUMPTIONS — confirm or correct**  
**Version: 0.1 · Date: 2026-07-15 · Owner: Engineering (for client sign-off)**

> **How to use this document**  
> Everything marked **[A#]** is an **assumption** built from your existing Excel books and the current system.  
> Please mark each assumption: **✓ Confirm** · **✗ Wrong (write the rule)** · **? Unsure**.  
> Until this is signed off, dashboards may look polished but are built on **guessed** identity rules.  
> One page of decisions here prevents months of rework.

---

## 1. What is one “fact” we store?

Every number in the system is one **observation**:

| Field | Meaning | Example from your world |
|---|---|---|
| **When** | Business date the inspection/production happened | `2025-04-02` |
| **Stage** | Process / inspection gate | Visual Inspection, Balloon Testing, Valve Integrity, Final |
| **Size** | French size (when the sheet is size-wise) | `16 FR` |
| **Batch** | Work unit / lot identifier (when present) | `25A28` (seen on VISUAL-style sheets) |
| **Measure** | What was counted | Checked / Accepted / Hold-Rework / Rejected |
| **Defect** | Rejection reason (when broken down) | COAG, PINH, STBL, LEAK, OTH, … |
| **Qty** | Integer count (pcs; sometimes trolleys) | `120` |
| **Source** | Where the number came from | File name + sheet + cell, or manual entry |

**We do not invent numbers.** Missing data shows as empty, never estimated.

---

## 2. Dimensions — what we believe “batch” means

| ID | Assumption | Confirm? |
|---|---|---|
| **[A1]** | A **batch** is a **lot / batch number** written on the inspection sheet (e.g. `25A28`), not a trolley and not “the whole day.” | |
| **[A2]** | One batch can appear on **more than one stage** (e.g. same lot later at Balloon / Final) — stages are separate facts, not one merged row. | |
| **[A3]** | Batch is **optional**. Many rows in your books are **day-only** (no batch column). Those stay valid with `batch = (none)`. | |
| **[A4]** | **Size** and **batch** are independent: same day can have multiple sizes and multiple batches. | |
| **[A5]** | **Shift** (Day/Night) is metadata for entry/audit, not the primary KPI axis (unless you say otherwise). | |
| **[A6]** | **Machine / operator / supervisor** are optional tags, not required for rejection rate math. | |

**If [A1] is wrong**, write your definition here:  
_Batch means: _______________________________________________ _

---

## 3. Aggregation rules (the decisions that make or break totals)

These rules decide whether two Excel rows become **one total** or **two lines**.

| ID | Situation | Our default rule | Confirm? |
|---|---|---|---|
| **[A7]** | Same **stage + day + size**, **different batches** | Keep as **separate batch rows**. For **daily / monthly KPIs**, **sum** them. | |
| **[A8]** | Same **stage + day**, one file has **per-size** rows and also a **whole-line total** | Prefer **size rows** (sum = stage total); drop the redundant whole-line total to avoid double count. | |
| **[A9]** | Same **stage + day** described by **two different uploaded files** | Keep the **higher-precedence** source only (size-wise / detailed > summary). Direct manual entry **wins** over upload for that day. | |
| **[A10]** | Re-upload of the **same file** | **Idempotent** — does not double-count. | |
| **[A11]** | Sheet has a **% rejection** formula cell | Store as a **claim to verify**, not as the source of truth. Dashboard **recomputes** rate from checked & rejected. | |
| **[A12]** | Defect columns sum ≠ Rejected total | **Flag as a data issue** (warning); still store both; do not silently “fix” the sheet. | |

**Critical yes/no for batch operations:**

> **[A13]** When a manager opens “Batch view,” should they see **unmerged** batch lines (even if same day/size)?  
> **Default: YES.**  
> Confirm? ______

> **[A14]** When a manager opens “Monthly dashboard,” should they see **sums across batches** for that month?  
> **Default: YES.**  
> Confirm? ______

---

## 4. Primary views (what the product optimises for first)

We will support **both** calendar and batch. Defaults for v1:

| Priority | View | Question it answers | Default? |
|---|---|---|---|
| P0 | **Stage · Day** | “What happened at Visual yesterday?” | On |
| P0 | **Stage · Day · Size** | “Which FR is rejecting more this week?” | On (where size-wise sheets exist) |
| P0 | **Defect Pareto** (scoped by stage/period) | “Which defect codes dominate?” | On |
| **P0** | **Batch table** | “How did lot `25A28` perform?” / “Worst batches this week?” | **On — elevating** |
| P1 | Week / Month / FY rollups | Management calendar reporting | On |
| P2 | SPC control charts | Process stability | After P0 trusted |
| P2 | COPQ ₹ savings | Cost of poor quality | After P0 trusted |
| P3 | Full 27-step process map | Line storytelling | Optional overlay |

**[A15]** The **Monday-morning default home screen** should be:  
- [ ] Factory overview (all quality gates, current period) ← **default**  
- [ ] Batch list (latest batches first)  
- [ ] Single stage deep-dive  
- [ ] Other: ___________

---

## 5. Stages & sheets we model today (from your books)

| Quality gate (stage) | Size-wise? | Defect breakdown? | Typical source |
|---|---|---|---|
| Visual Inspection | Yes | Yes (COAG, PINH, …) | VISUAL / size-wise books |
| Balloon Testing | Yes | Yes (STBL, BLBR, LEAK, …) | Valve / balloon books |
| Valve Integrity | Yes | Yes (LEAK, 90/10, BUB, THSP, …) | Same family |
| Final Inspection | Yes | Yes (subset of visual-like codes) | FINAL sheets |
| Production / eye-punching / … | Often no | Often no or light | Daily activity / shopfloor |

**[A16]** These four gates (Visual, Balloon, Valve Integrity, Final) are the **primary** analytics universe for v1; other process steps are secondary until you prioritise them. Confirm? ______

**[A17]** French sizes **6–24 FR** cover production. Confirm full list or strike unused:  
`6, 8, 10, 12, 14, 16, 18, 20, 22, 24` ______

**[A18]** Fiscal year starts **April** (FY Apr–Mar). Confirm? ______

---

## 6. Source of truth when things disagree

| ID | Conflict | Default rule | Confirm? |
|---|---|---|---|
| **[A19]** | Excel upload vs manual data entry for same stage·day | **Manual entry wins** | |
| **[A20]** | Detailed size-wise book vs monthly summary book | **Detailed book wins** | |
| **[A21]** | Two “official” numbers from different departments | System **flags conflict**; human adjudicates — we do not pick silently | |
| **[A22]** | Column header spelling variants (“STRUCK BALLOON” / “BALLOOM BRUST”) | Map to **one defect code** after you verify mappings once; keep raw text for audit | |

---

## 7. What “done / outstanding” means for v1 (MLP)

**In scope (must be trustworthy):**

1. Upload your workbooks → map columns once → numbers in ledger match the sheet  
2. **Day** and **Batch** views (where batch exists on sheet or is entered)  
3. Stage / size / defect breakdowns with **View Source** (cell provenance)  
4. No silent double counting  
5. Export / audit of what was stored  

**Explicitly later (not required for first sign-off):**

- Full SPC suite polish  
- COPQ finance-grade costing  
- CAPA automation  
- Multi-plant / multi-product ontology  
- AI chat as primary decision tool (AI only explains numbers already computed)

**[A23]** Do you agree this MLP order? If not, rank your top 3:  
1. ________  2. ________  3. ________

---

## 8. Worked example (so we mean the same thing)

**Sheet rows (Visual, 2025-04-02):**

| Batch | Size | Checked | Rejected | PINH |
|---|---|---|---|---|
| 25A28 | 16 FR | 1000 | 12 | 5 |
| 25A29 | 16 FR | 800 | 4 | 1 |
| 25A28 | 18 FR | 500 | 6 | 2 |

| View | What the system should show under defaults |
|---|---|
| **Batch `25A28`** | Two lines (16 FR + 18 FR): checked 1000+500, rejected 12+6, or one batch total **if you prefer rolled size** — see [A24] |
| **Day 2025-04-02 · Visual · 16 FR** | Checked **1800**, Rejected **16** (both batches summed) |
| **Month** | Sums all days (batches summed unless you open Batch view) |

**[A24]** For one batch with multiple sizes, default is **keep size split inside the batch**.  
Prefer instead **one total per batch** (hide size)? **Yes / No** ______

---

## 9. Sign-off

| Role | Name | Date | Signature / OK |
|---|---|---|---|
| Plant / Quality owner | | | |
| Who uses the dashboard daily | | | |
| Who owns the Excel files | | | |
| Engineering | | | |

**Instructions for client:**  
Return this file (or a reply email) with each **[A#]** marked ✓ / ✗ / ?.  
✗ answers should include one sentence of the correct rule.  
No need for a long PRD — **corrected assumptions are the PRD.**

---

## 10. Internal note (not for client)

| Assumption | Maps to system today | Gap |
|---|---|---|
| Batch optional, day primary | Events have `batchNo`; entry has header batch | Batch not first-class in analytics UI |
| [A7] sum for KPIs, separate for batch view | Canonicalizer keeps multi-batch rows from one file; selectors sum | Need explicit `byBatch` views |
| [A8][A9] precedence | `canonicalizeEvents` | Keep |
| [A11] claims vs facts | AggregateClaimEvent | Keep |
| Defect catalog | MOD / migration seed | Entry UI must follow sheet/MOD, not hardcode |

After sign-off: implement Batch table + entry grain; finish entry-template rewire; freeze MLP.
