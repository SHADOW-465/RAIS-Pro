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
