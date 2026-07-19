# Plan 2 — Dataset Registry (signature grouping)

**Spec:** `docs/superpowers/specs/2026-07-01-universal-schema-ingestion-design.md` component **[C]**.
**Builds on:** Plan 1 (`src/lib/schema/`). **Branch:** `feat/universal-schema-ingestion`.

## Goal

Group profiled tables sharing a `SchemaSignature` into **Datasets** — the logical units that will drive the View dropdown (~50 files/sheets → ~6 datasets). Pure and in-memory: no persistence, no UI, no DB in this plan. Order-independent by construction.

## Interfaces this consumes (already exist, do not change)
- `@/lib/schema/types`: `ColumnProfile`, `SchemaSignature`, `SchemaSignatureColumn`.
- `@/lib/schema/profile`: `profileTable(table) => { columns: ColumnProfile[] }`.
- `@/lib/schema/signature`: `computeSignature(columns) => SchemaSignature`.
- `@/lib/schema/from-workbook`: `buildProfilingTables(data, fileName) => ProfilingTable[]`.

Purity rule: only `from-workbooks.ts` may (transitively) touch `xlsx`. `types.ts`, `registry.ts`, `title.ts` stay pure.

---

## Task 1 — `src/lib/dataset/types.ts` (types only)

```typescript
// src/lib/dataset/types.ts
// Pure type definitions for the dataset registry. No logic.
import type { ColumnProfile, SchemaSignature, SchemaSignatureColumn } from "@/lib/schema/types";

/** One physical source (file + sheet) contributing rows to a dataset. */
export interface DatasetSource {
  fileName: string;
  sheetName: string;
  rowCount: number; // profiled SAMPLE row count (full-row ingestion is a later plan)
}

/** A logical dataset: all tables sharing one schema signature, collapsed into
 *  one view. This becomes the View-dropdown unit (replacing hardcoded stages). */
export interface Dataset {
  id: string;                       // = signature hash
  signatureHash: string;
  title: string;                    // deterministic human label (LLM refines later)
  columns: SchemaSignatureColumn[]; // the shared (role, name) basis
  sources: DatasetSource[];         // sorted, stable
  totalRows: number;                // sum of sampled source rowCounts
}

/** A profiled table ready to be grouped. */
export interface ProfiledTableInput {
  fileName: string;
  sheetName: string;
  signature: SchemaSignature;
  columns: ColumnProfile[];
  rowCount: number;
}
```

**Verify:** `npx tsc --noEmit -p tsconfig.json` clean. **Commit:** `feat(dataset): dataset-registry types`.

---

## Task 2 — `src/lib/dataset/title.ts` (deterministic title) + test (TDD)

Write the test first, watch it fail, then implement.

```typescript
// src/lib/dataset/__tests__/title.test.ts
import { deriveTitle } from "../title";
import type { DatasetSource } from "../types";
import type { SchemaSignatureColumn } from "@/lib/schema/types";

const cols: SchemaSignatureColumn[] = [
  { role: "dimension-date", name: "date" },
  { role: "measure", name: "quantity checked" },
  { role: "derived", name: "%" },
];
const src = (fileName: string, sheetName = "VISUAL"): DatasetSource => ({ fileName, sheetName, rowCount: 10 });

describe("deriveTitle", () => {
  it("extracts the shared meaningful phrase across a monthly file series", () => {
    const sources = [
      src("01 REJECTION ANALYSIS-APRIL 2025.xlsx"),
      src("02 REJECTION ANALYSIS-MAY 2025.xlsx"),
      src("03 REJECTION ANALYSIS-JUNE 2025.xlsx"),
    ];
    expect(deriveTitle(cols, sources).toLowerCase()).toContain("rejection");
    expect(deriveTitle(cols, sources).toLowerCase()).toContain("analysis");
  });

  it("strips month, size, year and sequence noise", () => {
    const t = deriveTitle(cols, [src("1 APRIL 26.xlsx", "16FR"), src("2 MAY 26.xlsx", "16FR")]);
    expect(t).not.toMatch(/\d/);
    expect(t.toLowerCase()).not.toContain("april");
  });

  it("falls back to a shape description when names carry no signal", () => {
    const t = deriveTitle(cols, [src("Sheet1.xlsx", "Sheet1")]);
    expect(t.toLowerCase()).toContain("measure");
  });
});
```

```typescript
// src/lib/dataset/title.ts
import type { DatasetSource } from "./types";
import type { SchemaSignatureColumn } from "@/lib/schema/types";

const MONTHS = /\b(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec|january|february|march|april|june|july|august|september|october|november|december)\b/gi;

/** Clean one file/sheet base name down to meaningful lowercase words. */
function words(name: string): string[] {
  const base = name.replace(/^.*[\\/]/, "").replace(/\.[a-z0-9]+$/i, "");
  const cleaned = base
    .replace(/\b\d+\s*fr\b|\bfr\s*\d+\b/gi, " ") // size tokens
    .replace(/\b3\s*way\b/gi, " ")
    .replace(MONTHS, " ")
    .replace(/\d+/g, " ")                         // sequence numbers, years
    .replace(/[^a-zA-Z ]+/g, " ")
    .toLowerCase();
  return cleaned.split(/\s+/).filter((w) => w.length >= 3);
}

const STOP = new Set(["report", "file", "the", "and", "for", "inspe", "inspection", "sheet", "data"]);

/** A deterministic, human-ish dataset title. The LLM refinement pass (spec [B])
 *  can later replace this; here we pick the most frequent meaningful word(s)
 *  shared across the source names, else describe the table shape. */
export function deriveTitle(columns: SchemaSignatureColumn[], sources: DatasetSource[]): string {
  const freq = new Map<string, number>();
  for (const s of sources) {
    for (const w of new Set(words(s.fileName))) {
      if (STOP.has(w)) continue;
      freq.set(w, (freq.get(w) ?? 0) + 1);
    }
  }
  const top = [...freq.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 3)
    .map((e) => e[0]);
  if (top.length > 0) {
    return top.map((w) => w[0].toUpperCase() + w.slice(1)).join(" ");
  }
  const measures = columns.filter((c) => c.role === "measure").length;
  const dims = columns.filter((c) => c.role === "dimension" || c.role === "dimension-date").length;
  return `Dataset (${measures} measures, ${dims} dimensions)`;
}
```

**Verify:** `npx jest src/lib/dataset/__tests__/title.test.ts` green. **Commit:** `feat(dataset): deterministic dataset title from source names`.

---

## Task 3 — `src/lib/dataset/registry.ts` (grouping) + test (TDD)

```typescript
// src/lib/dataset/__tests__/registry.test.ts
import { groupIntoDatasets } from "../registry";
import type { ProfiledTableInput } from "../types";
import type { SchemaSignature } from "@/lib/schema/types";

const sig = (hash: string): SchemaSignature => ({
  hash,
  columns: [
    { role: "dimension-date", name: "date" },
    { role: "measure", name: "qty" },
  ],
});
const input = (fileName: string, sheetName: string, hash: string, rowCount = 5): ProfiledTableInput => ({
  fileName, sheetName, signature: sig(hash), columns: [], rowCount,
});

describe("groupIntoDatasets", () => {
  it("collapses same-signature tables into one dataset with all sources", () => {
    const ds = groupIntoDatasets([
      input("apr.xlsx", "VISUAL", "aaaa", 10),
      input("may.xlsx", "VISUAL", "aaaa", 7),
    ]);
    expect(ds).toHaveLength(1);
    expect(ds[0].sources).toHaveLength(2);
    expect(ds[0].totalRows).toBe(17);
    expect(ds[0].id).toBe("aaaa");
  });

  it("keeps distinct signatures as distinct datasets", () => {
    const ds = groupIntoDatasets([input("a.xlsx", "S", "aaaa"), input("b.xlsx", "S", "bbbb")]);
    expect(ds).toHaveLength(2);
  });

  it("is order-independent (shuffled input → identical datasets)", () => {
    const a = [input("a.xlsx", "S1", "aaaa"), input("b.xlsx", "S2", "bbbb"), input("c.xlsx", "S3", "aaaa")];
    const b = [a[2], a[0], a[1]];
    expect(groupIntoDatasets(b)).toEqual(groupIntoDatasets(a));
  });
});
```

```typescript
// src/lib/dataset/registry.ts
import type { Dataset, DatasetSource, ProfiledTableInput } from "./types";
import { deriveTitle } from "./title";

/** Group profiled tables by schema-signature hash into datasets. Pure and
 *  order-independent: sources and datasets are sorted deterministically, so the
 *  same input set in any order yields deep-equal output. */
export function groupIntoDatasets(inputs: ProfiledTableInput[]): Dataset[] {
  const byHash = new Map<string, ProfiledTableInput[]>();
  for (const inp of inputs) {
    const arr = byHash.get(inp.signature.hash);
    if (arr) arr.push(inp);
    else byHash.set(inp.signature.hash, [inp]);
  }

  const datasets: Dataset[] = [];
  for (const [hash, group] of byHash) {
    const sources: DatasetSource[] = group
      .map((g) => ({ fileName: g.fileName, sheetName: g.sheetName, rowCount: g.rowCount }))
      .sort((a, b) => a.fileName.localeCompare(b.fileName) || a.sheetName.localeCompare(b.sheetName));
    const totalRows = sources.reduce((sum, s) => sum + s.rowCount, 0);
    const columns = group[0].signature.columns;
    datasets.push({
      id: hash,
      signatureHash: hash,
      title: deriveTitle(columns, sources),
      columns,
      sources,
      totalRows,
    });
  }

  // Stable order: largest datasets first, then alphabetical by title, then hash.
  return datasets.sort(
    (a, b) => b.totalRows - a.totalRows || a.title.localeCompare(b.title) || a.id.localeCompare(b.id),
  );
}
```

**Verify:** `npx jest src/lib/dataset/__tests__/registry.test.ts` green. **Commit:** `feat(dataset): group profiled tables into datasets by signature`.

---

## Task 4 — `src/lib/dataset/from-workbooks.ts` (adapter)

```typescript
// src/lib/dataset/from-workbooks.ts
import { buildProfilingTables } from "@/lib/schema/from-workbook";
import { profileTable } from "@/lib/schema/profile";
import { computeSignature } from "@/lib/schema/signature";
import { groupIntoDatasets } from "./registry";
import type { Dataset, ProfiledTableInput } from "./types";

export interface WorkbookInput {
  fileName: string;
  data: ArrayBuffer | Buffer;
}

/** End-to-end: raw workbooks → profiled tables → datasets grouped by signature.
 *  The only dataset file that (transitively) touches xlsx. */
export function datasetsFromWorkbooks(files: WorkbookInput[]): Dataset[] {
  const inputs: ProfiledTableInput[] = [];
  for (const f of files) {
    for (const table of buildProfilingTables(f.data, f.fileName)) {
      const { columns } = profileTable(table);
      const signature = computeSignature(columns);
      inputs.push({
        fileName: f.fileName,
        sheetName: table.sheetName,
        signature,
        columns,
        rowCount: table.rows.length,
      });
    }
  }
  return groupIntoDatasets(inputs);
}
```

**Verify:** `npx tsc --noEmit -p tsconfig.json` clean. **Commit:** `feat(dataset): adapter from workbooks to grouped datasets`.

---

## Task 5 — real-workbook integration test (TDD guard)

Guarded by folder presence (skips in CI without the corpus), mirroring Plan 1's `from-workbook.test.ts`.

```typescript
// src/lib/dataset/__tests__/from-workbooks.test.ts
import * as fs from "fs";
import * as path from "path";
import { datasetsFromWorkbooks } from "../from-workbooks";

const DIR = path.join(process.cwd(), "ANALYTICAL DATA", "REJECTION ANALYSIS 2025-26");
const maybe = fs.existsSync(DIR) ? describe : describe.skip;

maybe("datasetsFromWorkbooks (real corpus)", () => {
  const files = fs
    .readdirSync(DIR)
    .filter((f) => /REJECTION ANALYSIS.*\.xlsx$/i.test(f) && !f.startsWith("~$"))
    .map((f) => ({ fileName: f, data: fs.readFileSync(path.join(DIR, f)) as unknown as ArrayBuffer }));

  it("collapses the 12 monthly files' many sheets into far fewer datasets", () => {
    const ds = datasetsFromWorkbooks(files);
    // Each file has ~5 sheets → dozens of sheets total, but only a handful of
    // distinct signatures (Cummulative / Visual / Balloon / Valve / Final).
    expect(ds.length).toBeGreaterThan(0);
    expect(ds.length).toBeLessThan(files.length); // far fewer datasets than files
  });

  it("every dataset has a non-empty title and at least one source", () => {
    for (const d of datasetsFromWorkbooks(files)) {
      expect(d.title.trim().length).toBeGreaterThan(0);
      expect(d.sources.length).toBeGreaterThan(0);
    }
  });
});
```

**Verify:** `npx jest src/lib/dataset` green (integration runs if the corpus is present; report which). Then `npx jest` full suite — no regressions. **Commit:** `test(dataset): real-corpus grouping guard`.

---

## Done criteria
- `npx jest` full suite green (report counts).
- `npx tsc --noEmit` clean.
- No files touched outside `src/lib/dataset/`.
- Integration test ran (not skipped) locally and both assertions passed — report the actual dataset count vs sheet count.
