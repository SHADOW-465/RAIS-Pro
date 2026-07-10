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
  /** Known Disposafe stage this dataset was recognized as (labeling only —
   *  never triggers auto-ingestion), or null when unrecognized. */
  recognizedStageId: string | null;
  /** Confidence behind recognizedStageId; null when recognizedStageId is null. */
  recognitionConfidence: number | null;
  recognitionBasis: "alias" | "heuristic" | null;
}

/** A profiled table ready to be grouped. */
export interface ProfiledTableInput {
  fileName: string;
  sheetName: string;
  signature: SchemaSignature;
  columns: ColumnProfile[];
  rowCount: number;
}

/** One data row's non-meta column values, as actually read from a source sheet.
 *  This is the ground truth a generic dashboard computes KPIs/trends from. Meta
 *  columns (remarks, serials) are excluded — they carry no analytical signal. */
export interface DatasetRow {
  datasetId: string;
  fileName: string;
  sheetName: string;
  rowIndex: number; // 0-based, stable within (fileName, sheetName) across re-uploads
  values: Record<string, string | number | null>; // column name -> raw value
}
