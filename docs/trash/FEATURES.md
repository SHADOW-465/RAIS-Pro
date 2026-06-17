# RAIS Pro — Feature Specification (design-agnostic)

> This document describes **only what the application does** — its capabilities, logic, rules, inputs, and outputs. It deliberately says **nothing about presentation** (no layout, components, colors, typography, or interaction styling). Any UI may be designed on top of these features.

---

## 0. Purpose

The application ingests real-world manufacturing **rejection / inspection spreadsheets** and turns them into a **trustworthy quality analysis**: headline quality metrics, breakdowns, trends, a written summary with insights and recommended actions — plus the ability to **trace every number back to the exact source data it came from.**

It is built for a regulated, audit-sensitive context. Its defining promise is **correctness with provenance**: numbers are computed deterministically from the raw rows (never invented), and every reported number is linked to its origin.

---

## 1. Foundational principle (governs every feature)

**The model never does arithmetic.** Artificial intelligence is used for exactly two jobs:
1. **Classification** — labeling what each spreadsheet column represents.
2. **Narrative** — writing prose (summary, insights, recommendations) from already-computed numbers.

**All quantities are produced by deterministic computation over the raw rows.** No metric, total, rate, or chart value is ever taken from a model's output. This separation is a hard requirement and the reason the product can be trusted.

---

## 2. Data ingestion

- **Accepted inputs:** `.xlsx`, `.xls`, and `.csv` files.
- **Multiple files per analysis:** several spreadsheets can be analyzed together in a single run (e.g. different plants or report types). Practical limits: up to ~50 MB per file and ~12 files per analysis.
- **Multi-sheet workbooks:** every sheet inside each workbook is read and considered independently.
- **De-duplication:** files with identical names are not added twice.
- **Local parsing:** spreadsheets are parsed on the client; the raw cell grid never has to leave the user's machine to be read.

---

## 3. Spreadsheet parsing & cleaning (handles messy real-world files)

The parser must robustly extract clean tabular data from inspection reports that are full of human irregularities:

- **Header-row detection.** Scans the first rows of each sheet and selects the true column-header row. A row only qualifies as the header if it contains header-hint words (e.g. *qty, date, month, rejected, received, accepted, hold, reason, defect*). This prevents a long row of short codes (a legend row) from being mistaken for the header.
- **Multi-row header merging.** Many sheets use a two- or three-row header: a main row (e.g. `DATE | REC. QTY | ACCEPT QTY | HOLD QTY | REJ. QTY | REJ % | REASON FOR REJ`) followed by sub-header rows (an ordinal row `1 2 … 21` and a defect-code row `COAG SD TT … BST`). The parser merges these so quantity columns keep their names **and** the defect-matrix columns are correctly labeled by the code beneath them.
- **Junk / subtotal row stripping.** Removes rows that are not data: total / subtotal / sum rows, percentage rows, "Target" / "Deviation" rows, and rows where the date is blank but numeric cells are present (orphan subtotals).
- **Date handling.** Detects date columns by name (date/month/period/etc.) and by Excel serial-date values (range ~40000–60000), and treats them as dates — **never summed.** Serial dates can be converted to ISO date strings.
- **Numeric-column detection with text tolerance.** A column is treated as numeric only when actual numbers are the majority of its non-empty cells, so embedded text markers (e.g. "SUNDAY", "HOLIDAY", "VIJAYA DASHMI", `#DIV/0!`) are never folded into a sum.
- **Column normalization & de-duplication.** Collapses whitespace/newlines in header names and disambiguates repeated column names.
- **Per-column statistics.** For each column, computes type (number / string / date), and for numeric columns: sum, mean, min, max, plus unique-value count and sample values.
- **Grouped series extraction.** Pre-computes simple grouped aggregations (a dimension column vs. a numeric column) to support downstream trend/breakdown features.
- **Summary / rollup sheet detection.** Recognizes sheets that are themselves aggregates (e.g. a "YEARLY" sheet whose rows are month names, or sheets named cumulative/summary/format/etc., or very small sheets) so they can be **excluded from totals to avoid double-counting.**

---

## 4. Report-type understanding

The application recognizes distinct inspection report families and adapts classification to each:

- **Visual inspection** (single-stage: received → accepted/hold/rejected with a defect-reason matrix)
- **Assembly** (multi-stage funnel, e.g. visual + valve-integrity + eye-punching stages)
- **Balloon & valve integrity** (multi-stage with generic checked stages)
- **Shopfloor** (reason-only reject log, no received/checked column)
- **Cumulative** and **Yearly production** (rollup/summary types → excluded from aggregation)
- **Unknown** (falls back to header-signature heuristics)

Report type is inferred from file naming and header signatures, and determines how columns map to roles (e.g. how stages open, what counts as the entry stage).

---

## 5. Column-role classification (the "graph")

Each column in each sheet is assigned a **role**:

- `date` — a time dimension (never summed)
- `stage_checked` — units inspected at a stage (the funnel's input)
- `stage_accepted` — units accepted at a stage
- `stage_hold` — units placed on hold at a stage
- `stage_rejected` — units rejected at a stage
- `reason_count` — count of a specific defect reason (e.g. COAG, SD, BM…)
- `derived_total` — a pre-computed total/aggregate column (excluded from sums to avoid double counting)
- `dimension` — a non-quantity categorical column
- `ignore` — percentages and anything not summable

Classification works in three layers, designed so the model can add understanding **without ever risking wrong numbers**:

1. **Deterministic heuristic (always computed).** A rule-based classifier assigns roles from column names, types, statistics, and stage-opening logic. This is the safety net and is regression-tested against known-correct numbers.
2. **AI classification (optional enhancement).** A model proposes a per-sheet role graph as structured, schema-validated output.
3. **Reconciliation + sanity gate.** The AI graph is reconciled against the real columns (hallucinated columns are dropped; omitted real columns are back-filled from the heuristic). The AI graph's resulting numbers are **accepted only if they pass a sanity check** versus the heuristic baseline (e.g. rate within valid bounds, totals not wildly divergent). Otherwise the heuristic wins. The user gets model-driven understanding with no risk of "random numbers."

---

## 6. Deterministic metric computation

All headline numbers are computed in code from the raw rows, using an **entry-stage funnel** definition (so a single physical unit is not counted at every stage):

- **Checked quantity** = Σ of the *entry-stage* checked column across all non-summary sheets.
- **Accepted quantity** = Σ of the entry-stage accepted column.
- **Hold quantity** = Σ of hold columns.
- **Rejected quantity** = Σ of **all** stage-rejected columns (a reject at any stage is a real defect → additive). For reason-only reports (no rejected column), rejected = Σ of reason counts.
- **Rejection rate** = rejected ÷ checked (defined as 0 when checked is 0).

Additional deterministic analyses:
- **Per-stage breakdown** — checked, rejected, and rate for each stage of a multi-stage funnel.
- **Defect-reason ranking (Pareto)** — total count per defect reason, ranked, to identify the dominant defect drivers.
- **Monthly trend** — rejection rate per month, derived from the per-sheet/month data.

Every computed metric carries metadata: a human-readable **formula**, the **input fields** used, the **source sheets**, and the **source columns** it was derived from (this metadata powers verification — §9).

---

## 7. Headline metric (KPI) generation

From the computed metrics, the application derives a prioritized set of headline indicators:

- **Ordering:** rejection rate leads, followed by rejected quantity and checked quantity; accepted and hold quantities follow when meaningful.
- **Suppression of empties:** zero-valued accepted/hold indicators are dropped; a guaranteed core set (rejection rate, rejected, checked) is always present.
- **Trend & direction:** each indicator carries a trend (improving / stable / declining) computed from the monthly series, with **domain-aware semantics** — a *falling* rejection rate is *good* (improving), a *rising* rate is *bad*.
- **History series:** each indicator can carry a short historical series (for sparkline-type displays) computed from the monthly trend — not from the model.
- **Self-describing:** each indicator carries its formula/explanation and its source column(s) for traceability.

---

## 8. Narrative generation (AI prose, grounded in computed numbers)

After the numbers exist, a model writes the qualitative layer as structured, schema-validated output:

- **Analysis title** — a concise title for the report.
- **Executive summary** — a one-paragraph plain-language read of the cycle.
- **Insights** — up to ~7 short, number-anchored statements about what the data shows.
- **Recommendations** — up to ~6 suggested actions.
- **Alerts** — zero or more critical callouts.

**Constraint:** the narrative must reuse the numbers that were computed and **invent none.** If the model cannot produce a valid structured object, the system surfaces an error rather than coercing malformed output. The application keeps a clear separation between computed facts and AI-authored prose.

---

## 9. Data provenance & verification (core differentiator)

- Every headline metric records **which source column(s)** in **which sheet(s)** it was derived from.
- The application can take a metric's recorded source column and **locate the exact column in the raw rows**, using fuzzy matching that normalizes case, whitespace, and punctuation and then matches exactly, then partially.
- The original raw rows are retained so a user can **inspect the underlying data** and confirm a reported number against its source cells.
- This makes every headline number **auditable**: a reviewer can go from a metric to the precise data that produced it.

---

## 10. Source & merge auditing (transparency of aggregation)

The application produces an explicit, honest account of how the inputs were combined:

- **Included sources** — every sheet that contributed, and which group it was merged into.
- **Excluded sources** — every sheet that was left out **and the reason** (e.g. "summary/rollup sheet — excluded to avoid double-counting").
- **Merge strategy** — whether included sources were summed together or kept separate.
- **Warnings** — any data-quality or merge concerns detected.

This audit is always available alongside the analysis so the aggregation can be reviewed and trusted.

---

## 11. Follow-up question answering

- The user can ask **free-form follow-up questions** about the analyzed data.
- Each question is answered as a **self-contained structured insight**: a headline, 1–2 supporting data series/breakdowns, and a few (≈3–4) bullet points.
- Answers are **grounded strictly in the dataset** — the model is instructed to use only numbers that appear in the data summary and never to fabricate values.
- A set of **suggested questions** is offered to prompt useful queries.
- Answered insights become **durable artifacts** that are added to the analysis and persisted, so they can be revisited later.
- If the model returns plain text rather than a full structured answer, it is still captured as an insight artifact.

---

## 12. Export & capture

- Individual insight artifacts can be **exported as standalone image files** for sharing or pasting into reports.
- The complete analysis can be exported/printed as a document.
- Exported insight file names are derived from the question and date for easy organization.

---

## 13. Persistence & session management

- **Saved analyses (sessions).** Each completed analysis is saved, including its computed metrics, the source/merge audit, a dataset summary, and any insight artifacts.
- **Recent analyses.** Previously saved analyses can be listed and reopened, with a lightweight preview (title, source file names, key metrics, count of saved insights).
- **Reopen by identifier.** Any saved analysis can be reopened by its identifier (and is addressable, enabling links to a specific analysis).
- **Device-scoped identity.** Analyses are associated with a per-browser device identifier (no account/login is required).
- **Best-effort persistence.** The application functions even if the persistence layer is unavailable; saving is non-blocking.
- **Raw-data retention for verification.** The raw rows from an analysis are retained (client-side) so the verification feature (§9) keeps working when an analysis is reopened.

---

## 14. AI backend orchestration

- **Multi-provider failover chain.** AI calls are routed through an ordered chain of configured backends; the first that succeeds wins and failures cascade to the next, so the app keeps working if a provider is down or unconfigured.
- **Model tiers.** A faster/cheaper model tier is used for classification; a stronger tier for narrative.
- **Provider-agnostic by default.** Calls are made through a unified gateway abstraction rather than being hard-wired to one vendor; a single backend can be forced via configuration when desired.
- **Cross-provider structured output.** All AI calls request schema-validated structured objects, with schema rules chosen to be accepted by every supported provider.
- **Backend health check.** The set of configured backends can be tested end-to-end to confirm each can complete a structured request.

---

## 15. Reliability & correctness guarantees

- **Schemas are the contract.** Every AI output is validated against a strict schema; malformed output triggers a fallback (for classification) or a surfaced error (for narrative) — never silent coercion or ad-hoc JSON parsing.
- **Deterministic fallback always exists.** If AI classification is unavailable or fails the sanity gate, the golden-tested heuristic produces the numbers.
- **No-usable-data handling.** If no valid headline metrics can be produced from the inputs, the application reports this clearly instead of presenting a hollow or fabricated result.
- **Regression-protected numbers.** The deterministic engine is tested against known-correct totals reconciled to the spreadsheets' own embedded totals, guarding against silent miscalculation (e.g. header mis-detection zeroing a metric).

---

## 16. Domain rules & vocabulary (reference)

- **Entry-stage funnel rationale:** counting "checked" only at the entry stage avoids tallying the same unit at each successive stage; counting "rejected" across all stages captures every real defect. Rejection rate = rejected ÷ checked.
- **Rollup exclusion rationale:** workbooks frequently include their own yearly/cumulative summary sheets; including them alongside the monthly detail would double-count, so they are detected and excluded (and reported as excluded).
- **Defect reason codes** are domain-specific abbreviations (e.g. COAG, SD, TT, BL, PS, RW, BEP, BM, … BST) that appear as a per-row matrix; the app ranks these to find dominant defect drivers.
- **Report families** (visual, assembly, balloon/valve, shopfloor, cumulative, yearly) each have characteristic column structures the classifier is aware of.

---

## 17. End-to-end capability summary (one line each)

1. Accept one or many inspection spreadsheets (`.xlsx/.xls/.csv`).
2. Parse messy multi-sheet workbooks into clean tables (header detection, multi-row header merge, junk-row stripping, date/number typing).
3. Detect and exclude rollup/summary sheets to prevent double-counting.
4. Classify every column's role (heuristic + AI, with a sanity gate).
5. Compute all quality metrics deterministically (rates, quantities, per-stage, reason ranking, monthly trend).
6. Derive prioritized headline indicators with trends and history.
7. Generate a grounded written analysis (summary, insights, recommendations, alerts).
8. Link every metric to its exact source column for verification.
9. Produce a transparent source/merge audit (included, excluded + why, strategy, warnings).
10. Answer follow-up questions as grounded, saveable insight artifacts.
11. Export insights/analysis for sharing.
12. Save, list, and reopen analyses; retain raw data for later verification.
13. Route AI through a resilient multi-provider chain with schema-validated output.
14. Guarantee correctness via deterministic computation, schema contracts, fallbacks, and regression tests.
