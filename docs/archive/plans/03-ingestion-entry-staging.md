# 03 — Data Entry & Staging & Review

The two ingestion screens (mockups 2 & 3). Both already have a working backbone: `src/lib/ingest/emit.ts`, `entry/validate-entry.ts`, `ingest/from-rejection-sheets.ts`, `store/*`, `api/ingest`. This plan extends them to match the mockups. **Both paths emit the same canonical events.**

## Shared data-model extension (do first)
Extend `StageDayRecord` + `emitStageDay` with `acceptedGood` and `rework` (nullable `SourcedValue`s) → emit `inspection(accepted)` and `inspection(rework)` alongside the existing `inspection(rejected)` + `production(checked)`. Optional metadata `{ shift, operator, supervisor, machine, batchNo, productId, size }` rides on the record and is written into event provenance/metadata (enables V2 dims without changing analytics now). Update existing tests for the new event counts.

## Screen A — Data Entry (`/data-entry`, mockup 2)
Manual daily entry, "just like Excel" with the comment button.
- **Header fields:** Report Date, Shift, Operator, Supervisor, Product, Size (French), Machine, Batch/Lot No. (registry-driven dropdowns; Operator/Machine lists from Settings). All optional except Date+Product; captured into event metadata.
- **Production & Rejection table** (one row per registry stage): Input Qty · Accepted (Good | Rework) · Rejected Qty · Rejection % (auto = rej÷input, read-only) · Inspection By · **Remarks = the per-row comment button** (opens inline note → saved as an `annotation` event tied to that stage-row's provenance). TOTAL row auto-sums (display only; never stored as a value — it's derived).
- **Live validation** as the user types = `checkRecord` (already built): rejected>input (V-011/V-001), negatives, defect-sum, % mismatch → inline clarification chips, non-blocking. Mirrors the mockup's "Data Quality Check: Passed/Warning".
- **Right rail:** Quick Stats (totals for the date), Defect Summary donut (this date's defects), Data Quality Check list (the checkRecord results as Passed/Warning/Failed).
- **Additional info:** free Remarks (annotation), Attachments (optional file → stored as `source_file`), Data Source, Verified By, Verification Time.
- **Actions:** Reset · Save as Draft (records with `status: draft`, not yet validated) · **Submit & Lock** → `POST /api/ingest` (emit + store + checks) → events committed, draft cleared.

## Screen B — Staging & Review (`/staging`, mockup 3)
Upload raw files, review extracted rows, verify, then publish. This is the current `/ingest` page expanded.
- **Upload** (drag/drop xlsx/xls/csv) → client parse (`parseExcelFilesWithRaw`) → `classifyRejectionSheets` → **Upload Summary** (file, uploader, time, total/valid/invalid records).
- **Staging Area table** = one row per extracted stage-day record: Sr · Date · Stage · Input · Accepted · Rejected · Rejection % · **Status (Valid/Invalid)** · Remarks · Action (view / edit / approve). Status from `checkRecord` (Invalid when a critical issue like input-mismatch fires). Invalid rows highlighted red with the reason in Remarks (mockup row 6 "Input qty mismatch").
- **Edit** lets the steward fix an extracted value before publishing (creates a corrected record; original raw kept). **View** opens the verify split-panel (source cells ↔ extracted, the comment button per mapping — already built).
- **Review Notes** (Issue Type, Severity, Comment → annotation) + **Data Preview** (first rows of the raw sheet).
- **Right rail:** Quick Stats, Data Quality Check (Missing/Duplicate/Logical/Formula/Outlier with Passed/Warning/Failed = aggregated finding counts), Record Distribution donut (valid vs invalid), Actions.
- **Actions:** Validate All (run checks) · Approve All · **Publish to Analytics** = `POST /api/ingest` commit of approved records to the ledger → they appear in analytics/dashboard · Send for Approval (V1.5 workflow stub).
- **Pagination** for large files (server-agnostic; client paginates the parsed set).

## Connection to analytics
On publish, events land in the store; the Dashboard and analytics screens (which read `store.effective`) reflect them immediately on next scope fetch. Staging badge in the nav = count of unpublished/invalid staged records.

## Validation → Findings → analytics trust
`checkRecord` issues become `Finding`s (plan: route them through `FindingStore` on commit, not just inline) so they appear in Audit Trail and feed `trustScore`. Idempotent: re-uploading the same file dedupes by event hash (already true).
