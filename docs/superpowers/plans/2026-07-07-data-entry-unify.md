# Unify Data Entry + Dashboard Sync Fix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the dashboard-sync bug (Monthly Entry / Custom Datasets saves not refreshing the shared `EventsContext`), then merge `MonthlyEntryGrid` into `/data-entry`'s "New Data Entry" tab as the one and only spreadsheet-style entry surface, removing the standalone "Monthly Entry" tab and the old size-rows-per-date grid.

**Architecture:** No new endpoints or stores. Two existing save paths (`MonthlyEntryGrid.saveMonth()`, `DatasetEntryForm.handlePublish()`) start calling the already-proven `useEvents().refreshEvents()`. `MonthlyEntryGrid` gains three optional props (`customFields`, `initialDate`, `blockedReason`) so `data-entry/page.tsx` can drive it the same way the old grid was driven, then that page's "entry" tab is rewritten to render the header metadata bar (unchanged) followed by `<MonthlyEntryGrid key={date} .../>` instead of the old per-size grid.

**Tech Stack:** Next.js App Router client components, React state/hooks — no new libraries, no schema/API changes.

## Global Constraints

- No new Tailwind utility classes for theming — use CSS variables (`var(--...)`) exactly as the surrounding code already does.
- Don't reintroduce Chart.js, lucide-react, or framer-motion.
- File naming: `PascalCase.tsx` for components (already established) — no new files needed for this plan.
- Don't bypass Zod schemas or add custom JSON parsing — not touched by this plan, called out only because it's a project-wide rule.
- Every step that changes a `.tsx` file must be followed by `npx tsc --noEmit -p tsconfig.json` producing no new errors in that file.

---

## Task 1: Fix dashboard sync — `MonthlyEntryGrid` calls `refreshEvents()` after Save Month

**Files:**
- Modify: `src/components/MonthlyEntryGrid.tsx`

**Interfaces:**
- Consumes: `useEvents` from `src/components/app/EventsContext.tsx` (`{ refreshEvents: () => Promise<void> }`, already used the same way in `src/app/data-entry/page.tsx` and `src/app/staging/page.tsx`).
- Produces: nothing new consumed by later tasks — this is a self-contained bug fix.

- [ ] **Step 1: Add the `useEvents` import**

In `src/components/MonthlyEntryGrid.tsx`, find:

```tsx
import { CAPTURE_LABEL, CAPTURE_FIELD, CAPTURE_TO_RECORD_FIELD, CORE_FIELD_BY_COL } from "@/lib/ingest/capture-fields";
```

Replace with:

```tsx
import { CAPTURE_LABEL, CAPTURE_FIELD, CAPTURE_TO_RECORD_FIELD, CORE_FIELD_BY_COL } from "@/lib/ingest/capture-fields";
import { useEvents } from "@/components/app/EventsContext";
```

- [ ] **Step 2: Call the hook inside the component**

Find:

```tsx
export default function MonthlyEntryGrid({ onDirtyChange }: { onDirtyChange?: (dirty: boolean) => void } = {}) {
  const [registry, setRegistry] = useState<any | null>(null);
```

Replace with:

```tsx
export default function MonthlyEntryGrid({ onDirtyChange }: { onDirtyChange?: (dirty: boolean) => void } = {}) {
  const { refreshEvents } = useEvents();
  const [registry, setRegistry] = useState<any | null>(null);
```

- [ ] **Step 3: Refresh the shared events context after a successful save**

Find, inside `saveMonth()`:

```tsx
      setSuccess(`${payload.length} day(s) saved for ${monthLabel}.`);
      setDirty(false);
      await loadMonth();
    } catch (e: any) {
```

Replace with:

```tsx
      setSuccess(`${payload.length} day(s) saved for ${monthLabel}.`);
      setDirty(false);
      await loadMonth();
      refreshEvents().catch(console.error);
    } catch (e: any) {
```

(Matches the exact pattern already used in `src/app/data-entry/page.tsx`'s `submit()` and `src/app/staging/page.tsx`'s publish handler — the refresh is fire-and-forget and never blocks or rolls back the success state.)

- [ ] **Step 4: Type-check**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: no errors reported for `src/components/MonthlyEntryGrid.tsx`.

- [ ] **Step 5: Manual verification**

This codebase has no React component test harness (`@testing-library/react` is not installed — confirmed via `package.json`), and prior UI-wiring tasks in this project were verified by hand against the dev server instead of a new test file. Do the same here:

1. Start the dev server (`npm run dev`).
2. Open `/data-entry`, go to the "Monthly Entry" tab (still present — Task 4 removes it).
3. Enter a quantity for one day, click "Save Month".
4. Without reloading the page, navigate to `/` (Dashboard) via the app nav.
5. Confirm the KPI you just affected (e.g. Rejection Rate or Total Checked) reflects the new value. Before this fix it would NOT update without a hard reload — this is the regression check for the bug.

- [ ] **Step 6: Commit**

```bash
git add src/components/MonthlyEntryGrid.tsx
git commit -m "fix(data-entry): refresh shared events context after Monthly Entry save

MonthlyEntryGrid.saveMonth() wrote to the canonical event store
correctly but never called refreshEvents(), so Dashboard/Reports/
Chat stayed stale until a hard reload. Matches the pattern the
daily-entry grid and /staging already use."
```

---

## Task 2: Fix dashboard sync — `DatasetEntryForm` calls `refreshEvents()` after Publish

**Files:**
- Modify: `src/components/DatasetEntryForm.tsx`

**Interfaces:**
- Consumes: `useEvents` from `src/components/app/EventsContext.tsx` (same as Task 1).
- Produces: nothing new consumed by later tasks.

- [ ] **Step 1: Add the `useEvents` import**

Find:

```tsx
import { useEffect, useMemo, useState } from "react";
import { toStageRecords } from "@/lib/dataset/to-stage-records";
import type { Dataset, DatasetRow } from "@/lib/dataset/types";
```

Replace with:

```tsx
import { useEffect, useMemo, useState } from "react";
import { toStageRecords } from "@/lib/dataset/to-stage-records";
import { useEvents } from "@/components/app/EventsContext";
import type { Dataset, DatasetRow } from "@/lib/dataset/types";
```

- [ ] **Step 2: Call the hook inside the component**

Find:

```tsx
export default function DatasetEntryForm() {
  const [datasets, setDatasets] = useState<Dataset[] | null>(null);
```

Replace with:

```tsx
export default function DatasetEntryForm() {
  const { refreshEvents } = useEvents();
  const [datasets, setDatasets] = useState<Dataset[] | null>(null);
```

- [ ] **Step 3: Refresh the shared events context after a successful publish**

Find, inside `handlePublish()`:

```tsx
      const issues = (json.issues ?? []).length;
      setPublishMsg({
        tone: "ok",
        text: `Published — ${json.inserted} new, ${json.deduped} already present${issues ? `, ${issues} clarification${issues === 1 ? "" : "s"} raised` : ""}.`,
      });
    } catch (e: any) {
      setPublishMsg({ tone: "err", text: e?.message ?? "Publish failed" });
    } finally {
      setPublishing(false);
    }
  }
```

Replace with:

```tsx
      const issues = (json.issues ?? []).length;
      setPublishMsg({
        tone: "ok",
        text: `Published — ${json.inserted} new, ${json.deduped} already present${issues ? `, ${issues} clarification${issues === 1 ? "" : "s"} raised` : ""}.`,
      });
      refreshEvents().catch(console.error);
    } catch (e: any) {
      setPublishMsg({ tone: "err", text: e?.message ?? "Publish failed" });
    } finally {
      setPublishing(false);
    }
  }
```

- [ ] **Step 4: Type-check**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: no errors reported for `src/components/DatasetEntryForm.tsx`.

- [ ] **Step 5: Manual verification**

1. With the dev server running, open `/data-entry` → "Custom Datasets" tab.
2. Pick a recognized dataset (one that shows the "Publish to Cumulative Dashboard →" button after saving a row), save a row, then click Publish.
3. Without reloading, navigate to `/` (Dashboard) and confirm the published row's numbers are reflected.

- [ ] **Step 6: Commit**

```bash
git add src/components/DatasetEntryForm.tsx
git commit -m "fix(data-entry): refresh shared events context after Custom Datasets publish

Same gap as MonthlyEntryGrid (Task 1) — handlePublish() wrote to the
canonical event store but never told EventsContext to refetch."
```

---

## Task 3: `MonthlyEntryGrid` — add `customFields`, `initialDate`, `blockedReason` props

**Files:**
- Modify: `src/components/MonthlyEntryGrid.tsx`

**Interfaces:**
- Produces (for Task 4 to consume): `MonthlyEntryGrid` now accepts
  - `customFields?: Record<string, any>` — merged onto every saved record's `customFields` at save time; if it includes a `size` key, that's used as the fallback tag for rows whose own `size` is `null` (line-only stages), while size-wise rows keep their own real size.
  - `initialDate?: string` (`"YYYY-MM-DD"`) — seeds the grid's starting year/month instead of always today's month.
  - `blockedReason?: string | null` — when non-null, disables the "Save Month" button and shows this string as the error message if the user clicks it anyway.

- [ ] **Step 1: Add a timezone-safe date parser next to the existing date helpers**

Find:

```tsx
function isoDate(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}
```

Replace with:

```tsx
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

- [ ] **Step 2: Extend the component's prop type**

Find:

```tsx
export default function MonthlyEntryGrid({ onDirtyChange }: { onDirtyChange?: (dirty: boolean) => void } = {}) {
  const { refreshEvents } = useEvents();
```

Replace with:

```tsx
export default function MonthlyEntryGrid({ onDirtyChange, customFields, initialDate, blockedReason }: {
  onDirtyChange?: (dirty: boolean) => void;
  customFields?: Record<string, any>;
  initialDate?: string;
  blockedReason?: string | null;
} = {}) {
  const { refreshEvents } = useEvents();
```

- [ ] **Step 3: Seed the starting month from `initialDate` when given**

Find:

```tsx
  const [{ year, month }, setYearMonth] = useState(currentYearMonth());
```

Replace with:

```tsx
  const [{ year, month }, setYearMonth] = useState(() => (initialDate ? yearMonthOf(initialDate) : currentYearMonth()));
```

- [ ] **Step 4: Merge `customFields` onto every saved record, and gate Save Month on `blockedReason`**

Find:

```tsx
  async function saveMonth() {
    setSaving(true); setError(null); setSuccess(null);
    const ingestionId = globalThis.crypto?.randomUUID?.() ?? `entry-${Date.now()}`;
    const payload = records
      .filter((r) => r.checked || r.acceptedGood || r.rework || r.rejected || r.defects.length > 0)
      .map((r) => ({ ...r, ingestionId }));
```

Replace with:

```tsx
  async function saveMonth() {
    if (blockedReason) {
      setError(blockedReason);
      return;
    }
    setSaving(true); setError(null); setSuccess(null);
    const ingestionId = globalThis.crypto?.randomUUID?.() ?? `entry-${Date.now()}`;
    const payload = records
      .filter((r) => r.checked || r.acceptedGood || r.rework || r.rejected || r.defects.length > 0)
      .map((r) => ({
        ...r,
        ingestionId,
        customFields: { ...r.customFields, ...customFields, size: r.size ?? customFields?.size },
      }));
```

- [ ] **Step 5: Disable the Save Month button while blocked**

Find:

```tsx
      <div style={{ display: "flex", justifyContent: "center", marginTop: 16 }}>
        <button onClick={saveMonth} disabled={saving || invalidCount > 0}
          style={{ background: "var(--status-good)", color: "#fff", border: "none", borderRadius: 9, padding: "10px 22px", fontSize: 14, fontWeight: 700,
            cursor: saving || invalidCount > 0 ? "not-allowed" : "pointer", opacity: saving || invalidCount > 0 ? 0.6 : 1 }}>
          {saving ? "Saving Month…" : "Save Month"}
        </button>
      </div>
```

Replace with:

```tsx
      <div style={{ display: "flex", justifyContent: "center", marginTop: 16 }}>
        <button onClick={saveMonth} disabled={saving || invalidCount > 0 || !!blockedReason}
          style={{ background: "var(--status-good)", color: "#fff", border: "none", borderRadius: 9, padding: "10px 22px", fontSize: 14, fontWeight: 700,
            cursor: saving || invalidCount > 0 || blockedReason ? "not-allowed" : "pointer", opacity: saving || invalidCount > 0 || blockedReason ? 0.6 : 1 }}>
          {saving ? "Saving Month…" : "Save Month"}
        </button>
      </div>
```

- [ ] **Step 6: Type-check**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: no errors in `src/components/MonthlyEntryGrid.tsx`. (It's fine that nothing passes the new props yet — all three are optional and `data-entry/page.tsx` still renders the old grid until Task 4.)

- [ ] **Step 7: Commit**

```bash
git add src/components/MonthlyEntryGrid.tsx
git commit -m "feat(MonthlyEntryGrid): accept customFields/initialDate/blockedReason props

Prep for merging this component into the main /data-entry 'New Data
Entry' tab (next task) — no behavior change yet since nothing passes
these props until then."
```

---

## Task 4: Merge the spreadsheet into `/data-entry`'s "New Data Entry" tab

**Files:**
- Modify: `src/app/data-entry/page.tsx` (full-file rewrite — the file is large and the old grid's code is deeply interleaved with state used only by it, so a complete replacement is less error-prone than dozens of partial edits)

**Interfaces:**
- Consumes: `MonthlyEntryGrid`'s `customFields`/`initialDate`/`blockedReason`/`onDirtyChange` props (Task 3).
- Produces: nothing new — this is the last file in the chain.

**What's being removed and why (read before writing the file):**

- **Tab bar:** the "Monthly Entry" button is deleted. `activeTab` narrows from `"entry" | "monthly" | "ledger" | "custom"` to `"entry" | "ledger" | "custom"`. Border-radius on the remaining three buttons reverts to a clean 3-tab layout (first `8px 0 0 8px`, middle `0`, last `0 8px 8px 0`).
- **The old per-size, per-date grid and its state** (`records`, `dirty`, `loadingDay`, `attemptedSubmit`, `busy`, `activeStageId`, `loadDay`, `confirmDiscardIfDirty`, `stageIds`, `sizes`, `activeStage`, `activeCaptures`, `activeDefects`, `isSizeWise`, `gridRowKeys`, `cellKey`, `recordFor`, `blankRecord`, `updateCell`, `submit`, `resetSpreadsheet`) — all deleted. `MonthlyEntryGrid` now owns loading/editing/saving for the "entry" tab entirely.
- **The right-rail KPI/Validation panel** (`totals`, `reviewRows`, `blockingErrors`, the `Stat`/`Badge` helper components, and the "Real-Time KPIs"/"Validation Checklist" `Section`s) — deleted. These were live totals computed from the old single-date grid's `records`; there is no equivalent whole-month aggregation today, and the user's ask was to replace the lower table with the spreadsheet, which this does. The "Clear Grid" button is dropped for the same reason (no page-level `records` left to clear — `MonthlyEntryGrid` already warns before discarding unsaved edits via its own dirty-guard).
- **Now-dead style constants** `primary`, `eth`, `etd` — deleted (verified via grep: used only inside the removed grid/button JSX). `inp`, `ghost`, `th`, `td`, `btnPrimary`, `btnGhost`, `btnSmallPrimary`, `btnSmallGhost`, `Section`, `Field` are still used (header bar, ledger table, schema modal) and are kept.
- **Now-dead imports** `StageDayRecord`, `buildReviewRows`, `reviewSummary` (was already unused before this change), `applyEdit`, `CAPTURE_LABEL`, `CAPTURE_FIELD`, `CAPTURE_TO_RECORD_FIELD`, `CORE_FIELD_BY_COL` — deleted (verified via grep: no remaining call sites after the grid is removed).
- **Operator-required validation** — previously enforced via `attemptedSubmit`/`blockingErrors` with a red border on the Operator field that only appeared after a failed submit attempt. That mechanism is deleted along with `submit()`. It's replaced by the simpler `blockedReason` prop (Task 3): `MonthlyEntryGrid`'s Save Month button is disabled and shows "Operator name is required." if clicked while empty. The red-border-only-after-attempt cosmetic nuance is not reproduced — `ponytail: functional gate preserved (can't save without an operator), the pre-attempt red-border polish is dropped as not worth a new callback between the grid and the page for this one field. Add it back by tracking a `saveAttempted` flag surfaced via a new MonthlyEntryGrid callback prop if it's missed in practice.`
- **Ledger "Edit" and "Duplicate" actions** (`handleEditLedgerRecord`, `handleDuplicateLedgerRecord`) — rewritten. Both used to call `loadDay()`/mutate page-level `records` directly; now they set the header fields + `date`, and rely on `<MonthlyEntryGrid key={date} .../>` remounting (React remounts a component when its `key` changes) to load the right month fresh. `handleEditLedgerRecord` behaves the same as before (jumps to the record's date, same caveat as before that it lands on the first date-active stage, not literally every stage the ledger row touched — this was already true pre-merge). `handleDuplicateLedgerRecord` changes: `ponytail: it now duplicates the header fields (operator/supervisor/machine/product/batch/shift/notes) onto today's date, but does NOT copy the source day's quantities forward — MonthlyEntryGrid has no external-seed hook for pre-populating cells from outside. Add a seedRecords prop to MonthlyEntryGrid if operators rely on copying values, not just headers, between days.` Neither handler calls `confirmLeaveEntryGrid()` — they're only reachable from the Ledger tab's row buttons, which only render while `activeTab !== "entry"`, meaning `MonthlyEntryGrid` is already unmounted (and its own tab-switch guard already fired) by the time these run. Adding the check anyway would be dead code that can never trigger.
- **Report Date field's `onChange`** — previously called `confirmDiscardIfDirty` + `loadDay(newDate)`. Now calls the renamed `confirmLeaveEntryGrid()` guard (same discard-confirmation, checking `monthlyDirty` instead of the deleted page-level `dirty`) and just `setDate(newDate)` — the date change itself, combined with `key={date}` on `<MonthlyEntryGrid>`, causes the grid to remount and reload starting from the new month.

- [ ] **Step 1: Replace the entire file**

Read the current file at `src/app/data-entry/page.tsx` first (needed because the Write tool requires having read a file before overwriting it), then write this complete replacement:

```tsx
// src/app/data-entry/page.tsx
"use client";

import React, { useMemo, useState, useEffect } from "react";
import AppShell from "@/components/app/AppShell";
import Icon from "@/components/editorial/Icon";
import { useEvents } from "@/components/app/EventsContext";
import { DISPOSAFE_REGISTRY } from "@/lib/registry/disposafe";
import DatasetEntryForm from "@/components/DatasetEntryForm";
import MonthlyEntryGrid from "@/components/MonthlyEntryGrid";

interface FieldDef {
  name: string;
  type: "number" | "text" | "date" | "dropdown" | "boolean";
  required: boolean;
  addAs: "column";
  appliesTo: "all" | "selected";
  selectedStages?: string[];
  unit?: string;
  isDefect?: boolean;
  dropdownOptions?: string[];
}

interface StageDef {
  stageId: string;
  label: string;
  fields: FieldDef[];
  upstream: string[];
  effectiveFrom: string | null;
  effectiveTo: string | null;
}

const DEFAULT_FIELDS: FieldDef[] = [
  { name: "Checked Qty", type: "number", required: true, addAs: "column", appliesTo: "all", unit: "" },
  { name: "Good Qty", type: "number", required: false, addAs: "column", appliesTo: "all", unit: "" },
  { name: "Rework Qty", type: "number", required: false, addAs: "column", appliesTo: "all", unit: "" },
  { name: "Rejected Qty", type: "number", required: true, addAs: "column", appliesTo: "all", unit: "" }
];

const today = () => new Date().toISOString().slice(0, 10);

export default function DataEntryPage() {
  const { refreshEvents } = useEvents();
  const [activeTab, setActiveTab] = useState<"entry" | "ledger" | "custom">("entry");
  const [monthlyDirty, setMonthlyDirty] = useState(false);
  const [date, setDate] = useState(today());
  const [hdr, setHdr] = useState({
    shift: "Day Shift",
    operator: "",
    supervisor: "",
    product: "FBC",
    size: "All",
    machine: "All Machines",
    batch: ""
  });

  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Registry state
  const [registry, setRegistry] = useState<any | null>(null);

  // Ledger state
  const [ledgerRecords, setLedgerRecords] = useState<any[]>([]);
  const [ledgerSearch, setLedgerSearch] = useState("");
  const [ledgerSort, setLedgerSort] = useState<{ col: string; desc: boolean }>({ col: "date", desc: true });

  // Schema Editor state
  const [showSchemaModal, setShowSchemaModal] = useState(false);
  const [schemaError, setSchemaError] = useState<string | null>(null);
  const [draftStages, setDraftStages] = useState<StageDef[]>([]);

  // Column field definition editor
  const [editingColName, setEditingColName] = useState<string | null>(null);
  const [colDraft, setColDraft] = useState<Partial<FieldDef>>({
    name: "",
    type: "number",
    required: false,
    appliesTo: "all",
    selectedStages: [],
    unit: "",
    isDefect: false,
    dropdownOptions: []
  });

  // Load registry, ledger records, and prefilled header fields on mount.
  // The spreadsheet itself (MonthlyEntryGrid) loads its own month of data.
  useEffect(() => {
    loadRegistry();
    loadLedger();
    if (typeof window !== "undefined") {
      const savedOperator = localStorage.getItem("rais_hdr_operator");
      const savedSupervisor = localStorage.getItem("rais_hdr_supervisor");
      const savedMachine = localStorage.getItem("rais_hdr_machine");
      const savedProduct = localStorage.getItem("rais_hdr_product");
      const savedSize = localStorage.getItem("rais_hdr_size");
      const savedBatch = localStorage.getItem("rais_hdr_batch");
      const savedShift = localStorage.getItem("rais_hdr_shift");

      setHdr((prev) => ({
        shift: savedShift !== null ? savedShift : prev.shift,
        operator: savedOperator !== null ? savedOperator : prev.operator,
        supervisor: savedSupervisor !== null ? savedSupervisor : prev.supervisor,
        machine: savedMachine !== null ? savedMachine : prev.machine,
        product: savedProduct !== null ? savedProduct : prev.product,
        size: savedSize !== null ? savedSize : prev.size,
        batch: savedBatch !== null ? savedBatch : prev.batch
      }));
    }
  }, []);

  const updateHdrField = (field: keyof typeof hdr, val: string) => {
    setHdr((prev) => {
      const next = { ...prev, [field]: val };
      if (typeof window !== "undefined") {
        localStorage.setItem(`rais_hdr_${field}`, val);
      }
      return next;
    });
  };

  const loadRegistry = async () => {
    try {
      const res = await fetch("/api/schema");
      const data = await res.json();
      if (data.registry) {
        setRegistry(data.registry);
      }
    } catch (err) {
      console.error("Error loading registry:", err);
    }
  };

  const loadLedger = async () => {
    try {
      const res = await fetch("/api/manual-entries");
      const data = await res.json();
      if (data.records) {
        setLedgerRecords(data.records);
      }
    } catch (err) {
      console.error("Error loading ledger:", err);
    }
  };

  // Guards every action that would unmount/remount MonthlyEntryGrid (Report
  // Date change, ledger Edit/Duplicate, switching to another tab) while it
  // has unsaved edits — otherwise they'd vanish with no warning.
  const confirmLeaveEntryGrid = (): boolean => {
    if (activeTab !== "entry" || !monthlyDirty) return true;
    return confirm("You have unsaved changes in the data entry grid that haven't been submitted yet. Continuing will discard them. Continue?");
  };

  const activeRegistry = useMemo(() => {
    return registry || DISPOSAFE_REGISTRY;
  }, [registry]);

  // customFields merged onto every record MonthlyEntryGrid saves — the same
  // header tags the old single-day grid attached. `size` is used only as a
  // fallback for rows whose own registry size is null (line-only stages);
  // MonthlyEntryGrid prefers the row's real size when the stage is size-wise.
  const entryCustomFields = useMemo(
    () => ({
      operator: hdr.operator, supervisor: hdr.supervisor, machine: hdr.machine,
      product: hdr.product, size: hdr.size, batch: hdr.batch, shift: hdr.shift, notes,
    }),
    [hdr, notes],
  );

  // Schema Editor - Safety check
  const validateSchemaSafety = (stages: any[]): string | null => {
    for (const stage of stages) {
      const fields = stage.fields || [];
      const hasChecked = fields.some((f: any) => 
        /^(checked qty|checked quantity|input|input qty|input quantity)$/i.test(f.name)
      );
      const hasRejected = fields.some((f: any) => 
        /^(rejected qty|rejected quantity|rejected|reject qty|rejection qty|rejection quantity)$/i.test(f.name)
      );
      if (!hasChecked) {
        return `Cannot remove Checked Quantity.

Affected Features:
- Rejection Rate
- Yield Analysis
- Trend Charts

Suggested Fix:
Assign another field as Checked Quantity.`;
      }
      if (!hasRejected) {
        return `Cannot remove Rejected Quantity.

Affected Features:
- Rejection Rate
- Yield Analysis
- Trend Charts

Suggested Fix:
Assign another field as Rejected Quantity.`;
      }
    }
    return null;
  };

  const handleOpenSchemaModal = () => {
    // Clone registry stages to draft
    const clone = activeRegistry.stages.map((s: any) => ({
      ...s,
      fields: s.fields ? [...s.fields] : [...DEFAULT_FIELDS]
    }));
    setDraftStages(clone);
    setSchemaError(null);
    setEditingColName(null);
    setShowSchemaModal(true);
  };

  const handleAddStage = () => {
    const name = prompt("Enter new Inspection Stage Name:");
    if (!name || !name.trim()) return;
    const stageId = name.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-");
    
    if (draftStages.some(s => s.stageId === stageId)) {
      alert("A stage with this ID already exists.");
      return;
    }

    const newStage: StageDef = {
      stageId,
      label: name.trim(),
      fields: [...DEFAULT_FIELDS],
      upstream: draftStages.length > 0 ? [draftStages[draftStages.length - 1].stageId] : [],
      effectiveFrom: null,
      effectiveTo: null
    };

    setDraftStages([...draftStages, newStage]);
  };

  const handleRemoveStage = (stageId: string) => {
    if (draftStages.length <= 1) {
      alert("Cannot delete the only remaining stage. The registry must have at least one stage.");
      return;
    }
    if (!confirm("Are you sure you want to delete this stage? All data entries for this stage will be removed from the schema.")) return;
    setDraftStages(draftStages.filter(s => s.stageId !== stageId));
  };

  const handleAddColumn = () => {
    setColDraft({
      name: "",
      type: "number",
      required: false,
      appliesTo: "all",
      selectedStages: [],
      unit: "",
      isDefect: false,
      dropdownOptions: []
    });
    setEditingColName("__new__");
  };

  const handleEditColumn = (colName: string) => {
    // Find representative field definition
    let repField: any = null;
    const stagesApplies: string[] = [];
    
    draftStages.forEach((s) => {
      const f = s.fields.find((field) => field.name === colName);
      if (f) {
        repField = f;
        stagesApplies.push(s.stageId);
      }
    });

    if (!repField) return;

    setColDraft({
      ...repField,
      appliesTo: stagesApplies.length === draftStages.length ? "all" : "selected",
      selectedStages: stagesApplies
    });
    setEditingColName(colName);
  };

  const handleRemoveColumn = (colName: string) => {
    // Safety check first
    const isCore = ["Checked Qty", "Rejected Qty", "Good Qty", "Rework Qty"].includes(colName);
    
    // Apply removal to all draft stages
    const nextStages = draftStages.map((s) => ({
      ...s,
      fields: s.fields.filter((f) => f.name !== colName)
    }));

    if (isCore) {
      const err = validateSchemaSafety(nextStages);
      if (err) {
        alert(err);
        return;
      }
    }

    if (!confirm(`Are you sure you want to delete column "${colName}"?`)) return;
    setDraftStages(nextStages);
  };

  const handleSaveColumnDraft = () => {
    const name = colDraft.name?.trim();
    if (!name) {
      alert("Column name is required.");
      return;
    }

    const type = colDraft.type || "number";
    const required = !!colDraft.required;
    const appliesTo = colDraft.appliesTo || "all";
    const selectedStages = colDraft.selectedStages || [];
    const unit = colDraft.unit || "";
    const isDefect = !!colDraft.isDefect;
    const dropdownOptions = colDraft.dropdownOptions || [];

    const fieldObj: FieldDef = {
      name,
      type,
      required,
      addAs: "column",
      appliesTo,
      selectedStages,
      unit,
      isDefect,
      dropdownOptions
    };

    // Update draftStages
    const updated = draftStages.map((stage) => {
      let fields = [...stage.fields];
      
      // Determine if field applies to this stage
      const applies = appliesTo === "all" || selectedStages.includes(stage.stageId);
      
      // Filter out previous version of this column
      if (editingColName && editingColName !== "__new__") {
        fields = fields.filter((f) => f.name !== editingColName);
      }

      if (applies) {
        // If updating name or new column
        fields.push(fieldObj);
      }

      return {
        ...stage,
        fields
      };
    });

    // Check safety if modifying core fields
    const safetyErr = validateSchemaSafety(updated);
    if (safetyErr) {
      alert(safetyErr);
      return;
    }

    setDraftStages(updated);
    setEditingColName(null);
  };

  const handleSaveSchemaRegistry = async () => {
    const safetyErr = validateSchemaSafety(draftStages);
    if (safetyErr) {
      setSchemaError(safetyErr);
      return;
    }

    setBusyAction("schema-save");
    try {
      const res = await fetch("/api/schema", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          registry: {
            clientId: "disposafe",
            stages: draftStages,
            defects: activeRegistry.defects
          }
        })
      });

      if (!res.ok) throw new Error("Failed to save schema registry");
      const data = await res.json();
      if (data.registry) {
        setRegistry(data.registry);
      }
      setShowSchemaModal(false);
      setSuccess("Schema registry updated immediately. Direct entry spreadsheet grid reloaded.");
    } catch (e: any) {
      setSchemaError(e.message || "Failed to save registry");
    } finally {
      setBusyAction(null);
    }
  };

  // Ledger Actions — Edit/Duplicate jump the entry grid to the relevant date;
  // MonthlyEntryGrid is remounted via `key={date}` below, so it reloads
  // fresh whenever `date` changes. Delete removes the underlying event-store
  // record directly and is unrelated to the grid.
  const handleEditLedgerRecord = (rec: any) => {
    setHdr({
      shift: rec.shift, operator: rec.operator, supervisor: rec.supervisor,
      product: rec.product, size: rec.size, machine: rec.machine, batch: rec.batch,
    });
    setNotes(rec.notes || "");
    setActiveTab("entry");
    setDate(rec.date);
    setSuccess(`Record loaded for editing. Editing date: ${rec.date}.`);
  };

  // ponytail: duplicates header fields onto today's date only — does not
  // copy the source day's quantities forward (MonthlyEntryGrid has no
  // external-seed hook for that). Add a seedRecords prop to MonthlyEntryGrid
  // if operators rely on copying values, not just headers, between days.
  const handleDuplicateLedgerRecord = (rec: any) => {
    setHdr({
      shift: rec.shift, operator: rec.operator, supervisor: rec.supervisor,
      product: rec.product, size: rec.size, machine: rec.machine, batch: rec.batch,
    });
    setNotes(rec.notes || "");
    setActiveTab("entry");
    setDate(today());
    setSuccess("Header fields duplicated onto today's date. Enter today's quantities and Save Month.");
  };

  const handleDeleteLedgerRecord = async (rec: any) => {
    const isDirect = rec.source === "Direct Entry";
    const recordType = isDirect ? "manual entry record" : `uploaded record (${rec.source})`;
    if (!confirm(`Are you sure you want to delete the ${recordType} for ${rec.date} (${rec.shift})?`)) return;
    try {
      const res = await fetch(`/api/manual-entries?date=${rec.date}&shift=${rec.shift}`, {
        method: "DELETE"
      });
      if (!res.ok) throw new Error("Failed to delete record");
      
      setSuccess(`Record for ${rec.date} (${rec.shift}) has been deleted successfully.`);
      loadLedger();
      refreshEvents().catch(console.error);
    } catch (e: any) {
      alert("Error deleting: " + e.message);
    }
  };

  // Sort and filter ledger records
  const filteredLedger = useMemo(() => {
    return ledgerRecords
      .filter((rec) => {
        const query = ledgerSearch.toLowerCase().trim();
        if (!query) return true;
        return (
          rec.date.includes(query) ||
          rec.shift.toLowerCase().includes(query) ||
          (rec.source || "").toLowerCase().includes(query) ||
          rec.operator.toLowerCase().includes(query) ||
          rec.supervisor.toLowerCase().includes(query) ||
          rec.machine.toLowerCase().includes(query) ||
          rec.product.toLowerCase().includes(query) ||
          rec.size.toLowerCase().includes(query) ||
          rec.batch.toLowerCase().includes(query)
        );
      })
      .sort((a, b) => {
        const field = ledgerSort.col;
        const desc = ledgerSort.desc;
        let av = a[field] ?? "";
        let bv = b[field] ?? "";
        
        if (field === "date" || field === "recordedAt") {
          return desc ? bv.localeCompare(av) : av.localeCompare(bv);
        }
        
        av = typeof av === "string" ? av.toLowerCase() : av;
        bv = typeof bv === "string" ? bv.toLowerCase() : bv;
        
        if (av < bv) return desc ? 1 : -1;
        if (av > bv) return desc ? -1 : 1;
        return 0;
      });
  }, [ledgerRecords, ledgerSearch, ledgerSort]);

  const toggleSort = (col: string) => {
    setLedgerSort((prev) => ({
      col,
      desc: prev.col === col ? !prev.desc : true
    }));
  };

  // State flag for global busy states (e.g. saving registry)
  const [busyAction, setBusyAction] = useState<string | null>(null);

  return (
    <AppShell active="data-entry">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <div style={{ display: "flex", gap: 4 }}>
          <button
            onClick={() => { if (confirmLeaveEntryGrid()) setActiveTab("entry"); }}
            style={{
              padding: "8px 16px",
              border: "none",
              borderRadius: "8px 0 0 8px",
              background: activeTab === "entry" ? "var(--accent)" : "var(--surface-2)",
              color: activeTab === "entry" ? "var(--text-invert)" : "var(--text-2)",
              fontWeight: 700,
              fontSize: 13,
              cursor: "pointer"
            }}
          >
            New Data Entry
          </button>
          <button
            onClick={() => { if (confirmLeaveEntryGrid()) { setActiveTab("ledger"); loadLedger(); } }}
            style={{
              padding: "8px 16px",
              border: "none",
              borderRadius: "0",
              background: activeTab === "ledger" ? "var(--accent)" : "var(--surface-2)",
              color: activeTab === "ledger" ? "var(--text-invert)" : "var(--text-2)",
              fontWeight: 700,
              fontSize: 13,
              cursor: "pointer"
            }}
          >
            Entry History / Data Ledger
          </button>
          <button
            onClick={() => { if (confirmLeaveEntryGrid()) setActiveTab("custom"); }}
            style={{
              padding: "8px 16px",
              border: "none",
              borderRadius: "0 8px 8px 0",
              background: activeTab === "custom" ? "var(--accent)" : "var(--surface-2)",
              color: activeTab === "custom" ? "var(--text-invert)" : "var(--text-2)",
              fontWeight: 700,
              fontSize: 13,
              cursor: "pointer"
            }}
          >
            Custom Datasets
          </button>
        </div>

        <button 
          onClick={handleOpenSchemaModal} 
          style={{ ...ghost, padding: "8px 16px", fontSize: 13, display: "flex", alignItems: "center", gap: 6 }}
        >
          <Icon name="settings" size={13} /> Manage Schema
        </button>
      </div>

      {success && (
        <div style={{ marginBottom: 16, padding: "10px 14px", borderRadius: 9, background: "var(--positive-weak)", border: "1px solid var(--positive)", color: "var(--positive)", fontSize: 13, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span>{success}</span>
          <button onClick={() => setSuccess(null)} style={{ background: "transparent", border: "none", cursor: "pointer", fontSize: 16, color: "var(--positive)", fontWeight: 700 }}>&times;</button>
        </div>
      )}

      {error && (
        <div style={{ marginBottom: 16, padding: "10px 14px", borderRadius: 9, background: "color-mix(in srgb, var(--status-bad) 12%, transparent)", border: "1px solid var(--status-bad)", color: "var(--status-bad)", fontSize: 13, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span>{error}</span>
          <button onClick={() => setError(null)} style={{ background: "transparent", border: "none", cursor: "pointer", fontSize: 16, color: "var(--status-bad)", fontWeight: 700 }}>&times;</button>
        </div>
      )}

      {activeTab === "custom" ? (
        <DatasetEntryForm />
      ) : activeTab === "entry" ? (
        <div>
          <div style={{ display: "flex", gap: 14, alignItems: "flex-end", marginBottom: 16, padding: 16, background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12 }}>
            <label className="muted" style={{ fontSize: 11, display: "flex", flexDirection: "column", gap: 4 }}>
              Report Date
              <input type="date" value={date} onChange={(e) => {
                const newDate = e.target.value;
                if (!confirmLeaveEntryGrid()) return;
                setDate(newDate);
              }} style={{ ...inp, width: 160 }} />
            </label>
            <label className="muted" style={{ fontSize: 11, display: "flex", flexDirection: "column", gap: 4 }}>
              Shift
              <select value={hdr.shift} onChange={(e) => updateHdrField("shift", e.target.value)} style={{ ...inp, width: 140 }}>
                <option>Day Shift</option>
                <option>Night Shift</option>
              </select>
            </label>
          </div>

          <Section title="Operator & Batch Information">
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 }}>
              <Field label="Operator *">
                <input style={inp} value={hdr.operator} onChange={(e) => updateHdrField("operator", e.target.value)} placeholder="Required" />
              </Field>
              <Field label="Supervisor">
                <input style={inp} value={hdr.supervisor} onChange={(e) => updateHdrField("supervisor", e.target.value)} placeholder="Supervisor name" />
              </Field>
              <Field label="Product">
                <input style={inp} value={hdr.product} onChange={(e) => updateHdrField("product", e.target.value)} />
              </Field>
              <Field label="Size (French)">
                <input style={inp} value={hdr.size} onChange={(e) => updateHdrField("size", e.target.value)} />
              </Field>
              <Field label="Machine">
                <input style={inp} value={hdr.machine} onChange={(e) => updateHdrField("machine", e.target.value)} />
              </Field>
              <Field label="Batch / Lot No.">
                <input style={inp} value={hdr.batch} onChange={(e) => updateHdrField("batch", e.target.value)} placeholder="e.g. LOT-123" />
              </Field>
            </div>
          </Section>

          <Section title="Additional Notes / Remarks">
            <Field label="Remarks">
              <textarea 
                style={{ ...inp, minHeight: 60, fontFamily: "inherit" }} 
                value={notes} 
                onChange={(e) => setNotes(e.target.value)} 
                placeholder="General shift report remarks or notes..." 
              />
            </Field>
          </Section>

          <MonthlyEntryGrid
            key={date}
            initialDate={date}
            customFields={entryCustomFields}
            blockedReason={hdr.operator.trim() ? null : "Operator name is required."}
            onDirtyChange={setMonthlyDirty}
          />
        </div>
      ) : (
        /* Data Ledger / Entry History View */
        <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, padding: 16 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
            <h2 style={{ fontFamily: "var(--font-display)", fontSize: 18, fontWeight: 800, margin: 0 }}>Data Entry & Ingest Ledger</h2>
            <div style={{ position: "relative", width: 300 }}>
              <input 
                type="text" 
                placeholder="Search ledger..." 
                value={ledgerSearch} 
                onChange={(e) => setLedgerSearch(e.target.value)} 
                style={{ ...inp, paddingRight: 32 }}
              />
              <span style={{ position: "absolute", right: 10, top: 8, color: "var(--text-3)" }}>🔍</span>
            </div>
          </div>
 
          <table style={{ width: "100%", fontSize: 13, borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ color: "var(--text-3)", textAlign: "left", fontSize: 10.5, textTransform: "uppercase", letterSpacing: "0.03em", borderBottom: "1.5px solid var(--border-strong)" }}>
                <th style={{ ...th, cursor: "pointer" }} onClick={() => toggleSort("date")}>Date {ledgerSort.col === "date" ? (ledgerSort.desc ? "▼" : "▲") : ""}</th>
                <th style={{ ...th, cursor: "pointer" }} onClick={() => toggleSort("shift")}>Shift/Sheet {ledgerSort.col === "shift" ? (ledgerSort.desc ? "▼" : "▲") : ""}</th>
                <th style={{ ...th, cursor: "pointer" }} onClick={() => toggleSort("source")}>Source {ledgerSort.col === "source" ? (ledgerSort.desc ? "▼" : "▲") : ""}</th>
                <th style={{ ...th, cursor: "pointer" }} onClick={() => toggleSort("operator")}>Operator {ledgerSort.col === "operator" ? (ledgerSort.desc ? "▼" : "▲") : ""}</th>
                <th style={{ ...th, cursor: "pointer" }} onClick={() => toggleSort("machine")}>Machine {ledgerSort.col === "machine" ? (ledgerSort.desc ? "▼" : "▲") : ""}</th>
                <th style={{ ...th, cursor: "pointer" }} onClick={() => toggleSort("product")}>Product {ledgerSort.col === "product" ? (ledgerSort.desc ? "▼" : "▲") : ""}</th>
                <th style={th}>Checked</th>
                <th style={th}>Rejected</th>
                <th style={th}>Rej %</th>
                <th style={{ ...th, cursor: "pointer" }} onClick={() => toggleSort("recordedAt")}>Last Saved/Edited {ledgerSort.col === "recordedAt" ? (ledgerSort.desc ? "▼" : "▲") : ""}</th>
                <th style={{ ...th, textAlign: "right" }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredLedger.length === 0 ? (
                <tr>
                  <td colSpan={11} style={{ ...td, textAlign: "center", padding: 24, color: "var(--text-3)" }}>
                    No manual or uploaded entry records found matching search.
                  </td>
                </tr>
              ) : (
                filteredLedger.map((rec, idx) => {
                  // Compute totals for ledger row
                  let chk = 0;
                  let rej = 0;
                  Object.values(rec.stageData).forEach((sData: any) => {
                    chk += Number(sData["Checked Qty"]) || 0;
                    rej += Number(sData["Rejected Qty"]) || 0;
                  });
                  const rate = chk ? (rej / chk) * 100 : 0;
 
                  return (
                    <tr key={idx} style={{ borderBottom: "1px solid var(--border)", background: idx % 2 === 0 ? "transparent" : "var(--surface-2)" }}>
                      <td style={{ ...td, fontWeight: 700 }}>{rec.date}</td>
                      <td style={td}>{rec.shift}</td>
                      <td style={td}>
                        <span style={{ 
                          fontSize: 11, 
                          padding: "2px 6px", 
                          borderRadius: 4, 
                          background: rec.source === "Direct Entry" ? "var(--accent-weak)" : "var(--surface-3)", 
                          color: rec.source === "Direct Entry" ? "var(--accent-text)" : "var(--text-2)",
                          fontWeight: 600
                        }}>
                          {rec.source}
                        </span>
                      </td>
                      <td style={td}>{rec.operator}</td>
                      <td style={td}>{rec.machine}</td>
                      <td style={td}>{rec.product} ({rec.size})</td>
                      <td style={{ ...td, fontFamily: "var(--font-mono)" }}>{chk.toLocaleString()}</td>
                      <td style={{ ...td, fontFamily: "var(--font-mono)", color: "var(--status-bad)" }}>{rej.toLocaleString()}</td>
                      <td style={{ ...td, fontFamily: "var(--font-mono)", color: rate > 10 ? "var(--status-bad)" : "inherit" }}>{rate.toFixed(2)}%</td>
                      <td style={td}>
                        {rec.recordedAt ? new Date(rec.recordedAt).toLocaleString("en-US", {
                          month: "short",
                          day: "numeric",
                          hour: "2-digit",
                          minute: "2-digit"
                        }) : "—"}
                      </td>
                      <td style={{ ...td, textAlign: "right" }}>
                        <div style={{ display: "inline-flex", gap: 8 }}>
                          <button 
                            onClick={() => handleEditLedgerRecord(rec)} 
                            style={{ background: "transparent", border: "none", color: "var(--accent)", cursor: "pointer", fontSize: 12, fontWeight: 700 }}
                          >
                            Edit
                          </button>
                          <button 
                            onClick={() => handleDuplicateLedgerRecord(rec)} 
                            style={{ background: "transparent", border: "none", color: "var(--status-good)", cursor: "pointer", fontSize: 12, fontWeight: 700 }}
                          >
                            Duplicate
                          </button>
                          <button 
                            onClick={() => handleDeleteLedgerRecord(rec)} 
                            style={{ background: "transparent", border: "none", color: "var(--status-bad)", cursor: "pointer", fontSize: 12, fontWeight: 700 }}
                          >
                            Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* SCHEMA REGISTRY CONFIGURATION MODAL */}
      {showSchemaModal && (
        <div 
          className="modal-backdrop"
          style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: "rgba(18,16,14,0.6)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}
          onClick={(e) => { if (e.target === e.currentTarget) setShowSchemaModal(false); }}
        >
          <div 
            className="modal-panel"
            style={{ background: "var(--surface)", border: "1px solid var(--border-strong)", borderRadius: "var(--radius-lg)", boxShadow: "var(--shadow-3)", width: "100%", maxWidth: "800px", display: "flex", flexDirection: "column", color: "var(--text)", maxHeight: "90vh" }}
          >
            <div style={{ padding: "16px 20px", borderBottom: "2px solid var(--border)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <h3 style={{ fontFamily: "var(--font-display)", fontSize: 18, margin: 0 }}>Manage Registry Data Schema</h3>
              <button onClick={() => setShowSchemaModal(false)} style={{ background: "transparent", border: "none", fontSize: 24, cursor: "pointer", color: "var(--text-2)" }}>&times;</button>
            </div>
            
            <div style={{ padding: 20, overflowY: "auto", display: "flex", flexDirection: "column", gap: 16 }}>
              {schemaError && (
                <div style={{ padding: "10px 14px", borderRadius: 8, background: "color-mix(in srgb, var(--status-bad) 12%, transparent)", border: "1px solid var(--status-bad)", color: "var(--status-bad)", fontSize: 12.5, whiteSpace: "pre-line" }}>
                  {schemaError}
                </div>
              )}
 
              {/* Column/Field Definition Editor Subsection */}
              {editingColName !== null && (
                <div style={{ background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: 8, padding: 12 }}>
                  <h4 style={{ margin: "0 0 10px 0", fontSize: 13, fontWeight: 700 }}>
                    {editingColName === "__new__" ? "Add New Column / Field" : `Configure Field: ${editingColName}`}
                  </h4>
                  <div style={{ display: "grid", gridTemplateColumns: "1.2fr 1fr", gap: 10, alignItems: "end", marginBottom: 12 }}>
                    <label style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                      <span className="muted" style={{ fontSize: 10, fontWeight: 600 }}>Field Name</span>
                      <input 
                        type="text" 
                        value={colDraft.name || ""} 
                        onChange={(e) => setColDraft({ ...colDraft, name: e.target.value })} 
                        placeholder="e.g. Machine No" 
                        style={{ ...inp, padding: "5px 8px", fontSize: 12 }} 
                      />
                    </label>
                    <label style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                      <span className="muted" style={{ fontSize: 10, fontWeight: 600 }}>Field Type</span>
                      <select 
                        value={colDraft.type || "number"} 
                        onChange={(e: any) => setColDraft({ ...colDraft, type: e.target.value })} 
                        style={{ ...inp, padding: "5px 8px", fontSize: 12 }}
                      >
                        <option value="number">Number</option>
                        <option value="text">Text</option>
                        <option value="date">Date</option>
                        <option value="dropdown">Dropdown</option>
                        <option value="boolean">Boolean (Checkbox)</option>
                      </select>
                    </label>
                  </div>

                  {colDraft.type === "dropdown" && (
                    <label style={{ display: "flex", flexDirection: "column", gap: 2, marginBottom: 12 }}>
                      <span className="muted" style={{ fontSize: 10, fontWeight: 600 }}>Dropdown Options (comma-separated)</span>
                      <input 
                        type="text" 
                        placeholder="A, B, C, D" 
                        value={colDraft.dropdownOptions?.join(", ") || ""} 
                        onChange={(e) => setColDraft({ ...colDraft, dropdownOptions: e.target.value.split(",").map(s => s.trim()).filter(Boolean) })}
                        style={{ ...inp, padding: "5px 8px", fontSize: 12 }} 
                      />
                    </label>
                  )}

                  <div style={{ display: "grid", gridTemplateColumns: "150px 1fr", gap: 12, marginBottom: 12 }}>
                    <label style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                      <span className="muted" style={{ fontSize: 10, fontWeight: 600 }}>Applies To</span>
                      <select 
                        value={colDraft.appliesTo || "all"} 
                        onChange={(e: any) => setColDraft({ ...colDraft, appliesTo: e.target.value })} 
                        style={{ ...inp, padding: "5px 8px", fontSize: 12 }}
                      >
                        <option value="all">All Stages</option>
                        <option value="selected">Selected Stages</option>
                      </select>
                    </label>
                    {colDraft.appliesTo === "selected" && (
                      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                        <span className="muted" style={{ fontSize: 10, fontWeight: 600 }}>Select Stages</span>
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, background: "var(--bg)", border: "1px solid var(--border)", padding: 6, borderRadius: 6 }}>
                          {draftStages.map(s => {
                            const active = colDraft.selectedStages?.includes(s.stageId) ?? false;
                            return (
                              <label key={s.stageId} style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 11, cursor: "pointer" }}>
                                <input 
                                  type="checkbox" 
                                  checked={active} 
                                  onChange={(e) => {
                                    const next = e.target.checked 
                                      ? [...(colDraft.selectedStages || []), s.stageId]
                                      : (colDraft.selectedStages || []).filter(id => id !== s.stageId);
                                    setColDraft({ ...colDraft, selectedStages: next });
                                  }}
                                />
                                <span>{s.label}</span>
                              </label>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>

                  <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
                    <button onClick={() => setEditingColName(null)} style={{ ...btnSmallGhost }}>Cancel</button>
                    <button onClick={handleSaveColumnDraft} style={{ ...btnSmallPrimary }}>Apply Changes</button>
                  </div>
                </div>
              )}

              {/* Columns/Fields Management Section */}
              <div style={{ border: "1px solid var(--border)", borderRadius: 8, padding: 12 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                  <h4 style={{ margin: 0, fontSize: 13, fontWeight: 700 }}>Data Schema Columns (Fields)</h4>
                  <button onClick={handleAddColumn} style={{ ...btnSmallPrimary, background: "var(--accent)", color: "#fff" }}>
                    + Add Column Field
                  </button>
                </div>
                <table style={{ width: "100%", fontSize: 12, borderCollapse: "collapse" }}>
                  <thead>
                    <tr style={{ color: "var(--text-3)", textAlign: "left", fontSize: 10, borderBottom: "1px solid var(--border)" }}>
                      <th style={{ padding: "6px 8px" }}>Name</th>
                      <th style={{ padding: "6px 8px" }}>Type</th>
                      <th style={{ padding: "6px 8px" }}>Required</th>
                      <th style={{ padding: "6px 8px" }}>Defect?</th>
                      <th style={{ padding: "6px 8px" }}>Scope</th>
                      <th style={{ padding: "6px 8px", textAlign: "right" }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {/* Get all unique field definitions */}
                    {(() => {
                      const allFields: any[] = [];
                      draftStages.forEach((s) => {
                        s.fields.forEach((f) => {
                          if (!allFields.some((x) => x.name === f.name)) {
                            allFields.push(f);
                          }
                        });
                      });
                      
                      return allFields.map((f) => {
                        const stagesApplies: string[] = [];
                        draftStages.forEach((s) => {
                          if (s.fields.some((x) => x.name === f.name)) {
                            stagesApplies.push(s.label);
                          }
                        });

                        return (
                          <tr key={f.name} style={{ borderBottom: "1px solid var(--border)" }}>
                            <td style={{ padding: "6px 8px", fontWeight: 700 }}>{f.name}</td>
                            <td style={{ padding: "6px 8px", textTransform: "capitalize" }}>{f.type}</td>
                            <td style={{ padding: "6px 8px" }}>{f.required ? "Yes" : "No"}</td>
                            <td style={{ padding: "6px 8px" }}>{f.isDefect ? "Yes" : "No"}</td>
                            <td style={{ padding: "6px 8px", fontSize: 11, color: "var(--text-2)" }}>
                              {stagesApplies.length === draftStages.length ? "All Stages" : `${stagesApplies.length} Selected`}
                            </td>
                            <td style={{ padding: "6px 8px", textAlign: "right" }}>
                              <div style={{ display: "inline-flex", gap: 8 }}>
                                <button onClick={() => handleEditColumn(f.name)} style={{ background: "transparent", border: "none", color: "var(--accent)", cursor: "pointer", fontSize: 11, fontWeight: 700 }}>Configure</button>
                                <button onClick={() => handleRemoveColumn(f.name)} style={{ background: "transparent", border: "none", color: "var(--status-bad)", cursor: "pointer", fontSize: 11, fontWeight: 700 }}>Delete</button>
                              </div>
                            </td>
                          </tr>
                        );
                      });
                    })()}
                  </tbody>
                </table>
              </div>

              {/* Stages Management Section */}
              <div style={{ border: "1px solid var(--border)", borderRadius: 8, padding: 12 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                  <h4 style={{ margin: 0, fontSize: 13, fontWeight: 700 }}>Inspection Stages (Rows)</h4>
                  <button onClick={handleAddStage} style={{ ...btnSmallPrimary, background: "var(--accent)", color: "#fff" }}>
                    + Add Stage Row
                  </button>
                </div>
                <table style={{ width: "100%", fontSize: 12, borderCollapse: "collapse" }}>
                  <thead>
                    <tr style={{ color: "var(--text-3)", textAlign: "left", fontSize: 10, borderBottom: "1px solid var(--border)" }}>
                      <th style={{ padding: "6px 8px" }}>Stage ID</th>
                      <th style={{ padding: "6px 8px" }}>Stage Label</th>
                      <th style={{ padding: "6px 8px" }}>Columns Count</th>
                      <th style={{ padding: "6px 8px", textAlign: "right" }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {draftStages.map((stage) => (
                      <tr key={stage.stageId} style={{ borderBottom: "1px solid var(--border)" }}>
                        <td style={{ padding: "6px 8px", fontFamily: "var(--font-mono)" }}>{stage.stageId}</td>
                        <td style={{ padding: "6px 8px", fontWeight: 700 }}>{stage.label}</td>
                        <td style={{ padding: "6px 8px" }}>{stage.fields.length} Columns</td>
                        <td style={{ padding: "6px 8px", textAlign: "right" }}>
                          <button onClick={() => handleRemoveStage(stage.stageId)} style={{ background: "transparent", border: "none", color: "var(--status-bad)", cursor: "pointer", fontSize: 11, fontWeight: 700 }}>
                            Delete Stage
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div style={{ padding: "12px 20px", borderTop: "1.5px solid var(--border)", background: "var(--surface-2)", display: "flex", justifyContent: "flex-end", gap: 10 }}>
              <button onClick={() => setShowSchemaModal(false)} style={btnGhost}>Cancel</button>
              <button 
                onClick={handleSaveSchemaRegistry} 
                disabled={busyAction === "schema-save"} 
                style={{ ...btnPrimary, background: "var(--accent)", color: "#fff" }}
              >
                {busyAction === "schema-save" ? "Saving..." : "Save Schema Registry"}
              </button>
            </div>
          </div>
        </div>
      )}
    </AppShell>
  );
}

/* ── UI Bits ───────────────────────────────────────────────────────────── */
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ border: "1px solid var(--border)", borderRadius: 12, background: "var(--surface)", padding: 16, marginBottom: 16 }}>
      <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 12 }}>{title}</div>
      {children}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: "block" }}>
      <div className="muted" style={{ fontSize: 11, marginBottom: 4 }}>{label}</div>
      {children}
    </label>
  );
}

/* Styles */
const inp: React.CSSProperties = {
  width: "100%",
  padding: "7px 10px",
  borderRadius: 8,
  border: "1px solid var(--border)",
  background: "var(--bg)",
  color: "var(--text)",
  fontSize: 13,
  fontFamily: "inherit",
  outline: "none"
};

const ghost: React.CSSProperties = {
  background: "transparent",
  color: "var(--text-2)",
  border: "1px solid var(--border)",
  borderRadius: 9,
  padding: "10px 22px",
  fontSize: 14,
  cursor: "pointer"
};

const th: React.CSSProperties = { 
  padding: "10px 12px", 
  fontWeight: 600,
  borderBottom: "1px solid var(--border)"
};

const td: React.CSSProperties = { 
  padding: "10px 12px", 
  color: "var(--text-2)" 
};

const btnPrimary: React.CSSProperties = {
  background: "var(--accent)",
  color: "var(--text-invert)",
  border: "none",
  borderRadius: "var(--radius-md)",
  padding: "10px 24px",
  fontSize: "13.5px",
  fontWeight: 700,
  cursor: "pointer"
};

const btnGhost: React.CSSProperties = {
  background: "transparent",
  color: "var(--text-2)",
  border: "1px solid var(--border)",
  borderRadius: "var(--radius-md)",
  padding: "10px 24px",
  fontSize: "13.5px",
  fontWeight: 600,
  cursor: "pointer"
};

const btnSmallPrimary: React.CSSProperties = {
  background: "var(--accent)",
  color: "var(--text-invert)",
  border: "none",
  borderRadius: 6,
  padding: "4px 10px",
  fontSize: 11,
  fontWeight: 700,
  cursor: "pointer"
};

const btnSmallGhost: React.CSSProperties = {
  background: "transparent",
  color: "var(--text-2)",
  border: "1px solid var(--border)",
  borderRadius: 6,
  padding: "4px 10px",
  fontSize: 11,
  fontWeight: 600,
  cursor: "pointer"
};
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: no errors in `src/app/data-entry/page.tsx`. If any appear, they most likely mean a helper (`Stat`, `Badge`, `eth`, `etd`, `primary`, or one of the deleted state variables) is still referenced somewhere this rewrite missed — search the error output for the exact identifier and remove that reference too.

- [ ] **Step 3: Grep for stray references to deleted identifiers**

Run: `grep -nE "activeStageId|blockingErrors|reviewRows\b|gridRowKeys|resetSpreadsheet|Stat\(|Badge\(" src/app/data-entry/page.tsx`
Expected: no output. (Sanity check that the rewrite didn't leave a dangling reference tsc might not catch, e.g. inside a string or comment.)

- [ ] **Step 4: Run the full Jest suite**

Run: `npx jest --silent`
Expected: same pass/fail count as before this task (this file has no direct test coverage; this just confirms nothing elsewhere broke — e.g. a route test that imports shared modules this file also imports).

- [ ] **Step 5: Manual verification**

1. Start the dev server, open `/data-entry`.
2. Confirm the tab bar shows exactly three tabs: "New Data Entry", "Entry History / Data Ledger", "Custom Datasets" — no "Monthly Entry" tab.
3. On "New Data Entry": confirm the header bar (Report Date, Shift, Operator, Supervisor, Product, Size, Machine, Batch, Remarks) renders above the spreadsheet grid, and the grid itself shows stage tabs + (for size-wise stages) a size dropdown + one row per day of the current month, matching `MonthlyEntryGrid`'s existing look.
4. Leave Operator blank — confirm "Save Month" is disabled; type an operator name — confirm it becomes enabled (once at least one day has a value and no day is invalid).
5. Enter values across at least 3 non-adjacent days (e.g. the 1st, 15th, and last day of the month) and at least 2 different stages, then click "Save Month". Confirm the success banner appears.
6. Go to "Entry History / Data Ledger", find one of the just-saved rows, click "Edit" — confirm it switches back to "New Data Entry" with the grid showing that date's month and the header fields populated from the ledger row.
7. From the ledger, click "Duplicate" on a row — confirm the header fields populate and the date resets to today (values are intentionally NOT copied — see the `ponytail:` note above).
8. Change the "Report Date" field to a different month while the grid has unsaved edits — confirm a confirm() dialog appears; Cancel it and confirm the edits are still there.
9. Open "Manage Schema", make a trivial change (e.g. add then immediately remove a stage), Save — confirm the modal closes and the grid still renders correctly afterward.
10. Without reloading the page, navigate to `/` (Dashboard) and confirm the values saved in step 5 are reflected (this exercises the Task 1 fix in the merged UI).

- [ ] **Step 6: Commit**

```bash
git add src/app/data-entry/page.tsx
git commit -m "feat(data-entry): merge Monthly Entry into New Data Entry as the one spreadsheet UI

Replaces the old per-size, per-date grid (and its right-rail KPI/
validation panel) with MonthlyEntryGrid. Removes the standalone
Monthly Entry tab — there is now exactly one spreadsheet-style entry
surface. Header metadata bar (Operator/Supervisor/Machine/Product/
Batch/Shift/Report Date/notes) is unchanged; it's now attached to
every saved record via MonthlyEntryGrid's new customFields prop.
Ledger Edit/Duplicate now drive the grid via a key={date} remount
instead of directly mutating page-level record state (which no
longer exists)."
```

---

## Task 5: Final regression pass

**Files:** none (verification only)

- [ ] **Step 1: Full type-check**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: zero errors project-wide.

- [ ] **Step 2: Full Jest suite**

Run: `npx jest --silent`
Expected: same pass count as the pre-existing baseline (per this repo's own convention, a handful of unrelated corpus-directory suites already fail regardless of this work — confirm the count of failures hasn't grown, not that it's zero).

- [ ] **Step 3: End-to-end manual pass covering both fixed bugs together**

1. Start the dev server.
2. On `/data-entry` → "New Data Entry", enter and save values for 2+ days across 2+ stages (as in Task 4 Step 5).
3. Immediately (no reload) check: Dashboard (`/`) KPI cards, Reports (`/reports`), Defect Analysis (`/defect-analysis`) — all should reflect the new values.
4. On `/data-entry` → "Custom Datasets", save + publish a row for a recognized dataset; immediately check the Dashboard again without reloading.
5. Open "Ask RAIS" (`/chat`) and ask a question referencing the stage/date just entered — confirm the answer is grounded in the new data (it reads from the same `useEvents()` context, refreshed in steps 3-4).
6. Open the Dashboard's "View Source" panel and confirm the manually-entered records appear there with correct provenance (source file "Manual Entry" / "Monthly Entry ...").

- [ ] **Step 4: No commit for this task** — it's verification-only. If any check in Steps 1-3 fails, go back to the relevant earlier task, fix, and re-run this task's checks before considering the plan complete.
