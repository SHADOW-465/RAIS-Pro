# Plan 8 — Schema-Driven Data Entry [G]

**Spec:** component **[G]**. **Builds on:** Plan 3 (`/api/datasets` POST already accepts `{datasets, rows}`), Plan 7 (`recognizedStageId` + publish flow). **Branch:** `feat/universal-schema-ingestion`.

## Goal

Users should be able to key in new records for ANY persisted Dataset in-app, instead of editing Excel and re-uploading. This is **additive** to `/data-entry` — the existing registry-driven "Entry"/"Ledger"/schema-editor tabs stay exactly as they are; add a new tab.

## Design

- New tab on `/data-entry`: **"Custom Datasets"**, alongside the existing `entry`/`ledger` tabs.
- A dataset picker (dropdown of persisted Datasets, fetched from `/api/datasets`).
- On selecting one, render a form generated from `dataset.columns`:
  - `dimension-date` → a date input (defaults to today).
  - `dimension` → a text input (or, if the dataset already has ≤8 distinct values for that column across its rows — check via a quick `/api/datasets?datasetId=` fetch — a dropdown of those values plus an "Other" text fallback; otherwise plain text. Use judgment on the exact threshold, this is a minor UX nicety not a hard requirement).
  - `measure` / `defect` → a number input, default empty (treated as 0/omitted on save).
  - `derived` → NOT an input; show as a read-only computed preview if a simple percentage relationship is obviously inferable from column names (e.g. a `%`-named derived column with exactly one `measure`-named "rejected"-ish column and one "checked"-ish column present → show `rejected/checked*100` live as the user types); otherwise simply omit derived columns from the form (they're not something a human enters).
- On Save: build a single new `DatasetRow` — `rowIndex` = `(max existing rowIndex for a "Manual Entry" pseudo-source) + 1`, `fileName: "Manual Entry"`, `sheetName: dataset.title`, `values` from the form. POST `{ datasets: [existingDatasetMetadataUnchanged], rows: [newRow] }` to the EXISTING `/api/datasets` route — no backend changes needed, this route already accepts and persists exactly this shape (Plan 3/4).
- If `dataset.recognizedStageId` is set, after a successful save, offer the same "Publish to Cumulative Dashboard" action from Plan 7 (reuse `toStageRecords` + `/api/ingest`, scoped to just the new row) — do not duplicate that logic, import and call it.

## Task 1 — new component `src/components/DatasetEntryForm.tsx`

Build the picker + generated form + save action as described above. Read `src/app/data-entry/page.tsx`'s existing patterns for how it currently builds the registry-driven form (field types, styling conventions, button/success/error message patterns) and match that visual/interaction style rather than inventing a new one — this keeps the page internally consistent.

Fetch the dataset's existing rows (`/api/datasets?datasetId=`) once on selection, to (a) compute the next `rowIndex` for "Manual Entry" and (b) optionally power the dropdown-of-existing-values nicety for `dimension` columns.

**Verify:** `npx tsc --noEmit -p tsconfig.json` clean. No automated test (React-component, no test precedent in this repo — same rationale as Plan 6). Manual browser verification in Task 3.

**Commit:** `feat(data-entry): schema-driven entry form for any persisted Dataset`.

---

## Task 2 — wire the new tab into `/data-entry`

In `src/app/data-entry/page.tsx`, extend the tab state (currently `"entry" | "ledger"`) to include `"custom"`, add a third tab button alongside the existing two, and render `<DatasetEntryForm />` when active. This is an additive change — do not touch the `entry`/`ledger` tab implementations at all.

**Verify:** `npx tsc --noEmit` clean. **Commit:** `feat(data-entry): add Custom Datasets tab`.

---

## Task 3 — manual browser verification (required, per this project's UI-change standard)

Start the dev server. Navigate to `/data-entry`, open the new "Custom Datasets" tab, pick a persisted dataset, fill in the generated form with a plausible value, save it, and confirm:
1. No console/network errors.
2. A success message appears.
3. The dataset's KPI total on its View-dropdown tab (`GenericDatasetView`) increases by the entered amount after a refresh (proving the row actually persisted and is picked up by the existing generic-dashboard read path).
4. If the dataset is recognized, confirm the "Publish" follow-up action appears and works (reuse Plan 7's verification approach).

Screenshot and report what you saw, including the before/after KPI numbers.

---

## Done criteria
- `npx tsc --noEmit` clean; full `npx jest` — zero regressions vs. the Plan 7 baseline.
- Existing `entry`/`ledger` tabs on `/data-entry` unchanged (confirm via diff — only additive changes to that file).
- Manual browser verification completed with before/after evidence.
