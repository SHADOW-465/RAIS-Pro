/**
 * D1 — Canonical Event & Data Contract: Zod definitions (FROZEN v1.0.0)
 *
 * Design artifact, companion to D1-data-contract.md. Not imported by app code
 * until the contract is frozen (decision gate after D1); then these move to
 * src/types/ + src/lib/schemas.ts per D4.
 *
 * Two strata:
 *  - Canonical schemas (stored events, registries): internal-only, idiomatic Zod.
 *  - Candidate* schemas (LLM-facing ingestion output): obey the cross-provider
 *    rules from src/lib/schemas.ts — .nullable() not .optional(), no literal
 *    int unions, no z.record(). The LLM only emits cell refs + role labels;
 *    deterministic code reads values out of the workbook.
 */
import { z } from "zod";

export const SCHEMA_VERSION = "1.0.0";

/* ------------------------------------------------------------------ */
/* Shared primitives                                                    */
/* ------------------------------------------------------------------ */

/**
 * A provenance locator string. Usually an A1 cell ref ("K30"), but also accepts
 * sheet-qualified refs from ingestion ("VISUAL!REJECTION12") and synthetic refs
 * from direct entry ("ENTRY!checked"). Kept permissive so every value can carry
 * an honest pointer back to where it came from.
 */
export const CellRef = z.string().min(1).max(160);

export const PeriodKind = z.enum(["day", "week", "month", "fiscal-year"]);

/** Business time. Weeks may cross months (VISUAL JULY 25); store real bounds. */
export const Period = z.object({
  kind: PeriodKind,
  start: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), // ISO date
  end: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),   // inclusive; == start for "day"
});

export const Provenance = z.object({
  file: z.string().min(1),
  fileHash: z.string().min(1), // sha256 of uploaded bytes
  sheet: z.string().min(1),    // verbatim, incl. " MAY 25" leading-space quirks
  tableId: z.string().min(1),  // "t1" default; "t2" for second block on sheet
  cells: z.array(CellRef).min(1),
  headerPath: z.array(z.string()), // verbatim header rows, top first
  rowLabel: z.string().nullable(), // verbatim col-A label
  formulaText: z.string().nullable(),
  cachedValue: z.union([z.string(), z.number()]).nullable(),
  externalRef: z.string().nullable(), // e.g. "[2]MAY25 PRIMARY OUTPUT!$E$36"
});

export const ConfidenceBasis = z.enum([
  "exact",
  "heuristic",
  "llm",
  "external-cached",
]);

export const Confidence = z
  .object({
    score: z.number().min(0).max(1),
    basis: ConfidenceBasis,
  })
  .refine(
    (c) => c.basis !== "external-cached" || c.score <= 0.5,
    "external-cached confidence is capped at 0.5"
  );

const envelopeFields = {
  eventId: z.string().min(1), // content hash of (type, payload, provenance)
  schemaVersion: z.string().min(1),
  ingestionId: z.string().min(1),
  occurredOn: Period,
  provenance: Provenance,
  confidence: Confidence,
  extractedBy: z.string().min(1), // "heuristic" | "llm:<model-id>"
  recordedAt: z.string().datetime(),
  supersededBy: z.string().nullable(), // set only via Correction
};

/* ------------------------------------------------------------------ */
/* Registries (per-client versioned config, not events)                 */
/* ------------------------------------------------------------------ */

export const StageDef = z.object({
  stageId: z.string().min(1),
  label: z.string().min(1),
  effectiveFrom: z.string().nullable(), // ISO date; eye-punching = "2025-11-01"
  effectiveTo: z.string().nullable(),
  upstream: z.array(z.string()), // stageIds; declared flow for D2 DAG checks
});

export const DefectDef = z.object({
  defectCode: z.string().min(1),
  label: z.string().min(1),
  aliases: z.array(z.string()).min(1), // enumerated, incl. observed misspellings
  stages: z.array(z.string()), // stageIds where this defect is reported
});

export const ClientRegistry = z.object({
  clientId: z.string().min(1),
  registryVersion: z.string().min(1),
  fiscalYearStartMonth: z.number().int().min(1).max(12), // Disposafe: 4 (April)
  stages: z.array(StageDef).min(1),
  defects: z.array(DefectDef),
  costConfig: z.lazy(() => CostConfig).nullable(), // §cost — optional, user-supplied
});

/**
 * Cost configuration — OPTIONAL, user-entered (MOID-SPEC §8).
 * The plant types a ₹/unit per stage (or a single finished cost) only IF they
 * want rejection-cost figures. Absent → cost UI hides; analytics never invent it.
 * Deterministic: rejectionCost = Σ rejectedQty × costPerUnit(stage).
 */
export const StageCost = z.object({
  stageId: z.string().min(1),
  costPerUnitInr: z.number().nonnegative(), // value-add cost at this stage
});
export const CostConfig = z.object({
  enabled: z.boolean(),                 // user toggles cost calculations on
  currency: z.string().min(1),          // "INR"
  finishedUnitCostInr: z.number().nonnegative().nullable(), // flat fallback
  perStage: z.array(StageCost),         // optional per-stage overrides
  reworkCostPerUnitInr: z.number().nonnegative().nullable(),
});
export type CostConfig = z.infer<typeof CostConfig>;

/** Disposafe v1 REJECTION stage set (rejection-only scope; MOID-SPEC §3). */
export const DISPOSAFE_STAGE_IDS = [
  "visual",          // 100% Visual Inspection (P17)
  "balloon",         // Balloon Inspection (P18)
  "valve-integrity", // Valve Integrity & Balloon Inspection (P20)
  "final",           // Final Inspection (P24)
] as const;

/* ------------------------------------------------------------------ */
/* Canonical events                                                     */
/* ------------------------------------------------------------------ */

export const Disposition = z.enum(["accepted", "rejected", "rework", "hold", "downgrade"]);
export const Unit = z.enum(["pcs", "trolleys"]);

export const ProductionEvent = z.object({
  ...envelopeFields,
  eventType: z.literal("production"),
  stageId: z.string().min(1),
  quantity: z.number().int().nonnegative(),
  unit: Unit,
  batchNo: z.string().nullable(), // VISUAL 4-2-25: "25A28"
  size: z.string().nullable(),    // "16FR"
});

export const InspectionEvent = z.object({
  ...envelopeFields,
  eventType: z.literal("inspection"),
  stageId: z.string().min(1),
  disposition: Disposition,
  quantity: z.number().int().nonnegative(),
  unit: Unit,
  batchNo: z.string().nullable(),
  size: z.string().nullable(),
});

export const RejectionEvent = z.object({
  ...envelopeFields,
  eventType: z.literal("rejection"),
  stageId: z.string().min(1),
  defectCode: z.string().nullable(), // registry id; null when unresolved → Finding
  defectCodeRaw: z.string().min(1),  // verbatim label, e.g. "Overlaping"
  quantity: z.number().int().nonnegative(),
  unit: Unit,
  batchNo: z.string().nullable(),
  size: z.string().nullable(),
});

export const CarryoverKind = z.enum([
  "hold-resolution",
  "period-bridge",
  "stage-handoff",
]);

const CarryoverRef = z.union([
  z.object({ kind: z.literal("period"), period: Period }),
  z.object({ kind: z.literal("stage"), stageId: z.string().min(1) }),
]);

export const CarryoverEvent = z.object({
  ...envelopeFields,
  eventType: z.literal("carryover"),
  carryoverKind: CarryoverKind,
  fromRef: CarryoverRef,
  toRef: CarryoverRef,
  quantity: z.number().int().nonnegative(),
  unit: Unit,
});

export const ClaimKind = z.enum(["sum", "percentage", "external-pull", "derived"]);
export const Aggregation = z.enum(["daily", "weekly", "monthly", "fiscal-year"]);

/**
 * A value the sheet computed/asserted (totals, %, cross-file pulls).
 * NEVER an analytics input — exists for D2 to recompute and compare.
 * statedValue keeps Excel error strings verbatim ("#DIV/0!").
 */
export const AggregateClaimEvent = z.object({
  ...envelopeFields,
  eventType: z.literal("aggregate-claim"),
  claimKind: ClaimKind,
  statedValue: z.union([z.number(), z.string()]),
  aggregation: Aggregation,
  aboutStageId: z.string().nullable(),
  aboutDefectCode: z.string().nullable(),
});

export const CorrectionEvent = z.object({
  ...envelopeFields,
  eventType: z.literal("correction"),
  supersedesEventId: z.string().min(1),
  replacementEventId: z.string().nullable(),
  reason: z.string().min(1),
  authorisedBy: z.string().min(1), // adjudication ref — never system-initiated
});

export const AnnotationAuthor = z.enum(["steward", "gm", "system"]);
export const AdjudicationVerdict = z.enum(["mistake", "intentional", "unsure"]);

export const AnnotationEvent = z.object({
  ...envelopeFields,
  eventType: z.literal("annotation"),
  targetEventIds: z.array(z.string()),
  targetCells: z.array(CellRef),
  text: z.string(),
  author: AnnotationAuthor,
  findingId: z.string().nullable(), // D3 wires this up
  verdict: AdjudicationVerdict.nullable(),
});

/** Unverifiable in v1: source workbook not provided (external cached refs). */
export const DispatchEvent = z.object({
  ...envelopeFields,
  eventType: z.literal("dispatch"),
  quantity: z.number().int().nonnegative(),
  unit: Unit,
});

export const CanonicalEvent = z.discriminatedUnion("eventType", [
  ProductionEvent,
  InspectionEvent,
  RejectionEvent,
  CarryoverEvent,
  AggregateClaimEvent,
  CorrectionEvent,
  AnnotationEvent,
  DispatchEvent,
]);
export type CanonicalEvent = z.infer<typeof CanonicalEvent>;

/* ------------------------------------------------------------------ */
/* LLM-facing candidate schemas (ingestion phase 1)                     */
/* ------------------------------------------------------------------ */
/* Cross-provider rules apply below: .nullable() not .optional(),       */
/* plain enums/strings, no numeric literal unions, no z.record().       */
/* The LLM classifies structure; it never transcribes quantities.       */

export const CandidateRowClass = z.enum([
  "data",
  "subtotal-weekly",
  "total-monthly",
  "percentage",
  "marker",
  "legend",
  "header",
  "doc-meta",
  "unknown",
]);

export const CandidateColumnRole = z.enum([
  "date",
  "batch-no",
  "size",
  "quantity-in",       // production/received/checked
  "quantity-accepted",
  "quantity-rejected",
  "quantity-hold",
  "quantity-downgrade",
  "defect-count",      // one defect category column
  "percentage",
  "remarks",
  "ignore",
]);

export const CandidateColumn = z.object({
  columnLetter: z.string().min(1),     // "A".."AI"
  role: CandidateColumnRole,
  stageIdGuess: z.string().nullable(), // must resolve against registry or → Finding
  defectLabelRaw: z.string().nullable(), // verbatim header for defect-count cols
  headerCells: z.array(z.string()),    // cell refs of the header text
});

export const CandidateTable = z.object({
  tableId: z.string().min(1),
  sheet: z.string().min(1),
  // Rectangle as strings to survive strict-mode quirks; validated by code after.
  topLeftCell: z.string().min(1),
  bottomRightCell: z.string().min(1),
  grain: z.enum(["day", "batch", "month"]),
  columns: z.array(CandidateColumn).min(1),
  rowClasses: z.array(
    z.object({
      rowNumber: z.number().int().positive(),
      rowClass: CandidateRowClass,
    })
  ),
});

export const CandidateSheetGraph = z.object({
  sheet: z.string().min(1),
  isTemplate: z.boolean(), // VISUAL "FORMATE" → true → skipped
  tables: z.array(CandidateTable),
});

export type CandidateSheetGraph = z.infer<typeof CandidateSheetGraph>;
