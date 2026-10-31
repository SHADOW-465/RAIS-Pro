import {
  canonLot,
  conversionId,
  proposedConvertedBatchId,
  sizeOfLot,
} from "./ids";
import { parseBatchId } from "@/lib/entry/batch-id";
import { resolveStageId, STAGE_LABELS } from "@/core/ontology/plant-catalog";
import { conversionDateError, latestServerDay } from "./dates";
import { transferQtyError } from "./quantity-flow";
import {
  ConversionError,
  normalizeReasonCategory,
  type BatchConversion,
  type CreateConversionInput,
} from "./types";

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
  now = new Date(),
): BatchConversion {
  const reasonCategory = normalizeReasonCategory(input.reasonCategory);
  if (!reasonCategory) {
    throw new ConversionError(
      "reason-category-required",
      "Choose why the size changed: rework, regrade, or size reclassification.",
    );
  }
  const reasonNote = (input.reasonNote ?? "").trim();
  if (!reasonNote) {
    throw new ConversionError("reason-note-required", "Add a note saying what happened.");
  }
  const reason = `${reasonCategory}: ${reasonNote}`;

  const dateError = conversionDateError(input.convertedOn, latestServerDay(now));
  if (dateError) throw new ConversionError("invalid-date", dateError);

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

  if (input.lotKnown === false) {
    throw new ConversionError(
      "unknown-lot",
      `Lot ${fromBatch} has no entries in the ledger, so there is nothing to convert. Pick an existing lot.`,
    );
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

  // One conversion per lot (pending client decision). An identical repeat is
  // a no-op; anything else is refused loudly rather than keeping the old row.
  const already = outgoing(existing, fromBatch);
  if (already) {
    // A row stored before quantities were recorded has changedQty 0 (unknown),
    // so a repeat of it cannot be told apart from a changed quantity.
    if (already.toBatch === toBatch && (already.changedQty === changedQty || already.changedQty === 0)) {
      return already;
    }
    const was = `${fromBatch} was already converted to ${already.toBatch} (${already.changedQty.toLocaleString("en-US")} pieces).`;
    throw new ConversionError(
      "already-converted",
      already.toBatch === toBatch
        ? `${was} A lot can only be converted once, so the quantity cannot be changed to ${changedQty.toLocaleString("en-US")}.`
        : `${was} A lot can only be converted once, so it cannot also be converted to ${toBatch}.`,
    );
  }

  const taken = incoming(existing, toBatch);
  if (taken) {
    throw new ConversionError(
      "target-taken",
      `${toBatch} is already the converted identity of ${taken.fromBatch}.`,
    );
  }

  if (input.targetHasLedger) {
    throw new ConversionError(
      "target-has-ledger",
      `${toBatch} already has ledger entries. Converting into it would merge unrelated lots. Pick a new lot code that has no entries.`,
    );
  }

  // Cycle: converting into an ancestor, or onward into self via a loop.
  if (ancestors(existing, fromBatch).has(toBatch) || descendants(existing, toBatch).has(fromBatch)) {
    throw new ConversionError("cycle", `${fromBatch} and ${toBatch} are already on the same lineage.`);
  }

  if (input.eligibleQty !== undefined) {
    const label = STAGE_LABELS[stageId] ?? stageId;
    const over = transferQtyError(changedQty, input.eligibleQty, label);
    if (over) throw new ConversionError("qty-exceeds-eligible", over);
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
    reasonCategory,
    reasonNote,
    createdAt: new Date().toISOString(),
    createdBy: input.createdBy.trim() || "unknown",
  };
}
