# Grain-Aware Data Entry (Phase 1 of 2)

**Status:** Design approved (2026-07-09) — pending spec review before implementation planning.
**Author:** RAIS-Pro / MO!D engineering session.
**Relationship to prior specs:** builds on `2026-07-07-data-entry-unify-design.md` (the single `MonthlyEntryGrid` spreadsheet surface). Does not reverse any of its decisions.
**Phase 2 (separate spec, not covered here):** entry-status tracking (Complete/Pending/Missing/Draft/Submitted/Verified), shift-end and missing-day reminders, and Prev/Next-missing-entry navigation. That work depends on this phase's date-range plumbing and is tracked as a follow-up spec once this phase ships.

---

## 1. Problem

`/data-entry` always renders a full calendar month's worth of day-rows in `MonthlyEntryGrid`, regardless of the dashboard's global Date Grain (D/W/M/FY) selector in the topbar (`AppShell`, `t.grain`). An operator who only wants to enter today's production has to scroll a 28–31 row table to find today. The Report Date control is a fixed native date picker no matter what grain is active, so it doesn't communicate or drive what's actually shown below it.

### Goal

The Data Entry page's Report Date control and spreadsheet both become grain-aware: the same global Grain selector used everywhere else in the app determines whether Report Date is a day picker, a week picker, a month picker, or an FY picker — and the spreadsheet shows exactly that period's rows, no more, no less.

---

## 2. Approved decisions (this session)

| Decision | Choice |
|---|---|
| Grain source | Reuse the existing global `t.grain` tweak (topbar D/W/M/FY control) — no separate local control on the Data Entry page. |
| Week definition | **Week-of-month**, matching the bucketing already used in `src/lib/analytics/scope.ts` (`periodKey()` for grain `"week"`). A week never crosses a calendar-month boundary. Rejected: ISO calendar week (native `<input type="week">`), since it would disagree with how "week" is bucketed everywhere else in the app. |
| Week picker UI | A small popover calendar (mini month grid). Clicking any day highlights and selects its whole week row. Rejected: a flat dropdown list of "Week 1 / Week 2 / …" — less visual, user preferred the calendar. |
| FY interaction | An FY `<select>` (e.g. `FY2025-26`, Apr–Mar, same convention as `resolveScope()`'s `"this-fy"` case) narrows scope, then a row of 12 month tabs (Apr→Mar) lets the operator pick which month to actually edit. FY does **not** render as one flat 365-row table — it delegates to the existing Month case. |
| Daily view nav | Same single-row table (unchanged columns/stage tabs/size dropdown), plus new Prev Day / Next Day buttons mirroring the existing Prev/Next Month buttons. |
| Report Date label | Changes text with grain: "Report Date" (day) / "Report Week" / "Report Month" / "Report FY" — signals what the control does without extra chrome. |

---

## 3. Architecture

```
AppShell topbar Grain (t.grain, already global)
        ↓
data-entry/page.tsx: Report Date control switches widget by grain
        ↓
MonthlyEntryGrid: generalized from "always a calendar month"
                  to "a from/to date range derived from grain + selected period"
        ↓
/api/day-records?from=...&to=...   (already range-capable — no backend change)
```

No backend, schema, validation, or event-ledger change. `/api/day-records` already accepts an arbitrary `from`/`to` range (see `src/app/api/day-records/route.ts`); this phase is a client-side reshaping of which range gets requested and rendered.

---

## 4. Components

### `src/app/data-entry/page.tsx`

Report Date field becomes grain-aware (reads `t.grain` from `useTweaks()`, same hook `AppShell` already uses):

- **Day (`grain === "day"`):** unchanged native `<input type="date">`.
- **Week (`grain === "week"`):** new `WeekPicker` component (new file, `src/components/WeekPicker.tsx`) — a small popover calendar. **Precision note (caught in spec self-review):** `periodKey()`'s `"week"` case (`src/lib/analytics/scope.ts`) buckets by fixed 7-day chunks counted from the 1st of the month (days 1–7, 8–14, 15–21, 22–28, 29–31) — not real Monday–Sunday weeks. A weekday-aligned calendar grid would visually disagree with that bucketing whenever the 1st doesn't fall on the same weekday as the bucket boundary. So the popover renders day cells 7-per-row starting from day 1 (no weekday header row), and each row *is* one of `periodKey()`'s buckets — clicking any cell in a row highlights and selects that whole row. This keeps exactly one definition of "week" in the codebase; the popover just visualizes the same buckets `scope.ts` already computes. Popover's own Prev/Next arrows move between months when browsing. Emits the week's `{ from, to }` ISO bounds (first and last real day-of-month in the clicked bucket — the last bucket in a month may be shorter than 7 days, e.g. days 29–31).
- **Month (`grain === "month"`):** native `<input type="month">`.
- **FY (`grain === "fy"`):** a `<select>` of FY labels derived from the loaded events' date range (or the current FY if no data yet), plus a row of 12 month-tab buttons (Apr→Mar) beneath it. Clicking a tab sets the active month, which drives the same Month-case grid underneath.
- Label above the control reads "Report Date" / "Report Week" / "Report Month" / "Report FY" depending on grain.
- Switching grain from the topbar is global state (`t.grain` in `TweaksContext`) that `AppShell`'s D/W/M/FY buttons set directly — `data-entry/page.tsx` has no hook to veto that change before it happens. Instead: a `useEffect` on `t.grain` in `data-entry/page.tsx` detects the change and, if `monthlyDirty` is true, calls the same `confirm(...)` used by `confirmLeaveEntryGrid()`; declining calls `setTweak("grain", previousGrain)` to revert the topbar back (previous value tracked in a ref), accepting recomputes the period as "the new grain's period containing the currently-selected date" and discards the edit exactly like today's manual date-change path. This is a new (small) reactive guard, not a reuse of the existing one — the existing guard only covers actions originating inside this page.

### `src/components/MonthlyEntryGrid.tsx`

- Internal state changes from `{ year, month }` to `{ from, to }` (ISO date strings), computed by a small pure helper (new file `src/lib/entry/period.ts`) that, given a grain and an anchor date, returns:
  - day → `{ from: date, to: date }`
  - week → the week-of-month bounds containing `date` (reuses the same day-of-month arithmetic as `periodKey()`'s week case, kept in sync rather than duplicated — `period.ts` imports the week-number logic from `scope.ts` instead of re-deriving it)
  - month → first/last day of `date`'s month (existing `daysInMonth`/`isoDate` helpers, moved into `period.ts`)
  - fy → delegates to month (FY never produces its own row range; see §2)
- `days` (the render loop) becomes `Array.from` over the `{from, to}` range instead of always `daysInMonth`. For day/week grains this is 1 or 7 rows; for month/fy it's unchanged (still all days in the resolved month).
- `loadMonth()` renamed `loadRange()` — same `/api/day-records` call, parameterized by `from`/`to` instead of always month bounds. No response-shape change.
- Single "Prev/Next Month" button pair becomes "Prev/Next `<period>`" — same buttons, same position, stepping by one day/week/month/FY-month depending on grain (`goToMonth(delta)` generalizes to `goToPeriod(delta)`, still using the existing `confirmDiscardIfDirty` guard before navigating).
- New optional props: `grain: Grain` and `anchorDate: string` (replacing the current `initialDate`-only seeding), passed down from `data-entry/page.tsx`'s Report Date state.
- Stage tabs, size dropdown, per-day validation (`buildReviewRows`), dirty-discard guard, and Save Month (renamed Save in UI copy only where it says "Month" and the grain isn't month — e.g. "Save Week", "Save Day") are otherwise unchanged.

### Unchanged

Header metadata bar (Operator/Supervisor/Machine/Product/Batch/Shift/notes), Entry History/Ledger tab, Custom Datasets tab, `/api/ingest`, `/api/day-records`, `/api/schema`, the canonical event ledger, the validation engine (`checkRecord`, `buildReviewRows`), the analytics pipeline, dashboard integration.

---

## 5. Error handling

No new failure modes.

- Existing per-day validation (invalid days block Save) is unchanged — it already operates per-record regardless of how many rows are shown.
- Existing dirty-discard confirm (`confirmDiscardIfDirty` / `confirmLeaveEntryGrid`) now guards every period-changing action: day/week/month/FY-month nav buttons, the Report Date control itself (any widget), and a global Grain change while the page is open with unsaved edits.
- If `/api/day-records` returns zero records for a picked period (e.g. a genuinely empty week), the grid renders its rows with empty inputs — same as an empty month does today. No special "no data" state needed.

---

## 6. Testing plan

- Type-check (`npx tsc --noEmit -p tsconfig.json`) and the full Jest suite (`npx jest --silent`) stay green at today's baseline.
- New pure-function tests for `src/lib/entry/period.ts` (the from/to resolver for each grain) — deterministic date math, easy to unit test in isolation.
- Runtime verification (manual, via dev server) before calling this phase done:
  - Day grain shows exactly 1 row for the picked date; Prev/Next Day step correctly across month/year boundaries.
  - Week grain shows exactly 7 rows for the picked week; the popover calendar's row-highlight matches week-of-month bucketing (never crosses a month boundary).
  - Month grain behaves exactly as it does today (regression check — this is the one case that must not change).
  - FY grain: picking an FY populates the 12 month tabs; clicking a tab loads that month's existing grid; Save behaves identically to Month grain.
  - Saving in every grain still round-trips through `/api/ingest` and dashboard/reports reflect it after `refreshEvents()`, with no regression to the existing unify-spec dashboard-sync fix.

---

## 7. Out of scope (this spec)

- Entry status indicators (Complete/Pending/Missing/Draft/Submitted/Verified) — Phase 2.
- Shift-end / missing-day reminder notifications — Phase 2.
- Prev-missing-entry / Next-missing-entry / Go-to-Today navigation — Phase 2 (distinct from this spec's Prev/Next-period navigation, which steps sequentially regardless of completion state).
- Any change to the backend validation engine, Canonical Manufacturing Event Ledger, analytics pipeline, or `/api/ingest` contract.
