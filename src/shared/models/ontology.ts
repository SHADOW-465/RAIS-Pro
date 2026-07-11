// src/shared/models/ontology.ts
// The Manufacturing Ontology Document (MOD) — the single source of truth for
// what a workbook MEANS (ADD §8). A MOD is a versioned DATABASE ROW
// (mods.document holds ModDocument); this file is only its model.
//
// Catalog shapes (StageDef/DefectDef/SizeDef) are reused verbatim from the
// event contract so analytics/emit keep one vocabulary.

import { z } from "zod";
import { StageDef, DefectDef, SizeDef } from "@/lib/contract/d1";

/** What a resolved thing IS. Mirrors the profiler's ColumnRole universe plus
 *  sheet-level entities (stage). */
export const ModEntityKind = z.enum([
  "stage", "measure", "defect", "dimension", "size", "date", "derived", "meta",
]);

/** Which resolver rung produced the mapping (ADD §11 ladder). */
export const ResolvedBy = z.enum(["exact", "knowledge", "ontology", "rule", "llm", "user"]);

/** One resolved (or proposed) mapping: a verbatim source label → canonical meaning.
 *  EVERY profiled column/sheet gets an entity — nothing is ever omitted. */
export const ModEntity = z.object({
  entityId: z.string().min(1),                     // stable within the MOD
  kind: ModEntityKind,
  original: z.object({
    sheet: z.string(),
    colLetter: z.string().nullable(),              // null for sheet-level entities
    header: z.string(),                            // verbatim source label
  }),
  /** Canonical id, e.g. "REJECTED_QTY", "DEFECT:PINH", "STAGE:visual". Null =
   *  unresolved (kept visible, never dropped). */
  canonical: z.string().nullable(),
  subcategory: z.string().nullable(),
  confidence: z.number().min(0).max(1),
  resolvedBy: ResolvedBy,
  reason: z.string(),                              // human-readable basis (verification UI)
  verified: z.boolean(),                           // true only after staging acceptance
});

export const ModRelationshipKind = z.enum([
  "sheet-represents-stage", "column-measures", "defect-of-stage", "derived-from", "size-of-sheet",
]);

export const ModRelationship = z.object({
  kind: ModRelationshipKind,
  from: z.string().min(1),                         // entityId or sheet name
  to: z.string().min(1),                           // entityId or canonical id
});

export const ModFormula = z.object({
  sheet: z.string(),
  colLetter: z.string(),
  class: z.enum(["external-link", "vertical-aggregate", "row-derived"]),
  refs: z.array(z.string()),
  translated: z.string().nullable(),               // header-name form, e.g. "[REJ]/[CHECKED]*100"
});

/** Per-sheet layout captured for data-entry generation + view-source. */
export const ModLayout = z.object({
  sheet: z.string(),
  headerRows: z.array(z.array(z.union([z.string(), z.number()]).nullable())),
  merges: z.array(z.object({
    s: z.object({ r: z.number().int(), c: z.number().int() }),
    e: z.object({ r: z.number().int(), c: z.number().int() }),
  })),
  columnOrder: z.array(z.string()),                // entityIds in sheet column order
});

export const ModValidationRule = z.object({
  ruleId: z.string().min(1),
  expr: z.string().min(1),                         // over canonical ids, e.g. "CHECKED_QTY >= REJECTED_QTY"
  severity: z.enum(["critical", "warning", "info"]),
});

export const ModDocument = z.object({
  companyId: z.string().min(1),
  workbook: z.object({
    fileName: z.string(),
    fileHash: z.string(),                          // = snapshotId
    sheetNames: z.array(z.string()),
  }),
  entities: z.array(ModEntity),
  // Canonical catalogs derived from verified entities:
  stages: z.array(StageDef),
  defects: z.array(DefectDef),
  sizes: z.array(SizeDef),
  fiscalYearStartMonth: z.number().int().min(1).max(12),
  relationships: z.array(ModRelationship),
  formulas: z.array(ModFormula),
  layout: z.array(ModLayout),
  validation: z.array(ModValidationRule),
});

export const ModStatus = z.enum(["draft", "verified", "superseded"]);

/** One mods-table row. */
export const ModRow = z.object({
  modId: z.string().min(1),                        // lineage id (first snapshot hash)
  version: z.number().int().min(1),
  companyId: z.string().min(1),
  status: ModStatus,
  snapshotId: z.string().min(1),
  document: ModDocument,
  createdAt: z.string(),                           // ISO
  verifiedBy: z.string().nullable(),
  verifiedAt: z.string().nullable(),
  supersedes: z.number().int().nullable(),
});

export type ModEntityT = z.infer<typeof ModEntity>;
export type ModDocumentT = z.infer<typeof ModDocument>;
export type ModRowT = z.infer<typeof ModRow>;
export type ModStatusT = z.infer<typeof ModStatus>;
