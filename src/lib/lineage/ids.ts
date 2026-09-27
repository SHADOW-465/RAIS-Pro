// Read-only use of the plant's existing batch-ID helpers.
// This file must not change how Data Entry generates or canonicalises IDs.

import {
  buildBatchId,
  canonicalBatchId,
  isValidBatchId,
  parseBatchId,
  toDisplaySize,
} from "@/lib/entry/batch-id";

export function canonLot(raw: string | null | undefined): string | null {
  const c = canonicalBatchId(raw);
  return c && isValidBatchId(c) ? c : null;
}

export function sizeOfLot(batch: string): string | null {
  const p = parseBatchId(canonLot(batch) ?? batch);
  if (!p?.sizeFr) return null;
  return toDisplaySize(p.sizeFr);
}

/** Same start-date stem as `fromBatch`, new French size. `26I21-14` + 16Fr → `26I21-16`. */
export function proposedConvertedBatchId(fromBatch: string, newSize: string): string | null {
  const from = canonLot(fromBatch);
  if (!from) return null;
  const p = parseBatchId(from);
  if (!p) return null;
  return buildBatchId(p.date, newSize);
}

export function conversionId(fromBatch: string, toBatch: string): string {
  return `bc_${fromBatch}_${toBatch}`;
}

/** Live flow copy: `26I17-16 converted to 26I17-18`. */
export function conversionFlowLabel(fromBatch: string, toBatch: string): string {
  return `${fromBatch} converted to ${toBatch}`;
}

/** History list name: `26I17-16 CT 26I17-18`. */
export function conversionHistoryName(fromBatch: string, toBatch: string): string {
  return `${fromBatch} CT ${toBatch}`;
}

export function historyNameForLot(
  batch: string,
  conversions: { fromBatch: string; toBatch: string }[],
): string {
  const hit = conversions.find((c) => c.toBatch === batch);
  return hit ? conversionHistoryName(hit.fromBatch, hit.toBatch) : batch;
}
