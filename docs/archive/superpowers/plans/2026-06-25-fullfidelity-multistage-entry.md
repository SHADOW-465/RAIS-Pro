# Full-Fidelity Multi-Stage, Size-Wise Data Capture — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the single flat Data-Entry grid into stage-scoped, size-aware entry tabs (Visual / Balloon / Valve / Final + the full production chain) that capture every column the real Excel sheets hold (Checked/Accept/Hold/Reject + per-stage defect codes), and make the bulk Staging path ingest 100% of that fidelity — including the previously-skipped Daily Activity Report.

**Architecture:** The canonical event model (`StageDayRecord` → `emit.ts` → events) already carries `size`, `defects[]`, `acceptedGood`, and `rework`, so **no event-layer change is needed**. The work is: (1) make the **registry** the complete source of truth (full defect catalog, a `sizes` dimension, the full process-chain stages, and per-stage capture metadata); (2) fix two **parser** fidelity holes (drop-of ACCEPT/HOLD in size-wise; the unparsed Daily Activity Report); (3) teach the **schema-extractor + Staging** to auto-populate `sizes`; (4) rebuild the **Data-Entry UI** to render registry-driven stage tabs with a size×field grid; (5) make a few **downstream** views registry-driven. Manual entry and bulk import both flow through the *same* `/api/ingest` path and dedup on `stageId|date`, so they merge seamlessly.

**Tech Stack:** Next.js 16 / React 19, TypeScript, Zod (`src/lib/contract/d1.ts`), `xlsx` (SheetJS), Supabase (Postgres + JSONB registries), Jest (`npx jest`) with golden tests that read the real workbooks under `ANALYTICAL DATA/`.

---

## Scope & Decisions (locked with the user, 2026-06-25)

- **Tab structure:** one Data-Entry page, stage tabs + size rows inside each (single ingest path). NOT four separate pages.
- **Throughput scope:** **full process chain** — expands beyond rejection-only v1. Adds Production, Eye Punching, Leaching, Chlorination, Hanging, Gauge, Trimming, Valve Fixing, Balloon Production as stages, parsed from the Daily Activity Report.
- **Fidelity fixes:** expand the defect registry to the full SOP catalog; capture ACCEPT→`acceptedGood` and HOLD→`rework`; add `registry.sizes[]` with auto-extraction.
- This **supersedes** the `moid-current-scope` memory note that the app is rejection-only. Update that memory after Phase 1 lands.

## Source-of-truth facts the plan relies on

- **Dedup identity is `stageId|date`** (size-agnostic) — see `src/lib/ingest/parsers/dedupe.ts:16`. Per-FR size rows of one stage·day sum to that stage's total; a whole-line (size=null) record for the same stage·day is a *duplicate*, not additive. New stages (production, leaching, …) never collide with size-wise, so they are always kept.
- **`Disposition` already includes `hold`** (`d1.ts:146`) but `emit.ts` only emits accepted/rejected/rework. We map HOLD → `rework` to keep the existing balance equation `Checked = Good + Rework + Rejected` and the existing `StageDayRecord.rework` field. No new disposition is introduced.
- **Size canonical form is `Fr<n>`** (e.g. `Fr16`) — `parse-size-wise.ts:44,147` emit `Fr${n}`. The registry `sizes` and manual entry MUST use the same form so analytics aggregate consistently.
- **Parser golden tests read real files** from `ANALYTICAL DATA/` and skip themselves when absent (`parse-size-wise.test.ts`). New parser tests follow that pattern.

## Daily Activity Report — confirmed fixed column layout

From `graphify-out/converted/DAILY ACTIVITY REPORT 2026_96844723.md`, the data row is 35 columns (0-indexed):

| idx | meaning | idx | meaning | idx | meaning |
|----|---------|----|---------|----|---------|
| 0 | DATE | 12 | TRIMMNG (chk) | 24 | VALVE-INT HOLD |
| 1 | PROD NO OF LOTS | 13 | VISUAL CHKD | 25 | VALVE-INT REJ |
| 2 | PROD ACTUAL (chk) | 14 | VISUAL ACPT | 26 | FINAL CHKD |
| 3 | PROD ACPT | 15 | VISUAL HOLD | 27 | FINAL ACPT |
| 4 | PROD REJ | 16 | VISUAL REJ | 28 | FINAL HOLD |
| 5 | EYE-PUNCH ACTUAL (chk) | 17 | BALLOON CHKD | 29 | FINAL REJ |
| 6 | EYE-PUNCH ACPT | 18 | BALLOON ACPT | 30 | BALLOON-PROD CHKD |
| 7 | EYE-PUNCH REJ | 19 | BALLOON HOLD | 31 | BALLOON-PROD ACPT |
| 8 | LEACHING (chk) | 20 | BALLOON REJ | 32 | BALLOON-PROD REJ |
| 9 | CHLORINATION (chk) | 21 | VALVE FIXING (chk) | 33 | TOTAL REJ (claim) |
| 10 | HANGING (chk) | 22 | VALVE-INT CHKD | 34 | REJ% (claim) |
| 11 | GUAGE (chk) | 23 | VALVE-INT ACPT | | |

Skip rows where col-0 is not a date (`WEEKLY`, header rows) or col-1 is `SUNDAY`/holiday.

---

## File Structure

| File | Create/Modify | Responsibility |
|------|---------------|----------------|
| `src/lib/contract/d1.ts` | Modify | Add `sizes` to `ClientRegistry`; add `sizeWise` + `captures` to `StageDef`. |
| `src/lib/registry/disposafe.ts` | Modify | Full defect catalog; full process-chain stages; `sizes`; per-stage `sizeWise`/`captures`. |
| `src/lib/ingest/parsers/parse-size-wise.ts` | Modify | Read ACCEPT→`acceptedGood`, HOLD→`rework` for both visual and valve/balloon sections. |
| `src/lib/ingest/parsers/parse-daily-activity.ts` | Create | New fixed-column parser for the Daily Activity Report (full chain). |
| `src/lib/ingest/parsers/types.ts` | Modify | Add `daily-activity` family + precedence; route it (un-skip). |
| `src/lib/ingest/parsers/index.ts` | Modify | Wire `parseDailyActivity` into `recordsFromBuffer`. |
| `src/lib/ingest/parsers/__tests__/parse-daily-activity.test.ts` | Create | Golden test vs real DAILY ACTIVITY REPORT files. |
| `src/lib/ingest/parsers/__tests__/parse-size-wise.test.ts` | Modify | Assert ACCEPT/HOLD now captured. |
| `src/lib/ingest/schema-extractor.ts` | Modify | `extractSizesFromWorkbook()`; map `hold` role → `rework`. |
| `supabase/migrations/20260625_add_registry_sizes.sql` | Create | `ALTER TABLE registries ADD COLUMN sizes JSONB`. |
| `src/app/api/schema/route.ts` | Modify | Read/write `sizes`; default from `DISPOSAFE_REGISTRY`. |
| `src/app/staging/page.tsx` | Modify | Extract sizes on upload; persist into registry on publish. |
| `src/app/data-entry/page.tsx` | Modify | Stage tabs + size×field grid + per-stage defect columns; new `buildRecords`. |
| `src/components/app/AppShell.tsx` | Modify | Make `VIEW_OPTIONS` registry-driven (so new stages appear). |

---

# Phase 1 — Registry & Contract foundation

### Task 1: Extend the registry contract (`StageDef`, `ClientRegistry`)

**Files:**
- Modify: `src/lib/contract/d1.ts:91-113`

- [ ] **Step 1: Add `sizeWise` + `captures` to `StageDef` and `sizes` to `ClientRegistry`**

Replace the `StageDef` and `ClientRegistry` definitions (`d1.ts:91-113`) with:

```ts
export const StageCapture = z.enum(["checked", "accepted", "hold", "rejected"]);

export const StageDef = z.object({
  stageId: z.string().min(1),
  label: z.string().min(1),
  effectiveFrom: z.string().nullable(),
  effectiveTo: z.string().nullable(),
  upstream: z.array(z.string()),
  // NEW: entry/analytics metadata. Optional so existing persisted registries
  // (which lack these) still parse; readers default them.
  sizeWise: z.boolean().optional(),                 // render a size row per registry.sizes
  captures: z.array(StageCapture).optional(),       // which quantity columns this stage tracks
  isQualityGate: z.boolean().optional(),            // true for the 4 rejection inspection stages
});

export const SizeDef = z.object({
  sizeId: z.string().min(1),   // canonical "Fr16" (matches parse-size-wise output)
  label: z.string().min(1),    // "16 FR"
});

export const ClientRegistry = z.object({
  clientId: z.string().min(1),
  registryVersion: z.string().min(1),
  fiscalYearStartMonth: z.number().int().min(1).max(12),
  stages: z.array(StageDef).min(1),
  defects: z.array(DefectDef),
  sizes: z.array(SizeDef).default([]), // NEW: French-size dimension
  costConfig: z.lazy(() => CostConfig).nullable(),
});
```

- [ ] **Step 2: Verify it compiles**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: no new errors referencing `d1.ts` (pre-existing unrelated errors, if any, are unchanged).

- [ ] **Step 3: Commit**

```bash
git add src/lib/contract/d1.ts
git commit -m "feat(contract): add sizes dimension + per-stage capture metadata to registry"
```

---

### Task 2: Rewrite `DISPOSAFE_REGISTRY` with the full catalog

**Files:**
- Modify: `src/lib/registry/disposafe.ts:13-41`

- [ ] **Step 1: Replace the `stages`, `defects`, and add `sizes` in `DISPOSAFE_REGISTRY`**

Replace the object body (`disposafe.ts:14-41`, the `stages`/`defects`/`costConfig` block) with:

```ts
export const DISPOSAFE_REGISTRY: Registry = {
  clientId: "disposafe",
  registryVersion: "1.0.0",
  fiscalYearStartMonth: 4,
  stages: [
    // Production / throughput chain (from Daily Activity Report). captures only
    // what the sheet records; no defect breakdown, not size-wise.
    { stageId: "production",        label: "Production",        effectiveFrom: null, effectiveTo: null, upstream: [],                 captures: ["checked","accepted","rejected"] },
    { stageId: "eye-punching",      label: "Eye Punching",      effectiveFrom: "2025-11-01", effectiveTo: null, upstream: ["production"], captures: ["checked","accepted","rejected"] },
    { stageId: "leaching",          label: "Leaching",          effectiveFrom: null, effectiveTo: null, upstream: ["eye-punching"],   captures: ["checked"] },
    { stageId: "chlorination",      label: "Chlorination",      effectiveFrom: null, effectiveTo: null, upstream: ["leaching"],       captures: ["checked"] },
    { stageId: "hanging",           label: "Hanging",           effectiveFrom: null, effectiveTo: null, upstream: ["chlorination"],   captures: ["checked"] },
    { stageId: "gauge",             label: "Gauge",             effectiveFrom: null, effectiveTo: null, upstream: ["hanging"],        captures: ["checked"] },
    { stageId: "trimming",          label: "Trimming",          effectiveFrom: null, effectiveTo: null, upstream: ["gauge"],          captures: ["checked"] },
    // Quality gates — size-wise + defect-bearing.
    { stageId: "visual",            label: "Visual Inspection", effectiveFrom: null, effectiveTo: null, upstream: ["trimming"],       captures: ["checked","accepted","hold","rejected"], sizeWise: true, isQualityGate: true },
    { stageId: "balloon",           label: "Balloon Testing",   effectiveFrom: null, effectiveTo: null, upstream: ["visual"],         captures: ["checked","accepted","hold","rejected"], sizeWise: true, isQualityGate: true },
    { stageId: "valve-fixing",      label: "Valve Fixing",      effectiveFrom: null, effectiveTo: null, upstream: ["balloon"],        captures: ["checked"] },
    { stageId: "valve-integrity",   label: "Valve Integrity",   effectiveFrom: null, effectiveTo: null, upstream: ["valve-fixing"],   captures: ["checked","accepted","hold","rejected"], sizeWise: true, isQualityGate: true },
    { stageId: "final",             label: "Final Inspection",  effectiveFrom: null, effectiveTo: null, upstream: ["valve-integrity"],captures: ["checked","accepted","hold","rejected"], sizeWise: true, isQualityGate: true },
    { stageId: "balloon-production",label: "Balloon Production", effectiveFrom: null, effectiveTo: null, upstream: [],                captures: ["checked","accepted","rejected"] },
  ],
  defects: [
    // Visual catalog (P17 SOP / FINAL & VISUAL sheets — 21 codes)
    { defectCode: "COAG", label: "Coagulum",         aliases: ["COAG","COAGULUM"],                              stages: ["visual"] },
    { defectCode: "SD",   label: "Surface Defect",   aliases: ["SD","SURFACE DEFECT"],                          stages: ["visual"] },
    { defectCode: "TT",   label: "Thin Tip",         aliases: ["TT","THIN TIP"],                                stages: ["visual"] },
    { defectCode: "BL",   label: "Blister",          aliases: ["BL","BLISTER"],                                 stages: ["visual"] },
    { defectCode: "PS",   label: "Ply Separation",   aliases: ["PS","PLY SEPARATION","PLY SEP"],                stages: ["visual"] },
    { defectCode: "SB",   label: "Step Balloon",     aliases: ["SB","STEP BALLOON"],                            stages: ["visual"] },
    { defectCode: "PW",   label: "Projected Wire",   aliases: ["PW","PROJECTED WIRE"],                          stages: ["visual"] },
    { defectCode: "FP",   label: "Foreign Particle", aliases: ["FP","FOREIGN PARTICLE"],                        stages: ["visual"] },
    { defectCode: "RW",   label: "Raised Wire",      aliases: ["RW","RAISED WIRE"],                             stages: ["visual"] },
    { defectCode: "BEP",  label: "Bad Eye Punching", aliases: ["BEP","BAD EYE PUNCHING"],                       stages: ["visual","eye-punching"] },
    { defectCode: "DEC",  label: "Decolourisation",  aliases: ["DEC","DECOLORISATION","DECOLOURISATION"],       stages: ["visual"] },
    { defectCode: "BM",   label: "Black Mark",       aliases: ["BM","BLACK MARK"],                              stages: ["visual"] },
    { defectCode: "WEB",  label: "Webbing",          aliases: ["WEB","WEBBING"],                                stages: ["visual"] },
    { defectCode: "BT",   label: "Bad Trimming",     aliases: ["BT","BAD TRIMMING"],                            stages: ["visual","final"] },
    { defectCode: "SF",   label: "Short Funnel",     aliases: ["SF","SHORT FUNNEL"],                            stages: ["visual","final"] },
    { defectCode: "BIC",  label: "Bend In Catheter", aliases: ["BIC","BEND IN CATHETER"],                       stages: ["visual"] },
    { defectCode: "WK",   label: "Wrinkle",          aliases: ["WK","WRINKLE"],                                 stages: ["visual","final"] },
    { defectCode: "BMP",  label: "Bump",             aliases: ["BMP","BP","BUMP"],                              stages: ["visual"] },
    { defectCode: "TF",   label: "Torn Funnel",      aliases: ["TF","TORN FUNNEL"],                             stages: ["visual","final"] },
    { defectCode: "PINH", label: "Pinhole",          aliases: ["PINH","PH","PIN HOLE","PINHOLE"],               stages: ["visual","final"] },
    { defectCode: "BST",  label: "Bad Stripping",    aliases: ["BST","BAD STRIPPING"],                          stages: ["visual"] },
    // Balloon section (size-wise valve book)
    { defectCode: "STBL", label: "Stuck Balloon",    aliases: ["STBL","STUCK BALLOON","STRUCK BALLOON"],        stages: ["balloon"] },
    { defectCode: "BLBR", label: "Balloon Burst",    aliases: ["BLBR","BALLOON BURST","BALLOON BRUST","BALLOOM BRUST"], stages: ["balloon"] },
    // Valve Integrity section
    { defectCode: "LEAK", label: "Leakage",          aliases: ["LEAK","LEAKAGE"],                               stages: ["balloon","valve-integrity"] },
    { defectCode: "90/10",label: "90/10",            aliases: ["90/10","90-10","9010"],                         stages: ["valve-integrity"] },
    { defectCode: "BUB",  label: "Bubble",           aliases: ["BUB","BUBBLE"],                                 stages: ["valve-integrity"] },
    { defectCode: "THSP", label: "Thin Spot",        aliases: ["THSP","THIN SPOT","THIN SPOD"],                 stages: ["valve-integrity"] },
    // Catch-all (every gate)
    { defectCode: "OTH",  label: "Others",           aliases: ["OTH","OTHER","OTHERS"],                         stages: ["visual","balloon","valve-integrity","final"] },
  ],
  sizes: [
    { sizeId: "Fr6",  label: "6 FR" },  { sizeId: "Fr8",  label: "8 FR" },
    { sizeId: "Fr10", label: "10 FR" }, { sizeId: "Fr12", label: "12 FR" },
    { sizeId: "Fr14", label: "14 FR" }, { sizeId: "Fr16", label: "16 FR" },
    { sizeId: "Fr18", label: "18 FR" }, { sizeId: "Fr20", label: "20 FR" },
    { sizeId: "Fr22", label: "22 FR" }, { sizeId: "Fr24", label: "24 FR" },
  ],
  costConfig: null,
};
```

- [ ] **Step 2: Update existing registry tests for the new defect codes**

Run: `npx jest disposafe`
If a test asserts the old 13-defect list or old aliases (e.g. `STBL` alias `"SB"`), update those expectations to the new catalog above. The `resolveDefect` separator-insensitive behaviour for `90/10` must still pass — verify the `90/10` test still resolves `"90-10"` and `"90 10"`.

- [ ] **Step 3: Run the full suite**

Run: `npx jest`
Expected: PASS (golden parser tests unaffected — they assert structure, not the registry catalog).

- [ ] **Step 4: Commit**

```bash
git add src/lib/registry/disposafe.ts src/lib/registry/__tests__ 2>/dev/null; git commit -m "feat(registry): full SOP defect catalog, process-chain stages, and size dimension"
```

---

# Phase 2 — Parser fidelity

### Task 3: Capture ACCEPT + HOLD in `parse-size-wise`

**Files:**
- Modify: `src/lib/ingest/parsers/parse-size-wise.ts`
- Test: `src/lib/ingest/parsers/__tests__/parse-size-wise.test.ts`

- [ ] **Step 1: Write the failing assertions**

Add to the VALVE block of `parse-size-wise.test.ts` (after the existing `expect(records.every(r => r.size != null)).toBe(true);`):

```ts
      // ACCEPT and HOLD are now captured (previously dropped).
      const withAccept = records.filter(r => r.acceptedGood != null);
      expect(withAccept.length).toBeGreaterThan(0);
```

And to the VISUAL block similarly:

```ts
      const visualWithAccept = records.filter(r => r.acceptedGood != null);
      expect(visualWithAccept.length).toBeGreaterThan(0);
```

- [ ] **Step 2: Run to confirm failure**

Run: `npx jest parse-size-wise`
Expected: FAIL — `acceptedGood` is currently always `null`.

- [ ] **Step 3: Implement — VALVE branch**

In the valve branch (`parse-size-wise.ts:61-71`), the column map already documents `ACCEPT QTY (4)` for balloon and `(16)` for valve. Add accept/hold indices:

```ts
      const bCheckedIdx = 3;
      const bAcceptIdx = 4;
      const bHoldIdx = 5;
      const bRejectedIdx = 6;
      const bDefectStart = 8;
      const bDefectLabels = ["STRUCK BALLOON", "BALLOON BURST", "LEAKAGE", "OTHERS"];

      const vCheckedIdx = 15;
      const vAcceptIdx = 16;
      const vHoldIdx = 17;
      const vRejectedIdx = 18;
      const vDefectStart = 20;
      const vDefectLabels = ["LEAKAGE", "90-10", "BUBBLE", "THIN SPOT", "OTHERS"];
```

Then in the balloon `records.push({...})` (`parse-size-wise.ts:94-107`), replace `acceptedGood: null, rework: null,` with:

```ts
            acceptedGood: !isNaN(Number(row[bAcceptIdx])) ? { value: Math.round(Number(row[bAcceptIdx])), cell: `${sheetName}!${String.fromCharCode(65 + bAcceptIdx)}${i + 1}`, header: "ACCEPT QTY" } : null,
            rework: !isNaN(Number(row[bHoldIdx])) ? { value: Math.round(Number(row[bHoldIdx])), cell: `${sheetName}!${String.fromCharCode(65 + bHoldIdx)}${i + 1}`, header: "HOLD QTY" } : null,
```

And identically in the valve `records.push({...})` (`parse-size-wise.ts:125-138`) using `vAcceptIdx`/`vHoldIdx`.

- [ ] **Step 4: Implement — VISUAL branch**

In the visual branch (`parse-size-wise.ts:179-183`), after `rejectedIdx`, add:

```ts
      const acceptIdx = headers.indexOf("ACCEPT QTY") >= 0 ? headers.indexOf("ACCEPT QTY")
                       : headers.indexOf("A GRADE") >= 0 ? headers.indexOf("A GRADE")
                       : -1;
      const holdIdx = headers.indexOf("HOLD QTY") >= 0 ? headers.indexOf("HOLD QTY")
                     : headers.indexOf("HOLD") >= 0 ? headers.indexOf("HOLD") : -1;
```

Then in the visual `records.push({...})` (`parse-size-wise.ts:208-221`), replace `acceptedGood: null, rework: null,` with:

```ts
          acceptedGood: acceptIdx >= 0 && !isNaN(Number(row[acceptIdx])) ? { value: Math.round(Number(row[acceptIdx])), cell: `${sheetName}!${String.fromCharCode(65 + acceptIdx)}${i + 1}`, header: headers[acceptIdx] } : null,
          rework: holdIdx >= 0 && !isNaN(Number(row[holdIdx])) ? { value: Math.round(Number(row[holdIdx])), cell: `${sheetName}!${String.fromCharCode(65 + holdIdx)}${i + 1}`, header: headers[holdIdx] } : null,
```

> Note: `String.fromCharCode(65 + idx)` only produces valid A1 letters for idx ≤ 25. The valve accept/hold/reject indices (≤18) and visual indices are within range; this matches the file's existing convention. If a real sheet pushes a captured column past col Z, switch that cell builder to `colIndexToLabel` from `@/lib/parser` — but do not change it speculatively (YAGNI).

- [ ] **Step 5: Run to confirm pass**

Run: `npx jest parse-size-wise`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/lib/ingest/parsers/parse-size-wise.ts src/lib/ingest/parsers/__tests__/parse-size-wise.test.ts
git commit -m "fix(parser): capture ACCEPT and HOLD quantities in size-wise parser"
```

---

### Task 4: New `parse-daily-activity` parser

**Files:**
- Create: `src/lib/ingest/parsers/parse-daily-activity.ts`
- Test: `src/lib/ingest/parsers/__tests__/parse-daily-activity.test.ts`

- [ ] **Step 1: Write the failing golden test**

Create `src/lib/ingest/parsers/__tests__/parse-daily-activity.test.ts`:

```ts
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { parseDailyActivity } from "../parse-daily-activity";

const FILE = join(process.cwd(), "ANALYTICAL DATA", "SIZE WISE REJECTION", "FINAL", "DAILY ACTIVITY REPORT 2026.xlsx");
const has = existsSync(FILE);

(has ? describe : describe.skip)("parseDailyActivity", () => {
  const records = has ? parseDailyActivity(readFileSync(FILE), FILE).records : [];

  it("extracts the full process chain", () => {
    expect(records.length).toBeGreaterThan(0);
    const stageIds = new Set(records.map(r => r.stageId));
    for (const s of ["production","eye-punching","leaching","visual","balloon","valve-integrity","final","balloon-production"]) {
      expect(stageIds.has(s)).toBe(true);
    }
  });

  it("emits whole-line records (size=null) with valid dates", () => {
    expect(records.every(r => r.size === null)).toBe(true);
    expect(records.every(r => /^\d{4}-\d{2}-\d{2}$/.test(r.occurredOn.start))).toBe(true);
  });

  it("captures hold for the inspection gates", () => {
    const visual = records.find(r => r.stageId === "visual" && r.rework != null);
    expect(visual).toBeDefined();
  });

  it("skips SUNDAY / WEEKLY marker rows", () => {
    // 2026-04-05 is a Sunday in the source; no record should exist for it.
    expect(records.some(r => r.occurredOn.start === "2026-04-05")).toBe(false);
  });
});
```

- [ ] **Step 2: Run to confirm failure**

Run: `npx jest parse-daily-activity`
Expected: FAIL — module does not exist.

- [ ] **Step 3: Implement the parser**

Create `src/lib/ingest/parsers/parse-daily-activity.ts`:

```ts
// src/lib/ingest/parsers/parse-daily-activity.ts
// Fixed-column parser for the "DAILY ACTIVITY REPORT" — the whole-line daily
// throughput log covering the full process chain. Column map (0-indexed) is
// documented in docs/superpowers/plans/2026-06-25-fullfidelity-multistage-entry.md.
import * as xlsx from "xlsx";
import type { StageDayRecord } from "@/lib/ingest/emit";
import { toLocalISODate } from "@/lib/ingest/date";

interface StageCols { stageId: string; chk: number; acc: number | null; hold: number | null; rej: number | null; }

const STAGES: StageCols[] = [
  { stageId: "production",         chk: 2,  acc: 3,  hold: null, rej: 4 },
  { stageId: "eye-punching",       chk: 5,  acc: 6,  hold: null, rej: 7 },
  { stageId: "leaching",           chk: 8,  acc: null, hold: null, rej: null },
  { stageId: "chlorination",       chk: 9,  acc: null, hold: null, rej: null },
  { stageId: "hanging",            chk: 10, acc: null, hold: null, rej: null },
  { stageId: "gauge",              chk: 11, acc: null, hold: null, rej: null },
  { stageId: "trimming",           chk: 12, acc: null, hold: null, rej: null },
  { stageId: "visual",             chk: 13, acc: 14, hold: 15, rej: 16 },
  { stageId: "balloon",            chk: 17, acc: 18, hold: 19, rej: 20 },
  { stageId: "valve-fixing",       chk: 21, acc: null, hold: null, rej: null },
  { stageId: "valve-integrity",    chk: 22, acc: 23, hold: 24, rej: 25 },
  { stageId: "final",              chk: 26, acc: 27, hold: 28, rej: 29 },
  { stageId: "balloon-production", chk: 30, acc: 31, hold: null, rej: 32 },
];

const REJ_TOTAL_COL = 33;
const PCT_COL = 34;
const ROW_MARKER = /weekly|total|w\.?\s*report/i;
const HOLIDAY = /sunday|holiday|off/i;

const intOrNull = (v: unknown): number | null => {
  if (v == null || v === "") return null;
  const n = Number(String(v).replace(/[, ]/g, ""));
  return Number.isFinite(n) && n >= 0 ? Math.round(n) : null;
};

const cellRef = (col: number, row: number): string => {
  // colIndexToLabel-equivalent for cols beyond Z (e.g. col 33 = "AH").
  let s = ""; let n = col;
  do { s = String.fromCharCode(65 + (n % 26)) + s; n = Math.floor(n / 26) - 1; } while (n >= 0);
  return `${s}${row}`;
};

export interface DailyActivityParseResult { records: StageDayRecord[]; }

export function parseDailyActivity(buf: Buffer | ArrayBuffer, file: string): DailyActivityParseResult {
  const wb = xlsx.read(buf, { type: "buffer", cellDates: true });
  const records: StageDayRecord[] = [];

  for (const sheet of wb.SheetNames) {
    if (/yearly|summary|format/i.test(sheet)) continue;
    const rows: any[][] = xlsx.utils.sheet_to_json(wb.Sheets[sheet], { header: 1, defval: null, blankrows: false });

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      if (!Array.isArray(row)) continue;
      const a = row[0];
      if (typeof a === "string" && ROW_MARKER.test(a)) continue;
      const iso = toLocalISODate(a);
      if (!iso) continue;                                  // header / WEEKLY / blank
      if (typeof row[1] === "string" && HOLIDAY.test(row[1])) continue; // SUNDAY etc.

      const r = i + 1;
      const src = { file, fileHash: "local", sheet, tableId: "daily-activity" };
      const sv = (val: number | null, col: number, header: string) =>
        val == null ? null : { value: val, cell: `${sheet}!${cellRef(col, r)}`, header };

      for (const s of STAGES) {
        const checked = sv(intOrNull(row[s.chk]), s.chk, "CHKD QTY");
        const accepted = s.acc != null ? sv(intOrNull(row[s.acc]), s.acc, "ACPT QTY") : null;
        const hold = s.hold != null ? sv(intOrNull(row[s.hold]), s.hold, "HOLD") : null;
        const rejected = s.rej != null ? sv(intOrNull(row[s.rej]), s.rej, "REJ") : null;
        if (!checked && !rejected) continue;               // nothing recorded for this stage·day

        records.push({
          occurredOn: { kind: "day", start: iso, end: iso },
          stageId: s.stageId,
          size: null,
          source: src,
          checked,
          acceptedGood: accepted,
          rework: hold,                                     // HOLD → rework (balance equation)
          rejected,
          defects: [],
          statedPct: null,
          extractedBy: "heuristic",
          ingestionId: "init-seed-daily-activity",
        });
      }
    }
  }

  return { records };
}
```

- [ ] **Step 4: Run to confirm pass**

Run: `npx jest parse-daily-activity`
Expected: PASS (all 4 cases).

- [ ] **Step 5: Commit**

```bash
git add src/lib/ingest/parsers/parse-daily-activity.ts src/lib/ingest/parsers/__tests__/parse-daily-activity.test.ts
git commit -m "feat(parser): add Daily Activity Report parser for full process chain"
```

---

### Task 5: Route + dedup the new family

**Files:**
- Modify: `src/lib/ingest/parsers/types.ts:4-41`
- Modify: `src/lib/ingest/parsers/index.ts`
- Test: `src/lib/ingest/parsers/__tests__/router.test.ts`

- [ ] **Step 1: Add the failing router assertion**

Add to `router.test.ts` (inside the existing `routeFamily` describe):

```ts
  it("routes Daily Activity Report to daily-activity", () => {
    expect(routeFamily("DAILY ACTIVITY REPORT 2026.xlsx")).toBe("daily-activity");
  });
```

- [ ] **Step 2: Run to confirm failure**

Run: `npx jest router`
Expected: FAIL — currently returns `null`.

- [ ] **Step 3: Implement in `types.ts`**

In `types.ts`, add `"daily-activity"` to the `SourceFamily` union (`types.ts:4-9`):

```ts
export type SourceFamily =
  | "size-wise"
  | "assembly-daily"
  | "daily-activity"
  | "rejection-analysis"
  | "stage-report"
  | "cumulative";
```

Add to `PRECEDENCE` (`types.ts:12-18`) — below size-wise(40) so size-wise stays authoritative for overlapping gates; the new chain stages never collide (different stageId) so they are always kept:

```ts
export const PRECEDENCE: Record<SourceFamily, number> = {
  "size-wise": 40,
  "assembly-daily": 30,
  "rejection-analysis": 30,
  "daily-activity": 25,
  "stage-report": 20,
  "cumulative": 0,
};
```

Replace the skip line in `routeFamily` (`types.ts:34`) — change:

```ts
  if (/daily activity/.test(f)) return null;
```

to:

```ts
  if (/daily activity/.test(f)) return "daily-activity";
```

- [ ] **Step 4: Wire into `index.ts`**

In `src/lib/ingest/parsers/index.ts`, add the import + export + branch:

```ts
import { parseDailyActivity } from "./parse-daily-activity";
```
```ts
export { parseDailyActivity } from "./parse-daily-activity";
```

In `recordsFromBuffer`, before the `size-wise` branch (`index.ts:37`), add:

```ts
  if (family === "daily-activity") {
    return parseDailyActivity(buf, name).records.map((record) => ({ record, family }));
  }
```

- [ ] **Step 5: Run the full suite**

Run: `npx jest`
Expected: PASS, including `router` and `dedupe` (dedup is unchanged; new family obeys the same `stageId|date` grouping).

- [ ] **Step 6: Commit**

```bash
git add src/lib/ingest/parsers/types.ts src/lib/ingest/parsers/index.ts src/lib/ingest/parsers/__tests__/router.test.ts
git commit -m "feat(parser): route + prioritize daily-activity family"
```

---

# Phase 3 — Schema-extractor & sizes persistence

### Task 6: Migration — add `sizes` to `registries`

**Files:**
- Create: `supabase/migrations/20260625_add_registry_sizes.sql`

- [ ] **Step 1: Write the migration**

```sql
-- Add the French-size dimension to the per-client registry.
ALTER TABLE registries ADD COLUMN IF NOT EXISTS sizes JSONB NOT NULL DEFAULT '[]'::jsonb;
```

- [ ] **Step 2: Apply it** (local or remote, per the project's workflow)

If using the Supabase MCP/CLI: apply `20260625_add_registry_sizes.sql`. Verify with a `list_tables`/`\d registries` that the `sizes` column exists.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260625_add_registry_sizes.sql
git commit -m "feat(db): add sizes column to registries"
```

---

### Task 7: Persist + serve `sizes` in the schema route

**Files:**
- Modify: `src/app/api/schema/route.ts`

- [ ] **Step 1: Serve `sizes` from GET**

In `GET` (`route.ts:38-47`), add `sizes` to the returned registry (both the configured and default branches):

```ts
      return NextResponse.json({
        registry: {
          clientId: data.client_id,
          registryVersion: data.registry_version,
          fiscalYearStartMonth: data.fiscal_year_start_month,
          stages: enrichedStages,
          defects: data.defects || [],
          sizes: data.sizes || DISPOSAFE_REGISTRY.sizes,
        },
        configured: true
      });
```

And in the unconfigured fallback (`route.ts:55-61`) the spread of `DISPOSAFE_REGISTRY` already includes `sizes` — no change needed there beyond confirming the spread.

- [ ] **Step 2: Persist `sizes` in POST**

In `POST`, after `const defects = ...` (`route.ts:91`), add:

```ts
    const sizes = payload.sizes || DISPOSAFE_REGISTRY.sizes;
```

Add `sizes` to the upsert object (`route.ts:94-100`) and to the returned registry (`route.ts:104-114`):

```ts
    const { error } = await db.from("registries").upsert({
      client_id: "disposafe",
      registry_version: "1.0.0",
      fiscal_year_start_month: 4,
      stages,
      defects,
      sizes,
    }, { onConflict: "client_id" });
```
```ts
      registry: { clientId: "disposafe", registryVersion: "1.0.0", fiscalYearStartMonth: 4, stages, defects, sizes }
```

- [ ] **Step 3: Verify the route compiles & returns sizes**

Run: `npx tsc --noEmit` then start the dev server (Phase 5 verification covers the live check).

- [ ] **Step 4: Commit**

```bash
git add src/app/api/schema/route.ts
git commit -m "feat(api): read/write registry sizes"
```

---

### Task 8: Auto-extract sizes during Staging upload

**Files:**
- Modify: `src/lib/ingest/schema-extractor.ts`
- Modify: `src/app/staging/page.tsx`

- [ ] **Step 1: Add `extractSizesFromWorkbook` to schema-extractor**

Append to `src/lib/ingest/schema-extractor.ts`:

```ts
/** Discover French sizes from per-size sheet names (e.g. "16FR" → "Fr16"). */
export function extractSizesFromWorkbook(wb: xlsx.WorkBook): { sizeId: string; label: string }[] {
  const out: { sizeId: string; label: string }[] = [];
  const seen = new Set<string>();
  for (const sn of wb.SheetNames) {
    const m = sn.trim().match(/^(\d+)\s*FR$/i);
    if (!m) continue;
    const sizeId = `Fr${m[1]}`;
    if (seen.has(sizeId)) continue;
    seen.add(sizeId);
    out.push({ sizeId, label: `${m[1]} FR` });
  }
  // numeric ascending
  return out.sort((a, b) => Number(a.sizeId.slice(2)) - Number(b.sizeId.slice(2)));
}
```

- [ ] **Step 2: Map `hold` role → rework in `classifyWithSchema`**

The schema-extractor's `REWORK_RE` already matches `hold` (`schema-extractor.ts:80`), so HOLD columns are classified `role: "rework"` and already flow to `StageDayRecord.rework`. No change needed — confirm by reading `schema-extractor.ts:80,163`. (Documented here so the executor does not add a redundant path.)

- [ ] **Step 3: Accumulate + persist sizes in Staging**

In `src/app/staging/page.tsx`, import the new helper (extend the dynamic import at `staging/page.tsx:94`):

```ts
      const { extractSchemaFromWorkbook, classifyWithSchema, extractSizesFromWorkbook } = await import("@/lib/ingest/schema-extractor");
```

Add an accumulator near the other `for (const file of files)` locals (`staging/page.tsx:106-109`):

```ts
      const discoveredSizes = new Map<string, { sizeId: string; label: string }>();
```

Inside the per-file loop, after `const wb = xlsx.read(...)` (`staging/page.tsx:117`):

```ts
          for (const sz of extractSizesFromWorkbook(wb)) discoveredSizes.set(sz.sizeId, sz);
```

In `publish()` (`staging/page.tsx:410`), when building the registry update body (`staging/page.tsx:449-458`), include the merged sizes so they persist on publish:

```ts
        const mergedSizes = (() => {
          const map = new Map<string, any>();
          for (const s of (regToUpdate.sizes || [])) map.set(s.sizeId, s);
          // discoveredSizes is in handleUpload scope; persist via sessionStorage bridge
          const cached = sessionStorage.getItem(`rais_sizes_${ingestionId}`);
          if (cached) for (const s of JSON.parse(cached)) map.set(s.sizeId, s);
          return Array.from(map.values()).sort((a, b) => Number(a.sizeId.slice(2)) - Number(b.sizeId.slice(2)));
        })();
```

…and add `sizes: mergedSizes` to the `registry` object in that POST body. To bridge `discoveredSizes` from `handleUpload` into `publish`, persist it at the end of `handleUpload` (next to the existing `sessionStorage.setItem` block at `staging/page.tsx:210-215`):

```ts
          sessionStorage.setItem(`rais_sizes_${ingestionId}`, JSON.stringify(Array.from(discoveredSizes.values())));
```

> Simpler alternative if you prefer state over sessionStorage: add `const [discoveredSizesState, setDiscoveredSizesState] = useState<{sizeId:string;label:string}[]>([])`, set it at the end of `handleUpload`, and read it in `publish`. Pick one; do not do both.

- [ ] **Step 4: Verify build**

Run: `npx tsc --noEmit`
Expected: no new errors in `staging/page.tsx` or `schema-extractor.ts`.

- [ ] **Step 5: Commit**

```bash
git add src/lib/ingest/schema-extractor.ts src/app/staging/page.tsx
git commit -m "feat(staging): auto-extract French sizes and persist into the registry"
```

---

# Phase 4 — Data-Entry UI rebuild (stage tabs + size×field grid)

> The repo has **no UI unit tests** (Jest covers schemas/parsers). These tasks are build-and-verify-in-browser, using the `preview_*` workflow. Each task ends with a screenshot proof.

### Task 9: Stage-tab + size-aware entry grid

**Files:**
- Modify: `src/app/data-entry/page.tsx`

- [ ] **Step 1: Add an active-stage tab state and derive sizes/captures/defects**

Add state near the other `useState`s (`data-entry/page.tsx:43`):

```ts
  const [activeStageId, setActiveStageId] = useState<string | null>(null);
```

After `activeRegistry` is derived (`data-entry/page.tsx:148-150`), add helpers:

```ts
  const sizes: { sizeId: string; label: string }[] = useMemo(
    () => activeRegistry.sizes && activeRegistry.sizes.length ? activeRegistry.sizes : [],
    [activeRegistry]
  );

  // Default the active stage tab to the first date-active quality gate, else first stage.
  useEffect(() => {
    if (activeStageId && stageIds.includes(activeStageId)) return;
    const firstGate = stageIds.find((id: string) =>
      activeRegistry.stages.find((s: any) => s.stageId === id)?.isQualityGate);
    setActiveStageId(firstGate ?? stageIds[0] ?? null);
  }, [stageIds, activeStageId, activeRegistry]);

  const activeStage = useMemo(
    () => activeRegistry.stages.find((s: any) => s.stageId === activeStageId) || null,
    [activeRegistry, activeStageId]
  );

  const activeCaptures: string[] = useMemo(
    () => activeStage?.captures ?? ["checked", "accepted", "hold", "rejected"],
    [activeStage]
  );

  const activeDefects = useMemo(
    () => (activeRegistry.defects || []).filter((d: any) => d.stages.includes(activeStageId)),
    [activeRegistry, activeStageId]
  );

  const isSizeWise = !!activeStage?.sizeWise && sizes.length > 0;
  // Grid row keys: one per size for size-wise stages, else a single synthetic row.
  const gridRowKeys: string[] = isSizeWise ? sizes.map(s => s.sizeId) : ["__line__"];
```

- [ ] **Step 2: Restructure the per-cell `rows` state to be keyed by (stage, rowKey, field)**

Change the rows state shape so a size-wise stage can hold a value per size. Replace `rows` usage in `updateCell` (`data-entry/page.tsx:181-189`) with a composite key:

```ts
  // rows: `${stageId}|${rowKey}` -> fieldName -> value
  const cellKey = (stageId: string, rowKey: string) => `${stageId}|${rowKey}`;

  const updateCell = (stageId: string, rowKey: string, colName: string, val: string) => {
    setRows((prev) => ({
      ...prev,
      [cellKey(stageId, rowKey)]: { ...(prev[cellKey(stageId, rowKey)] || {}), [colName]: val },
    }));
  };
```

> This changes the `rows` map keys from `stageId` to `stageId|rowKey`. Update every `rows[stageId]` read in `totals`, `blockingErrors`, `buildRecords`, and the ledger edit/duplicate handlers to iterate `gridRowKeys` and use `rows[cellKey(stageId, rowKey)]`. The single-row (throughput) stages use `rowKey = "__line__"`.

- [ ] **Step 3: Render the stage tab bar + the size×field grid**

Replace the "Spreadsheet Data Entry Grid" `<Section>` (`data-entry/page.tsx:1095-1161`) with a stage-tab bar and a grid whose **rows = `gridRowKeys`** and **columns = capture fields + defect codes**:

```tsx
            <Section title={`${activeStage?.label ?? "Stage"} — Data Entry`}>
              {/* Stage tab bar (date-active stages) */}
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

              <div style={{ overflowX: "auto", border: "1px solid var(--border)", borderRadius: 8, background: "var(--bg)", marginBottom: 12 }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                  <thead>
                    <tr style={{ color: "var(--text-3)", background: "var(--surface-2)", fontSize: 10, textTransform: "uppercase", borderBottom: "1.5px solid var(--border-strong)" }}>
                      <th style={{ ...eth, textAlign: "left", width: 120 }}>{isSizeWise ? "Size" : "Line"}</th>
                      {activeCaptures.map(c => <th key={c} style={eth}>{CAPTURE_LABEL[c]}</th>)}
                      {activeDefects.map((d: any) => <th key={d.defectCode} style={eth} title={d.label}>{d.defectCode}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {gridRowKeys.map((rowKey) => {
                      const label = isSizeWise ? (sizes.find(s => s.sizeId === rowKey)?.label ?? rowKey) : "Whole line";
                      const cells = rows[cellKey(activeStageId!, rowKey)] || {};
                      return (
                        <tr key={rowKey} style={{ borderBottom: "1px solid var(--border)" }}>
                          <td style={{ ...etd, textAlign: "left", fontWeight: 700, background: "var(--surface)" }}>{label}</td>
                          {activeCaptures.map(c => (
                            <td key={c} style={{ ...etd, padding: "3px 4px" }}>
                              <input type="number" value={cells[CAPTURE_FIELD[c]] ?? ""}
                                onChange={(e) => updateCell(activeStageId!, rowKey, CAPTURE_FIELD[c], e.target.value)}
                                style={{ ...inp, width: "100%", padding: "4px 6px", height: 28, fontFamily: "var(--font-mono)", textAlign: "right" }} />
                            </td>
                          ))}
                          {activeDefects.map((d: any) => (
                            <td key={d.defectCode} style={{ ...etd, padding: "3px 4px" }}>
                              <input type="number" value={cells[d.label] ?? ""}
                                onChange={(e) => updateCell(activeStageId!, rowKey, d.label, e.target.value)}
                                style={{ ...inp, width: "100%", padding: "4px 6px", height: 28, fontFamily: "var(--font-mono)", textAlign: "right" }} />
                            </td>
                          ))}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <p className="muted" style={{ fontSize: 11, margin: 0 }}>
                💡 Enter per-{isSizeWise ? "size" : "line"} quantities for <strong>{activeStage?.label}</strong>. Switch stages with the tabs above; each stage saves its own rows.
              </p>
            </Section>
```

Add the label/field maps near the top-level constants (`data-entry/page.tsx:32-37`):

```ts
const CAPTURE_LABEL: Record<string, string> = { checked: "Checked", accepted: "Accept", hold: "Hold", rejected: "Reject" };
const CAPTURE_FIELD: Record<string, string> = { checked: "Checked Qty", accepted: "Good Qty", hold: "Rework Qty", rejected: "Rejected Qty" };
```

- [ ] **Step 4: Verify in browser**

Start the dev server (`preview_start`), open `/data-entry`. Confirm: stage tabs render from the registry; Visual/Balloon/Valve/Final show size rows + their defect columns; Production/Leaching/etc. show a single "Whole line" row with only the captures they track. Take a screenshot.

- [ ] **Step 5: Commit**

```bash
git add src/app/data-entry/page.tsx
git commit -m "feat(data-entry): registry-driven stage tabs with size-wise + defect grid"
```

---

### Task 10: Rewrite `buildRecords`, `totals`, `blockingErrors` for the new grid

**Files:**
- Modify: `src/app/data-entry/page.tsx`

- [ ] **Step 1: Rewrite `buildRecords` to emit one record per (stage, size)**

Replace `buildRecords` (`data-entry/page.tsx:438-508`) with:

```ts
  const buildRecords = (ingestionId: string): StageDayRecord[] => {
    const out: StageDayRecord[] = [];
    for (const stageId of stageIds) {
      const stage = activeRegistry.stages.find((s: any) => s.stageId === stageId);
      const captures: string[] = stage?.captures ?? ["checked", "accepted", "hold", "rejected"];
      const stageSizeWise = !!stage?.sizeWise && sizes.length > 0;
      const rowKeys = stageSizeWise ? sizes.map((s) => s.sizeId) : ["__line__"];
      const stageDefects = (activeRegistry.defects || []).filter((d: any) => d.stages.includes(stageId));

      for (const rowKey of rowKeys) {
        const cells = rows[cellKey(stageId, rowKey)] || {};
        const num = (f: string) => (cells[f] !== undefined && cells[f] !== "" ? Number(cells[f]) : null);
        const cVal = captures.includes("checked") ? num("Checked Qty") : null;
        const rVal = captures.includes("rejected") ? num("Rejected Qty") : null;
        const rwVal = captures.includes("hold") ? num("Rework Qty") : null;
        let gVal = captures.includes("accepted") ? num("Good Qty") : null;
        if (gVal === null && cVal !== null && rVal !== null) gVal = Math.max(0, cVal - rVal - (rwVal ?? 0));

        const defects = stageDefects
          .map((d: any) => ({ raw: d.label, value: Number(cells[d.label]) || 0, cell: `ENTRY!${stageId}.${rowKey}.${d.defectCode}` }))
          .filter((d: any) => d.value > 0);

        // skip empty rows
        if (cVal === null && rVal === null && defects.length === 0) continue;

        const size = stageSizeWise ? rowKey : null;
        out.push({
          occurredOn: { kind: "day", start: date, end: date },
          stageId,
          size,
          source: { file: "Manual Entry", fileHash: `manual-${date}-${hdr.shift}`, sheet: hdr.shift, tableId: "entry" },
          checked: cVal !== null ? { value: cVal, cell: `ENTRY!${stageId}.${rowKey}.checked`, header: "Checked Qty" } : null,
          acceptedGood: gVal !== null ? { value: gVal, cell: `ENTRY!${stageId}.${rowKey}.good`, header: "Good Qty" } : null,
          rework: rwVal !== null ? { value: rwVal, cell: `ENTRY!${stageId}.${rowKey}.rework`, header: "Rework Qty" } : null,
          rejected: rVal !== null ? { value: rVal, cell: `ENTRY!${stageId}.${rowKey}.rejected`, header: "Rejected Qty" } : null,
          defects,
          statedPct: null,
          extractedBy: "direct-entry",
          ingestionId,
          customFields: {
            operator: hdr.operator, supervisor: hdr.supervisor, machine: hdr.machine,
            product: hdr.product, size: size ?? hdr.size, batch: hdr.batch, notes,
          },
        });
      }
    }
    return out;
  };
```

- [ ] **Step 2: Rewrite `totals` to sum across (stage, rowKey)**

Replace the `totals` body (`data-entry/page.tsx:311-366`) to iterate `stageIds × rowKeys` using `rows[cellKey(stageId, rowKey)]` and the `CAPTURE_FIELD` names (`Checked Qty`, `Rejected Qty`, `Good Qty`, `Rework Qty`). Keep the same returned shape `{ checked, rejected, good, rework, rejPct, fpy, hasGoodField }`:

```ts
  const totals = useMemo(() => {
    let checked = 0, rejected = 0, good = 0, rework = 0; let hasGoodField = false;
    for (const stageId of stageIds) {
      const stage = activeRegistry.stages.find((s: any) => s.stageId === stageId);
      const stageSizeWise = !!stage?.sizeWise && sizes.length > 0;
      const rowKeys = stageSizeWise ? sizes.map((s) => s.sizeId) : ["__line__"];
      for (const rowKey of rowKeys) {
        const c = rows[cellKey(stageId, rowKey)] || {};
        const cVal = Number(c["Checked Qty"]) || 0;
        const rVal = Number(c["Rejected Qty"]) || 0;
        const rwVal = Number(c["Rework Qty"]) || 0;
        let gVal: number;
        if (c["Good Qty"] !== undefined && c["Good Qty"] !== "") { hasGoodField = true; gVal = Number(c["Good Qty"]) || 0; }
        else gVal = Math.max(0, cVal - rVal - rwVal);
        checked += cVal; rejected += rVal; good += gVal; rework += rwVal;
      }
    }
    const rejPct = checked ? (rejected / checked) * 100 : 0;
    const fpy = checked ? (good / checked) * 100 : 0;
    return { checked, rejected, good, rework, rejPct, fpy, hasGoodField };
  }, [rows, stageIds, activeRegistry, sizes]);
```

- [ ] **Step 3: Simplify `blockingErrors`**

Replace `blockingErrors` (`data-entry/page.tsx:369-435`) with a version that requires operator and checks `rejected ≤ checked` per non-empty (stage,row):

```ts
  const blockingErrors = useMemo(() => {
    const errs: string[] = [];
    if (!hdr.operator.trim()) errs.push("Operator name is required.");
    for (const stageId of stageIds) {
      const stage = activeRegistry.stages.find((s: any) => s.stageId === stageId);
      const name = stage?.label || stageId;
      const stageSizeWise = !!stage?.sizeWise && sizes.length > 0;
      const rowKeys = stageSizeWise ? sizes.map((s) => s.sizeId) : ["__line__"];
      for (const rowKey of rowKeys) {
        const c = rows[cellKey(stageId, rowKey)] || {};
        const cVal = c["Checked Qty"] !== undefined && c["Checked Qty"] !== "" ? Number(c["Checked Qty"]) : null;
        const rVal = c["Rejected Qty"] !== undefined && c["Rejected Qty"] !== "" ? Number(c["Rejected Qty"]) : null;
        if (cVal !== null && rVal !== null && rVal > cVal) {
          const sizeLbl = stageSizeWise ? ` (${sizes.find(s => s.sizeId === rowKey)?.label})` : "";
          errs.push(`${name}${sizeLbl}: Rejected (${rVal}) cannot exceed Checked (${cVal}).`);
        }
      }
    }
    return errs;
  }, [rows, stageIds, hdr.operator, activeRegistry, sizes]);
```

- [ ] **Step 4: Fix the ledger edit/duplicate handlers**

`handleEditLedgerRecord` / `handleDuplicateLedgerRecord` (`data-entry/page.tsx:797-847`) unpack `rec.stageData` into `nextRows[stageId]`. Since the ledger groups by stage (not stage+size), edited rows load into the throughput/single-row slot. Change them to write into `cellKey(stageId, "__line__")`:

```ts
    const nextRows: Record<string, Record<string, string>> = {};
    Object.entries(rec.stageData).forEach(([stageId, data]: [string, any]) => {
      const k = `${stageId}|__line__`;
      nextRows[k] = {};
      Object.entries(data).forEach(([fName, val]) => { nextRows[k][fName] = String(val ?? ""); });
    });
    setRows(nextRows);
```

> Note: the manual-entries ledger (`/api/manual-entries`) groups events by date+shift and reconstructs per-stage field values from `headerPath`; it does not currently round-trip size. Editing a previously size-wise manual entry will collapse to whole-line. This is acceptable for v1 (re-entry of one day). A size-aware ledger round-trip is out of scope for this plan — note it for a follow-up.

- [ ] **Step 5: Remove now-dead helpers**

Delete `handlePaste`, `handleFillDown`, `handleKeyDown`, `sortedFieldNames`, `renderSpreadsheetInput`, and `DEFAULT_FIELDS` usages that referenced the old flat grid IF they are no longer referenced after Steps 1-3. Run `npx tsc --noEmit` and let unused-variable errors guide removal. (Keep the Schema-Editor modal handlers — they still operate on `draftStages`.)

- [ ] **Step 6: Verify end-to-end in browser**

`preview_start`; on `/data-entry`: enter Visual sizes (e.g. Fr16 Checked 2374 / Reject 61 / COAG 10), switch to Production and enter a whole-line row, set Operator, Submit. Confirm the success toast, then check the Ledger tab shows the entry and the Dashboard rejection rate updates. Screenshot the filled grid + the dashboard.

- [ ] **Step 7: Commit**

```bash
git add src/app/data-entry/page.tsx
git commit -m "feat(data-entry): emit per-(stage,size) records; size-aware totals & validation"
```

---

# Phase 5 — Downstream wiring

### Task 11: Make the global View selector registry-driven

**Files:**
- Modify: `src/components/app/AppShell.tsx:45-51`

- [ ] **Step 1: Build `VIEW_OPTIONS` from the registry**

`AppShell` already fetches `/api/schema` (`AppShell.tsx:107-115`). Capture the stages and derive the view list (Cumulative + quality gates, to keep the headline focused on inspection):

Add state:

```ts
  const [viewStages, setViewStages] = useState<{ id: string; label: string }[]>([]);
```

In the existing `/api/schema` `.then` (`AppShell.tsx:108-111`), add:

```ts
        const gates = (data.registry?.stages || []).filter((s: any) => s.isQualityGate ?? true);
        setViewStages(gates.map((s: any) => ({ id: s.stageId, label: s.label })));
```

Replace the hardcoded `VIEW_OPTIONS` consumption (`AppShell.tsx:442`) so it maps over `[{ id: "cumulative", label: "Cumulative" }, ...viewStages]` instead of the constant. Keep the static `VIEW_OPTIONS` const as the fallback when `viewStages` is empty:

```ts
              {[{ id: "cumulative", label: "Cumulative" }, ...(viewStages.length ? viewStages : VIEW_OPTIONS.slice(1))].map((v) => {
```

- [ ] **Step 2: Verify in browser**

`preview_start`; confirm the top View toggle still shows Cumulative / Visual / Balloon / Valve / Final (now sourced from the registry) and switching still scopes the dashboard. Screenshot.

- [ ] **Step 3: Commit**

```bash
git add src/components/app/AppShell.tsx
git commit -m "feat(shell): derive the global View selector from registry quality gates"
```

---

### Task 12: Bulk re-seed verification (the real point of all this)

**Files:** none (operational verification)

- [ ] **Step 1: Clear + re-ingest the real workbooks**

On `/clear-data`, reset the ledger. Then on `/staging`, upload (in one batch) the size-wise Visual + Valve books, the Rejection Analysis months, and `DAILY ACTIVITY REPORT 2026.xlsx`. Publish.

- [ ] **Step 2: Confirm fidelity**

Verify on the dashboard / stage-analysis / size-analysis / defect-analysis:
- New stages (Production, Eye Punching, Leaching, …) appear with throughput counts.
- Size-wise stages show per-Fr breakdown and the expanded defect Pareto (21 visual codes resolving, not "Others").
- The stage totals are **not doubled** (dedup `stageId|date` holds: size-wise wins over daily-activity for the gates).
- Accept/Hold now populate (balance check closes where the source had them).

- [ ] **Step 3: Run the full automated suite one final time**

Run: `npx jest`
Expected: PASS (all prior + new parser/router tests).

- [ ] **Step 4: Commit any test fixtures/notes**

```bash
git add -A && git commit -m "test: verify full-fidelity multi-stage ingest end-to-end" || echo "nothing to commit"
```

---

## Self-Review

**Spec coverage:**
- Stage tabs + size rows → Tasks 9-10. ✓
- Full throughput chain → Tasks 2 (stages), 4-5 (parser/router). ✓
- Expand defect catalog → Task 2. ✓
- Capture ACCEPT+HOLD → Task 3 (size-wise), Task 4 (daily-activity), Task 8 step 2 (schema-extractor confirmed). ✓
- registry.sizes + auto-extract → Tasks 1, 2, 6, 7, 8. ✓
- "Staging builds the entry schema" → Tasks 7-8 persist sizes/stages/defects the entry grid reads. ✓

**Type consistency:** `cellKey(stageId, rowKey)` used uniformly in Tasks 9-10. `captures`/`sizeWise`/`isQualityGate` defined in Task 1, consumed in Tasks 2, 9-11. `CAPTURE_FIELD` maps capture→canonical field name (`Checked Qty`/`Good Qty`/`Rework Qty`/`Rejected Qty`) consistently in grid render, `buildRecords`, `totals`, `blockingErrors`. `SourceFamily` `daily-activity` added in Task 5 before use. Size canonical form `Fr<n>` consistent across registry, parser, extractor, entry.

**Known follow-ups (intentionally out of scope):** size-aware ledger round-trip (Task 10 step 4 note); per-stage cost config for new throughput stages; `String.fromCharCode` A1 helper only valid ≤ col Z in size-wise (Task 3 note) vs the `cellRef` helper in daily-activity which handles AA+.
