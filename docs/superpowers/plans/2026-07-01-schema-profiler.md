# Schema Profiler & Signature — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a pure module that classifies each column of a parsed table by *semantic role* (using the formula dependency graph, not formula-presence) and emits a stable schema signature — fixing the bug where formula-linked raw measurements get discarded.

**Architecture:** A new isolated library `src/lib/schema/` with no UI/persistence/network dependencies. It takes a `ProfilingTable` (header + sampled cells with formulas) and returns `ColumnProfile[]` + `SchemaSignature`. A thin adapter builds `ProfilingTable`s from a workbook by reusing the existing header helpers in `src/lib/parser.ts`. Tested first against synthetic tables (fast, deterministic) and then against one real workbook.

**Tech Stack:** TypeScript, `xlsx` (SheetJS, already a dependency), Jest (`npx jest`). Pure functions only — must run in browser and Node (no `crypto`/`fs` in the core).

**Spec:** `docs/superpowers/specs/2026-07-01-universal-schema-ingestion-design.md` (components [B] Schema Profiler, and the `SchemaSignature` used by [C]).

---

## File Structure

| File | Responsibility |
|---|---|
| `src/lib/schema/types.ts` | All shared types: `ColumnRole`, `FormulaClass`, `ColumnProfile`, `ProfilingCell`, `ProfilingTable`, `SchemaSignature`. No logic. |
| `src/lib/schema/formula-class.ts` | `classifyFormula()` — one Excel formula string → `FormulaClass` (none / external-link / vertical-aggregate / row-derived). Pure string logic. |
| `src/lib/schema/profile.ts` | `profileColumn()` + `profileTable()` — combine name, value-type, and formula class into a `ColumnRole`. The core role decision. |
| `src/lib/schema/signature.ts` | `computeSignature()` + `stableHash()` — order-stable fingerprint over column roles+names. |
| `src/lib/schema/from-workbook.ts` | Adapter: `buildProfilingTables(buf, fileName)` — reuse `parser.ts` header detection, read per-cell `.f`, emit `ProfilingTable[]`. The only file that imports `xlsx`. |
| `src/lib/schema/__tests__/formula-class.test.ts` | Unit tests for `classifyFormula`. |
| `src/lib/schema/__tests__/profile.test.ts` | Unit tests for role classification (incl. the regression guard). |
| `src/lib/schema/__tests__/signature.test.ts` | Unit tests for signature stability. |
| `src/lib/schema/__tests__/from-workbook.test.ts` | Integration test against one real workbook (guarded by `fs.existsSync`). |

---

## Task 1: Shared types

**Files:**
- Create: `src/lib/schema/types.ts`

- [ ] **Step 1: Write the types file**

```typescript
// src/lib/schema/types.ts
// Pure type definitions for the schema profiler. No logic, no imports.

/** Semantic role of a column — what it MEANS, independent of whether Excel
 *  happened to fill it with a formula. This is the distinction that fixes the
 *  "formula-linked raw measurement gets discarded" bug. */
export type ColumnRole =
  | "dimension-date" // the table's time axis
  | "dimension"      // size, batch, category, low-cardinality label
  | "measure"        // a raw count/quantity an operator records (GROUND TRUTH)
  | "derived"        // a row-wise function of sibling columns (%, rate, row total)
  | "defect"         // a reason-code tally column
  | "meta";          // S.No, remarks, doc-control — ignored for signature

/** How a single cell's formula relates the cell to the rest of the table. */
export type FormulaClass =
  | { kind: "none" }
  | { kind: "external-link"; ref: string }        // ='[3]APRIL 25'!B9 → a LINKED RAW VALUE
  | { kind: "vertical-aggregate"; range: string } // =SUM(B6:B10)     → a subtotal cell
  | { kind: "row-derived"; refs: string[] };      // =F9/C9*100       → DERIVED from siblings

export interface ColumnProfile {
  name: string;        // normalized header
  index: number;       // 0-based column index within the table
  colLetter: string;   // Excel column letter (A, B, … AB)
  role: ColumnRole;
  type: "date" | "number" | "string" | "unknown";
  formula: FormulaClass | null; // dominant formula class across sampled data cells
}

/** One data cell as seen by the profiler. */
export interface ProfilingCell {
  value: unknown;
  formula: string | null; // verbatim Excel formula WITHOUT leading "=", or null
}

/** A rectangular table ready for profiling. Row/col indices are 0-based; the
 *  true Excel sheet row of `rows[r]` is `firstDataRow + r` (1-based). */
export interface ProfilingTable {
  sheetName: string;
  header: string[];        // normalized header, by column index
  colLetters: string[];    // Excel column letter, by column index
  firstDataRow: number;    // 1-based sheet row number of rows[0]
  rows: ProfilingCell[][]; // [rowIndex][colIndex]
}

export interface SchemaSignatureColumn {
  role: ColumnRole;
  name: string; // normalized name used in the fingerprint
}

export interface SchemaSignature {
  hash: string;                      // stable short hex hash
  columns: SchemaSignatureColumn[];  // the (role, name) basis, in column order
}
```

- [ ] **Step 2: Verify it compiles**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: no errors referencing `src/lib/schema/types.ts`.

- [ ] **Step 3: Commit**

```bash
git add src/lib/schema/types.ts
git commit -m "feat(schema): column-profile and signature types"
```

---

## Task 2: Formula classifier

**Files:**
- Create: `src/lib/schema/formula-class.ts`
- Test: `src/lib/schema/__tests__/formula-class.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// src/lib/schema/__tests__/formula-class.test.ts
import { classifyFormula } from "@/lib/schema/formula-class";

describe("classifyFormula", () => {
  it("returns none for no formula", () => {
    expect(classifyFormula(null, "B", 9)).toEqual({ kind: "none" });
  });

  it("classifies a cross-file/sheet link as external-link (NOT derived)", () => {
    // QUANTITY CHECKED in the analytical files is a formula but a RAW value.
    const r = classifyFormula("'[3]APRIL 25'!B9", "B", 9);
    expect(r.kind).toBe("external-link");
  });

  it("classifies a same-sheet cross reference with ! as external-link", () => {
    const r = classifyFormula("'APRIL 25'!B9", "B", 9);
    expect(r.kind).toBe("external-link");
  });

  it("classifies a vertical SUM range as vertical-aggregate", () => {
    const r = classifyFormula("SUM(B6:B10)", "B", 11);
    expect(r.kind).toBe("vertical-aggregate");
  });

  it("classifies a same-row sibling formula as row-derived", () => {
    // REJ% = F/C*100 in cell G9
    const r = classifyFormula("F9/C9*100", "G", 9);
    expect(r).toEqual({ kind: "row-derived", refs: expect.arrayContaining(["F", "C"]) });
  });

  it("classifies REJ QTY = C-(D+E) as row-derived, excluding self", () => {
    const r = classifyFormula("C9-(D9+E9)", "F", 9);
    expect(r.kind).toBe("row-derived");
    if (r.kind === "row-derived") {
      expect(r.refs.sort()).toEqual(["C", "D", "E"]);
    }
  });

  it("ignores a leading equals sign", () => {
    expect(classifyFormula("=SUM(B6:B10)", "B", 11).kind).toBe("vertical-aggregate");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest src/lib/schema/__tests__/formula-class.test.ts`
Expected: FAIL — "Cannot find module '@/lib/schema/formula-class'".

- [ ] **Step 3: Write the implementation**

```typescript
// src/lib/schema/formula-class.ts
import type { FormulaClass } from "./types";

/**
 * Classify ONE Excel formula by how it relates its cell to the rest of the table.
 *
 * The order matters and encodes the core insight of the profiler:
 *   1. Any "!" or "[n]" means a sheet/workbook reference → external-link.
 *      Such a cell is a LINKED RAW VALUE (e.g. QUANTITY CHECKED pulled from the
 *      daily book), NOT a derived metric — it must never be discarded.
 *   2. A vertical range (B6:B10) → a subtotal/aggregate cell.
 *   3. References to OTHER columns in the SAME row → genuinely derived.
 *
 * @param formula  verbatim formula, with or without a leading "="; null = none
 * @param selfCol  the column letter of the cell being classified (e.g. "G")
 * @param selfRow  the 1-based sheet row of the cell (e.g. 9)
 */
export function classifyFormula(
  formula: string | null,
  selfCol: string,
  selfRow: number,
): FormulaClass {
  if (formula == null) return { kind: "none" };
  let f = formula.trim();
  if (f.startsWith("=")) f = f.slice(1);
  if (f === "") return { kind: "none" };

  // 1. Sheet/workbook reference. In Excel, "!" only ever denotes a sheet ref,
  //    and "[n]" an external workbook — neither appears in plain arithmetic.
  if (f.includes("!") || /\[\d+\]/.test(f)) {
    const m = f.match(/(?:\[\d+\])?(?:'[^']*'|[A-Za-z0-9_ ]+)!\$?[A-Z]{1,3}\$?\d+/);
    return { kind: "external-link", ref: m ? m[0] : f };
  }

  // 2. Vertical aggregate range, e.g. SUM(B6:B10).
  const range = f.match(/\$?[A-Z]{1,3}\$?\d+\s*:\s*\$?[A-Z]{1,3}\$?\d+/);
  if (range) return { kind: "vertical-aggregate", range: range[0] };

  // 3. Same-row references to OTHER columns → derived.
  const refRe = /\$?([A-Z]{1,3})\$?(\d+)/g;
  const refs = new Set<string>();
  let mm: RegExpExecArray | null;
  while ((mm = refRe.exec(f)) !== null) {
    const col = mm[1];
    const row = Number(mm[2]);
    if (row === selfRow && col !== selfCol) refs.add(col);
  }
  if (refs.size > 0) return { kind: "row-derived", refs: [...refs] };

  return { kind: "none" };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest src/lib/schema/__tests__/formula-class.test.ts`
Expected: PASS (7 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/schema/formula-class.ts src/lib/schema/__tests__/formula-class.test.ts
git commit -m "feat(schema): classify Excel formulas by table relationship"
```

---

## Task 3: Column & table role profiler

**Files:**
- Create: `src/lib/schema/profile.ts`
- Test: `src/lib/schema/__tests__/profile.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// src/lib/schema/__tests__/profile.test.ts
import { profileTable } from "@/lib/schema/profile";
import type { ProfilingTable, ProfilingCell } from "@/lib/schema/types";

const cell = (value: unknown, formula: string | null = null): ProfilingCell => ({ value, formula });

// Helper: build a table from a header + array of row arrays of ProfilingCells.
function table(header: string[], colLetters: string[], rows: ProfilingCell[][]): ProfilingTable {
  return { sheetName: "T", header, colLetters, firstDataRow: 9, rows };
}

describe("profileTable", () => {
  it("keeps a formula-LINKED quantity column as a measure (regression guard)", () => {
    // The exact bug: QUANTITY CHECKED is filled by ='[3]APRIL 25'!B9 — a formula,
    // but a raw count. It must be a measure, never derived, never dropped.
    const t = table(
      ["DATE", "QUANTITY CHECKED", "REJECTION", "%"],
      ["A", "B", "C", "D"],
      [
        [cell("2025-04-01"), cell(10982, "'[3]APRIL 25'!B9"), cell(1054, "'[3]APRIL 25'!E9"), cell(9.6, "C9/B9*100")],
        [cell("2025-04-02"), cell(11054, "'[3]APRIL 25'!B10"), cell(828, "'[3]APRIL 25'!E10"), cell(7.5, "C10/B10*100")],
      ],
    );
    const { columns } = profileTable(t);
    const byName = Object.fromEntries(columns.map((c) => [c.name, c.role]));
    expect(byName["QUANTITY CHECKED"]).toBe("measure");
    expect(byName["REJECTION"]).toBe("measure");
    expect(byName["%"]).toBe("derived");
    expect(byName["DATE"]).toBe("dimension-date");
  });

  it("classifies a row-derived total column as derived", () => {
    const t = table(
      ["DATE", "VISUAL QTY", "TOTAL REJ QTY"],
      ["A", "B", "P"],
      [
        [cell("2025-04-01"), cell(10982), cell(2646, "D6+H6+L6+O6")],
      ],
    );
    const { columns } = profileTable(t);
    expect(columns.find((c) => c.name === "TOTAL REJ QTY")!.role).toBe("derived");
    expect(columns.find((c) => c.name === "VISUAL QTY")!.role).toBe("measure");
  });

  it("classifies a short reason code with numeric values as a defect column", () => {
    const t = table(
      ["DATE", "REC. QTY", "COAG", "SD"],
      ["A", "C", "H", "I"],
      [
        [cell("2025-06-01"), cell(500), cell(3), cell(1)],
        [cell("2025-06-02"), cell(480), cell(0), cell(2)],
      ],
    );
    const { columns } = profileTable(t);
    expect(columns.find((c) => c.name === "COAG")!.role).toBe("defect");
    expect(columns.find((c) => c.name === "SD")!.role).toBe("defect");
    expect(columns.find((c) => c.name === "REC. QTY")!.role).toBe("measure");
  });

  it("classifies a low-cardinality text column as a dimension", () => {
    const t = table(
      ["BATCH", "REC. QTY"],
      ["A", "B"],
      [
        [cell("B-101"), cell(500)],
        [cell("B-102"), cell(480)],
      ],
    );
    const { columns } = profileTable(t);
    expect(columns.find((c) => c.name === "BATCH")!.role).toBe("dimension");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest src/lib/schema/__tests__/profile.test.ts`
Expected: FAIL — "Cannot find module '@/lib/schema/profile'".

- [ ] **Step 3: Write the implementation**

```typescript
// src/lib/schema/profile.ts
import type {
  ColumnProfile,
  ColumnRole,
  FormulaClass,
  ProfilingCell,
  ProfilingTable,
} from "./types";
import { classifyFormula } from "./formula-class";

const DATE_NAME_RE = /\b(date|day|month|year|period|week|quarter)\b/i;
const META_NAME_RE = /s\.?\s*no|sr\.?\s*no|serial|remark|comment|doc\.?\s*no|supersed|effective|page\b|trolley|operator|supervisor/i;
const DERIVED_NAME_RE = /%|percent|\brate\b|\bfpy\b|\byield\b/i;
const MEASURE_NAME_RE = /\bqty\b|quantity|checked|\brec\.?\b|receiv|\baccept|\bacpt\b|\bgood\b|\bhold\b|\brej\b|reject|input|dispatch|produc|balloon|valve|visual|final/i;
const SIZE_NAME_RE = /^\s*\d{1,2}\s*fr\b|^fr\s*\d{1,2}\b|\bsize\b/i;
const SHORT_CODE_RE = /^[A-Z0-9/]{1,6}$/;

function looksSerialDate(nums: number[]): boolean {
  return nums.length >= 2 && nums.every((n) => n >= 40000 && n <= 60000);
}

/** Decide a column's value-type from its non-empty sampled cells. */
function columnType(cells: ProfilingCell[], name: string): ColumnProfile["type"] {
  const vals = cells.map((c) => c.value).filter((v) => v !== "" && v != null);
  if (vals.length === 0) return "unknown";
  if (DATE_NAME_RE.test(name)) return "date";
  const nums = vals.filter((v): v is number => typeof v === "number" && Number.isFinite(v));
  if (looksSerialDate(nums)) return "date";
  const isoish = vals.filter((v) => typeof v === "string" && /\d{4}-\d{2}-\d{2}|^\d{1,2}[\/-]\d{1,2}/.test(v));
  if (isoish.length >= vals.length * 0.5) return "date";
  if (nums.length >= Math.max(1, vals.length * 0.5)) return "number";
  return "string";
}

/** Pick the dominant non-"none" formula class across a column's data cells. */
function dominantFormulaClass(
  cells: ProfilingCell[],
  colLetter: string,
  firstDataRow: number,
): FormulaClass | null {
  const tally: Record<string, number> = { "external-link": 0, "vertical-aggregate": 0, "row-derived": 0 };
  const sample: Record<string, FormulaClass> = {};
  cells.forEach((c, idx) => {
    const fc = classifyFormula(c.formula, colLetter, firstDataRow + idx);
    if (fc.kind === "none") return;
    tally[fc.kind] += 1;
    if (!sample[fc.kind]) sample[fc.kind] = fc;
  });
  let best: string | null = null;
  for (const k of Object.keys(tally)) {
    if (tally[k] > 0 && (best === null || tally[k] > tally[best])) best = k;
  }
  return best ? sample[best] : null;
}

function classifyRole(
  name: string,
  type: ColumnProfile["type"],
  fclass: FormulaClass | null,
  cardinality: number,
): ColumnRole {
  const u = name.trim().toUpperCase();

  if (type === "date" || DATE_NAME_RE.test(name)) return "dimension-date";
  if (META_NAME_RE.test(name)) return "meta";

  // Derived: a row-wise function of siblings, OR a %/rate/yield by name.
  // NOTE: external-link and vertical-aggregate are deliberately NOT derived —
  // a linked cell is a raw value, an aggregate is a subtotal row artefact.
  if (fclass?.kind === "row-derived") return "derived";
  if (DERIVED_NAME_RE.test(name)) return "derived";

  // Explicit measure words win before the generic short-code → defect rule, so
  // "REJ QTY" / "REC. QTY" stay measures rather than being read as reason codes.
  if (MEASURE_NAME_RE.test(name) && type === "number") return "measure";

  // Defect: a short uppercase reason code carrying numeric tallies.
  if (type === "number" && SHORT_CODE_RE.test(u)) return "defect";

  if (SIZE_NAME_RE.test(name)) return "dimension";

  if (type === "number") return "measure";
  if (type === "string") return cardinality >= 2 && cardinality <= 50 ? "dimension" : "meta";
  return "meta";
}

export function profileColumn(table: ProfilingTable, index: number): ColumnProfile {
  const name = (table.header[index] ?? "").trim();
  const colLetter = table.colLetters[index] ?? "";
  const cells = table.rows.map((r) => r[index]).filter(Boolean) as ProfilingCell[];
  const nonEmpty = cells.filter((c) => c.value !== "" && c.value != null);
  const cardinality = new Set(nonEmpty.map((c) => String(c.value))).size;
  const type = columnType(cells, name);
  const formula = dominantFormulaClass(cells, colLetter, table.firstDataRow);
  const role = classifyRole(name, type, formula, cardinality);
  return { name, index, colLetter, role, type, formula };
}

export function profileTable(table: ProfilingTable): { columns: ColumnProfile[] } {
  const columns: ColumnProfile[] = [];
  for (let i = 0; i < table.header.length; i++) {
    if ((table.header[i] ?? "").trim() === "") continue;
    columns.push(profileColumn(table, i));
  }
  return { columns };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest src/lib/schema/__tests__/profile.test.ts`
Expected: PASS (4 tests). The regression guard ("keeps a formula-LINKED quantity column as a measure") is the one that proves the reported bug is fixed.

- [ ] **Step 5: Commit**

```bash
git add src/lib/schema/profile.ts src/lib/schema/__tests__/profile.test.ts
git commit -m "feat(schema): classify column roles by name, type, and formula graph"
```

---

## Task 4: Schema signature

**Files:**
- Create: `src/lib/schema/signature.ts`
- Test: `src/lib/schema/__tests__/signature.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// src/lib/schema/__tests__/signature.test.ts
import { computeSignature, stableHash } from "@/lib/schema/signature";
import type { ColumnProfile } from "@/lib/schema/types";

const col = (name: string, role: ColumnProfile["role"]): ColumnProfile => ({
  name, role, index: 0, colLetter: "A", type: "number", formula: null,
});

describe("stableHash", () => {
  it("is deterministic and isomorphic (no crypto/fs)", () => {
    expect(stableHash("abc")).toBe(stableHash("abc"));
    expect(stableHash("abc")).not.toBe(stableHash("abd"));
  });
});

describe("computeSignature", () => {
  it("is identical for two tables with the same roles+names (different data months)", () => {
    const a = [col("DATE", "dimension-date"), col("QUANTITY CHECKED", "measure"), col("%", "derived")];
    const b = [col("DATE", "dimension-date"), col("QUANTITY CHECKED", "measure"), col("%", "derived")];
    expect(computeSignature(a).hash).toBe(computeSignature(b).hash);
  });

  it("differs when a column role differs", () => {
    const a = [col("X", "measure")];
    const b = [col("X", "derived")];
    expect(computeSignature(a).hash).not.toBe(computeSignature(b).hash);
  });

  it("ignores meta columns so remarks/serials don't fragment the signature", () => {
    const withMeta = [col("DATE", "dimension-date"), col("REMARKS", "meta"), col("QTY", "measure")];
    const without = [col("DATE", "dimension-date"), col("QTY", "measure")];
    expect(computeSignature(withMeta).hash).toBe(computeSignature(without).hash);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest src/lib/schema/__tests__/signature.test.ts`
Expected: FAIL — "Cannot find module '@/lib/schema/signature'".

- [ ] **Step 3: Write the implementation**

```typescript
// src/lib/schema/signature.ts
import type { ColumnProfile, SchemaSignature } from "./types";

/** djb2 — a tiny, deterministic, isomorphic string hash (no Node crypto, so it
 *  runs identically in the browser and on the server). */
export function stableHash(s: string): string {
  let h = 5381;
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
  }
  return h.toString(16).padStart(8, "0");
}

function normalizeName(name: string): string {
  return name.toLowerCase().replace(/\s+/g, " ").trim();
}

/** Fingerprint a table by the ordered (role, normalized-name) of its non-meta
 *  columns. Meta columns (remarks, serials) are excluded so cosmetic noise does
 *  not fragment a logical dataset; data values never enter the signature. */
export function computeSignature(columns: ColumnProfile[]): SchemaSignature {
  const sigCols = columns
    .filter((c) => c.role !== "meta")
    .map((c) => ({ role: c.role, name: normalizeName(c.name) }));
  const basis = sigCols.map((c) => `${c.role}:${c.name}`).join("|");
  return { hash: stableHash(basis), columns: sigCols };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest src/lib/schema/__tests__/signature.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/schema/signature.ts src/lib/schema/__tests__/signature.test.ts
git commit -m "feat(schema): order-stable schema signature over column roles"
```

---

## Task 5: Workbook adapter

**Files:**
- Create: `src/lib/schema/from-workbook.ts`
- Reuse: `src/lib/parser.ts` (`detectHeaderRow`, `buildHeaderBlock`, `normalizeHeaders`, `colIndexToLabel`)

- [ ] **Step 1: Write the implementation**

```typescript
// src/lib/schema/from-workbook.ts
import * as XLSX from "xlsx";
import {
  detectHeaderRow,
  buildHeaderBlock,
  normalizeHeaders,
  colIndexToLabel,
} from "@/lib/parser";
import type { ProfilingCell, ProfilingTable } from "./types";

const MAX_SAMPLE_ROWS = 60;

/** Sheets that are templates or rollups, not primary data — skipped. */
const SKIP_SHEET_RE = /^\s*(formate|format|yearly|annual|cumul|summary|total|config|settings)\b/i;

/**
 * Build one ProfilingTable per data sheet of a workbook, reusing the existing
 * header-detection helpers and reading per-cell formulas (cell.f) so the
 * profiler can use the formula dependency graph. The ONLY file here that touches
 * xlsx — keeps the profiler core pure.
 */
export function buildProfilingTables(data: ArrayBuffer | Buffer, _fileName: string): ProfilingTable[] {
  const wb = XLSX.read(data, { cellFormula: true });
  const tables: ProfilingTable[] = [];

  for (const sheetName of wb.SheetNames) {
    if (SKIP_SHEET_RE.test(sheetName)) continue;
    const ws = wb.Sheets[sheetName];
    if (!ws) continue;

    const rawRows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" }) as unknown[][];
    if (rawRows.length === 0) continue;

    const headerRowIndex = detectHeaderRow(rawRows);
    const { header, dataStartIndex } = buildHeaderBlock(rawRows, headerRowIndex);
    const normalizedHeader = normalizeHeaders(header);
    const colLetters = normalizedHeader.map((_, i) => colIndexToLabel(i));
    const firstDataRow = dataStartIndex + 1; // 1-based sheet row of rows[0]

    const dataRows = rawRows.slice(dataStartIndex, dataStartIndex + MAX_SAMPLE_ROWS);
    const rows: ProfilingCell[][] = dataRows.map((row, rIdx) =>
      normalizedHeader.map((_, cIdx) => {
        const value = row[cIdx] ?? "";
        const ref = `${colLetters[cIdx]}${firstDataRow + rIdx}`;
        const cell = ws[ref];
        const formula = cell && typeof cell.f === "string" ? cell.f : null;
        return { value, formula } satisfies ProfilingCell;
      }),
    );

    const hasData = rows.some((r) => r.some((c) => c.value !== "" && c.value != null));
    if (!hasData) continue;

    tables.push({ sheetName, header: normalizedHeader, colLetters, firstDataRow, rows });
  }

  return tables;
}
```

- [ ] **Step 2: Verify it compiles**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: no errors in `src/lib/schema/from-workbook.ts`.

- [ ] **Step 3: Commit**

```bash
git add src/lib/schema/from-workbook.ts
git commit -m "feat(schema): adapter to build ProfilingTables from a workbook"
```

---

## Task 6: Integration test against a real workbook

**Files:**
- Test: `src/lib/schema/__tests__/from-workbook.test.ts`

- [ ] **Step 1: Write the test**

```typescript
// src/lib/schema/__tests__/from-workbook.test.ts
import * as fs from "fs";
import * as path from "path";
import { buildProfilingTables } from "@/lib/schema/from-workbook";
import { profileTable } from "@/lib/schema/profile";
import { computeSignature } from "@/lib/schema/signature";

// The real corpus lives outside src/. Guard so CI without the data still passes,
// while local runs validate the bug fix on genuine files.
const FILE = path.resolve(
  process.cwd(),
  "ANALYTICAL DATA/REJECTION ANALYSIS 2025-26/01 REJECTION ANALYSIS-APRIL 2025.xlsx",
);
const maybe = fs.existsSync(FILE) ? describe : describe.skip;

maybe("buildProfilingTables on the real April rejection-analysis workbook", () => {
  it("profiles the VISUAL sheet: linked counts are measures, % is derived", () => {
    const tables = buildProfilingTables(fs.readFileSync(FILE), path.basename(FILE));
    const visual = tables.find((t) => /visual/i.test(t.sheetName));
    expect(visual).toBeDefined();

    const { columns } = profileTable(visual!);
    const role = (re: RegExp) => columns.find((c) => re.test(c.name))?.role;

    // The exact regression: QUANTITY CHECKED & REJECTION are formula-LINKED raw
    // counts — they must survive as measures, not be dropped as "formula".
    expect(role(/quantity checked|checked/i)).toBe("measure");
    expect(role(/reject/i)).toBe("measure");
    expect(role(/^%$|percent/i)).toBe("derived");
  });

  it("produces a non-empty stable signature", () => {
    const tables = buildProfilingTables(fs.readFileSync(FILE), path.basename(FILE));
    const visual = tables.find((t) => /visual/i.test(t.sheetName))!;
    const sig = computeSignature(profileTable(visual).columns);
    expect(sig.hash).toMatch(/^[0-9a-f]{8}$/);
    expect(sig.columns.length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run the test**

Run: `npx jest src/lib/schema/__tests__/from-workbook.test.ts`
Expected: PASS if the `ANALYTICAL DATA/` folder is present (2 tests); SKIPPED otherwise. Locally it must PASS.

- [ ] **Step 3: Run the full suite to confirm no regressions**

Run: `npx jest`
Expected: all prior tests still pass plus the new schema tests.

- [ ] **Step 4: Commit**

```bash
git add src/lib/schema/__tests__/from-workbook.test.ts
git commit -m "test(schema): real-workbook integration guard for the measure-drop bug"
```

---

## Self-Review

**Spec coverage (component [B]):** column roles by name + value-type + formula graph ✅ (Task 3); "has a formula ≠ derived", external-links treated as measures ✅ (Tasks 2–3, regression guard); `SchemaSignature` for grouping ✅ (Task 4); AI-refinement layer is **explicitly deferred to Plan 2** (this plan ships the deterministic baseline the sanity gate will protect — consistent with the spec's "deterministic baseline + LLM under sanity gate"). No spec requirement in scope is left unimplemented.

**Placeholder scan:** none — every step carries complete code or an exact command.

**Type consistency:** `ColumnRole`, `FormulaClass`, `ColumnProfile`, `ProfilingTable`, `ProfilingCell`, `SchemaSignature` are defined once in Task 1 and used unchanged in Tasks 2–6. `profileTable` returns `{ columns }` in both its definition (Task 3) and all call sites (Tasks 4 test, 6). `classifyFormula(formula, selfCol, selfRow)` signature is identical across Tasks 2, 3.

---

## Roadmap — subsequent plans (not detailed here)

Each is its own spec-backed plan, in dependency order. This plan (Profiler) is the keystone they consume.

- **Plan 2 — Structural completion + AI refinement:** sub-table separation (the R/S/T weekly mini-table), `~$` lock-file skipping at upload, and the `tryModels` LLM role-refinement pass guarded by a sanity gate over the Task-3 baseline. Adds `npm run check:ai` coverage.
- **Plan 3 — Dataset Registry + dynamic Views:** group `ProfilingTable`s by signature into persisted `Dataset`s (new `datasets` table + migration); rewrite `AppShell` View dropdown to read detected Datasets instead of `DISPOSAFE_REGISTRY.stages`; fix the `/api/schema` hardcoded-fallback so clearing data clears views.
- **Plan 4 — Generic Dashboard builder:** `Dataset → DashboardConfig` from column roles (measures→KPIs/trends, dimensions→breakdowns, defect→Pareto), reusing editorial widgets.
- **Plan 5 — Domain Recognizer + integrated re-wire:** match signatures to known Disposafe stage profiles; feed recognized Datasets into the existing COPQ/SPC/FPY `Cumulative` dashboard.
- **Plan 6 — Schema-driven Data Entry:** generate editable grids from a Dataset's schema; new rows flow through the existing `emit` path.
