import {
  canonLot,
  conversionId,
  proposedConvertedBatchId,
  sizeOfLot,
} from "./ids";
import { parseBatchId } from "@/lib/entry/batch-id";
import { resolveStageId } from "@/core/ontology/plant-catalog";
import {
  ConversionError,
  type BatchConversion,
  type CreateConversionInput,
} from "./types";

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

function outgoing(rows: BatchConversion[], from: string): BatchConversion | undefined {
  return rows.find((r) => r.fromBatch === from);
}

function incoming(rows: BatchConversion[], to: string): BatchConversion | undefined {
  return rows.find((r) => r.toBatch === to);
}

/** Walk ancestors of `batch` (incoming edges). */
function ancestors(rows: BatchConversion[], batch: string): Set<string> {
  const seen = new Set<string>();
  let cur: string | undefined = batch;
  while (cur) {
    if (seen.has(cur)) break;
    seen.add(cur);
    cur = incoming(rows, cur)?.fromBatch;
  }
  return seen;
}

/** Walk descendants of `batch` (outgoing edges). */
function descendants(rows: BatchConversion[], batch: string): Set<string> {
  const seen = new Set<string>();
  let cur: string | undefined = batch;
  while (cur) {
    if (seen.has(cur)) break;
    seen.add(cur);
    cur = outgoing(rows, cur)?.toBatch;
  }
  return seen;
}

/**
 * Pure. Returns the row to insert, or throws ConversionError.
 * Existing rows are the only state this module consults — never the ledger.
 */
export function planConversion(
  input: CreateConversionInput,
  existing: BatchConversion[],
): BatchConversion {
  const reason = (input.reason ?? "").trim();
  if (!reason) throw new ConversionError("reason-required", "Record why the size changed.");

  if (!ISO_DAY.test(input.convertedOn ?? "")) {
    throw new ConversionError("invalid-date", "Conversion date must be YYYY-MM-DD.");
  }

  const changedQty = input.changedQty;
  if (!Number.isInteger(changedQty) || changedQty <= 0) {
    throw new ConversionError("qty-invalid", "Enter the exact quantity that changed size.");
  }
  const stageId = resolveStageId(input.stageId);
  if (!stageId) {
    throw new ConversionError("stage-required", "Choose the station where the size changes.");
  }

  const fromBatch = canonLot(input.fromBatch);
  if (!fromBatch) {
    throw new ConversionError("invalid-from", "Original batch ID is not a valid lot code.");
  }

  const toBatch = canonLot(input.toBatch || proposedConvertedBatchId(fromBatch, input.toSize) || "");
  if (!toBatch) {
    throw new ConversionError("invalid-to", "Converted batch ID could not be derived from the new size.");
  }

  const fromSize = sizeOfLot(fromBatch);
  const toSize = sizeOfLot(toBatch);
  if (!fromSize || !toSize) {
    throw new ConversionError("invalid-to", "Both lot codes must include a French size.");
  }
  if (fromSize === toSize) {
    throw new ConversionError("same-size", `Size is already ${fromSize}. Pick a different size.`);
  }

  const fromParts = parseBatchId(fromBatch);
  const toParts = parseBatchId(toBatch);
  if (!fromParts || !toParts || fromParts.date !== toParts.date) {
    throw new ConversionError(
      "stem-mismatch",
      "Converted lot must keep the original start date in the ID (only the size suffix changes).",
    );
  }

  const already = outgoing(existing, fromBatch);
  if (already) {
    if (already.toBatch === toBatch) return already;
    throw new ConversionError(
      "already-converted",
      `${fromBatch} already converted to ${already.toBatch}.`,
    );
  }

  const taken = incoming(existing, toBatch);
  if (taken) {
    throw new ConversionError(
      "target-taken",
      `${toBatch} is already the converted identity of ${taken.fromBatch}.`,
    );
  }

  // Cycle: converting into an ancestor, or onward into self via a loop.
  if (ancestors(existing, fromBatch).has(toBatch) || descendants(existing, toBatch).has(fromBatch)) {
    throw new ConversionError("cycle", `${fromBatch} and ${toBatch} are already on the same lineage.`);
  }

  return {
    id: conversionId(fromBatch, toBatch),
    fromBatch,
    toBatch,
    fromSize,
    toSize,
    changedQty,
    stageId,
    convertedOn: input.convertedOn,
    reason,
    createdAt: new Date().toISOString(),
    createdBy: input.createdBy.trim() || "unknown",
  };
}
