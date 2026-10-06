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
  reason: string;
  createdAt: string;
  createdBy: string;
}

export interface CreateConversionInput {
  fromBatch: string;
  toSize: string;
  /** Optional override; default is the derived stem+new-size id. */
  toBatch?: string;
  changedQty: number;
  stageId: string;
  convertedOn: string;
  reason: string;
  createdBy: string;
}

export type ConversionErrorCode =
  | "invalid-from"
  | "invalid-to"
  | "same-size"
  | "stem-mismatch"
  | "already-converted"
  | "target-taken"
  | "cycle"
  | "reason-required"
  | "invalid-date"
  | "qty-invalid"
  | "stage-required";

export class ConversionError extends Error {
  readonly code: ConversionErrorCode;
  constructor(code: ConversionErrorCode, message: string) {
    super(message);
    this.name = "ConversionError";
    this.code = code;
  }
}

export interface LineageNode {
  batch: string;
  size: string;
  /** First identity on the chain. */
  origin: boolean;
  /** Incoming conversion that created this identity, if any. */
  via: BatchConversion | null;
}
