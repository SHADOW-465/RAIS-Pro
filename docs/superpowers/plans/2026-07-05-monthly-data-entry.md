# Monthly Entry Mode Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a "Monthly Entry" tab to `/data-entry` that shows one row per calendar day of a selected month (for a chosen Stage + Size), reusing the existing edit/validate/save pipeline instead of building a parallel one.

**Architecture:** Extend `GET /api/day-records` to accept a date range (`from`/`to`) plus optional `stageId`/`size` filters, on top of its existing single-`date` mode. A new self-contained `MonthlyEntryGrid` component (mirrors the existing `DatasetEntryForm` tab pattern) fetches a month of records, renders day-rows, edits cells through the same `applyEdit`/`buildReviewRows` functions the daily grid already uses, and batches all changed days into one `POST /api/ingest` call via a "Save Month" button.

**Tech Stack:** Next.js App Router route handlers, React (client components), Jest for route/unit tests, existing `StageDayRecord`/`applyEdit`/`buildReviewRows` domain model — no new libraries.

Spec: `docs/superpowers/specs/2026-07-05-monthly-data-entry-design.md`

---

## Task 1: Extend `/api/day-records` to support a date range

**Files:**
- Modify: `src/app/api/day-records/route.ts`
- Test: `src/app/api/day-records/__tests__/route.test.ts` (new)

- [ ] **Step 1: Write the failing tests**

Create `src/app/api/day-records/__tests__/route.test.ts`:

```ts
// Forces the memory store so this test never touches a real Supabase project.
process.env.MOID_STORE = "memory";

import { GET } from "../route";
import { NextRequest } from "next/server";
import { getStores } from "@/lib/store";
import { emitMany } from "@/lib/ingest/emit";
import type { StageDayRecord } from "@/lib/ingest/emit";

function rec(date: string, overrides: Partial<StageDayRecord> = {}): StageDayRecord {
  return {
    occurredOn: { kind: "day", start: date, end: date },
    stageId: "visual",
    size: "Fr8",
    source: { file: "Manual Entry", fileHash: `manual-${date}`, sheet: "Data Entry", tableId: "entry" },
    checked: { value: 100, cell: "EDIT!checked", header: "checked" },
    acceptedGood: { value: 90, cell: "EDIT!acceptedGood", header: "acceptedGood" },
    rework: null,
    rejected: { value: 10, cell: "EDIT!rejected", header: "rejected" },
    defects: [],
    statedPct: null,
    extractedBy: "direct-entry",
    ingestionId: `ing-${date}`,
    ...overrides,
  };
}

async function seed(records: StageDayRecord[]) {
  const { events } = getStores();
  await events.append(emitMany(records));
}

function req(qs: string) {
  return new NextRequest(`http://localhost/api/day-records?${qs}`);
}

describe("/api/day-records", () => {
  it("date-only mode is unchanged: returns every stage/size for that single date", async () => {
    await seed([rec("2026-04-01"), rec("2026-04-01", { stageId: "production", size: null })]);
    const res = await GET(req("date=2026-04-01"));
    const json = await res.json();
    expect(json.records).toHaveLength(2);
    expect(json.records.every((r: StageDayRecord) => r.occurredOn.start === "2026-04-01")).toBe(true);
  });

  it("from/to range mode returns one record per (date, stage, size)", async () => {
    await seed([rec("2026-04-01"), rec("2026-04-02"), rec("2026-04-03")]);
    const res = await GET(req("from=2026-04-01&to=2026-04-30&stageId=visual&size=Fr8"));
    const json = await res.json();
    expect(json.records).toHaveLength(3);
    const dates = json.records.map((r: StageDayRecord) => r.occurredOn.start).sort();
    expect(dates).toEqual(["2026-04-01", "2026-04-02", "2026-04-03"]);
  });

  it("range mode never merges two different days into one record", async () => {
    await seed([rec("2026-04-01", { rejected: { value: 5, cell: "", header: "" } }), rec("2026-04-02", { rejected: { value: 20, cell: "", header: "" } })]);
    const res = await GET(req("from=2026-04-01&to=2026-04-30&stageId=visual&size=Fr8"));
    const json = await res.json();
    const byDate = Object.fromEntries(json.records.map((r: StageDayRecord) => [r.occurredOn.start, r.rejected?.value]));
    expect(byDate["2026-04-01"]).toBe(5);
    expect(byDate["2026-04-02"]).toBe(20);
  });

  it("stageId/size filters narrow the range query", async () => {
    await seed([rec("2026-04-01", { stageId: "visual", size: "Fr8" }), rec("2026-04-01", { stageId: "visual", size: "Fr14" }), rec("2026-04-01", { stageId: "balloon", size: "Fr8" })]);
    const res = await GET(req("from=2026-04-01&to=2026-04-30&stageId=visual&size=Fr8"));
    const json = await res.json();
    expect(json.records).toHaveLength(1);
    expect(json.records[0].stageId).toBe("visual");
    expect(json.records[0].size).toBe("Fr8");
  });

  it("an empty range returns an empty array, not an error", async () => {
    const res = await GET(req("from=2099-01-01&to=2099-01-31&stageId=visual&size=Fr8"));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.records).toEqual([]);
  });

  it("neither date nor from/to is a 400", async () => {
    const res = await GET(req("stageId=visual"));
    expect(res.status).toBe(400);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx jest src/app/api/day-records --silent`
Expected: FAIL — most assertions fail because the route doesn't yet accept `from`/`to`/`stageId`/`size` and groups only by `stageId|size` (would merge different dates together, or 400 on missing `date`).

- [ ] **Step 3: Implement the range query**

Replace the full contents of `src/app/api/day-records/route.ts`:

```ts
// src/app/api/day-records/route.ts
// Reconstruct StageDayRecord[] for a calendar date (or a date range) from the
// canonical event ledger — the reverse of emitStageDay(). Feeds the Data Entry
// spreadsheet (single date) and the Monthly Entry grid (a whole month) so
// opening an existing date/range loads whatever is ACTUALLY on file (any
// source: upload or manual entry). Reads through the same canonicalizeEvents()
// the dashboard uses, so what the operator edits is exactly what's shown
// everywhere else.
import { NextRequest, NextResponse } from "next/server";
import { getStores } from "@/lib/store";
import { canonicalizeEvents } from "@/lib/analytics/canonical";
import type { StageDayRecord } from "@/lib/ingest/emit";

const COUNTABLE = new Set(["production", "inspection", "rejection"]);

export async function GET(req: NextRequest) {
  try {
    const date = req.nextUrl.searchParams.get("date");
    const from = req.nextUrl.searchParams.get("from");
    const to = req.nextUrl.searchParams.get("to");
    const stageId = req.nextUrl.searchParams.get("stageId");
    const size = req.nextUrl.searchParams.get("size");

    const rangeFrom = date ?? from;
    const rangeTo = date ?? to;
    if (!rangeFrom || !rangeTo) {
      return NextResponse.json({ error: "date, or both from and to, are required" }, { status: 400 });
    }

    const { events } = getStores();
    let dayEvents = canonicalizeEvents(await events.effective({ from: rangeFrom, to: rangeTo }))
      .filter((e: any) => COUNTABLE.has(e.eventType) && e.occurredOn?.start >= rangeFrom && e.occurredOn?.start <= rangeTo);

    if (stageId) dayEvents = dayEvents.filter((e: any) => e.stageId === stageId);
    if (size) dayEvents = dayEvents.filter((e: any) => (e.size ?? null) === size);

    // One record per (date, stageId, size) — mirrors how emitStageDay() groups
    // a single StageDayRecord's fields into separate events. Date is folded
    // into the key so a range query never merges two different days.
    const groups = new Map<string, StageDayRecord>();
    const keyOf = (d: string, sId: string, sz: string | null) => `${d}|${sId}|${sz ?? "__line__"}`;

    for (const e of dayEvents as any[]) {
      const evDate = e.occurredOn.start;
      const evSize: string | null = e.size ?? null;
      const key = keyOf(evDate, e.stageId, evSize);
      let rec = groups.get(key);
      if (!rec) {
        rec = {
          occurredOn: e.occurredOn,
          stageId: e.stageId,
          size: evSize,
          // Sheet fixed to "Data Entry" regardless of original source: once
          // loaded for editing, review.ts's stageLabel() falls back to the
          // registry's proper stage label instead of a stale sheet name.
          source: { file: e.provenance?.file ?? "Data Entry", fileHash: e.provenance?.fileHash ?? "local", sheet: "Data Entry", tableId: "entry" },
          checked: null,
          acceptedGood: null,
          rework: null,
          rejected: null,
          defects: [],
          statedPct: null,
          extractedBy: e.extractedBy,
          ingestionId: e.ingestionId,
          customFields: e.customFields ?? {},
        };
        groups.set(key, rec);
      }
      const sv = { value: e.quantity, cell: e.provenance?.cells?.[0] ?? "", header: e.provenance?.headerPath?.[0] ?? "" };
      if (e.eventType === "production") rec.checked = sv;
      else if (e.eventType === "inspection") {
        if (e.disposition === "rejected") rec.rejected = sv;
        else if (e.disposition === "accepted") rec.acceptedGood = sv;
        else if (e.disposition === "rework") rec.rework = sv;
      } else if (e.eventType === "rejection") {
        rec.defects.push({ raw: e.defectCodeRaw, value: e.quantity, cell: e.provenance?.cells?.[0] ?? "" });
      }
    }

    return NextResponse.json({ records: Array.from(groups.values()) });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? "Failed to load day records" }, { status: 500 });
  }
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx jest src/app/api/day-records --silent`
Expected: PASS (6/6)

- [ ] **Step 5: Run the full suite to confirm no regression on the daily-entry page**

Run: `npx jest --silent`
Expected: same pass count as before this change (the 5 corpus-directory suites fail regardless — pre-existing, unrelated). No new failures.

- [ ] **Step 6: Commit**

```bash
git add src/app/api/day-records/route.ts src/app/api/day-records/__tests__/route.test.ts
git commit -m "feat(day-records): support from/to range + stageId/size filters

Additive: date-only mode (used by daily entry) is unchanged. Powers
the Monthly Entry grid's one-request-per-month load."
```

---

## Task 2: Extract shared capture-field maps (DRY prerequisite for Task 3)

**Files:**
- Create: `src/lib/ingest/capture-fields.ts`
- Modify: `src/app/data-entry/page.tsx:41-45` (the four map declarations) and the later `CORE_FIELD_BY_COL` declaration
- Test: none new (existing Jest suite + manual page load cover this — it's a pure extraction, no behavior change)

- [ ] **Step 1: Create the shared module**

Create `src/lib/ingest/capture-fields.ts`:

```ts
// src/lib/ingest/capture-fields.ts
// Shared between the daily entry grid (data-entry/page.tsx) and the Monthly
// Entry grid — both render the same capture columns (Checked/Good/Rework/
// Rejected) against the same StageDayRecord fields, so the label/key mappings
// live in one place instead of two copies drifting apart.

/** Registry `stage.captures` id -> short column label shown in the grid header. */
export const CAPTURE_LABEL: Record<string, string> = { checked: "Checked", accepted: "Accept", hold: "Hold", rejected: "Reject" };

/** Registry `stage.captures` id -> the schema field name used for edits/lookup. */
export const CAPTURE_FIELD: Record<string, string> = { checked: "Checked Qty", accepted: "Good Qty", hold: "Rework Qty", rejected: "Rejected Qty" };

/** Registry `stage.captures` id -> StageDayRecord property name. */
export const CAPTURE_TO_RECORD_FIELD: Record<string, "checked" | "acceptedGood" | "rework" | "rejected"> = {
  checked: "checked", accepted: "acceptedGood", hold: "rework", rejected: "rejected",
};

/** Schema field name -> StageDayRecord property name (the reverse direction,
 *  used by updateCell to route an edit on a named column to the right field). */
export const CORE_FIELD_BY_COL: Record<string, "checked" | "acceptedGood" | "rework" | "rejected"> = {
  "Checked Qty": "checked", "Good Qty": "acceptedGood", "Rework Qty": "rework", "Rejected Qty": "rejected",
};
```

- [ ] **Step 2: Update `data-entry/page.tsx` to import instead of declare**

In `src/app/data-entry/page.tsx`, remove these four lines (currently around line 41-45):

```ts
const CAPTURE_LABEL: Record<string, string> = { checked: "Checked", accepted: "Accept", hold: "Hold", rejected: "Reject" };
const CAPTURE_FIELD: Record<string, string> = { checked: "Checked Qty", accepted: "Good Qty", hold: "Rework Qty", rejected: "Rejected Qty" };
const CAPTURE_TO_RECORD_FIELD: Record<string, "checked" | "acceptedGood" | "rework" | "rejected"> = {
  checked: "checked", accepted: "acceptedGood", hold: "rework", rejected: "rejected",
};
```

and the later `CORE_FIELD_BY_COL` declaration:

```ts
const CORE_FIELD_BY_COL: Record<string, "checked" | "acceptedGood" | "rework" | "rejected"> = {
  "Checked Qty": "checked", "Good Qty": "acceptedGood", "Rework Qty": "rework", "Rejected Qty": "rejected",
};
```

Add this import near the top of the file (alongside the existing `@/lib/ingest/review` import):

```ts
import { CAPTURE_LABEL, CAPTURE_FIELD, CAPTURE_TO_RECORD_FIELD, CORE_FIELD_BY_COL } from "@/lib/ingest/capture-fields";
```

- [ ] **Step 3: Verify the extraction didn't change behavior**

Run: `npx tsc --noEmit -p tsconfig.json 2>&1 | grep data-entry`
Expected: no output (no type errors — confirms nothing still references the removed local consts incorrectly)

Run: `npx jest --silent`
Expected: same pass count as Task 1's Step 5 (pure refactor, no logic change)

- [ ] **Step 4: Commit**

```bash
git add src/lib/ingest/capture-fields.ts src/app/data-entry/page.tsx
git commit -m "refactor(data-entry): extract capture-field maps to a shared module

Prerequisite for MonthlyEntryGrid, which needs the identical
label/key mappings the daily grid already uses."
```

---

## Task 3: `MonthlyEntryGrid` component — shell, data loading, day-row rendering

**Files:**
- Create: `src/components/MonthlyEntryGrid.tsx`

- [ ] **Step 1: Write the component shell with month navigation and data loading**

Create `src/components/MonthlyEntryGrid.tsx`:

```tsx
"use client";

// src/components/MonthlyEntryGrid.tsx
// "Monthly Entry" mode for /data-entry — one row per calendar day of a
// selected month, for a chosen Stage (+ Size for size-wise stages). Mirrors
// the real Excel sheet shape. Reuses the exact same StageDayRecord model,
// applyEdit(), and buildReviewRows() the daily entry grid and /staging use,
// so a day entered here is indistinguishable from one entered anywhere else
// (see docs/superpowers/specs/2026-07-05-monthly-data-entry-design.md).

import React, { useEffect, useMemo, useState } from "react";
import { DISPOSAFE_REGISTRY } from "@/lib/registry/disposafe";
import type { StageDayRecord } from "@/lib/ingest/emit";
import { buildReviewRows, applyEdit } from "@/lib/ingest/review";
import { CAPTURE_LABEL, CAPTURE_FIELD, CAPTURE_TO_RECORD_FIELD, CORE_FIELD_BY_COL } from "@/lib/ingest/capture-fields";

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

export default function MonthlyEntryGrid() {
  const [registry, setRegistry] = useState<any | null>(null);
  const [activeStageId, setActiveStageId] = useState<string | null>(null);
  const [activeSize, setActiveSize] = useState<string | null>(null);
  const [{ year, month }, setYearMonth] = useState(currentYearMonth());

  const [records, setRecords] = useState<StageDayRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/schema")
      .then((res) => res.json())
      .then((data) => setRegistry(data.registry ?? null))
      .catch(() => setRegistry(null));
  }, []);

  const activeRegistry = registry || DISPOSAFE_REGISTRY;

  const stageIds: string[] = useMemo(() => {
    const monthEnd = isoDate(year, month, daysInMonth(year, month));
    const monthStart = isoDate(year, month, 1);
    return activeRegistry.stages
      .filter((s: any) => (s.effectiveFrom == null || s.effectiveFrom <= monthEnd) &&
                     (s.effectiveTo == null || monthStart <= s.effectiveTo))
      .map((s: any) => s.stageId);
  }, [activeRegistry, year, month]);

  useEffect(() => {
    if (activeStageId && stageIds.includes(activeStageId)) return;
    setActiveStageId(stageIds[0] ?? null);
  }, [stageIds, activeStageId]);

  const activeStage = useMemo(
    () => activeRegistry.stages.find((s: any) => s.stageId === activeStageId) || null,
    [activeRegistry, activeStageId],
  );

  const sizes: { sizeId: string; label: string }[] = useMemo(
    () => (activeRegistry.sizes && activeRegistry.sizes.length ? activeRegistry.sizes : []),
    [activeRegistry],
  );
  const isSizeWise = !!activeStage?.sizeWise && sizes.length > 0;

  useEffect(() => {
    if (!isSizeWise) { setActiveSize(null); return; }
    if (activeSize && sizes.some((s) => s.sizeId === activeSize)) return;
    setActiveSize(sizes[0]?.sizeId ?? null);
  }, [isSizeWise, sizes, activeSize]);

  const activeCaptures: string[] = useMemo(
    () => activeStage?.captures ?? ["checked", "accepted", "hold", "rejected"],
    [activeStage],
  );
  const activeDefects = useMemo(
    () => (activeRegistry.defects || []).filter((d: any) => d.stages.includes(activeStageId)),
    [activeRegistry, activeStageId],
  );

  const rowKey = isSizeWise ? activeSize : "__line__";

  const loadMonth = async () => {
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
    } catch (err) {
      console.error("Error loading month:", err);
      setError("Failed to load this month's data.");
      setRecords([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadMonth();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeStageId, activeSize, year, month]);

  const days = useMemo(
    () => Array.from({ length: daysInMonth(year, month) }, (_, i) => isoDate(year, month, i + 1)),
    [year, month],
  );

  const recordFor = (date: string): StageDayRecord | undefined =>
    records.find((r) => r.occurredOn.start === date && (r.size ?? "__line__") === rowKey);

  const monthLabel = new Date(year, month - 1, 1).toLocaleDateString("en-US", { month: "long", year: "numeric" });

  const goToMonth = (deltaMonths: number) => {
    let m = month + deltaMonths;
    let y = year;
    while (m > 12) { m -= 12; y += 1; }
    while (m < 1) { m += 12; y -= 1; }
    setYearMonth({ year: y, month: m });
  };

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16, padding: 16, background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12 }}>
        <button onClick={() => goToMonth(-1)} style={ghost} aria-label="Previous month">‹ Prev</button>
        <div style={{ fontWeight: 700, minWidth: 140, textAlign: "center" }}>{monthLabel}</div>
        <button onClick={() => goToMonth(1)} style={ghost} aria-label="Next month">Next ›</button>
        {isSizeWise && (
          <select value={activeSize ?? ""} onChange={(e) => setActiveSize(e.target.value)} style={{ ...inp, width: 100, marginLeft: 12 }}>
            {sizes.map((s) => <option key={s.sizeId} value={s.sizeId}>{s.label}</option>)}
          </select>
        )}
        {loading && <span className="muted" style={{ fontSize: 12 }}>Loading…</span>}
      </div>

      {error && <div style={{ marginBottom: 14, padding: "10px 14px", borderRadius: 9, background: "color-mix(in srgb, var(--status-bad) 12%, transparent)", color: "var(--status-bad)", fontSize: 13 }}>{error}</div>}

      <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginBottom: 12 }}>
        {stageIds.map((id: string) => {
          const s = activeRegistry.stages.find((st: any) => st.stageId === id);
          const on = id === activeStageId;
          return (
            <button key={id} onClick={() => setActiveStageId(id)}
              style={{ padding: "6px 12px", borderRadius: 8, border: "1px solid var(--border-strong)",
                background: on ? "var(--accent)" : "var(--surface-2)",
                color: on ? "var(--text-invert)" : "var(--text-2)", fontWeight: 700, fontSize: 12, cursor: "pointer" }}>
              {s?.label ?? id}
            </button>
          );
        })}
      </div>

      <div style={{ overflowX: "auto", border: "1px solid var(--border)", borderRadius: 8, background: "var(--bg)" }}>
        <table style={{ width: "max-content", minWidth: "100%", borderCollapse: "separate", borderSpacing: 0, fontSize: 13 }}>
          <thead>
            <tr style={{ color: "var(--text-3)", background: "var(--surface-2)", fontSize: 10, textTransform: "uppercase", borderBottom: "1.5px solid var(--border-strong)" }}>
              <th style={{ ...eth, textAlign: "left", minWidth: 90, position: "sticky", left: 0, zIndex: 2, background: "var(--surface-2)" }}>Date</th>
              {activeCaptures.map((c) => <th key={c} style={eth}>{CAPTURE_LABEL[c]}</th>)}
              {activeDefects.map((d: any) => <th key={d.defectCode} style={eth} title={d.label}>{d.defectCode}</th>)}
            </tr>
          </thead>
          <tbody>
            {days.map((date) => {
              const rec = recordFor(date);
              const captureValue = (c: string): string => {
                const field = CAPTURE_TO_RECORD_FIELD[c];
                const sv = rec?.[field];
                return sv != null ? String(sv.value) : "";
              };
              const defectValue = (label: string): string => {
                const d = rec?.defects.find((x) => x.raw === label);
                return d ? String(d.value) : "";
              };
              return (
                <tr key={date} style={{ borderBottom: "1px solid var(--border)" }}>
                  <td style={{ ...etd, textAlign: "left", fontWeight: 700, background: "var(--surface)", position: "sticky", left: 0, zIndex: 1, fontFamily: "var(--font-mono)" }}>{date}</td>
                  {activeCaptures.map((c) => (
                    <td key={c} style={{ ...etd, padding: "3px 4px" }}>
                      <input type="number" inputMode="numeric" value={captureValue(c)} readOnly
                        style={{ ...inp, width: 84, padding: "4px 8px", height: 30, fontFamily: "var(--font-mono)", textAlign: "right" }} />
                    </td>
                  ))}
                  {activeDefects.map((d: any) => (
                    <td key={d.defectCode} style={{ ...etd, padding: "3px 4px" }}>
                      <input type="number" inputMode="numeric" value={defectValue(d.label)} readOnly
                        style={{ ...inp, width: 64, padding: "4px 8px", height: 30, fontFamily: "var(--font-mono)", textAlign: "right" }} />
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

const inp: React.CSSProperties = {
  width: "100%", padding: "7px 10px", borderRadius: 8, border: "1px solid var(--border)",
  background: "var(--bg)", color: "var(--text)", fontSize: 13, fontFamily: "inherit", outline: "none",
};
const ghost: React.CSSProperties = {
  background: "transparent", color: "var(--text-2)", border: "1px solid var(--border)",
  borderRadius: 9, padding: "8px 14px", fontSize: 13, cursor: "pointer",
};
const eth: React.CSSProperties = { padding: "8px 8px", textAlign: "center", fontWeight: 600, borderRight: "1px solid var(--border)" };
const etd: React.CSSProperties = { padding: "6px 8px", textAlign: "center", color: "var(--text)", borderRight: "1px solid var(--border)" };
```

Note: cells are `readOnly` in this step deliberately — Task 4 wires editing. This step's goal is a correctly-loading, correctly-shaped read-only grid to validate the data flow before adding edit/save complexity on top.

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit -p tsconfig.json 2>&1 | grep MonthlyEntryGrid`
Expected: no output

- [ ] **Step 3: Commit**

```bash
git add src/components/MonthlyEntryGrid.tsx
git commit -m "feat(data-entry): MonthlyEntryGrid shell — month nav + read-only day rows

Loads a month of records via the new /api/day-records range query.
Editing lands in the next commit."
```

---

## Task 4: Wire up editing, per-row validation, and the dirty-discard guard

**Files:**
- Modify: `src/components/MonthlyEntryGrid.tsx`

- [ ] **Step 1: Add editable cells, per-row validation, and a dirty guard**

In `src/components/MonthlyEntryGrid.tsx`, add `dirty` state and an `updateCell` function (mirrors `data-entry/page.tsx`'s `updateCell`, keyed by date as well as stage/size), then wire per-row invalid highlighting via `buildReviewRows`.

Add near the other `useState` declarations:

```tsx
  const [dirty, setDirty] = useState(false);
```

Add a `blankRecord` and `updateCell` function above the `loadMonth` function:

```tsx
  const blankRecord = (date: string): StageDayRecord => ({
    occurredOn: { kind: "day", start: date, end: date },
    stageId: activeStageId!,
    size: rowKey === "__line__" ? null : rowKey,
    source: { file: "Manual Entry", fileHash: `manual-${date}`, sheet: "Data Entry", tableId: "entry" },
    checked: null, acceptedGood: null, rework: null, rejected: null,
    defects: [], statedPct: null,
    extractedBy: "direct-entry",
    ingestionId: "pending",
  });

  // CORE_FIELD_BY_COL is already imported from "@/lib/ingest/capture-fields"
  // (added to this file's import line in this same task) — not redeclared.
  const updateCell = (date: string, colName: string, val: string) => {
    const coreField = CORE_FIELD_BY_COL[colName];
    setDirty(true);
    setRecords((prev) => {
      let idx = prev.findIndex((r) => r.occurredOn.start === date && (r.size ?? "__line__") === rowKey);
      let next = prev;
      if (idx < 0) {
        if (val === "") return prev;
        next = [...prev, blankRecord(date)];
        idx = next.length - 1;
      }
      if (val === "") {
        return next.map((r, i) => {
          if (i !== idx) return r;
          if (coreField) return { ...r, [coreField]: null, extractedBy: "direct-entry" };
          return { ...r, defects: r.defects.filter((d) => d.raw !== colName), extractedBy: "direct-entry" };
        });
      }
      const num = Number(val);
      if (isNaN(num) || num < 0) return next;
      return applyEdit(next, idx, coreField ?? colName, num);
    });
  };
```

Replace the "nav that discards records" call sites — `goToMonth`, `setActiveStageId` (in the stage-tab buttons), and the size `<select>`'s `onChange` — so each first checks the dirty flag. Replace the `goToMonth` function:

```tsx
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

(`monthLabel` is computed above `goToMonth` already — no reorder needed since `confirmDiscardIfDirty` is defined right before it and both close over `monthLabel`/`month`/`year` from the surrounding scope.)

Update the stage-tab button's `onClick` from `() => setActiveStageId(id)` to:

```tsx
onClick={() => { if (confirmDiscardIfDirty("Switching stages")) setActiveStageId(id); }}
```

Update the size `<select>`'s `onChange` from `(e) => setActiveSize(e.target.value)` to:

```tsx
onChange={(e) => { if (confirmDiscardIfDirty("Switching size")) setActiveSize(e.target.value); }}
```

Reset `dirty` to `false` at the end of `loadMonth`'s try block, right after `setRecords(data.records ?? [])`:

```tsx
      setRecords(data.records ?? []);
      setDirty(false);
```

and in the catch block, right after `setRecords([]);`:

```tsx
      setRecords([]);
      setDirty(false);
```

Now make the cells editable and validation-aware. Add per-day validation above the day-rows `.map`:

```tsx
  const reviewByDate = useMemo(() => {
    const map = new Map<string, ReturnType<typeof buildReviewRows>[number]>();
    records.forEach((r, i) => {
      const [row] = buildReviewRows([r]);
      if (row) map.set(`${r.occurredOn.start}|${(r.size ?? "__line__")}`, { ...row, recordIndex: i });
    });
    return map;
  }, [records]);
```

Replace the two `readOnly` inputs' `onChange`/`readOnly` — the capture cell:

```tsx
                  {activeCaptures.map((c) => {
                    const review = reviewByDate.get(`${date}|${rowKey}`);
                    const field = CAPTURE_TO_RECORD_FIELD[c];
                    const isCulprit = review?.invalidFields.includes(field === "acceptedGood" ? "acceptedGood" : field);
                    return (
                      <td key={c} style={{ ...etd, padding: "3px 4px" }}>
                        <input type="number" inputMode="numeric" value={captureValue(c)}
                          onChange={(e) => updateCell(date, CAPTURE_FIELD[c], e.target.value)}
                          style={{ ...inp, width: 84, padding: "4px 8px", height: 30, fontFamily: "var(--font-mono)", textAlign: "right",
                            borderColor: isCulprit ? "var(--status-bad)" : "var(--border-strong)" }} />
                      </td>
                    );
                  })}
```

and the defect cell:

```tsx
                  {activeDefects.map((d: any) => {
                    const review = reviewByDate.get(`${date}|${rowKey}`);
                    const isCulprit = review?.invalidFields.includes(d.label) || review?.invalidFields.includes(d.defectCode);
                    return (
                      <td key={d.defectCode} style={{ ...etd, padding: "3px 4px" }}>
                        <input type="number" inputMode="numeric" value={defectValue(d.label)}
                          onChange={(e) => updateCell(date, d.label, e.target.value)}
                          style={{ ...inp, width: 64, padding: "4px 8px", height: 30, fontFamily: "var(--font-mono)", textAlign: "right",
                            borderColor: isCulprit ? "var(--status-bad)" : "var(--border-strong)" }} />
                      </td>
                    );
                  })}
```

Add a summary line below the table showing invalid-day count:

```tsx
      {(() => {
        const invalidCount = Array.from(reviewByDate.values()).filter((r) => r.status === "invalid").length;
        return invalidCount > 0 ? (
          <p style={{ fontSize: 12, color: "var(--status-bad)", marginTop: 8 }}>
            {invalidCount} of {reviewByDate.size} entered day{reviewByDate.size === 1 ? "" : "s"} need{invalidCount === 1 ? "s" : ""} fixing before you can save.
          </p>
        ) : null;
      })()}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit -p tsconfig.json 2>&1 | grep MonthlyEntryGrid`
Expected: no output

- [ ] **Step 3: Commit**

```bash
git add src/components/MonthlyEntryGrid.tsx
git commit -m "feat(data-entry): editable Monthly Entry cells + per-day validation

Reuses applyEdit()/buildReviewRows() unchanged — same guarantees
(no auto-mutating neighbouring fields, invalidFields-scoped
highlighting) daily entry already has. Adds the dirty-discard guard
to month/stage/size navigation."
```

---

## Task 5: "Save Month" batch submit

**Files:**
- Modify: `src/components/MonthlyEntryGrid.tsx`

- [ ] **Step 1: Add the save action and button**

Add state near the other `useState` declarations:

```tsx
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState<string | null>(null);
```

Add the save function above the `return`:

```tsx
  const invalidCount = Array.from(reviewByDate.values()).filter((r) => r.status === "invalid").length;

  async function saveMonth() {
    setSaving(true); setError(null); setSuccess(null);
    const ingestionId = globalThis.crypto?.randomUUID?.() ?? `entry-${Date.now()}`;
    const payload = records
      .filter((r) => r.checked || r.acceptedGood || r.rework || r.rejected || r.defects.length > 0)
      .map((r) => ({ ...r, ingestionId }));

    if (payload.length === 0) {
      setError("Enter quantities for at least one day before saving.");
      setSaving(false);
      return;
    }

    try {
      const res = await fetch("/api/ingest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ingestionId, fileName: `Monthly Entry ${monthLabel}`, records: payload }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? "Save failed");
      setSuccess(`${payload.length} day(s) saved for ${monthLabel}.`);
      setDirty(false);
      await loadMonth();
    } catch (e: any) {
      setError(e?.message ?? "Save failed");
    } finally {
      setSaving(false);
    }
  }
```

Add the success banner and Save button just before the closing `</div>` of the component's returned JSX (after the invalid-count paragraph block):

```tsx
      {success && (
        <div style={{ marginTop: 14, padding: "10px 14px", borderRadius: 9, background: "var(--positive-weak)", border: "1px solid var(--positive)", color: "var(--positive)", fontSize: 13 }}>
          {success}
        </div>
      )}

      <div style={{ display: "flex", justifyContent: "center", marginTop: 16 }}>
        <button onClick={saveMonth} disabled={saving || invalidCount > 0}
          style={{ background: "var(--status-good)", color: "#fff", border: "none", borderRadius: 9, padding: "10px 22px", fontSize: 14, fontWeight: 700,
            cursor: saving || invalidCount > 0 ? "not-allowed" : "pointer", opacity: saving || invalidCount > 0 ? 0.6 : 1 }}>
          {saving ? "Saving Month…" : "Save Month"}
        </button>
      </div>
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit -p tsconfig.json 2>&1 | grep MonthlyEntryGrid`
Expected: no output

- [ ] **Step 3: Commit**

```bash
git add src/components/MonthlyEntryGrid.tsx
git commit -m "feat(data-entry): Save Month batches every changed day into one POST /api/ingest

Disabled while any entered day is invalid, matching daily entry's
Submit & Lock gating."
```

---

## Task 6: Wire the "Monthly Entry" tab into `/data-entry`

**Files:**
- Modify: `src/app/data-entry/page.tsx`

- [ ] **Step 1: Add the tab**

Change the `activeTab` type (around line 51):

```ts
  const [activeTab, setActiveTab] = useState<"entry" | "monthly" | "ledger" | "custom">("entry");
```

Add the import near the top of the file (alongside the `DatasetEntryForm` import):

```ts
import MonthlyEntryGrid from "@/components/MonthlyEntryGrid";
```

Add a fourth tab button, inserted between the "New Data Entry" and "Entry History / Data Ledger" buttons:

```tsx
          <button
            onClick={() => setActiveTab("monthly")}
            style={{
              padding: "8px 16px",
              border: "none",
              borderRadius: "0",
              background: activeTab === "monthly" ? "var(--accent)" : "var(--surface-2)",
              color: activeTab === "monthly" ? "var(--text-invert)" : "var(--text-2)",
              fontWeight: 700,
              fontSize: 13,
              cursor: "pointer"
            }}
          >
            Monthly Entry
          </button>
```

Since this button now sits between the first and third buttons, change the first button's `borderRadius` from `"8px 0 0 8px"` to stay the same (still the leftmost), and change the (previously-second, now-third) "Entry History / Data Ledger" button's `borderRadius` from `"0"` to stay `"0"` (it's now the middle-right one, not the rightmost) — and give the new "Monthly Entry" button and the last ("Custom Datasets") button the correct end-cap: "Custom Datasets" keeps `"0 8px 8px 0"` (still rightmost). No changes needed to the two existing buttons' `borderRadius` values — only the new button needs `borderRadius: "0"` as written above, since it's now a middle tab.

Add the render branch — change:

```tsx
      {activeTab === "custom" ? (
        <DatasetEntryForm />
      ) : activeTab === "entry" ? (
```

to:

```tsx
      {activeTab === "custom" ? (
        <DatasetEntryForm />
      ) : activeTab === "monthly" ? (
        <MonthlyEntryGrid />
      ) : activeTab === "entry" ? (
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit -p tsconfig.json 2>&1 | grep data-entry`
Expected: no output

- [ ] **Step 3: Run the full test suite**

Run: `npx jest --silent`
Expected: same pass count as Task 1 Step 5 (no regression — this task only adds a new tab/branch, doesn't touch existing tabs' logic)

- [ ] **Step 4: Commit**

```bash
git add src/app/data-entry/page.tsx
git commit -m "feat(data-entry): add Monthly Entry as a third tab

Sits alongside New Data Entry / Entry History / Custom Datasets;
daily entry is unchanged."
```

---

## Task 7: Manual verification pass (dev server)

No committed test file — this repo verifies UI flows by hand against the dev server (see the rest of this session's testing). This task is a checklist, not code.

- [ ] **Step 1: Start the dev server** (`preview_start` / `npm run dev`) and navigate to `/data-entry`.
- [ ] **Step 2: Click "Monthly Entry".** Confirm the current month loads, stage tabs match the registry (same set already verified in this session's Phase 1), and a size dropdown appears only for size-wise stages.
- [ ] **Step 3: Edit 3 non-adjacent days** (e.g. the 1st, 15th, and last day of the month) with different values across Checked/Good/Reject/one defect code each. Confirm:
  - Each day's row shows exactly what was typed.
  - No other day's row changed.
  - No other field within an edited day changed beyond what was typed (reuse the exact assertion pattern from the daily-entry test earlier this session: edit a defect, confirm `checked`/`rejected` on that SAME day are untouched unless you touched them).
- [ ] **Step 4: Switch stage tabs, then switch back.** Confirm the confirm() dialog fires (unsaved changes), and Cancel preserves the 3 edited days.
- [ ] **Step 5: Click "Save Month".** Confirm the success banner, then verify via `curl http://localhost:3000/api/day-records?from=<first-of-month>&to=<last-of-month>&stageId=<stage>&size=<size>` that all 3 days round-trip with the exact entered values.
- [ ] **Step 6: Check the Dashboard** reflects the newly saved days (same spot-check style as this session's Phase 4 — Rejection Rate / FPY / Defect Pareto should move).
- [ ] **Step 7: Navigate to the next month, then back.** Confirm the previously-saved month's data still loads correctly (no cross-month leakage).

---

## Self-Review Notes

- **Spec coverage:** Task 1 covers the range-query endpoint (§3 "New: date-range day-records query"). Tasks 3-5 cover the grid/edit/validate/save component (§3 "Component: MonthlyEntryGrid", §3 "Save", §4). Task 6 covers the tab addition (§2 "Relationship to daily entry"). Task 7 covers §5 (testing plan's Playwright-equivalent manual pass). Out-of-scope items from spec §6 (column visibility, ad-hoc rows, clipboard paste) are intentionally absent from this plan.
- **Placeholder scan:** none found — every step has complete code or an exact command.
- **Type consistency:** `updateCell(date, colName, val)` signature is identical across Task 4's definition and Task 5's usage (unused directly in Task 5, only `saveMonth` reads `records`). `CAPTURE_LABEL`/`CAPTURE_FIELD`/`CAPTURE_TO_RECORD_FIELD` names match between Task 2's extraction and Task 3/4's imports. `reviewByDate` key format (`` `${date}|${rowKey}` ``) is consistent between its construction in Task 4 and both lookup sites in the same task.
