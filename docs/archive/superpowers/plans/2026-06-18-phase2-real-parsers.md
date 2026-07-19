# Phase 2 — Real Parsers, Dedupe & Merge Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Replace the synthetic-weight seeder with deterministic parsers that read only real values from every workbook, deduplicate overlapping sources by precedence, and reconcile same-day manual-vs-Excel conflicts with a Finding instead of silently overwriting.

**Architecture:** One parser module per real file shape → all emit the existing `StageDayRecord` contract → a `dedupeByPrecedence` pass keeps the highest-precedence record per `(stageId, size|·, day, dispositionKind)` → `emitMany` → durable store (Phase 1). Same code path for the seeder and the Staging upload.

**Tech Stack:** TypeScript, `xlsx` (SheetJS), Jest golden tests against the real workbooks in `DATA/` and `ANALYTICAL DATA/`.

**Builds on:** Phase 1 (`feat/phase1-durable-ledger`). This plan's branch is `feat/phase2-real-parsers`.

---

## Empirical file-shape findings (from profiling the real workbooks)

These corrected the spec's assumptions and **must** drive the parsers:

1. **The existing size-wise parser is broken.** `store/index.ts` size parser requires a `DATE` column, but the real `SIZE WISE/VISUAL/*.xlsx` per-size sheets (`6FR`…`24FR`) have header `B.NO | SIZE | REC. QTY | ACCEPT QTY | HOLD QTY | HOLD % | REJ. QTY | REJ % | REASON FOR REJECTION` + a 21-code defect block — **no DATE column**. The date is in the **filename** (`1 APRIL 26.xlsx` → 2026-04-01). So size data silently produced nothing → the dashboard's "every size same %" came purely from the synthetic fallback.

2. **REJECTION ANALYSIS monthly files** (`01 REJECTION ANALYSIS-APRIL 2025.xlsx`): sheets `Cummulative | VISUAL | BALLOON INSPECTION | VALVE INTEGRITY | FINAL … | APRIL`. The **`Cummulative` sheet is percentages** (a claim, not counts). The **per-stage sheets carry raw counts**. Dates carry a UTC off-by-one artifact (`2025-03-31T18:29:50Z` = local Apr 1) — normalize by local date, not `.toISOString()`.

3. **SIZE WISE/VALVE INTEGRITY/*.xlsx** has a **`COMMULATIVE` sheet that is the richest real source**: per-size rows × two stage blocks side-by-side — Balloon (`CHECKED/ACCEPT/HOLD/REJ/REJ% + STRUCK BALLOON/BALLOOM BRUST/LEAKAGE/OTHERS`, cols 0–11) and Valve (`CHECKED/ACCEPT/HOLD/REJ/REJ% + LEAKAGE/90-10/BUBBLE/THIN SPOD/OTHERS`, cols 13–23), with `TOTAL`/`TOTAL %` rows. Real counts; date from filename.

4. **SIZE WISE/FINAL** uses weekly sheets (`MAY WEEK 2`…) + `DAILY ACTIVITY REPORT 20xx.xlsx`.

5. **Fiscal year:** size-wise files are dated **FY2026-27** (April 2026+), genuinely later than the rejection-analysis FY2025-26. Per the locked decision, unify by real date — they sit later on the same axis.

6. **Defect taxonomy** is fully enumerated in the VISUAL `FORMATE` legend (COAG, SD, TT, BL, PS, SB, PW, FP, RW, BEP, DEC, BM, WEB, BT, SF, BIC, WK, BMP, TF, PH, BST, BP …) plus the VALVE block names. Registry reconciliation is part of sub-phase 2c.

---

## Decomposition (each sub-phase ships independently)

Phase 2 is large and the shapes are heterogeneous, so it is split into three shippable sub-plans:

- **2a (this document, detailed below):** dedupe + merge-or-clarify core, seeding rewrite that **removes all synthetic weights**, plus the two fully-understood parsers (**assembly-daily**, **rejection-analysis** extraction). After 2a: real stage-level counts, no double-count, no silent manual override, and size/defect honestly show "no data" until 2b.
- **2b (separate plan):** size-wise parsers — `VISUAL` per-size (date-from-filename), `VALVE INTEGRITY` `COMMULATIVE` two-stage, `FINAL` weekly. Restores real per-size + per-defect detail.
- **2c (separate plan):** `DATA/` stage reports (visual inspection, balloon & valve) + cumulative-as-claims (`AggregateClaimEvent`) + registry/SOP defect reconciliation.

---

## Sub-phase 2a — File structure

| File | Responsibility | Action |
| --- | --- | --- |
| `src/lib/ingest/parsers/types.ts` | `SourceFamily` enum + `PrecededRecord` (StageDayRecord + precedence rank) | Create |
| `src/lib/ingest/parsers/dedupe.ts` | `dedupeByPrecedence(records)` — keep highest-rank per key, return kept + shadowed | Create |
| `src/lib/ingest/parsers/reconcile.ts` | `reconcileConflicts(existing, incoming)` — same-key equal→drop, differ→Finding | Create |
| `src/lib/ingest/parsers/parse-assembly-daily.ts` | Parse the wide multi-stage daily sheet (ASSEMBLY REJECTION REPORT) | Create |
| `src/lib/ingest/parsers/parse-rejection-analysis.ts` | Thin wrapper over existing `classifyRejectionSheets` + `sourceFamily` | Create |
| `src/lib/ingest/parsers/index.ts` | Router: pick parser by filename/sheet fingerprint | Create |
| `src/lib/ingest/date.ts` | `toLocalISODate` (fixes the UTC off-by-one) + `dateFromFilename` | Create |
| `src/lib/store/seed.ts` | Extracted seeding: walk data dirs → router → dedupe → emit → append (no synthetic) | Create |
| `src/lib/store/index.ts` | Call the new `seed.ts`; delete the inline synthetic seeder | Modify |
| `src/lib/ingest/parsers/__tests__/*.test.ts` | Golden + unit tests | Create |

---

## Task 1: Date normalization helpers

**Files:**
- Create: `src/lib/ingest/date.ts`
- Test: `src/lib/ingest/__tests__/date.test.ts`

The UTC off-by-one (`2025-03-31T18:29:50Z` really means local 2025-04-01) corrupts every date if normalized with `.toISOString()`. Normalize by the date's **local** components. Also derive dates from filenames like `1 APRIL 26` / `01 REJECTION ANALYSIS-APRIL 2025`.

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/ingest/__tests__/date.test.ts
import { toLocalISODate, dateFromFilename } from "../date";

describe("toLocalISODate", () => {
  it("uses local calendar date, not UTC (fixes the -1 day artifact)", () => {
    // A Date whose UTC is the prior evening but local is Apr 1.
    const d = new Date(2025, 3, 1, 0, 0, 0); // local Apr 1 2025
    expect(toLocalISODate(d)).toBe("2025-04-01");
  });
  it("parses Excel serial numbers to local ISO", () => {
    // Excel serial 45748 = 2025-04-01
    expect(toLocalISODate(45748)).toBe("2025-04-01");
  });
  it("returns null for junk", () => {
    expect(toLocalISODate("SUNDAY")).toBeNull();
  });
});

describe("dateFromFilename", () => {
  it("reads 'D MONTH YY' style (size-wise files, FY26)", () => {
    expect(dateFromFilename("1 APRIL 26.xlsx")).toBe("2026-04-01");
  });
  it("reads 'NN ... MONTH YYYY' style (rejection analysis)", () => {
    expect(dateFromFilename("01 REJECTION ANALYSIS-APRIL 2025.xlsx")).toBe("2025-04-01");
  });
  it("returns null when no month/day is present", () => {
    expect(dateFromFilename("YEARLY ANALYSIS.xlsx")).toBeNull();
  });
});
```

- [ ] **Step 2: Run → FAIL** (`npx jest src/lib/ingest/__tests__/date.test.ts`).

- [ ] **Step 3: Implement**

```ts
// src/lib/ingest/date.ts
const MONTHS: Record<string, number> = {
  jan:1,feb:2,mar:3,apr:4,may:5,jun:6,jul:7,aug:8,sep:9,oct:10,nov:11,dec:12,
  january:1,february:2,march:3,april:4,june:6,july:7,august:8,september:9,october:10,november:11,december:12,
};
const pad = (n: number) => String(n).padStart(2, "0");

/** ISO yyyy-mm-dd using LOCAL calendar fields (avoids the UTC -1 day shift). */
export function toLocalISODate(v: unknown): string | null {
  if (v == null || v === "") return null;
  if (v instanceof Date && !isNaN(v.getTime())) {
    return `${v.getFullYear()}-${pad(v.getMonth() + 1)}-${pad(v.getDate())}`;
  }
  if (typeof v === "number") {
    if (v > 20000 && v < 80000) {
      // Excel serial → date at local midnight (1900 system, with the known leap bug offset).
      const d = new Date(Math.round((v - 25569) * 86400 * 1000));
      return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
    }
    return null;
  }
  const s = String(v).trim();
  const d = new Date(s);
  if (!isNaN(d.getTime()) && /\d{4}|\d{1,2}[/-]\d{1,2}/.test(s)) {
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  }
  return null;
}

/** Derive an ISO date from a filename. Handles 'D MONTH YY' and 'MONTH YYYY'.
 *  Two-digit years map to 2000+YY. Returns null if no month found. */
export function dateFromFilename(name: string): string | null {
  const base = name.replace(/\.[a-z]+$/i, "");
  const monthMatch = base.match(/(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*/i);
  if (!monthMatch) return null;
  const month = MONTHS[monthMatch[1].toLowerCase()];
  const yearMatch = base.match(/\b(20\d{2})\b/) || base.match(/\b(\d{2})\b(?!.*\b\d{4}\b)/);
  let year: number;
  if (yearMatch) {
    const y = Number(yearMatch[1]);
    year = y < 100 ? 2000 + y : y;
  } else return null;
  // Leading day number before the month (e.g. "1 APRIL 26"); default to 1.
  const dayMatch = base.match(/^(\d{1,2})\s+[A-Za-z]/);
  const day = dayMatch ? Number(dayMatch[1]) : 1;
  return `${year}-${pad(month)}-${pad(day)}`;
}
```

- [ ] **Step 4: Run → PASS.** `npx jest src/lib/ingest/__tests__/date.test.ts`

- [ ] **Step 5: Commit** — `git add -A && git commit -m "feat(ingest): local-date + filename-date helpers (fix UTC off-by-one)"`

---

## Task 2: Source families + precedence types

**Files:**
- Create: `src/lib/ingest/parsers/types.ts`
- Test: covered by Task 3's dedupe tests.

- [ ] **Step 1: Create the types**

```ts
// src/lib/ingest/parsers/types.ts
import type { StageDayRecord } from "@/lib/ingest/emit";

/** Which kind of workbook a record came from — sets dedup precedence. */
export type SourceFamily =
  | "size-wise"          // richest: size + defect detail
  | "assembly-daily"     // wide per-stage daily counts
  | "rejection-analysis" // per-stage daily counts (monthly workbooks)
  | "stage-report"       // standalone visual / balloon-valve reports
  | "cumulative";        // rollups — claims only, never base counts

/** Higher wins. cumulative is 0 (claims only; never a base count). */
export const PRECEDENCE: Record<SourceFamily, number> = {
  "size-wise": 40,
  "assembly-daily": 30,
  "rejection-analysis": 30,
  "stage-report": 20,
  "cumulative": 0,
};

export interface PrecededRecord {
  record: StageDayRecord;
  family: SourceFamily;
}
```

- [ ] **Step 2: Commit** — `git add -A && git commit -m "feat(ingest): source-family precedence types"`

---

## Task 3: dedupeByPrecedence

**Files:**
- Create: `src/lib/ingest/parsers/dedupe.ts`
- Test: `src/lib/ingest/parsers/__tests__/dedupe.test.ts`

Keep the highest-precedence record per `(stageId, size|"·", day)`. Ties → keep the first (deterministic). Cumulative (precedence 0) is never a base count — it is excluded from the kept set and returned as `claims`.

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/ingest/parsers/__tests__/dedupe.test.ts
import { dedupeByPrecedence } from "../dedupe";
import type { PrecededRecord } from "../types";

function rec(family: any, stageId: string, size: string | null, day: string, rejected: number): PrecededRecord {
  return {
    family,
    record: {
      occurredOn: { kind: "day", start: day, end: day },
      stageId, size,
      source: { file: family, fileHash: "h", sheet: "s", tableId: "t" },
      checked: null, acceptedGood: null, rework: null,
      rejected: { value: rejected, cell: "X1", header: "REJ" },
      defects: [], statedPct: null, extractedBy: "heuristic", ingestionId: "i",
    } as any,
  };
}

describe("dedupeByPrecedence", () => {
  it("keeps size-wise over rejection-analysis for the same key", () => {
    const out = dedupeByPrecedence([
      rec("rejection-analysis", "visual", null, "2025-04-01", 100),
      rec("size-wise", "visual", null, "2025-04-01", 90),
    ]);
    expect(out.kept).toHaveLength(1);
    expect(out.kept[0].family).toBe("size-wise");
    expect(out.shadowed).toHaveLength(1);
  });

  it("keeps different keys independently", () => {
    const out = dedupeByPrecedence([
      rec("assembly-daily", "visual", null, "2025-04-01", 10),
      rec("assembly-daily", "balloon", null, "2025-04-01", 5),
    ]);
    expect(out.kept).toHaveLength(2);
  });

  it("routes cumulative records to claims, never kept", () => {
    const out = dedupeByPrecedence([rec("cumulative", "visual", null, "2025-04-01", 100)]);
    expect(out.kept).toHaveLength(0);
    expect(out.claims).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run → FAIL.**

- [ ] **Step 3: Implement**

```ts
// src/lib/ingest/parsers/dedupe.ts
import { PRECEDENCE, type PrecededRecord } from "./types";

export interface DedupeResult {
  kept: PrecededRecord[];
  shadowed: PrecededRecord[];   // lost to a higher-precedence record on the same key
  claims: PrecededRecord[];     // cumulative/rollup — for cross-check, never base counts
}

function keyOf(p: PrecededRecord): string {
  const r = p.record;
  return `${r.stageId}|${r.size ?? "·"}|${r.occurredOn.start}`;
}

export function dedupeByPrecedence(records: PrecededRecord[]): DedupeResult {
  const claims: PrecededRecord[] = [];
  const best = new Map<string, PrecededRecord>();
  const shadowed: PrecededRecord[] = [];

  for (const p of records) {
    if (PRECEDENCE[p.family] === 0) { claims.push(p); continue; }
    const k = keyOf(p);
    const cur = best.get(k);
    if (!cur) { best.set(k, p); continue; }
    if (PRECEDENCE[p.family] > PRECEDENCE[cur.family]) {
      shadowed.push(cur);
      best.set(k, p);
    } else {
      shadowed.push(p);
    }
  }
  return { kept: [...best.values()], shadowed, claims };
}
```

- [ ] **Step 4: Run → PASS.**

- [ ] **Step 5: Commit** — `git add -A && git commit -m "feat(ingest): dedupeByPrecedence (size-wise > stage reports > cumulative claims)"`

---

## Task 4: reconcileConflicts (merge-or-clarify)

**Files:**
- Create: `src/lib/ingest/parsers/reconcile.ts`
- Test: `src/lib/ingest/parsers/__tests__/reconcile.test.ts`

When an incoming record shares a key with an already-stored value: identical numbers → drop the duplicate (no-op); different numbers → keep the incoming but emit a **conflict descriptor** the caller turns into a Finding (per the locked "keep both + raise a Finding" decision). Pure function; returns what to write + conflicts.

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/ingest/parsers/__tests__/reconcile.test.ts
import { reconcileConflicts } from "../reconcile";

const mk = (stageId: string, day: string, rejected: number) => ({
  occurredOn: { kind: "day", start: day, end: day }, stageId, size: null,
  source: { file: "f", fileHash: "h", sheet: "s", tableId: "t" },
  checked: { value: 1000, cell: "A1", header: "C" }, acceptedGood: null, rework: null,
  rejected: { value: rejected, cell: "B1", header: "R" },
  defects: [], statedPct: null, extractedBy: "direct-entry", ingestionId: "i",
} as any);

describe("reconcileConflicts", () => {
  it("drops an identical duplicate (no conflict)", () => {
    const out = reconcileConflicts([mk("visual", "2025-04-01", 50)], [mk("visual", "2025-04-01", 50)]);
    expect(out.toWrite).toHaveLength(0);
    expect(out.conflicts).toHaveLength(0);
  });
  it("writes the incoming and flags a conflict when values differ", () => {
    const out = reconcileConflicts([mk("visual", "2025-04-01", 50)], [mk("visual", "2025-04-01", 80)]);
    expect(out.toWrite).toHaveLength(1);
    expect(out.conflicts).toHaveLength(1);
    expect(out.conflicts[0]).toMatchObject({ stageId: "visual", day: "2025-04-01", existing: 50, incoming: 80 });
  });
  it("writes a brand-new key with no conflict", () => {
    const out = reconcileConflicts([], [mk("balloon", "2025-04-02", 5)]);
    expect(out.toWrite).toHaveLength(1);
    expect(out.conflicts).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run → FAIL.**

- [ ] **Step 3: Implement**

```ts
// src/lib/ingest/parsers/reconcile.ts
import type { StageDayRecord } from "@/lib/ingest/emit";

export interface Conflict {
  stageId: string;
  size: string | null;
  day: string;
  existing: number;
  incoming: number;
}
export interface ReconcileResult {
  toWrite: StageDayRecord[];
  conflicts: Conflict[];
}

const keyOf = (r: StageDayRecord) => `${r.stageId}|${r.size ?? "·"}|${r.occurredOn.start}`;
const rejOf = (r: StageDayRecord) => r.rejected?.value ?? null;

export function reconcileConflicts(existing: StageDayRecord[], incoming: StageDayRecord[]): ReconcileResult {
  const byKey = new Map<string, StageDayRecord>();
  for (const e of existing) byKey.set(keyOf(e), e);

  const toWrite: StageDayRecord[] = [];
  const conflicts: Conflict[] = [];

  for (const inc of incoming) {
    const k = keyOf(inc);
    const prior = byKey.get(k);
    if (!prior) { toWrite.push(inc); continue; }
    const a = rejOf(prior), b = rejOf(inc);
    if (a === b) continue; // identical → drop duplicate
    toWrite.push(inc);
    conflicts.push({ stageId: inc.stageId, size: inc.size ?? null, day: inc.occurredOn.start, existing: a ?? 0, incoming: b ?? 0 });
  }
  return { toWrite, conflicts };
}
```

- [ ] **Step 4: Run → PASS.**

- [ ] **Step 5: Commit** — `git add -A && git commit -m "feat(ingest): reconcileConflicts (merge identical, flag differing for a Finding)"`

---

## Task 5: parse-assembly-daily (the new wide-format parser)

**Files:**
- Create: `src/lib/ingest/parsers/parse-assembly-daily.ts`
- Test: `src/lib/ingest/parsers/__tests__/parse-assembly-daily.test.ts`

Parses `DATA/ASSEMBLY REJECTION REPORT.xlsx` monthly sheets. Header band row 4 (0-indexed 3): per-stage column groups. Map by fixed column roles read from the header text, skip `SUNDAY`/`WEEK`/`W. REPORT`/`Total` marker rows and blank rows, ignore `#DIV/0!`. Date in col A. Ground truth from the profiled APRIL 25 total row: Visual checked 247767 / rej 19271; Balloon chkd 216080 / rej 1910; Valve chkd 214182 / rej 6101; Final checked 220895 / rej 5900.

- [ ] **Step 1: Write the failing golden test**

```ts
// src/lib/ingest/parsers/__tests__/parse-assembly-daily.test.ts
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { parseAssemblyDaily } from "../parse-assembly-daily";

const FILE = join(process.cwd(), "DATA", "ASSEMBLY REJECTION REPORT.xlsx");
const maybe = existsSync(FILE) ? describe : describe.skip;

maybe("parseAssemblyDaily (golden, APRIL 25)", () => {
  const { records } = parseAssemblyDaily(readFileSync(FILE), "ASSEMBLY REJECTION REPORT.xlsx");
  const april = records.filter((r) => r.occurredOn.start.startsWith("2025-04"));

  const sum = (stage: string, pick: (r: any) => number | null) =>
    april.filter((r) => r.stageId === stage).reduce((s, r) => s + (pick(r) ?? 0), 0);

  it("totals visual rejected to the sheet's total row", () => {
    expect(sum("visual", (r) => r.rejected?.value)).toBe(19271);
    expect(sum("visual", (r) => r.checked?.value)).toBe(247767);
  });
  it("totals balloon + valve + final rejected", () => {
    expect(sum("balloon", (r) => r.rejected?.value)).toBe(1910);
    expect(sum("valve-integrity", (r) => r.rejected?.value)).toBe(6101);
    expect(sum("final", (r) => r.rejected?.value)).toBe(5900);
  });
  it("skips SUNDAY/WEEK/Total marker rows (no record on those)", () => {
    expect(april.every((r) => /^\d{4}-\d{2}-\d{2}$/.test(r.occurredOn.start))).toBe(true);
  });
});
```

- [ ] **Step 2: Run → FAIL** (module missing). If the test SKIPS (file absent), STOP and report `NEEDS_CONTEXT` — the golden file must be present.

- [ ] **Step 3: Implement the parser**

```ts
// src/lib/ingest/parsers/parse-assembly-daily.ts
import xlsx from "xlsx";
import type { StageDayRecord } from "@/lib/ingest/emit";
import { toLocalISODate } from "@/lib/ingest/date";

// Fixed column layout of the ASSEMBLY daily sheet (header row index 3 / row 4):
// A DATE | B VISUAL QTY | C VISUAL ACPT | D REJ | E REJ% | F BALLOON CHKD | G ACPT |
// H REJ | I REJ% | J VALVE CHKD | K ACPT | L REJ | M REJ% | N FINAL CHKD | O FINAL REJ ...
const COL = { date:0, vChk:1, vAcc:2, vRej:3, bChk:5, bAcc:6, bRej:7, kChk:9, kAcc:10, kRej:11, fChk:13, fRej:14 };
const MARKER = /sunday|week|w\.?\s*report|total/i;
const intOrNull = (v: unknown): number | null => {
  if (v == null || v === "") return null;
  const n = Number(String(v).replace(/[, ]/g, ""));
  return Number.isFinite(n) && n >= 0 ? Math.round(n) : null;
};
const sv = (value: number | null, sheet: string, col: number, row: number, header: string) =>
  value == null ? null : { value, cell: `${sheet}!${String.fromCharCode(65 + col)}${row}`, header };

export interface AssemblyParseResult { records: StageDayRecord[] }

export function parseAssemblyDaily(buf: Buffer | ArrayBuffer, file: string): AssemblyParseResult {
  const wb = xlsx.read(buf, { type: "buffer", cellDates: true });
  const records: StageDayRecord[] = [];

  for (const sheet of wb.SheetNames) {
    if (/yearly|summary/i.test(sheet)) continue;
    const rows: any[][] = xlsx.utils.sheet_to_json(wb.Sheets[sheet], { header: 1, defval: null, blankrows: false });
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      if (!Array.isArray(row)) continue;
      const a = row[COL.date];
      if (typeof a === "string" && MARKER.test(a)) continue;
      const iso = toLocalISODate(a);
      if (!iso) continue;
      const r = i + 1;
      const src = { file, fileHash: "local", sheet, tableId: "t1" };
      const mk = (stageId: string, chk: number, acc: number | null, rej: number, accCol: number | null, rejCol: number, chkCol: number, rejHdr: string): StageDayRecord => ({
        occurredOn: { kind: "day", start: iso, end: iso }, stageId, size: null, source: src,
        checked: sv(intOrNull(row[chkCol]), sheet, chkCol, r, "CHKD QTY"),
        acceptedGood: accCol != null ? sv(intOrNull(row[accCol]), sheet, accCol, r, "ACPT QTY") : null,
        rework: null,
        rejected: sv(intOrNull(row[rejCol]), sheet, rejCol, r, rejHdr),
        defects: [], statedPct: null, extractedBy: "heuristic", ingestionId: "init-seed-assembly",
      });
      records.push(mk("visual", 0, null, 0, COL.vAcc, COL.vRej, COL.vChk, "VISUAL REJ"));
      records.push(mk("balloon", 0, null, 0, COL.bAcc, COL.bRej, COL.bChk, "BALLOON REJ"));
      records.push(mk("valve-integrity", 0, null, 0, COL.kAcc, COL.kRej, COL.kChk, "VALVE REJ"));
      records.push(mk("final", 0, null, 0, null, COL.fRej, COL.fChk, "FINAL REJ"));
    }
  }
  // Drop empty rows (no checked and no rejected on any stage line).
  return { records: records.filter((r) => r.checked || r.rejected) };
}
```

- [ ] **Step 4: Run → PASS** (golden totals match).

- [ ] **Step 5: Commit** — `git add -A && git commit -m "feat(ingest): parse-assembly-daily wide multi-stage parser + golden test"`

---

## Task 6: parse-rejection-analysis (extract existing classifier)

**Files:**
- Create: `src/lib/ingest/parsers/parse-rejection-analysis.ts`
- Test: `src/lib/ingest/parsers/__tests__/parse-rejection-analysis.test.ts`

Wrap the existing, correct `classifyRejectionSheets` (it already maps the per-stage sheets) into a parser that returns `PrecededRecord[]` tagged `rejection-analysis`, and routes the `Cummulative` % sheet to nothing here (claims handled in 2c). It must parse a real workbook's per-stage sheets.

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/ingest/parsers/__tests__/parse-rejection-analysis.test.ts
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { parseRejectionAnalysis } from "../parse-rejection-analysis";

const FILE = join(process.cwd(), "ANALYTICAL DATA", "REJECTION ANALYSIS 2025-26", "01 REJECTION ANALYSIS-APRIL 2025.xlsx");
const maybe = existsSync(FILE) ? describe : describe.skip;

maybe("parseRejectionAnalysis", () => {
  const out = parseRejectionAnalysis(readFileSync(FILE), "01 REJECTION ANALYSIS-APRIL 2025.xlsx");
  it("produces rejection-analysis records for the four stages", () => {
    const stages = new Set(out.map((p) => p.record.stageId));
    expect(out.length).toBeGreaterThan(0);
    expect(out.every((p) => p.family === "rejection-analysis")).toBe(true);
    expect(stages.has("visual")).toBe(true);
  });
});
```

- [ ] **Step 2: Run → FAIL.**

- [ ] **Step 3: Implement**

```ts
// src/lib/ingest/parsers/parse-rejection-analysis.ts
import { parseWorkbookBuffer } from "@/lib/parser";
import { classifyRejectionSheets } from "@/lib/ingest/from-rejection-sheets";
import type { PrecededRecord } from "./types";

export function parseRejectionAnalysis(buf: Buffer | ArrayBuffer, file: string): PrecededRecord[] {
  const { rawSheets } = parseWorkbookBuffer(buf as Buffer, file);
  const { records } = classifyRejectionSheets(rawSheets, "init-seed-rej");
  return records.map((record) => ({ record, family: "rejection-analysis" as const }));
}
```

- [ ] **Step 4: Run → PASS.**

- [ ] **Step 5: Commit** — `git add -A && git commit -m "feat(ingest): parse-rejection-analysis wrapper tagged for precedence"`

---

## Task 7: Parser router

**Files:**
- Create: `src/lib/ingest/parsers/index.ts`
- Test: `src/lib/ingest/parsers/__tests__/router.test.ts`

Pick a parser by filename. (Size-wise families are added in 2b; here the router returns `null` for them so 2a can ship — they simply aren't ingested yet.)

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/ingest/parsers/__tests__/router.test.ts
import { routeFamily } from "../index";

describe("routeFamily", () => {
  it("classifies known filenames", () => {
    expect(routeFamily("ASSEMBLY REJECTION REPORT.xlsx")).toBe("assembly-daily");
    expect(routeFamily("01 REJECTION ANALYSIS-APRIL 2025.xlsx")).toBe("rejection-analysis");
    expect(routeFamily("COMMULATIVE 2025-26.xlsx")).toBe("cumulative");
    expect(routeFamily("YEARLY ANALYSIS.xlsx")).toBe("cumulative");
  });
  it("returns null for not-yet-supported size-wise files", () => {
    expect(routeFamily("1 APRIL 26.xlsx")).toBeNull();
  });
});
```

- [ ] **Step 2: Run → FAIL.**

- [ ] **Step 3: Implement**

```ts
// src/lib/ingest/parsers/index.ts
import type { SourceFamily } from "./types";

export { dedupeByPrecedence } from "./dedupe";
export { reconcileConflicts } from "./reconcile";
export { parseAssemblyDaily } from "./parse-assembly-daily";
export { parseRejectionAnalysis } from "./parse-rejection-analysis";
export * from "./types";

/** Decide the source family from a filename. null = not ingested in 2a. */
export function routeFamily(file: string): SourceFamily | null {
  const f = file.toLowerCase();
  if (/assembly/.test(f)) return "assembly-daily";
  if (/rejection analysis/.test(f)) return "rejection-analysis";
  if (/cumm?ulative|yearly/.test(f)) return "cumulative";
  return null; // size-wise per-size files handled in sub-phase 2b
}
```

- [ ] **Step 4: Run → PASS.**

- [ ] **Step 5: Commit** — `git add -A && git commit -m "feat(ingest): parser router by filename family"`

---

## Task 8: Seeding rewrite — remove ALL synthetic weights

**Files:**
- Create: `src/lib/store/seed.ts`
- Modify: `src/lib/store/index.ts` (replace the inline `seedStore` body with a call to the new module; delete `DEFECT_MIX`, `sizeWeights`, `sizeRecords`, and the hardcoded user path)
- Test: `src/lib/store/__tests__/seed.test.ts`

The new seeder: resolve the data root from `MOID_DATA_DIR` else repo `ANALYTICAL DATA/` (primary) + `DATA/` (supplementary); walk workbooks; route each via `routeFamily`; parse with the matching parser into `PrecededRecord[]`; `dedupeByPrecedence`; `emitMany(kept)`; `append`. **No synthetic size or defect generation anywhere.** Idempotent (early-return when store non-empty; append dedups on hash).

- [ ] **Step 1: Write a unit test for the pure assembly step (no FS)**

```ts
// src/lib/store/__tests__/seed.test.ts
import { recordsFromBuffer } from "../seed";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const FILE = join(process.cwd(), "DATA", "ASSEMBLY REJECTION REPORT.xlsx");
const maybe = existsSync(FILE) ? it : it.skip;

maybe("recordsFromBuffer routes assembly file to real records (no synthetic sizes)", () => {
  const recs = recordsFromBuffer(readFileSync(FILE), "ASSEMBLY REJECTION REPORT.xlsx");
  expect(recs.length).toBeGreaterThan(0);
  // strict-real: assembly records carry NO size (size detail only comes from size-wise files in 2b)
  expect(recs.every((p) => p.record.size == null)).toBe(true);
  expect(recs.every((p) => p.family === "assembly-daily")).toBe(true);
});
```

- [ ] **Step 2: Run → FAIL.**

- [ ] **Step 3: Implement `seed.ts`**

```ts
// src/lib/store/seed.ts
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join } from "node:path";
import { emitMany } from "@/lib/ingest/emit";
import {
  routeFamily, parseAssemblyDaily, parseRejectionAnalysis, dedupeByPrecedence,
  type PrecededRecord,
} from "@/lib/ingest/parsers";
import type { EventStore } from "./types";

/** Parse one workbook buffer into precedence-tagged records (no synthetic data). */
export function recordsFromBuffer(buf: Buffer, file: string): PrecededRecord[] {
  const family = routeFamily(file);
  if (family === "assembly-daily") {
    return parseAssemblyDaily(buf, file).records.map((record) => ({ record, family }));
  }
  if (family === "rejection-analysis") {
    return parseRejectionAnalysis(buf, file);
  }
  return []; // cumulative claims handled in 2c; size-wise in 2b
}

function walkXlsx(dir: string): string[] {
  if (!existsSync(dir)) return [];
  const out: string[] = [];
  for (const e of readdirSync(dir)) {
    if (e.startsWith("~$")) continue;
    const p = join(dir, e);
    if (statSync(p).isDirectory()) out.push(...walkXlsx(p));
    else if (e.toLowerCase().endsWith(".xlsx")) out.push(p);
  }
  return out;
}

function dataRoots(): string[] {
  const env = process.env.MOID_DATA_DIR;
  const roots = env ? [env] : [join(process.cwd(), "ANALYTICAL DATA"), join(process.cwd(), "DATA")];
  return roots.filter(existsSync);
}

/** Seed the durable store from real workbooks. Idempotent. */
export async function seedFromDisk(events: EventStore): Promise<void> {
  if (typeof window !== "undefined") return;
  if ((await events.effective()).length > 0) return;

  const all: PrecededRecord[] = [];
  for (const root of dataRoots()) {
    for (const file of walkXlsx(root)) {
      try { all.push(...recordsFromBuffer(readFileSync(file), file.split(/[\\/]/).pop()!)); }
      catch (e) { console.warn(`seed: skip ${file}:`, (e as Error).message); }
    }
  }
  const { kept, shadowed, claims } = dedupeByPrecedence(all);
  const out = emitMany(kept.map((p) => p.record));
  if (out.length) {
    const { inserted } = await events.append(out);
    console.log(`✓ seeded ${inserted} events from ${kept.length} records (${shadowed.length} shadowed, ${claims.length} claims) — no synthetic data`);
  }
}
```

- [ ] **Step 4: Wire `index.ts` to the new seeder and delete the synthetic code**

In `src/lib/store/index.ts`: replace the entire `seedStore` function body with a thin delegate, and remove the `DEFECT_MIX`, `sizeWeights`/`sizeRecords` blocks and the hardcoded `C:\\Users\\acer\\Documents\\MO!D...` path:

```ts
import { seedFromDisk } from "./seed";

function seedStore(eventsStore: EventStore) {
  if (typeof window !== "undefined") return;
  void seedFromDisk(eventsStore).catch((e) => console.error("seed failed:", e));
}
```

- [ ] **Step 5: Run tests + typecheck**

Run: `npx jest && npx tsc --noEmit`
Expected: green. The store-selector and Phase-1 tests are unaffected (memory backend; seed early-returns in tests because they don't assert seeded content, or the store is empty and seeding reads repo files — keep tests hermetic by NOT asserting seeded counts here).

- [ ] **Step 6: Commit** — `git add -A && git commit -m "feat(store): real-parser seeding; remove all synthetic size/defect weights"`

---

## Task 9: Surface reconcile conflicts as Findings on ingest

**Files:**
- Modify: `src/app/api/ingest/route.ts`
- Test: `src/app/api/__tests__/ingest-reconcile.test.ts` (pure reconcile wiring; no live store)

On Excel/manual commit, run `reconcileConflicts(existingForKeys, incoming)` and, for each conflict, upsert a Finding (`subtype: "value-conflict"`) so the steward clarifies instead of the data silently overwriting. Only write the reconciled `toWrite` set. (Detailed wiring steps mirror the existing route; the implementer reads `route.ts` and threads `reconcileConflicts` before `emitMany`, fetching existing events for the incoming keys via `events.effective({ from, to })`.)

- [ ] **Step 1–5:** TDD the conflict→Finding mapping as a pure helper `conflictsToFindings(conflicts, ingestionId)` first (unit-tested), then wire it into the route. Commit `feat(ingest): raise value-conflict Findings instead of overwriting on same-key commits`.

> NOTE: this task's pure helper is fully testable; the route wiring is integration glue verified by the controller running the app. If the implementer finds the Finding schema (`src/lib/contract/d3`) requires fields not derivable from a `Conflict`, report `NEEDS_CONTEXT` with the schema gap rather than inventing fields.

---

## Verification (sub-phase 2a)

- `npx jest` green incl. the new golden tests (assembly totals match the sheet's own total row).
- Controller live check: restart the app, confirm `/api/events` still `backend:"supabase"`; the dashboard's stage numbers now come from real assembly/rejection records; **size-wise and defect panels honestly show "no data" (no equal-% fabrication)** until 2b.
- Confirm no `DEFECT_MIX` / `sizeWeights` strings remain: `grep -rn "DEFECT_MIX\|sizeWeights" src/` → no matches.

## Out of scope (→ later sub-phases)
- Size-wise per-size + per-defect parsing → **2b**.
- Cumulative-as-claims + `DATA/` stage reports + registry/SOP reconciliation → **2c**.
- "No data" empty-state UI polish + charts → Phase 3.
