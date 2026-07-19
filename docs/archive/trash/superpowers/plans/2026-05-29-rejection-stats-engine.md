# Rejection Statistics Engine — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make RAIS-Pro produce *correct, precise, trustworthy* rejection statistics from messy multi-shape Excel reports, with a verify panel that shows real provenance.

**Architecture:** Keep the existing "AI classifies, JS computes" split, but (a) fix the ingestion layer so junk rows / date columns / duplicate headers stop corrupting sums, (b) introduce a deterministic **semantic metric layer** where each KPI is an explicit formula over *canonical fields* (rates are ratio-of-totals, never row-average, never rounded), (c) auto-detect report type so the three report shapes map to the same canonical fields, and (d) gate every change with **golden-number fixtures** computed from the real `DATA/` files. UI/typography is the final, cosmetic pass.

**Tech Stack:** Next.js 16, React 19, TypeScript, `xlsx` (SheetJS), Zod, AI SDK v6 via `tryModels`, Jest.

---

## Canonical model (the contract everything maps to)

Every report row, regardless of shape, maps to zero or more **inspection records**:

```ts
// src/types/metrics.ts
export type ReportType = "assembly" | "visual" | "shopfloor" | "unknown";

/** One canonical inspection record after mapping a raw row. */
export interface InspectionRecord {
  date: string | null;        // ISO yyyy-mm-dd, or null
  stage: string;              // "Visual", "Balloon", "Valve Integrity", "Overall"
  checkedQty: number;         // received / checked at this stage
  acceptedQty: number;
  rejectedQty: number;
  holdQty: number;            // 0 when the report has no hold concept
  reason: string | null;      // rejection reason / code, null if not tracked
}

/** A single computed statistic with full provenance for the verify panel. */
export interface Metric {
  id: string;                 // "rejection_rate"
  label: string;              // "Overall Rejection Rate"
  value: number;              // exact, unrounded
  display: string;            // formatted for UI ("4.58%")
  unit: string | null;
  formula: string;            // "Σ rejected ÷ Σ checked"
  inputs: { field: string; total: number }[];  // {rejected: 13180},{checked:287700}
  sourceSheets: string[];     // which sheetKeys contributed
}
```

**The five metrics** (recommended set, computed deterministically):

| id | label | formula |
|----|-------|---------|
| `checked_qty` | Total Checked | `Σ checkedQty` |
| `rejected_qty` | Total Rejected | `Σ rejectedQty` |
| `rejection_rate` | Overall Rejection Rate | `Σ rejectedQty ÷ Σ checkedQty` |
| `accepted_qty` | Total Accepted | `Σ acceptedQty` |
| `hold_qty` | Total Hold | `Σ holdQty` |

Plus two breakdown series: **rejection rate by stage** and **top reasons (Pareto)**, and one trend: **monthly rejection rate**.

---

## File structure

- Create `src/types/metrics.ts` — canonical types above.
- Create `src/lib/report-types.ts` — `detectReportType()` + per-type row→`InspectionRecord[]` mappers.
- Create `src/lib/metrics.ts` — `computeMetrics()`, `computeStageBreakdown()`, `computeReasonPareto()`, `computeMonthlyTrend()`. Pure, no AI, no rounding.
- Create `src/__tests__/fixtures/golden.ts` — ground-truth numbers from real `DATA/` files.
- Create `src/__tests__/golden.test.ts` — integration test: parse real files → assert exact metrics.
- Modify `src/lib/parser.ts` — header detection, date/serial handling, junk-row stripping, drop the 4-sig-fig rounding, expose a buffer entry point.
- Modify `src/lib/merger.ts` — remove `roundSig` from totals; rates via ratio-of-totals; weighted means.
- Modify `src/lib/analyzer.ts` — delete the conflicting `selectSheetsForPrompt` yearly-preference path.
- Modify `src/lib/analysis-utils.ts` + `src/lib/schemas.ts` — feed pre-computed metrics to the dashboard prompt; AI only writes prose + picks chart type.
- Modify `src/components/Dashboard.tsx`, `KPICard.tsx`, `BeamOverlay.tsx`, `SourcesPanel.tsx` — render from `Metric[]`, beams point at formula + source.
- Modify `src/app/globals.css` / layout — typography scale (final pass).

---

## PHASE 1 — Ground-truth fixtures (the safety net)

### Task 1: Expose a buffer-based parse entry point

**Files:**
- Modify: `src/lib/parser.ts:129-133`

- [ ] **Step 1: Write the failing test**

`src/__tests__/parser-buffer.test.ts`:
```ts
import { readFileSync } from "fs";
import { join } from "path";
import { parseWorkbookBuffer } from "@/lib/parser";

test("parseWorkbookBuffer reads a real xlsx into summaries", async () => {
  const buf = readFileSync(join(process.cwd(), "DATA", "ASSEMBLY REJECTION REPORT.xlsx"));
  const { summaries } = parseWorkbookBuffer(buf, "ASSEMBLY REJECTION REPORT.xlsx");
  expect(summaries.length).toBeGreaterThan(0);
  expect(summaries[0].name).toContain("ASSEMBLY");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest parser-buffer -t "parseWorkbookBuffer"`
Expected: FAIL — `parseWorkbookBuffer is not a function`.

- [ ] **Step 3: Refactor `parseExcelFilesWithRaw` to delegate to a pure buffer function**

In `parser.ts`, extract the per-workbook loop body into:
```ts
export function parseWorkbookBuffer(
  data: ArrayBuffer | Buffer,
  fileName: string,
): ParseResult {
  const workbook = XLSX.read(data);
  const summaries: SheetSummary[] = [];
  const rawSheets: RawSheet[] = [];
  for (const sheetName of workbook.SheetNames) {
    // ...existing per-sheet logic moved here unchanged for now...
  }
  return { summaries, rawSheets };
}
```
Then make `parseExcelFilesWithRaw` call it per file:
```ts
export async function parseExcelFilesWithRaw(files: File[]): Promise<ParseResult> {
  const out: ParseResult = { summaries: [], rawSheets: [] };
  for (const file of files) {
    const r = parseWorkbookBuffer(await file.arrayBuffer(), file.name);
    out.summaries.push(...r.summaries);
    out.rawSheets.push(...r.rawSheets);
  }
  return out;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest parser-buffer`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/parser.ts src/__tests__/parser-buffer.test.ts
git commit -m "refactor(parser): add buffer-based parse entry point for tests"
```

### Task 2: Establish ground-truth numbers from the real files

**Files:**
- Create: `scripts/ground-truth.ts`
- Create: `src/__tests__/fixtures/golden.ts`

- [ ] **Step 1: Write a one-off ground-truth script**

`scripts/ground-truth.ts` reads each file in `DATA/`, and for each sheet prints, per *correctly-identified quantity column*, the exact sum AFTER excluding: blank-date rows, rows where the row is an embedded subtotal (all-numeric with empty first/label cell), legend rows, and "% / TOTAL" rows. Print stage-level checked/rejected totals.

```ts
import { readFileSync, readdirSync } from "fs";
import * as XLSX from "xlsx";
// deliberately INDEPENDENT of app code — this is the oracle.
// (full script: iterate DATA/, header-detect, drop junk rows, sum named cols)
```

- [ ] **Step 2: Run it and capture true numbers**

Run: `npx tsx scripts/ground-truth.ts`
Manually reconcile a couple of values against the spreadsheet's own "Total" row (e.g. ASSEMBLY APRIL 25 visual checked total = 247767 per the sheet's own Total row).

- [ ] **Step 3: Freeze the numbers as fixtures**

`src/__tests__/fixtures/golden.ts`:
```ts
// Ground truth computed once via scripts/ground-truth.ts and reconciled
// against each spreadsheet's own embedded Total row. Update ONLY when the
// source files change.
export const GOLDEN = {
  "ASSEMBLY REJECTION REPORT.xlsx": {
    reportType: "assembly" as const,
    checkedQty: /* fill from script */ 0,
    rejectedQty: 0,
    rejectionRate: 0,   // rejectedQty / checkedQty
  },
  // ...one entry per file in DATA/
};
```

- [ ] **Step 4: Commit**

```bash
git add scripts/ground-truth.ts src/__tests__/fixtures/golden.ts
git commit -m "test: freeze ground-truth rejection totals from DATA files"
```

---

## PHASE 2 — Fix ingestion (parser correctness)

### Task 3: Stop summing date / serial-date columns

**Files:**
- Modify: `src/lib/parser.ts` (column classification ~180-209)
- Test: `src/__tests__/parser-dates.test.ts`

- [ ] **Step 1: Failing test** — a sheet whose first column is Excel serial dates must classify that column as `date`, not `number`, and produce no numeric aggregate for it.

```ts
import * as XLSX from "xlsx";
import { parseWorkbookBuffer } from "@/lib/parser";

test("excel-serial date column is not summed", () => {
  const ws = XLSX.utils.aoa_to_sheet([
    ["DATE", "REJ QTY"],
    [45748, 10], [45749, 20], [45750, 30],
  ]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "S");
  const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
  const { summaries } = parseWorkbookBuffer(buf, "f.xlsx");
  const cols = summaries[0].columns;
  expect(cols.find(c => c.name === "DATE")!.type).toBe("date");
  expect(cols.find(c => c.name === "DATE")!.sum).toBeUndefined();
  expect(cols.find(c => c.name === "REJ QTY")!.sum).toBe(60);
});
```

- [ ] **Step 2: Run** → FAIL (DATE summed to 137247).

- [ ] **Step 3: Implement** — in the column-summary map, classify a column as `date` BEFORE the numeric branch when its name is date-like OR its values are Excel serials in the date range (40000–60000) covering ~2009–2064:

```ts
const looksSerialDate = (vals: unknown[]) => {
  const nums = vals.filter((v): v is number => typeof v === "number");
  return nums.length >= 3 && nums.every(n => n >= 40000 && n <= 60000);
};
// in columnSummaries.map, before `if (typeof rawVals[0] === 'number')`:
if (isDateLike(col, rawVals.map(String)) || looksSerialDate(rawVals)) {
  if (!dateDimCol) dateDimCol = col;
  return { name: col, type: "date", uniqueCount: uniqueVals.size,
           sampleData: rawVals.slice(0, 5).map(serialToISO) };
}
```
Add a `serialToISO(n)` helper using `XLSX.SSF` / `(n-25569)*86400e3`.

- [ ] **Step 4: Run** → PASS.

- [ ] **Step 5: Commit** `fix(parser): treat excel-serial date columns as dates, not numbers`

### Task 4: Strip embedded subtotal & legend rows

**Files:**
- Modify: `src/lib/parser.ts` (`isTotalRow` / row filter ~46-54, 170-173)
- Test: `src/__tests__/parser-junk-rows.test.ts`

- [ ] **Step 1: Failing test** — a sheet with (a) a normal row, (b) an unlabeled subtotal row (empty first col, numbers in the rest), (c) a "TOTAL" row, must keep only the normal row.

```ts
const ws = XLSX.utils.aoa_to_sheet([
  ["DATE", "VISUAL QTY", "REJ QTY"],
  [45748, 100, 10],
  ["", 100, 10],            // unlabeled subtotal — MUST be dropped
  ["Total", 200, 20],       // labeled total — MUST be dropped
]);
// expect VISUAL QTY sum === 100, not 400
```

- [ ] **Step 2: Run** → FAIL (sum 400).

- [ ] **Step 3: Implement** — extend junk-row detection:
```ts
function isJunkRow(row: Record<string, unknown>, cols: string[], dateCol: string | null): boolean {
  // labeled total
  if (cols.some(c => TOTAL_ROW_RE.test(String(row[c] ?? "").trim()))) return true;
  // % / legend marker
  if (cols.some(c => /^total in %$|^%$/i.test(String(row[c] ?? "").trim()))) return true;
  // unlabeled subtotal: has a date column but its date cell is blank while numerics are present
  if (dateCol) {
    const dateBlank = String(row[dateCol] ?? "").trim() === "";
    const hasNums = cols.some(c => c !== dateCol && typeof row[c] === "number");
    if (dateBlank && hasNums) return true;
  }
  return false;
}
```
Apply it after `dateDimCol` is known (may require a first pass to detect the date column, then filter). Update `totalRowsStripped` accordingly.

- [ ] **Step 4: Run** → PASS.

- [ ] **Step 5: Commit** `fix(parser): drop unlabeled subtotal, %, and legend rows`

### Task 5: Robust header detection for title/blank-row preambles

**Files:**
- Modify: `src/lib/parser.ts` (header detection ~144-156)
- Test: `src/__tests__/parser-header.test.ts`

- [ ] **Step 1: Failing test** — a sheet with 3 preamble rows (company name in a merged cell, blanks, a report title) then the real header row must pick the header row with the most distinct non-empty string cells.

- [ ] **Step 2: Run** → FAIL (picks row 0).

- [ ] **Step 3: Implement** — replace "first row with ≥2 strings" with: scan first 12 rows, score each by (# distinct non-empty string cells), pick the highest-scoring row that is followed by a row containing ≥1 numeric cell. Also collapse `\n` in header names to a single space and de-duplicate identical headers by suffixing ` (2)`, ` (3)`.

- [ ] **Step 4: Run** → PASS.

- [ ] **Step 5: Commit** `fix(parser): score-based header detection + multiline/dup header normalization`

### Task 6: Remove premature rounding from sums

**Files:**
- Modify: `src/lib/parser.ts` (`roundSig` usages on `sum`), `src/lib/merger.ts:8-13,110-145`
- Test: `src/__tests__/no-rounding.test.ts`

- [ ] **Step 1: Failing test** — sum of `[100001, 200003]` must be exactly `300004`, not `300000`.

- [ ] **Step 2: Run** → FAIL (roundSig → 300000).

- [ ] **Step 3: Implement** — keep raw `sum` exact; only format at display via `fmtNum`. Remove `roundSig` from `sum`/grand-total math (keep an optional rounding helper purely for chart-label brevity if needed, but never for KPI values).

- [ ] **Step 4: Run** → PASS.

- [ ] **Step 5: Commit** `fix(math): stop rounding totals to 4 significant figures`

---

## PHASE 3 — Semantic metric layer

### Task 7: Report-type detection + canonical row mapping

**Files:**
- Create: `src/types/metrics.ts` (types above)
- Create: `src/lib/report-types.ts`
- Test: `src/__tests__/report-types.test.ts`

- [ ] **Step 1: Failing tests** — header signatures map to types:
```ts
expect(detectReportType(["DATE","VISUAL QTY","VISUAL ACPT QTY","REJ QTY","BALLOON CHKD QTY"])).toBe("assembly");
expect(detectReportType(["B.NO","SIZE","REC. QTY","ACCEPT QTY","HOLD QTY","REJ. QTY","REASON FOR REJECTION"])).toBe("visual");
expect(detectReportType(["DATE","No of TROLLEYS","COAG","Raised Wire","Surface Defect"])).toBe("shopfloor");
```
And mapping produces canonical records:
```ts
const recs = mapRowsToRecords("visual", [{ "REC. QTY":100,"ACCEPT QTY":80,"HOLD QTY":5,"REJ. QTY":15,"REASON FOR REJECTION":"COAG" }], headerMeta);
expect(recs[0]).toMatchObject({ stage:"Overall", checkedQty:100, rejectedQty:15, holdQty:5, reason:"COAG" });
```

- [ ] **Step 2: Run** → FAIL.

- [ ] **Step 3: Implement** `report-types.ts`:
  - `detectReportType(headers)` — deterministic header-signature match (regex on normalized headers). `unknown` fallback.
  - `mapRowsToRecords(type, rows, cols)` — per type:
    - **assembly**: emit one `InspectionRecord` per stage triple (`VISUAL QTY`/`VISUAL ACPT QTY`/`REJ QTY`), (`BALLOON CHKD QTY`/.../next `REJ QTY`), (`VALVE INT CHKD QTY`/.../`VALVE INTY REJ QTY`). Stage names "Visual"/"Balloon"/"Valve Integrity". Resolve duplicate `REJ QTY` by positional order relative to each stage's CHKD column.
    - **visual**: one "Overall" record per row using `REC. QTY`/`ACCEPT QTY`/`REJ. QTY`/`HOLD QTY`/`REASON FOR REJECTION`.
    - **shopfloor**: the reason columns are counts; emit one record per (row, reason-column) with `rejectedQty = count`, `checkedQty = 0`, `stage = "Shopfloor"`, `reason = columnName`.
  - AI fallback for `unknown`: a small `generateObject` call (via `tryModels`) that maps headers→canonical fields. Schema in `schemas.ts` (Task 9).

- [ ] **Step 4: Run** → PASS.

- [ ] **Step 5: Commit** `feat(metrics): report-type detection + canonical row mapping`

### Task 8: Deterministic metric computation with provenance

**Files:**
- Create: `src/lib/metrics.ts`
- Test: `src/__tests__/metrics.test.ts`

- [ ] **Step 1: Failing tests** — given records totalling checked=287700, rejected=13180:
```ts
const m = computeMetrics(records, ["f.xlsx - S"]);
const rate = m.find(x => x.id === "rejection_rate")!;
expect(rate.value).toBeCloseTo(13180/287700, 6);
expect(rate.display).toBe("4.58%");
expect(rate.formula).toBe("Σ rejected ÷ Σ checked");
expect(rate.inputs).toEqual([{field:"rejected",total:13180},{field:"checked",total:287700}]);
```
Plus `computeReasonPareto` returns reasons sorted desc by qty; `computeMonthlyTrend` returns rate per month in calendar order; `computeStageBreakdown` returns rate per stage.

- [ ] **Step 2: Run** → FAIL.

- [ ] **Step 3: Implement** `metrics.ts` — pure reducers over `InspectionRecord[]`. Rates ALWAYS `Σnum ÷ Σden` guarded against div-by-zero (`den === 0 ? 0`). No rounding of `value`; `display` formats (`%` to 2dp, counts with thousands separators). Each `Metric` carries `formula`, `inputs`, `sourceSheets`.

- [ ] **Step 4: Run** → PASS.

- [ ] **Step 5: Commit** `feat(metrics): deterministic metric computation with provenance`

### Task 9: Golden integration test (closes the loop)

**Files:**
- Create: `src/__tests__/golden.test.ts`

- [ ] **Step 1: Write the test** — for each file in `GOLDEN`: `parseWorkbookBuffer` → detect type → map rows → `computeMetrics` → assert `checkedQty`, `rejectedQty`, `rejectionRate` exactly match the fixture.

- [ ] **Step 2: Run** `npx jest golden` → iterate parser/mapper until PASS for all files.

- [ ] **Step 3: Commit** `test: golden-number integration test over real DATA files`

### Task 10: Resolve the conflicting dedup path + relation awareness

**Files:**
- Modify: `src/lib/analyzer.ts` (delete `selectSheetsForPrompt`)
- Modify: `src/app/api/analyze/route.ts` (call metric layer; pass records, not raw column totals)
- Modify: `src/lib/analysis-utils.ts:50-73`, `src/lib/merger.ts`

- [ ] **Step 1: Failing test** — `src/__tests__/dedup.test.ts`: a file list containing both monthly sheets AND a "YEARLY 2025-26" summary sheet must compute `checkedQty` from the monthly sheets only (summary excluded), whether passed all at once or appended one-by-one (idempotent by `sheetKey`).

- [ ] **Step 2: Run** → FAIL.

- [ ] **Step 3: Implement**
  - Delete `selectSheetsForPrompt`; `runAnalysis` sends all summaries unfiltered (dedup is the merge-plan's job).
  - Keep summary sheets out of sums (`isSummaryCandidate`/merge-plan `excludedSheets`) but compute their totals separately and attach as `crossCheck` so the verify panel can flag mismatch (≥1% delta → warning). This satisfies "use as cross-check, never double-count, understand relations even across separate uploads."
  - Route handler: after `mapRowsToRecords` per included sheet, call `computeMetrics(allRecords, includedSheetKeys)`; feed metric `display` values + breakdown series into the dashboard prompt.

- [ ] **Step 4: Run** → PASS.

- [ ] **Step 5: Commit** `fix(pipeline): single dedup path; summary sheets become cross-check`

### Task 11: AI writes prose, not numbers

**Files:**
- Modify: `src/lib/schemas.ts` (`DashboardConfigSchema`), `src/lib/analysis-utils.ts`

- [ ] **Step 1:** Update `buildPrompt` to inject the finished `Metric[]` (label, display, formula) + breakdown/trend series, and instruct: "These KPI values and chart arrays are FINAL. Copy them verbatim. Your job is the title, executive summary, insights, and recommendations." Keep cross-provider rules (`.nullable()`, plain ints).
- [ ] **Step 2:** Run `npm run check:ai` to confirm every backend still accepts the schema. Expected: all green.
- [ ] **Step 3:** Update `src/__tests__/analysis-utils.test.ts` to assert the prompt contains the exact metric display strings.
- [ ] **Step 4:** Run `npx jest analysis-utils` → PASS.
- [ ] **Step 5: Commit** `feat(ai): dashboard prompt consumes final metrics; model only narrates`

---

## PHASE 4 — Dashboard + verify panel wiring

### Task 12: Render KPIs from `Metric[]` with formula tooltips

**Files:** Modify `src/components/Dashboard.tsx`, `src/components/KPICard.tsx`.

- [ ] **Step 1:** Thread the computed `Metric[]` (returned from `/api/analyze`) into `Dashboard`; render `KPICard` from `metric.display` + `metric.label`, with `metric.formula` and `metric.inputs` shown on hover/expand.
- [ ] **Step 2:** Verify via preview (`preview_start`, upload a DATA file, `preview_snapshot`) that REJ rate now reads ~4.58%, not 0.01.
- [ ] **Step 3: Commit** `feat(ui): KPI cards render from metric layer with formula provenance`

### Task 13: Verify beams point at formula + source

**Files:** Modify `src/components/BeamOverlay.tsx`, `src/components/SourcesPanel.tsx`.

- [ ] **Step 1:** Use `metric.sourceSheets` + `metric.inputs[].field` to resolve the target column/sheet for the beam (replace the current `sourceColumn` heuristic). For ratio metrics, draw beams to BOTH numerator and denominator columns.
- [ ] **Step 2:** Verify via preview: clicking the REJ rate KPI highlights both REJ QTY and the checked-qty column and shows "13,180 ÷ 287,700".
- [ ] **Step 3: Commit** `feat(verify): beams trace metrics to their exact source columns + formula`

---

## PHASE 5 — UI / typography pass

### Task 14: Typographic hierarchy + density

**Files:** Modify `src/app/globals.css`, `src/components/editorial/*`.

- [ ] **Step 1:** Raise base font size and establish a clear type scale via CSS variables (do NOT add Tailwind color utilities — per AGENTS.md). Increase KPI value size, section label contrast, and table legibility. Keep Fraunces/Inter Tight/JetBrains Mono.
- [ ] **Step 2:** Verify across `preview_resize` (desktop + narrow) and dark/`data-bg` variants; screenshot before/after.
- [ ] **Step 3: Commit** `style(ui): editorial type scale + density pass`

---

## Self-Review notes

- **Spec coverage:** auto-detect report type (Task 7), no double-count across uploads + cross-check (Task 10), correct rates (Task 8), precision/no rounding (Task 6), provenance verify (Task 13), UI (Task 14), golden-number trust mechanism (Tasks 2, 9). ✅
- **Type consistency:** `InspectionRecord`/`Metric` defined in Task 7's `metrics.ts` and used identically in Tasks 8–13. `computeMetrics(records, sourceSheets)` signature stable across Tasks 8, 10, 12.
- **Ordering:** fixtures → parser → metric layer → wiring → UI; each phase gated by tests against Phase-1 fixtures so a regression fails CI before it reaches the dashboard.
