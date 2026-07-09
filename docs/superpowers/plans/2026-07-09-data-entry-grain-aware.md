# Grain-Aware Data Entry Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the `/data-entry` Report Date control and spreadsheet grid follow the global Date Grain (D/W/M/FY) instead of always showing a full calendar month.

**Architecture:** A new pure date-range resolver (`src/lib/entry/period.ts`) turns `(grain, anchorDate)` into a `{from, to}` row range and handles Prev/Next stepping; `MonthlyEntryGrid` is generalized to render that range instead of a hardcoded month; `data-entry/page.tsx`'s Report Date field swaps in a day input, a new `WeekPicker` popover, a month input, or an FY select + month tabs depending on `t.grain`.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Jest (existing test runner), no new dependencies.

## Global Constraints

- No changes to `/api/day-records`, `/api/ingest`, `/api/schema`, the validation engine (`checkRecord`/`buildReviewRows`), the canonical event ledger, or the analytics pipeline — this plan is client-side reshaping only (per spec §4 "Unchanged" and §7 "Out of scope").
- Week bucketing must reuse `scope.ts`'s existing `periodKey()` "week" definition (day-count chunks from the 1st of the month) — do not introduce a second, Mon–Sun-based definition anywhere (spec §4 precision note).
- FY convention is Apr–Mar, matching `resolveScope()`'s `"this-fy"` case and `periodKey()`'s `"fy"` case — reuse, don't reimplement.
- No new npm dependencies (native `<input type="month">`/`<input type="date">`, custom popover — same pattern as the existing Date Range/View pickers in `AppShell.tsx`).
- Follow this codebase's existing precedent: pure logic modules get colocated `__tests__` Jest files; UI wiring components (grids, pickers, pages) are verified manually against the dev server, not unit-tested (see `2026-07-07-data-entry-unify-design.md` §5 and the absence of any `.test.tsx` file in the repo).
- `npx tsc --noEmit -p tsconfig.json` and `npx jest --silent` must stay green after every task.

---

### Task 1: Week-of-month and FY helpers in `scope.ts`

**Files:**
- Modify: `src/lib/analytics/scope.ts:48-65` (the `periodKey` function)
- Test: `src/lib/analytics/__tests__/scope.test.ts` (new file — this module has no existing test file)

**Interfaces:**
- Produces: `weekOfMonthBounds(year: number, month: number, day: number): { week: number; startDay: number; endDay: number }` — exported from `scope.ts`.
- Produces: `fyContaining(dateIso: string): { startYear: number; label: string; from: string; to: string }` — exported from `scope.ts`.
- `periodKey`'s public behavior (signature and output strings) is unchanged — this task only extracts its internal week-math into a reusable, independently-testable function.

- [ ] **Step 1: Write the failing tests**

Create `src/lib/analytics/__tests__/scope.test.ts`:

```ts
import { periodKey, weekOfMonthBounds, fyContaining } from "../scope";

describe("weekOfMonthBounds", () => {
  it("buckets days 1-7 of any month into week 1", () => {
    expect(weekOfMonthBounds(2026, 7, 1)).toEqual({ week: 1, startDay: 1, endDay: 7 });
    expect(weekOfMonthBounds(2026, 7, 7)).toEqual({ week: 1, startDay: 1, endDay: 7 });
  });

  it("buckets days 8-14 into week 2, etc.", () => {
    expect(weekOfMonthBounds(2026, 7, 8)).toEqual({ week: 2, startDay: 8, endDay: 14 });
    expect(weekOfMonthBounds(2026, 7, 14)).toEqual({ week: 2, startDay: 8, endDay: 14 });
  });

  it("clamps the last bucket's endDay to the real last day of a 31-day month", () => {
    // July 2026 has 31 days: buckets are 1-7, 8-14, 15-21, 22-28, 29-31 (short last bucket)
    expect(weekOfMonthBounds(2026, 7, 29)).toEqual({ week: 5, startDay: 29, endDay: 31 });
    expect(weekOfMonthBounds(2026, 7, 31)).toEqual({ week: 5, startDay: 29, endDay: 31 });
  });

  it("clamps the last bucket's endDay to the real last day of a 30-day month", () => {
    // June 2026 has 30 days: last bucket is 29-30 (2 days)
    expect(weekOfMonthBounds(2026, 6, 30)).toEqual({ week: 5, startDay: 29, endDay: 30 });
  });

  it("clamps the last bucket's endDay for February", () => {
    // Feb 2026 has 28 days: buckets are 1-7, 8-14, 15-21, 22-28 (exactly 4, no short one)
    expect(weekOfMonthBounds(2026, 2, 28)).toEqual({ week: 4, startDay: 22, endDay: 28 });
  });
});

describe("periodKey with grain 'week' (regression — must stay byte-identical)", () => {
  it("still produces the same key format after the weekOfMonthBounds extraction", () => {
    expect(periodKey("2026-07-01", "week")).toBe("2026-07-W1");
    expect(periodKey("2026-07-08", "week")).toBe("2026-07-W2");
    expect(periodKey("2026-07-31", "week")).toBe("2026-07-W5");
    expect(periodKey("2026-06-30", "week")).toBe("2026-06-W5");
  });
});

describe("fyContaining", () => {
  it("returns the FY containing a date in the second half of the calendar year (Apr-Dec)", () => {
    expect(fyContaining("2026-07-09")).toEqual({
      startYear: 2026,
      label: "FY2026-27",
      from: "2026-04-01",
      to: "2027-03-31",
    });
  });

  it("returns the FY containing a date in the first quarter of the calendar year (Jan-Mar)", () => {
    expect(fyContaining("2027-02-15")).toEqual({
      startYear: 2026,
      label: "FY2026-27",
      from: "2026-04-01",
      to: "2027-03-31",
    });
  });

  it("agrees with periodKey's own FY label format", () => {
    expect(fyContaining("2026-07-09").label).toBe(periodKey("2026-07-09", "fy"));
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx jest src/lib/analytics/__tests__/scope.test.ts`
Expected: FAIL — `weekOfMonthBounds` and `fyContaining` are not exported from `../scope` yet.

- [ ] **Step 3: Implement the helpers and refactor `periodKey`**

In `src/lib/analytics/scope.ts`, add these two exports right after the `sizeOf` helper (before `scopeEvents`, around line 28):

```ts
/** The week-of-month bucket containing `day` in `month`/`year`. Buckets are
 *  fixed 7-day chunks counted from the 1st (1-7, 8-14, 15-21, 22-28, 29-31+)
 *  — NOT real Monday-Sunday weeks. This is the one place that definition
 *  lives; `periodKey`'s "week" case and Data Entry's week picker both call
 *  this instead of re-deriving the math. */
export function weekOfMonthBounds(year: number, month: number, day: number): { week: number; startDay: number; endDay: number } {
  const week = Math.floor((day - 1) / 7) + 1;
  const startDay = (week - 1) * 7 + 1;
  const lastDayOfMonth = new Date(year, month, 0).getDate();
  const endDay = Math.min(week * 7, lastDayOfMonth);
  return { week, startDay, endDay };
}

/** The Apr-Mar fiscal year containing `dateIso`, with its label (matching
 *  periodKey's "fy" format) and calendar bounds. */
export function fyContaining(dateIso: string): { startYear: number; label: string; from: string; to: string } {
  const [y, m] = dateIso.split("-").map(Number);
  const startYear = m >= 4 ? y : y - 1;
  return {
    startYear,
    label: periodKey(dateIso, "fy"),
    from: `${startYear}-04-01`,
    to: `${startYear + 1}-03-31`,
  };
}
```

Then replace the `"week"` case inside `periodKey` (currently):

```ts
    case "week": {
      const week = Math.floor((d - 1) / 7) + 1; // week-of-month 1..5
      return `${y}-${String(m).padStart(2, "0")}-W${week}`;
    }
```

with:

```ts
    case "week": {
      const { week } = weekOfMonthBounds(y, m, d);
      return `${y}-${String(m).padStart(2, "0")}-W${week}`;
    }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx jest src/lib/analytics/__tests__/scope.test.ts`
Expected: PASS (all cases above)

Run: `npx jest --silent`
Expected: PASS — full existing suite unaffected (periodKey's output is unchanged).

- [ ] **Step 5: Commit**

```bash
git add src/lib/analytics/scope.ts src/lib/analytics/__tests__/scope.test.ts
git commit -m "$(cat <<'EOF'
Extract week-of-month bucket math into weekOfMonthBounds, add fyContaining

Both are needed by the grain-aware Data Entry picker (docs/superpowers/specs/2026-07-09-data-entry-grain-aware-design.md) and keep exactly one definition of "week"/"FY" in the codebase. periodKey's output is unchanged (regression-tested).
EOF
)"
```

---

### Task 2: `src/lib/entry/period.ts` — date-range resolver for the entry grid

**Files:**
- Create: `src/lib/entry/period.ts`
- Test: `src/lib/entry/__tests__/period.test.ts`

**Interfaces:**
- Consumes: `weekOfMonthBounds`, `fyContaining` from `@/lib/analytics/scope` (Task 1).
- Produces: `export type EntryGrain = "day" | "week" | "month";`
- Produces: `export interface PeriodRange { from: string; to: string }`
- Produces: `export function resolvePeriod(grain: EntryGrain, anchorDate: string): PeriodRange`
- Produces: `export function stepPeriod(grain: EntryGrain, anchorDate: string, delta: number): string` — returns a new anchor date, `delta` in units of the grain (e.g. `delta=1` for week means "next week bucket").
- Produces: `export function periodLabel(grain: EntryGrain, anchorDate: string): string` — human label for the nav bar (e.g. "9 Jul 2026", "Week 2 (8-14 Jul 2026)", "July 2026").

- [ ] **Step 1: Write the failing tests**

Create `src/lib/entry/__tests__/period.test.ts`:

```ts
import { resolvePeriod, stepPeriod, periodLabel } from "../period";

describe("resolvePeriod", () => {
  it("day grain resolves to a single-day range", () => {
    expect(resolvePeriod("day", "2026-07-09")).toEqual({ from: "2026-07-09", to: "2026-07-09" });
  });

  it("week grain resolves to the containing week-of-month bucket", () => {
    expect(resolvePeriod("week", "2026-07-09")).toEqual({ from: "2026-07-08", to: "2026-07-14" });
  });

  it("week grain clamps to the real last day for a short final bucket", () => {
    expect(resolvePeriod("week", "2026-07-30")).toEqual({ from: "2026-07-29", to: "2026-07-31" });
  });

  it("month grain resolves to the full calendar month", () => {
    expect(resolvePeriod("month", "2026-02-15")).toEqual({ from: "2026-02-01", to: "2026-02-28" });
  });
});

describe("stepPeriod", () => {
  it("day grain steps by one calendar day, crossing month boundaries", () => {
    expect(stepPeriod("day", "2026-07-31", 1)).toBe("2026-08-01");
    expect(stepPeriod("day", "2026-08-01", -1)).toBe("2026-07-31");
  });

  it("day grain steps crossing a year boundary", () => {
    expect(stepPeriod("day", "2026-12-31", 1)).toBe("2027-01-01");
  });

  it("week grain steps to the next bucket's start, even across a month boundary with a short final bucket", () => {
    // July 2026's last bucket is 29-31 (short); the week after it is August's week 1 (1-7)
    expect(stepPeriod("week", "2026-07-29", 1)).toBe("2026-08-01");
  });

  it("week grain steps backward across a month boundary onto the short final bucket", () => {
    // The week before August's week 1 is July's short last bucket (29-31), not a mis-aligned 7-day jump
    expect(stepPeriod("week", "2026-08-01", -1)).toBe("2026-07-29");
  });

  it("week grain steps backward across a month boundary into June's short final bucket (29-30)", () => {
    expect(stepPeriod("week", "2026-07-01", -1)).toBe("2026-06-29");
  });

  it("month grain steps by one month, wrapping year boundaries in both directions", () => {
    expect(stepPeriod("month", "2026-12-15", 1)).toBe("2027-01-01");
    expect(stepPeriod("month", "2026-01-15", -1)).toBe("2025-12-01");
  });
});

describe("periodLabel", () => {
  it("labels a day", () => {
    expect(periodLabel("day", "2026-07-09")).toBe("9 Jul 2026");
  });

  it("labels a week with its date range", () => {
    expect(periodLabel("week", "2026-07-09")).toBe("Week 2 (8-14 Jul 2026)");
  });

  it("labels a short final week bucket with its clamped range", () => {
    expect(periodLabel("week", "2026-07-30")).toBe("Week 5 (29-31 Jul 2026)");
  });

  it("labels a month", () => {
    expect(periodLabel("month", "2026-07-09")).toBe("July 2026");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx jest src/lib/entry/__tests__/period.test.ts`
Expected: FAIL — `src/lib/entry/period.ts` does not exist yet.

- [ ] **Step 3: Implement `period.ts`**

Create `src/lib/entry/period.ts`:

```ts
// src/lib/entry/period.ts
// Turns (grain, anchorDate) into the row range MonthlyEntryGrid should
// render, and steps the anchor forward/backward by one grain-unit for the
// Prev/Next nav buttons. FY is not a grain here — data-entry/page.tsx maps
// its "fy" grain to "month" (picking a month inside the FY) before calling
// into this module; see docs/superpowers/specs/2026-07-09-data-entry-grain-aware-design.md.

import { weekOfMonthBounds } from "@/lib/analytics/scope";

export type EntryGrain = "day" | "week" | "month";

export interface PeriodRange {
  from: string;
  to: string;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function daysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

function isoDate(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function partsOf(dateStr: string): { year: number; month: number; day: number } {
  const [year, month, day] = dateStr.split("-").map(Number);
  return { year, month, day };
}

function bucketsInMonth(year: number, month: number): number {
  return Math.ceil(daysInMonth(year, month) / 7);
}

export function resolvePeriod(grain: EntryGrain, anchorDate: string): PeriodRange {
  const { year, month, day } = partsOf(anchorDate);
  switch (grain) {
    case "day":
      return { from: anchorDate, to: anchorDate };
    case "week": {
      const { startDay, endDay } = weekOfMonthBounds(year, month, day);
      return { from: isoDate(year, month, startDay), to: isoDate(year, month, endDay) };
    }
    case "month":
      return { from: isoDate(year, month, 1), to: isoDate(year, month, daysInMonth(year, month)) };
  }
}

export function stepPeriod(grain: EntryGrain, anchorDate: string, delta: number): string {
  const { year, month, day } = partsOf(anchorDate);
  switch (grain) {
    case "day": {
      const d = new Date(Date.UTC(year, month - 1, day));
      d.setUTCDate(d.getUTCDate() + delta);
      return d.toISOString().slice(0, 10);
    }
    case "week": {
      // Bucket-index arithmetic, not raw +/-7 days: the last bucket of a
      // month can be shorter than 7 days, so stepping by real calendar days
      // would land inside the wrong bucket when crossing a month boundary.
      const { week } = weekOfMonthBounds(year, month, day);
      let idx = week + delta;
      let y = year, m = month;
      while (idx > bucketsInMonth(y, m)) {
        idx -= bucketsInMonth(y, m);
        m += 1;
        if (m > 12) { m = 1; y += 1; }
      }
      while (idx < 1) {
        m -= 1;
        if (m < 1) { m = 12; y -= 1; }
        idx += bucketsInMonth(y, m);
      }
      return isoDate(y, m, (idx - 1) * 7 + 1);
    }
    case "month": {
      let m = month + delta;
      let y = year;
      while (m > 12) { m -= 12; y += 1; }
      while (m < 1) { m += 12; y -= 1; }
      return isoDate(y, m, 1);
    }
  }
}

export function periodLabel(grain: EntryGrain, anchorDate: string): string {
  const { year, month, day } = partsOf(anchorDate);
  switch (grain) {
    case "day":
      return `${day} ${MONTHS[month - 1]} ${year}`;
    case "week": {
      const { week, startDay, endDay } = weekOfMonthBounds(year, month, day);
      return `Week ${week} (${startDay}-${endDay} ${MONTHS[month - 1]} ${year})`;
    }
    case "month":
      return `${["January","February","March","April","May","June","July","August","September","October","November","December"][month - 1]} ${year}`;
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx jest src/lib/entry/__tests__/period.test.ts`
Expected: PASS (all cases above)

- [ ] **Step 5: Commit**

```bash
git add src/lib/entry/period.ts src/lib/entry/__tests__/period.test.ts
git commit -m "$(cat <<'EOF'
Add period.ts: date-range resolver for grain-aware Data Entry

resolvePeriod/stepPeriod/periodLabel turn (grain, anchorDate) into the
row range MonthlyEntryGrid renders and drive its Prev/Next nav. Week
stepping uses bucket-index math (not raw +/-7 days) so it lands correctly
on a short final week-of-month bucket across a month boundary.
EOF
)"
```

---

### Task 3: `WeekPicker` popover component

**Files:**
- Create: `src/components/WeekPicker.tsx`

**Interfaces:**
- Consumes: `weekOfMonthBounds` from `@/lib/analytics/scope`.
- Produces: `export default function WeekPicker(props: { value: string; onChange: (anchorDate: string) => void }): JSX.Element` — `value` is any date inside the currently-selected week bucket (the page's `date` state); `onChange` fires with the **first day** of the bucket the user clicked (so the caller can just store it as the new anchor, matching how `resolvePeriod("week", anchorDate)` is used elsewhere).

- [ ] **Step 1: Implement the component**

Create `src/components/WeekPicker.tsx`:

```tsx
"use client";

// src/components/WeekPicker.tsx
// Report Date control for the "week" grain on /data-entry. Opens a small
// popover calendar where day cells are laid out 7-per-row starting from the
// 1st of the month (NOT real Monday-Sunday weeks) — matching the week-of-month
// bucketing weekOfMonthBounds()/periodKey() already use everywhere else in the
// app. Clicking any cell in a row selects and highlights that whole row.
// See docs/superpowers/specs/2026-07-09-data-entry-grain-aware-design.md §4.

import React, { useEffect, useRef, useState } from "react";
import { weekOfMonthBounds } from "@/lib/analytics/scope";

function daysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

function isoDate(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function partsOf(dateStr: string): { year: number; month: number; day: number } {
  const [year, month, day] = dateStr.split("-").map(Number);
  return { year, month, day };
}

const MONTH_NAMES = ["January","February","March","April","May","June","July","August","September","October","November","December"];

export default function WeekPicker({ value, onChange }: { value: string; onChange: (anchorDate: string) => void }) {
  const initial = partsOf(value);
  const [open, setOpen] = useState(false);
  const [browseYear, setBrowseYear] = useState(initial.year);
  const [browseMonth, setBrowseMonth] = useState(initial.month);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (!containerRef.current?.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener("click", handler);
    return () => window.removeEventListener("click", handler);
  }, [open]);

  const selected = partsOf(value);
  const selectedBucket = weekOfMonthBounds(selected.year, selected.month, selected.day);

  const total = daysInMonth(browseYear, browseMonth);
  const rows: number[][] = [];
  for (let d = 1; d <= total; d += 7) {
    const row: number[] = [];
    for (let x = d; x <= Math.min(d + 6, total); x++) row.push(x);
    rows.push(row);
  }

  const goMonth = (delta: number) => {
    let m = browseMonth + delta;
    let y = browseYear;
    if (m > 12) { m = 1; y += 1; }
    if (m < 1) { m = 12; y -= 1; }
    setBrowseMonth(m);
    setBrowseYear(y);
  };

  const pickRow = (row: number[]) => {
    onChange(isoDate(browseYear, browseMonth, row[0]));
    setOpen(false);
  };

  const label = `Week ${selectedBucket.week} (${selectedBucket.startDay}-${selectedBucket.endDay} ${MONTH_NAMES[selected.month - 1].slice(0, 3)} ${selected.year})`;

  return (
    <div ref={containerRef} style={{ position: "relative" }}>
      <div
        onClick={(e) => { e.stopPropagation(); setOpen(!open); }}
        style={{
          display: "flex", alignItems: "center", gap: 6, fontSize: 13, fontWeight: 600,
          border: "1px solid var(--border)", borderRadius: 8, padding: "7px 10px",
          background: "var(--bg)", color: "var(--text)", cursor: "pointer", width: 160,
        }}
      >
        {label}
      </div>

      {open && (
        <div
          onClick={(e) => e.stopPropagation()}
          style={{
            position: "absolute", top: "100%", left: 0, marginTop: 6, zIndex: 200,
            background: "var(--surface)", border: "1px solid var(--border-strong)",
            borderRadius: "var(--radius-md)", boxShadow: "var(--shadow-lg)", padding: 12, width: 240,
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8, fontWeight: 700, fontSize: 13 }}>
            <button onClick={() => goMonth(-1)} style={{ background: "transparent", border: "none", cursor: "pointer", fontSize: 14 }}>‹</button>
            <span>{MONTH_NAMES[browseMonth - 1]} {browseYear}</span>
            <button onClick={() => goMonth(1)} style={{ background: "transparent", border: "none", cursor: "pointer", fontSize: 14 }}>›</button>
          </div>

          {rows.map((row, i) => {
            const isSelectedRow = browseYear === selected.year && browseMonth === selected.month && row[0] === selectedBucket.startDay;
            return (
              <div
                key={i}
                onClick={() => pickRow(row)}
                style={{
                  display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 2, marginBottom: 2,
                  borderRadius: 6, cursor: "pointer",
                  background: isSelectedRow ? "color-mix(in srgb, var(--accent) 15%, transparent)" : "transparent",
                }}
              >
                {row.map((d) => (
                  <div key={d} style={{
                    textAlign: "center", padding: "4px 0", fontSize: 12, fontFamily: "var(--font-mono)",
                    fontWeight: isSelectedRow ? 800 : 500,
                    color: isSelectedRow ? "var(--accent)" : "var(--text)",
                  }}>
                    {d}
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Verify it compiles**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: no new errors from `src/components/WeekPicker.tsx` (this component isn't wired into any page yet, so it just needs to type-check standalone).

- [ ] **Step 3: Commit**

```bash
git add src/components/WeekPicker.tsx
git commit -m "$(cat <<'EOF'
Add WeekPicker: popover week-of-month selector for Data Entry

Row-highlight calendar, 7-per-row from the 1st of the month (no weekday
header) so the visual grouping always matches weekOfMonthBounds()'s
existing bucketing instead of introducing a second "week" definition.
Not yet wired into any page (Task 5).
EOF
)"
```

---

### Task 4: Generalize `MonthlyEntryGrid` from month-only to grain + range

**Files:**
- Modify: `src/components/MonthlyEntryGrid.tsx`

**Interfaces:**
- Consumes: `EntryGrain`, `resolvePeriod`, `stepPeriod`, `periodLabel` from `@/lib/entry/period` (Task 2).
- Produces (new/changed props): `{ grain: EntryGrain; anchorDate: string; onAnchorChange?: (next: string) => void }` replacing the old `initialDate?: string` prop. `onAnchorChange` is optional so `data-entry/page.tsx` can keep its own `date` state in sync when the grid's internal Prev/Next buttons move the anchor (needed because in FY mode the page needs to know which month is currently open in the month-tabs row — Task 5).
- Everything else exported/consumed (`onDirtyChange`, `customFields`, `blockedReason`, `presetId`) is unchanged.

- [ ] **Step 1: Replace the `{year, month}` state with a grain-aware `anchorDate` state**

In `src/components/MonthlyEntryGrid.tsx`, replace the top-of-file helpers and the component's date state.

Remove (lines 18-39, the now-superseded local date helpers — `currentYearMonth`, `daysInMonth`, `isoDate`, `yearMonthOf`):

```ts
function currentYearMonth(): { year: number; month: number } {
  const now = new Date();
  return { year: now.getFullYear(), month: now.getMonth() + 1 }; // month: 1-12
}

/** Days in `month` (1-12) of `year` — day 0 of the next 0-indexed month is the
 *  last day of the target month. */
function daysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

function isoDate(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/** Parses a "YYYY-MM-DD" string into { year, month } without going through
 *  `Date` parsing (which treats date-only strings as UTC and can shift the
 *  day depending on the browser's local timezone). */
function yearMonthOf(dateStr: string): { year: number; month: number } {
  const [y, m] = dateStr.split("-").map(Number);
  return { year: y, month: m };
}
```

Replace with an import (added to the existing import block at the top of the file):

```ts
import { type EntryGrain, resolvePeriod, stepPeriod, periodLabel } from "@/lib/entry/period";
```

Change the component signature (currently `initialDate?: string`) and its date state:

Before:

```ts
export default function MonthlyEntryGrid({ onDirtyChange, customFields, initialDate, blockedReason, presetId }: {
  onDirtyChange?: (dirty: boolean) => void;
  customFields?: Record<string, any>;
  initialDate?: string;
  blockedReason?: string | null;
  /** Which Data Entry preset's registry to render the grid against. Omit for the default preset. */
  presetId?: string | null;
} = {}) {
  const { refreshEvents } = useEvents();
  const [registry, setRegistry] = useState<any | null>(null);
  const [activeStageId, setActiveStageId] = useState<string | null>(null);
  const [activeSize, setActiveSize] = useState<string | null>(null);
  const [{ year, month }, setYearMonth] = useState(() => (initialDate ? yearMonthOf(initialDate) : currentYearMonth()));
```

After:

```ts
export default function MonthlyEntryGrid({ onDirtyChange, customFields, grain, anchorDate, onAnchorChange, blockedReason, presetId }: {
  onDirtyChange?: (dirty: boolean) => void;
  customFields?: Record<string, any>;
  /** Which row range to render — see src/lib/entry/period.ts. */
  grain: EntryGrain;
  /** Any date inside the range currently being edited. */
  anchorDate: string;
  /** Fired when Prev/Next nav moves the anchor, so a parent tracking its own
   *  copy (e.g. the FY month-tabs row) can stay in sync. */
  onAnchorChange?: (next: string) => void;
  blockedReason?: string | null;
  /** Which Data Entry preset's registry to render the grid against. Omit for the default preset. */
  presetId?: string | null;
}) {
  const { refreshEvents } = useEvents();
  const [registry, setRegistry] = useState<any | null>(null);
  const [activeStageId, setActiveStageId] = useState<string | null>(null);
  const [activeSize, setActiveSize] = useState<string | null>(null);
  const { from, to } = useMemo(() => resolvePeriod(grain, anchorDate), [grain, anchorDate]);
  const { year, month } = useMemo(() => {
    const [y, m] = anchorDate.split("-").map(Number);
    return { year: y, month: m };
  }, [anchorDate]);
```

(`year`/`month` are kept as derived values — not state — because the stage-effective-date filtering further down (`stageIds` memo) already reads them by name; deriving from `anchorDate` instead of storing separately removes a second source of truth.)

- [ ] **Step 2: Replace `days` (row list), `loadMonth`, and `goToMonth` with range-based equivalents**

Before (the `days` memo):

```ts
  const days = useMemo(
    () => Array.from({ length: daysInMonth(year, month) }, (_, i) => isoDate(year, month, i + 1)),
    [year, month],
  );
```

After:

```ts
  const days = useMemo(() => {
    const out: string[] = [];
    const start = new Date(`${from}T00:00:00Z`).getTime();
    const end = new Date(`${to}T00:00:00Z`).getTime();
    for (let t = start; t <= end; t += 86400000) {
      out.push(new Date(t).toISOString().slice(0, 10));
    }
    return out;
  }, [from, to]);
```

Before (`loadMonth`):

```ts
  const loadMonth = useCallback(async () => {
    if (!activeStageId) return;
    setLoading(true); setError(null);
    const from = isoDate(year, month, 1);
    const to = isoDate(year, month, daysInMonth(year, month));
    const params = new URLSearchParams({ from, to, stageId: activeStageId });
    if (isSizeWise && activeSize) params.set("size", activeSize);
    try {
      const res = await fetch(`/api/day-records?${params.toString()}`);
      const data = await res.json();
      setRecords(data.records ?? []);
      setDirty(false);
    } catch (err) {
      console.error("Error loading month:", err);
      setError("Failed to load this month's data.");
      setRecords([]);
      setDirty(false);
    } finally {
      setLoading(false);
    }
  }, [activeStageId, activeSize, year, month, isSizeWise]);

  useEffect(() => {
    loadMonth();
  }, [loadMonth]);
```

After:

```ts
  const loadRange = useCallback(async () => {
    if (!activeStageId) return;
    setLoading(true); setError(null);
    const params = new URLSearchParams({ from, to, stageId: activeStageId });
    if (isSizeWise && activeSize) params.set("size", activeSize);
    try {
      const res = await fetch(`/api/day-records?${params.toString()}`);
      const data = await res.json();
      setRecords(data.records ?? []);
      setDirty(false);
    } catch (err) {
      console.error("Error loading range:", err);
      setError("Failed to load this period's data.");
      setRecords([]);
      setDirty(false);
    } finally {
      setLoading(false);
    }
  }, [activeStageId, activeSize, from, to, isSizeWise]);

  useEffect(() => {
    loadRange();
  }, [loadRange]);
```

Before (`monthLabel`, `goToMonth`, and the discard-confirm that references it):

```ts
  const monthLabel = new Date(year, month - 1, 1).toLocaleDateString("en-US", { month: "long", year: "numeric" });

  const confirmDiscardIfDirty = (actionLabel: string): boolean => {
    if (!dirty) return true;
    return confirm(`You have unsaved changes for ${monthLabel} that haven't been submitted yet. ${actionLabel} will discard them. Continue?`);
  };

  const goToMonth = (deltaMonths: number) => {
    if (!confirmDiscardIfDirty("Changing the month")) return;
    let m = month + deltaMonths;
    let y = year;
    while (m > 12) { m -= 12; y += 1; }
    while (m < 1) { m += 12; y -= 1; }
    setYearMonth({ year: y, month: m });
  };
```

After:

```ts
  const rangeLabel = periodLabel(grain, anchorDate);

  const confirmDiscardIfDirty = (actionLabel: string): boolean => {
    if (!dirty) return true;
    return confirm(`You have unsaved changes for ${rangeLabel} that haven't been submitted yet. ${actionLabel} will discard them. Continue?`);
  };

  const goToPeriod = (delta: number) => {
    const label = grain === "day" ? "Changing the day" : grain === "week" ? "Changing the week" : "Changing the month";
    if (!confirmDiscardIfDirty(label)) return;
    const next = stepPeriod(grain, anchorDate, delta);
    onAnchorChange?.(next);
  };
```

- [ ] **Step 3: Update the remaining references to `monthLabel`, `goToMonth`, and the nav bar's Prev/Next buttons**

Two remaining usages of `monthLabel` in `saveMonth()` — before:

```ts
      body: JSON.stringify({ ingestionId, fileName: `Monthly Entry ${monthLabel}`, records: payload, presetId }),
      ...
      setSuccess(`${payload.length} day(s) saved for ${monthLabel}.`);
```

After:

```ts
      body: JSON.stringify({ ingestionId, fileName: `Data Entry ${rangeLabel}`, records: payload, presetId }),
      ...
      setSuccess(`${payload.length} day(s) saved for ${rangeLabel}.`);
```

The nav bar JSX — before:

```tsx
        <button onClick={() => goToMonth(-1)} style={ghost} aria-label="Previous month">‹ Prev</button>
        <div style={{ fontWeight: 700, minWidth: 140, textAlign: "center" }}>{monthLabel}</div>
        <button onClick={() => goToMonth(1)} style={ghost} aria-label="Next month">Next ›</button>
```

After:

```tsx
        <button onClick={() => goToPeriod(-1)} style={ghost} aria-label="Previous period">‹ Prev</button>
        <div style={{ fontWeight: 700, minWidth: 160, textAlign: "center" }}>{rangeLabel}</div>
        <button onClick={() => goToPeriod(1)} style={ghost} aria-label="Next period">Next ›</button>
```

The Save button copy — before:

```tsx
          {saving ? "Saving Month…" : "Save Month"}
```

After:

```tsx
          {saving ? "Saving…" : grain === "day" ? "Save Day" : grain === "week" ? "Save Week" : "Save Month"}
```

- [ ] **Step 4: Type-check**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: no errors from `MonthlyEntryGrid.tsx` itself. (`data-entry/page.tsx` will show errors here because it still passes the old `initialDate` prop — that's expected and fixed in Task 5; confirm the only errors are in `data-entry/page.tsx`, not `MonthlyEntryGrid.tsx`.)

- [ ] **Step 5: Run the existing Jest suite**

Run: `npx jest --silent`
Expected: PASS — no test in this repo imports `MonthlyEntryGrid` directly (component wiring isn't unit-tested per this codebase's convention), so this is a smoke check that nothing else broke.

- [ ] **Step 6: Commit**

```bash
git add src/components/MonthlyEntryGrid.tsx
git commit -m "$(cat <<'EOF'
Generalize MonthlyEntryGrid from a fixed month to grain + anchorDate

Replaces the hardcoded {year, month} state and daysInMonth() row loop
with resolvePeriod()/stepPeriod()/periodLabel() from lib/entry/period.ts,
so the grid can render exactly one day, one week-of-month bucket, or a
full month depending on the caller's grain. data-entry/page.tsx is
updated to pass the new props in the next commit.
EOF
)"
```

---

### Task 5: Grain-aware Report Date control in `data-entry/page.tsx`

**Files:**
- Modify: `src/app/data-entry/page.tsx`

**Interfaces:**
- Consumes: `useTweaks()` from `@/components/editorial/TweaksContext` (for `t.grain`/`setTweak`), `WeekPicker` (Task 3), `EntryGrain`/`resolvePeriod` from `@/lib/entry/period` (Task 2), `fyContaining` from `@/lib/analytics/scope` (Task 1), `useEvents()` (already imported) for the FY dropdown's available years.
- Produces: no new exports — this is the page component itself.

- [ ] **Step 1: Add the new imports and FY/grain-derived state**

At the top of `src/app/data-entry/page.tsx`, add to the existing import block:

```ts
import { useTweaks } from "@/components/editorial/TweaksContext";
import WeekPicker from "@/components/WeekPicker";
import { type EntryGrain, resolvePeriod } from "@/lib/entry/period";
import { fyContaining } from "@/lib/analytics/scope";
```

Immediately after the existing `const [date, setDate] = useState(today());` line (this anchor matters: the grain-guard effect below reads `activeTab`/`monthlyDirty`, both already declared above this point in the file — inserting here keeps the reads visually below their declarations instead of relying on closure-timing to make an out-of-order reference safe), add:

```ts
  const { t, setTweak } = useTweaks();
  const { events } = useEvents();

  // FY grain doesn't have its own row range — it narrows to a fiscal year,
  // then a month tab within it drives the same Month case the grid already
  // renders. `fyOpenMonth` is the anchor actually passed to the grid whenever
  // t.grain === "fy"; `date` (below) remains the anchor for day/week/month.
  const [fyStartYear, setFyStartYear] = useState<number>(() => fyContaining(today()).startYear);
  const [fyOpenMonth, setFyOpenMonth] = useState<string>(() => {
    const fy = fyContaining(today());
    return fy.from; // default to April 1st of the current/most-recent FY
  });

  // Grain-change guard: the topbar's D/W/M/FY buttons (AppShell) set t.grain
  // directly with no way for this page to veto it. Detect the change here
  // instead, and revert it if there are unsaved edits the operator declines
  // to discard — see docs/superpowers/specs/2026-07-09-data-entry-grain-aware-design.md §4.
  const prevGrainRef = useRef(t.grain);
  useEffect(() => {
    if (t.grain === prevGrainRef.current) return;
    if (activeTab === "entry" && monthlyDirty) {
      const ok = confirm("You have unsaved changes in the data entry grid that haven't been submitted yet. Switching the Grain will discard them. Continue?");
      if (!ok) {
        setTweak("grain", prevGrainRef.current);
        return;
      }
    }
    prevGrainRef.current = t.grain;
  }, [t.grain, activeTab, monthlyDirty, setTweak]);

  // The FY dropdown's options: every FY that has at least one event, plus the
  // FY containing today so the control is never empty on a fresh install.
  const fyOptions = useMemo(() => {
    const years = new Set<number>([fyContaining(today()).startYear]);
    for (const e of events ?? []) {
      years.add(fyContaining(e.occurredOn.start).startYear);
    }
    return Array.from(years).sort((a, b) => b - a);
  }, [events]);

  // The grain actually handed to MonthlyEntryGrid: "fy" isn't a grid grain
  // (Task 2's EntryGrain is day|week|month) — FY mode always edits a month.
  const effectiveGrain: EntryGrain = t.grain === "fy" ? "month" : t.grain;
  const effectiveAnchor = t.grain === "fy" ? fyOpenMonth : date;
```

Add `useRef` to the existing `import React, { useMemo, useState, useEffect } from "react";` line (it currently doesn't import `useRef`):

Before:

```ts
import React, { useMemo, useState, useEffect } from "react";
```

After:

```ts
import React, { useMemo, useState, useEffect, useRef } from "react";
```

- [ ] **Step 2: Replace the Report Date field with the grain-aware control**

Before (inside the "entry" tab's header bar):

```tsx
            <label className="muted" style={{ fontSize: 11, display: "flex", flexDirection: "column", gap: 4 }}>
              Report Date
              <input type="date" value={date} onChange={(e) => {
                const newDate = e.target.value;
                if (!confirmLeaveEntryGrid()) return;
                setDate(newDate);
              }} style={{ ...inp, width: 160 }} />
            </label>
```

After:

```tsx
            <label className="muted" style={{ fontSize: 11, display: "flex", flexDirection: "column", gap: 4 }}>
              {t.grain === "day" && "Report Date"}
              {t.grain === "week" && "Report Week"}
              {t.grain === "month" && "Report Month"}
              {t.grain === "fy" && "Report FY"}

              {t.grain === "day" && (
                <input type="date" value={date} onChange={(e) => {
                  const newDate = e.target.value;
                  if (!confirmLeaveEntryGrid()) return;
                  setDate(newDate);
                }} style={{ ...inp, width: 160 }} />
              )}

              {t.grain === "week" && (
                <WeekPicker value={date} onChange={(next) => {
                  if (!confirmLeaveEntryGrid()) return;
                  setDate(next);
                }} />
              )}

              {t.grain === "month" && (
                <input type="month" value={date.slice(0, 7)} onChange={(e) => {
                  if (!confirmLeaveEntryGrid()) return;
                  setDate(`${e.target.value}-01`);
                }} style={{ ...inp, width: 160 }} />
              )}

              {t.grain === "fy" && (
                <select value={fyStartYear} onChange={(e) => {
                  if (!confirmLeaveEntryGrid()) return;
                  const y = Number(e.target.value);
                  setFyStartYear(y);
                  setFyOpenMonth(`${y}-04-01`);
                }} style={{ ...inp, width: 160 }}>
                  {fyOptions.map((y) => (
                    <option key={y} value={y}>FY{y}-{String((y + 1) % 100).padStart(2, "0")}</option>
                  ))}
                </select>
              )}
            </label>
```

- [ ] **Step 3: Add the FY month-tabs row (rendered only in FY grain, just above the grid)**

Immediately before the existing `{presets.length === 0 ? (` block (which conditionally renders `<MonthlyEntryGrid />`), add:

```tsx
          {t.grain === "fy" && (
            <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginBottom: 16 }}>
              {Array.from({ length: 12 }, (_, i) => {
                const month = ((i + 3) % 12) + 1; // Apr(4)..Mar(3): i=0 -> 4, ..., i=8 -> 12, i=9 -> 1, ...
                const year = month >= 4 ? fyStartYear : fyStartYear + 1;
                const anchor = `${year}-${String(month).padStart(2, "0")}-01`;
                const on = fyOpenMonth.slice(0, 7) === anchor.slice(0, 7);
                const label = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"][month - 1];
                return (
                  <button key={anchor} onClick={() => { if (confirmLeaveEntryGrid()) setFyOpenMonth(anchor); }}
                    style={{ padding: "6px 12px", borderRadius: 8, border: "1px solid var(--border-strong)",
                      background: on ? "var(--accent)" : "var(--surface-2)",
                      color: on ? "var(--text-invert)" : "var(--text-2)", fontWeight: 700, fontSize: 12, cursor: "pointer" }}>
                    {label}
                  </button>
                );
              })}
            </div>
          )}
```

- [ ] **Step 4: Pass the new props to `MonthlyEntryGrid`**

Before:

```tsx
            <MonthlyEntryGrid
              key={`${date}-${selectedPresetId ?? "default"}`}
              initialDate={date}
              presetId={selectedPresetId}
              customFields={entryCustomFields}
              blockedReason={hdr.operator.trim() ? null : "Operator name is required."}
              onDirtyChange={setMonthlyDirty}
            />
```

After:

```tsx
            <MonthlyEntryGrid
              key={`${effectiveGrain}-${effectiveAnchor}-${selectedPresetId ?? "default"}`}
              grain={effectiveGrain}
              anchorDate={effectiveAnchor}
              onAnchorChange={(next) => { if (t.grain === "fy") setFyOpenMonth(next); else setDate(next); }}
              presetId={selectedPresetId}
              customFields={entryCustomFields}
              blockedReason={hdr.operator.trim() ? null : "Operator name is required."}
              onDirtyChange={setMonthlyDirty}
            />
```

- [ ] **Step 5: Type-check and run the suite**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: PASS — no errors in `data-entry/page.tsx` or `MonthlyEntryGrid.tsx`.

Run: `npx jest --silent`
Expected: PASS — same baseline as Task 1/2 (no test imports these page/component files directly).

- [ ] **Step 6: Commit**

```bash
git add src/app/data-entry/page.tsx
git commit -m "$(cat <<'EOF'
Wire the global Grain (D/W/M/FY) into the Data Entry Report Date control

Report Date now renders a day input, the new WeekPicker, a month input,
or an FY select + month-tabs row depending on t.grain, and passes the
resolved grain/anchor down to the generalized MonthlyEntryGrid. A topbar
grain change while there are unsaved edits is now caught and confirmable
(reverting the tweak on decline) instead of silently discarding them.
EOF
)"
```

---

### Task 6: Manual runtime verification

**Files:** none (verification only — no code changes).

- [ ] **Step 1: Start the dev server and open `/data-entry`**

Confirm the Report Date label reads "Report Date" and a native date input renders (Grain defaults to "month" — switch the topbar Grain to Day first).

- [ ] **Step 2: Day grain**

Set Grain to Day. Confirm: exactly one row renders for the picked date; Prev Day / Next Day step correctly, including across a month-end (e.g. Jul 31 → Aug 1) and a year-end (Dec 31 → Jan 1).

- [ ] **Step 3: Week grain**

Set Grain to Week. Open the WeekPicker popover; confirm the day grid has no weekday header and groups days 7-per-row from the 1st. Click a row; confirm exactly those days render in the grid (the short final bucket of a 31-day month should show only 3 rows, e.g. days 29-31). Confirm Prev/Next Week steps correctly across a month boundary, landing on the adjacent month's first/last bucket (not a raw ±7-day jump).

- [ ] **Step 4: Month grain**

Set Grain to Month. Confirm behavior is unchanged from before this plan (this is the regression check) — full month renders, Prev/Next Month works, Save behaves as it did previously.

- [ ] **Step 5: FY grain**

Set Grain to FY. Confirm the FY select and 12 month tabs (Apr→Mar) render; clicking a tab loads that month's spreadsheet below; Save behaves identically to Month grain, with the success/ledger `fileName` reflecting the correct month.

- [ ] **Step 6: Cross-cutting checks**

- Enter data in any grain, click Save, confirm the success banner appears and the row(s) persist on reload (via `/api/day-records`).
- Confirm Dashboard/Reports reflect the save immediately (via the existing `refreshEvents()` call) without a page reload — this is the pre-existing dashboard-sync behavior from the unify spec; it must not have regressed.
- With unsaved edits in the grid, switch the topbar Grain: confirm the discard-confirm dialog appears, and declining it reverts the topbar's Grain selection back to what it was.
- With unsaved edits, use the page's own Report Date control (any grain) and the FY month-tabs: confirm the existing `confirmLeaveEntryGrid()` discard-confirm still fires for those too.

- [ ] **Step 7: Final check and report**

Run `npx tsc --noEmit -p tsconfig.json` and `npx jest --silent` one more time to confirm both are green, then report this phase complete.

---

## Spec coverage check (self-review)

- §2 grain source (reuse global `t.grain`) → Task 5.
- §2 week definition (week-of-month, matches `scope.ts`) → Task 1, Task 2, Task 3.
- §2 week picker UI (row-highlight calendar) → Task 3.
- §2 FY interaction (dropdown + month tabs, delegates to Month) → Task 5.
- §2 daily view nav (Prev/Next Day) → Task 2 (`stepPeriod`), Task 4 (nav bar).
- §2 Report Date label changes per grain → Task 5, Step 2.
- §3 architecture (topbar grain → picker → grid → existing `/api/day-records`) → Tasks 2, 4, 5 together; no backend task exists because none is needed.
- §4 components (`WeekPicker` new file, `MonthlyEntryGrid` generalized, `data-entry/page.tsx` grain-aware) → Tasks 3, 4, 5.
- §4 "unchanged" list → verified by construction: no task touches `/api/ingest`, `/api/day-records`, `/api/schema`, the header metadata bar, the Ledger tab, or Custom Datasets.
- §5 error handling (dirty guard now covers grain changes too) → Task 5, Step 1 (the `prevGrainRef` effect).
- §6 testing plan → Task 1 & 2's Jest tests (pure logic) + Task 6 (manual runtime verification for every grain, dashboard-sync regression check).
- §7 out of scope (status indicators, reminders, missing-entry nav) → correctly absent from every task; tracked as the Phase 2 follow-up spec.
