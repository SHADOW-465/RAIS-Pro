# Unify Data Entry into One Spreadsheet + Fix Dashboard Sync

**Status:** Design approved (2026-07-07) — pending spec review before implementation planning.
**Author:** RAIS-Pro / MO!D engineering session.
**Supersedes:** the "Additive, new third mode" decision in `2026-07-05-monthly-data-entry-design.md` — Monthly Entry stops being a separate mode and becomes the one and only spreadsheet-style entry surface.
**Scope:** this spec covers two of three pieces requested in this session (dashboard sync fix, UI merge). The third — automatically extending the registry/columns from an uploaded Excel workbook's structure — is deliberately out of scope here and tracked as a separate follow-up spec.

---

## 1. Problem

Two bugs/gaps drove this:

1. **Two parallel spreadsheet-style entry UIs exist on `/data-entry`.** "New Data Entry" (rows = sizes, for one fixed date) and "Monthly Entry" (rows = calendar days, for one fixed stage+size) share almost all their underlying logic (`applyEdit`, `buildReviewRows`, `capture-fields.ts` maps, `/api/schema`, `/api/day-records`, `/api/ingest`) but are two separate UI experiences a user has to choose between. There should be one.
2. **Manual entries via Monthly Entry / Custom Datasets don't show up anywhere else without a hard reload.** `EventsProvider` (`src/components/app/EventsContext.tsx`) fetches `/api/events` once on mount and stays mounted across client-side navigation. `data-entry/page.tsx`'s daily-grid `submit()` already calls `refreshEvents()` after a successful save — that's why it feels "live." `MonthlyEntryGrid.saveMonth()` and `DatasetEntryForm.handlePublish()` never call it. The write is real (same event store, same `emitMany` pipeline — there is no separate storage path for manual entries), but the shared `EventsContext` the Dashboard/Reports/Chat all read from stays stale until a full page reload remounts it.

### Goal

One spreadsheet-style entry surface on `/data-entry` (day-rows × stage/size-scoped capture+defect columns, the `MonthlyEntryGrid` shape), and every successful save — from any entry surface — immediately refreshes the shared events context so Dashboard/Reports/Defect Analysis/Ask RAIS/View Source reflect it without a reload.

---

## 2. Approved decisions (this session)

| Decision | Choice |
|---|---|
| Relationship between the two existing grids | **Replace, don't add.** `MonthlyEntryGrid`'s day-rows shape becomes the only spreadsheet entry surface. The old size-rows-for-one-date grid is deleted. |
| Multiple sizes within one stage | **One size at a time via a dropdown** (today's Monthly Entry model) — mirrors separate per-size tables in the source Excel; switching sizes swaps the table. Rejected: a single wide table with a repeated column-group per size — truer to some workbook layouts but a much bigger table-rendering change for a UI that already works today. |
| Tab bar | **Remove "Monthly Entry" as a separate tab entirely.** Tabs become: New Data Entry (now the spreadsheet) / Entry History / Custom Datasets. |
| Header metadata bar | **Unchanged.** Operator, Supervisor, Machine, Product, Batch/Lot No., Shift, Report Date, notes stay exactly where and how they are; only the table beneath them is replaced. |
| Dashboard sync | **Call the existing `refreshEvents()` from every save path**, not a new polling/subscription mechanism. Matches the pattern already proven in the daily grid. |

---

## 3. Architecture

### (A) Dashboard sync fix

```
MonthlyEntryGrid.saveMonth() / DatasetEntryForm.handlePublish()
        ↓ (on 200 OK, same as data-entry/page.tsx's submit() already does)
useEvents().refreshEvents()
        ↓
EventsContext refetches /api/events → canonicalizeEvents() → new events[]
        ↓
Dashboard / Reports / Defect Analysis / Ask RAIS / View Source
  (all already read exclusively via useEvents() — no other data path to fix)
```

No new endpoint, no new store, no polling. `refreshEvents()` already exists and is already proven in the daily-entry path; this closes the two (or more, pending a grep) call sites missing it. A failure of the refresh call itself (e.g. transient network blip) is swallowed/logged — it must not overwrite the "N day(s) saved" success banner, since the save itself already succeeded independent of the refresh.

### (B) UI merge

```
/data-entry
  ├─ Header metadata bar (Operator/Supervisor/Machine/Product/Batch/Shift/Report Date/notes) — UNCHANGED
  ├─ Tab: "New Data Entry"  →  <MonthlyEntryGrid customFields={headerCustomFields} initialDate={reportDate} />
  ├─ Tab: "Entry History / Data Ledger" — UNCHANGED
  └─ Tab: "Custom Datasets" (DatasetEntryForm) — UNCHANGED
```

- `data-entry/page.tsx`: delete the current "New Data Entry" tab's grid JSX (the size-rows-per-date table) and its now-unused supporting state/logic (`gridRowKeys`, that tab's `updateCell`, the per-date `stageIds`/`activeStage` wiring, `submit()`'s payload-building) — after grepping for any cross-references from the Ledger or Custom Datasets tabs first, so nothing shared is deleted out from under them. Render `<MonthlyEntryGrid />` in its place, passing:
  - `customFields`: the same operator/supervisor/machine/product/batch/shift/notes object the old `submit()` already assembled from the header bar's local state.
  - `initialDate`: the header bar's current Report Date value, so the grid opens on the month containing it instead of always today's month.
- `activeTab` type: `"entry" | "ledger" | "custom"` (drop `"monthly"`). Delete the "Monthly Entry" tab button. Revert the tab bar's border-radius styling to a clean 3-tab layout (first: `8px 0 0 8px`, middle: `0`, last: `0 8px 8px 0`).
- `src/components/MonthlyEntryGrid.tsx`: add two new optional props:
  - `customFields?: Record<string, any>` — merged into a record's `customFields` **at save time**, inside `saveMonth()`, not at row-creation time. This way, if the operator corrects a header field (e.g. fixes a typo in "Operator") after already entering some day values, the save reflects the header's latest state regardless of which rows were touched first.
  - `initialDate?: string` — seeds the starting `{ year, month }` state instead of always `currentYearMonth()`.
- Everything else in `MonthlyEntryGrid` (month nav, stage tabs, size dropdown, day rows, per-day validation via `buildReviewRows`, dirty-discard guard, Save Month) is unchanged.

Net effect: one spreadsheet component used everywhere spreadsheet-style entry happens, one save path, header metadata untouched, three tabs instead of four.

---

## 4. Error handling

- No new failure modes. Existing per-day validation (`buildReviewRows` → invalid days highlighted, Save Month disabled while any day is invalid) and the existing dirty-discard confirm-on-navigate guard (switching month/stage/size with unsaved edits) are unchanged.
- `refreshEvents()` failures after a successful save are non-fatal — logged/swallowed, do not block or clear the success banner, do not roll back the save (the save already committed to the event store independent of the context refresh).

---

## 5. Testing plan

- Type-check (`npx tsc --noEmit -p tsconfig.json`) and the full Jest suite (`npx jest --silent`) must stay green at the same pass count as today's baseline (pre-existing unrelated corpus-directory failures aside).
- No new automated test files planned for the pure UI wiring (consistent with this codebase's existing precedent for grid/tab wiring changes — verified by hand against the dev server).
- End-to-end runtime verification (already tracked as a session task, not part of this spec's implementation plan): upload a real Excel workbook, compare the generated grid against it, edit multiple non-adjacent days across multiple stages, save, then confirm Dashboard/Reports/Defect Analysis/Ask RAIS/View Source all reflect it immediately — without a page reload. This is the direct regression check for the Section 1 bug.

---

## 6. Out of scope (this spec)

- Automatically extending the registry (stages/sizes/defects/custom fields) from an uploaded workbook's structure — tracked separately as a follow-up spec.
- Column visibility toggles, ad-hoc extra rows, clipboard paste into the grid — unrequested, unchanged from the prior spec's scope decisions.
- A wide, all-sizes-at-once table layout — explicitly rejected in favor of the size dropdown (see §2).
