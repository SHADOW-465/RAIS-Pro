// src/shared/models/workbook.ts
// The lossless workbook snapshot — Step 1 of the MOD pipeline (ADD §4.1).
// The reader NEVER decides, ignores, renames, or deletes: this is Excel as JSON.
// Stored in workbook_snapshots.content; content-addressed by file-bytes SHA-256.

import { z } from "zod";

/** One populated cell, sparse-addressed by 0-based row/col. */
export const SnapshotCell = z.object({
  r: z.number().int().min(0),
  c: z.number().int().min(0),
  /** Raw value as parsed (dates stay Excel serial numbers — lossless). */
  v: z.union([z.string(), z.number(), z.boolean()]).nullable(),
  /** xlsx cell type: b|n|d|s|e|z */
  t: z.string(),
  /** Verbatim formula without leading "=", or null. */
  f: z.string().nullable(),
  /** Formatted text as Excel displayed it, or null. */
  w: z.string().nullable(),
  /** Number format string (e.g. "dd-mm-yyyy"), or null. */
  z: z.string().nullable(),
});

export const SnapshotMerge = z.object({
  s: z.object({ r: z.number().int(), c: z.number().int() }),
  e: z.object({ r: z.number().int(), c: z.number().int() }),
});

export const SnapshotSheet = z.object({
  name: z.string(),
  /** Used range (!ref), or null for an empty sheet. */
  ref: z.string().nullable(),
  cells: z.array(SnapshotCell),
  merges: z.array(SnapshotMerge),
  /** Column widths (wch), by column index — null when the file carries none. */
  colWidths: z.array(z.number().nullable()).nullable(),
});

export const WorkbookSnapshot = z.object({
  /** SHA-256 hex of the file bytes — the content address. */
  snapshotId: z.string().length(64),
  fileName: z.string(),
  sheets: z.array(SnapshotSheet),
});

export type SnapshotCellT = z.infer<typeof SnapshotCell>;
export type SnapshotSheetT = z.infer<typeof SnapshotSheet>;
export type WorkbookSnapshotT = z.infer<typeof WorkbookSnapshot>;
