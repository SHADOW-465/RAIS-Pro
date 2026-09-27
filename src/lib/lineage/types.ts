// Batch lineage — a size conversion of the SAME physical lot.
//
// Isolated from the event ledger. Analytics, Data Entry, Source Trace, and
// batch-ID generation never read this module. A plant that never records a
// conversion behaves exactly as it does today.

export interface BatchConversion {
  /** Stable id: `bc_<from>_<to>` so a repeat POST is a no-op. */
  id: string;
  fromBatch: string;
  toBatch: string;
  fromSize: string;
  toSize: string;
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
  | "invalid-date";

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
