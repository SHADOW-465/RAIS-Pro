# Monthly Entry Mode for Data Entry

**Status:** Design approved (2026-07-05) — pending spec review before implementation planning.
**Author:** RAIS-Pro / MO!D engineering session.
**Adds to, does not replace:** the existing single-day entry form on `/data-entry` stays exactly as-is for quick single-day corrections; this is a new, third mode alongside it.

---

## 1. Problem

`/data-entry` today is single-date only: pick one date, pick stage tabs, fill per-size rows, submit. The client's real workflow (and their Excel workbooks) is monthly — one sheet per month, one row per day. Users who want to enter or backfill a run of days have to repeat the single-day flow once per day, which doesn't match how they actually work and discourages using the app instead of Excel for day-to-day logging.

### Goal

Add a "Monthly Entry" mode that mirrors the real Excel sheet shape (day-rows, stage/size-scoped columns) for fast bulk entry and backfill, while reusing every piece of validation/edit/save logic the daily grid and `/staging` already share — no parallel implementation to keep in sync.

---

## 2. Approved decisions (this session)

| Decision | Choice |
|---|---|
| Relationship to daily entry | **Additive.** New tab ("Monthly Entry") next to "New Data Entry" / "Entry History". Daily entry unchanged. |
| Grid shape | **One size at a time.** Pick Stage + (if size-wise) Size, like picking a workbook tab; the grid then shows every calendar day of the selected month as its own row — the direct translation of the real Excel sheet. Rejected alternative: day-rows with expandable per-size sub-rows (more compact for a whole-stage overview, but more clicks to actually enter data, and duplicates work `/staging`'s size-wise columns already do well). |
| "Customizable" meaning | **Navigate to any month/year and backfill/correct any day within it.** Not column visibility toggles, not ad-hoc extra rows — those are out of scope for this spec. |
| Save model | **One "Save Month" button.** Edits accumulate client-side across as many days as the user touches; nothing hits the server until Save Month is clicked, which batches every changed day into one submit. No autosave-per-cell, no per-row save buttons — matches the existing "Submit & Lock" convention (explicit commit, never silent). |
| Column/day set | Derived from the same `DISPOSAFE_REGISTRY` (or active registry) the daily grid already reads — same captures, same defect codes, same size list. No new schema concept. |

---

## 3. Architecture

```
Month/Year + Stage (+ Size) picker
        ↓
GET /api/day-records?from&to&stageId&size   (new: range query on the existing route)
        ↓
StageDayRecord[]  (one per day-that-has-data; missing days render as blank rows client-side)
        ↓
Monthly grid (day-rows × capture/defect columns)
        ↓
updateCell() → applyEdit()            [same function every other grid uses — no new edit path]
        ↓
buildReviewRows() per day             [same validation every other grid uses]
        ↓
"Save Month" → POST /api/ingest        [existing route, already accepts any StageDayRecord[]]
        ↓
Canonical ledger (identical event shape to daily entry / uploads — already proven in prior testing)
```

This mirrors the project's existing pipeline invariant: no new validation engine, no new save path, no new event shape — only a new *view* over the same data model, plus one new *read* query shape.

### New: date-range day-records query

`GET /api/day-records` currently accepts a single `date`. Extend it to accept `from`/`to` (both present ⇒ range mode; `date` alone keeps working exactly as today for the daily-entry page, so this is additive, not a breaking change to the existing route/contract).

Response shape for range mode: `{ records: StageDayRecord[] }`, same record shape as today, simply spanning every date in range that has at least one record. Days with no records are NOT returned — the client fills in blank rows for every calendar day of the month regardless (same "a date with nothing yet is exactly 'create a new date'" convention `loadDay()` already uses).

### Component: `MonthlyEntryGrid`

New component under `src/components/` (or inline in a new tab within `data-entry/page.tsx`, consistent with how "Custom Datasets" is already a third tab backed by `DatasetEntryForm`). Responsibilities:

- Month/Year navigation (prev/next arrows + a native month picker), Stage tabs (reused), Size dropdown (shown only when `activeStage.sizeWise`).
- Renders one row per calendar day of the selected month (`new Date(year, month+1, 0).getDate()` for day count — no new date-math library, `Date` covers this).
- Each row's cells call the same `updateCell`/`applyEdit` the daily grid uses, keyed by `(stageId, size, date)` instead of `(stageId, size)`. State stays a flat `StageDayRecord[]` (one entry per day that has data), filtered per row by date — the same shape and filtering approach the daily grid already uses for `(stageId, rowKey)`, just with `date` added to the filter key. No new state container.
- Per-row validation via `buildReviewRows()` on that day's records — invalid days get the same red-highlight/flag-expansion treatment `/staging` and daily entry already use (reusing the `invalidFields`-based cell highlighting fixed in the prior session, not reinventing it).
- Reuses the `dirty` + `confirmDiscardIfDirty()` guard already added to daily entry: switching month, stage, or size with unsaved edits prompts before discarding, exactly like changing the daily-entry date does today.

### Save

"Save Month" collects every `StageDayRecord` touched since the last load/save (tracked the same way daily entry's `records` state already is) and does **one** `POST /api/ingest` with the full batch — the existing route already accepts an arbitrary `StageDayRecord[]` spanning any set of dates, so no backend change is required here beyond the new GET query.

---

## 4. Error handling

- Same blocking-error rules as daily entry (operator required, `buildReviewRows` logical-bounds checks), but surfaced **per day-row** (inline, next to that row) instead of once globally, plus a summary count at the top ("3 of 30 days need fixing before you can save").
- Save Month is disabled while any touched day has a blocking error, same as today's "Submit & Lock" gating on `blockingErrors.length`.
- Network/save failure: same pattern as daily entry's `submit()` — show the error banner, keep all client-side edits intact (do NOT clear `records` on a failed save, so nothing is lost on a transient failure).

---

## 5. Testing plan

- Unit test for the new `from`/`to` range branch of `/api/day-records` (returns records spanning multiple days; `date`-only mode unchanged; empty range returns `{ records: [] }`).
- Unit test confirming Save Month's batching produces the same event shapes as the daily-entry path for an equivalent set of days (regression guard against the "manual entry must be indistinguishable from upload" invariant already verified in the prior testing session).
- Playwright pass: open Monthly Entry, pick a stage+size, edit multiple non-adjacent days within the month, verify no cross-day/cross-field leakage (reusing the exact assertions from the prior daily-entry test — no other field/day changes when one cell is edited), Save Month, then verify the canonical ledger and Dashboard/Reports reflect every saved day (same verification steps already used for daily entry, just repeated across a month instead of one day).

---

## 6. Out of scope (this spec)

- Column visibility customization (show/hide specific fields) — not what "customizable" meant per clarification.
- Ad-hoc extra rows beyond calendar days (e.g. a second shift on the same day) — not requested.
- Bulk paste/import from clipboard into the grid — not requested; can be a future spec if it comes up.
