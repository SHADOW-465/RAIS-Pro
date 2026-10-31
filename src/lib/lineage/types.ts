// Batch lineage — a size conversion of PART of the same physical lot.
//
// Isolated from the event ledger. Analytics, Data Entry, Source Trace, and
// batch-ID generation never read this module. A plant that never records a
// conversion behaves exactly as it does today.
//
// Only `changedQty` pieces move to the new size, at `stageId`. The rest stay
// on the original lot. The converted lot is entered from that station forward.

export interface BatchConversion {
  /** Stable id: `bc_<from>_<to>` so a repeat POST is a no-op. */
  id: string;
  fromBatch: string;
  toBatch: string;
  fromSize: string;
  toSize: string;
  /** Pieces of the original lot that changed size. The remainder stays put. */
  changedQty: number;
  /** Station where the size change happens. Entry on the new lot starts here. */
  stageId: string;
  /** Business date the size change happened (YYYY-MM-DD). */
  convertedOn: string;
  /**
   * Display string kept for older readers: `rework: note` or just the category.
   * The category and the note are the real fields and are not edited in place.
   */
  reason: string;
  /** One of CONVERSION_REASON_CATEGORIES, or a later slug added to that list. */
  reasonCategory: string;
  /** Operator's words. Required on a new conversion. */
  reasonNote: string;
  createdAt: string;
  createdBy: string;
  /** Set by a GM undo. Active reads omit any row with this set. */
  reversedAt?: string | null;
  reversedBy?: string | null;
  reversalReason?: string | null;
}

/**
 * Why a size change happened. Text in the database, not an enum, so appending
 * a category here is enough — no migration. The picker and the server both
 * read this list.
 */
export const CONVERSION_REASON_CATEGORIES = [
  { id: "rework", label: "Rework" },
  { id: "regrade", label: "Regrade" },
  { id: "size-reclassification", label: "Size reclassification" },
] as const;

export function normalizeReasonCategory(raw: string | null | undefined): string | null {
  const s = (raw ?? "").trim().toLowerCase().replace(/[\s_]+/g, "-");
  if (!s) return null;
  return CONVERSION_REASON_CATEGORIES.some((c) => c.id === s) ? s : null;
}

export interface CreateConversionInput {
  fromBatch: string;
  toSize: string;
  /** Optional override; default is the derived stem+new-size id. */
  toBatch?: string;
  changedQty: number;
  stageId: string;
  convertedOn: string;
  /** Category id from CONVERSION_REASON_CATEGORIES. Free text is not a category. */
  reasonCategory: string;
  /** What happened, in the operator's words. */
  reasonNote: string;
  createdBy: string;
  /**
   * Pieces the ledger says the original lot can give up at `stageId`. Set by
   * the server from the ledger, never from the request body. When present,
   * planConversion rejects a larger `changedQty`.
   */
  eligibleQty?: number;
  /**
   * Whether the ledger has any entry for the original lot. Set by the server
   * from the ledger, never from the request body. `false` rejects the save.
   */
  lotKnown?: boolean;
  /**
   * Whether the ledger already has rows for the target lot. Set by the server
   * from the ledger, never from the request body. `true` rejects the save:
   * converting into an existing lot would merge unrelated work.
   */
  targetHasLedger?: boolean;
}

export type ConversionErrorCode =
  | "invalid-from"
  | "unknown-lot"
  | "invalid-to"
  | "same-size"
  | "stem-mismatch"
  | "already-converted"
  | "target-taken"
  | "cycle"
  | "reason-required"
  | "reason-category-required"
  | "reason-note-required"
  | "target-has-ledger"
  | "not-found"
  | "invalid-date"
  | "qty-invalid"
  | "qty-exceeds-eligible"
  | "stage-required";

export class ConversionError extends Error {
  readonly code: ConversionErrorCode;
  constructor(code: ConversionErrorCode, message: string) {
    super(message);
    this.name = "ConversionError";
    this.code = code;
  }
}

/**
 * The lineage table is missing (or out of date). Raised instead of quietly
 * keeping rows in server memory, where a restart would lose a recorded
 * conversion. The API maps it to 503.
 */
export class LineageUnavailableError extends Error {
  constructor(detail?: string, message?: string) {
    super(
      message ??
        ("Batch conversion storage is not set up on this server (the batch_conversions table is missing or out of date). " +
          "Nothing was saved. Ask an administrator to apply the batch_conversion_partial migration." +
          (detail ? ` [${detail}]` : "")),
    );
    this.name = "LineageUnavailableError";
  }
}

export const REASON_COLUMNS_MESSAGE =
  "Conversion was not saved. batch_conversions is missing reason_category and reason_note, so the reason could not be stored. " +
  "Nothing was saved. Apply migration 20261031130000_batch_conversion_reason.sql, then record the conversion again.";

export const REVERSAL_COLUMNS_MESSAGE =
  "Undo is not available. batch_conversions is missing reversed_at, reversed_by, and reversal_reason. " +
  "Nothing was changed. Apply migration 20261031120000_batch_conversion_reversal.sql.";

/** Append-only note that a conversion was reversed. The conversion row itself stays. */
export interface ConversionAudit {
  id: string;
  conversionId: string;
  action: "reversed";
  actor: string;
  reason: string;
  at: string;
  snapshot: BatchConversion;
}

export interface LineageNode {
  batch: string;
  size: string;
  /** First identity on the chain. */
  origin: boolean;
  /** Incoming conversion that created this identity, if any. */
  via: BatchConversion | null;
}
