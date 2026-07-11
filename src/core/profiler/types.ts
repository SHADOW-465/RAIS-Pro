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
 *  true Excel sheet row of `rows[r]` is `firstDataRow + r` (1-based).
 *  A sheet with side-by-side table regions (e.g. the Balloon | Valve Integrity
 *  layout) yields one ProfilingTable per region — distinguished by tableId. */
export interface ProfilingTable {
  sheetName: string;
  /** "t1", "t2", … — region within the sheet. Absent ⇒ "t1" (single region). */
  tableId?: string;
  /** Group-header text spanning this region (e.g. "VALVE INTEGRITY"), if any.
   *  The strongest stage-identity signal a region carries. */
  regionLabel?: string | null;
  header: string[];        // normalized header, by column index
  colLetters: string[];    // Excel column letter, by column index (TRUE sheet letters)
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
