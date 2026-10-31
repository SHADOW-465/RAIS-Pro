// A converted lot only holds the pieces that moved to the new size. Any entry
// for it that checks more than that is wrong, whichever screen sent it.

import { canonLot } from "./ids";
import type { BatchConversion } from "./types";

type CappedRecord = {
  checked: { value: number } | null;
  customFields?: Record<string, unknown> | null;
};

/** The first record that checks more than its converted lot holds, as a sentence; null when all fit. */
export function convertedLotCapError(
  records: CappedRecord[],
  conversions: BatchConversion[],
): string | null {
  if (conversions.length === 0) return null;
  const byTo = new Map(conversions.map((c) => [c.toBatch, c]));
  for (const r of records) {
    const cf = r.customFields ?? {};
    const raw = cf.batch ?? cf.batchId ?? cf.batchNo;
    const lot = typeof raw === "string" ? canonLot(raw) : null;
    const conv = lot ? byTo.get(lot) : undefined;
    const checked = r.checked?.value ?? 0;
    // changedQty 0 is a row stored before quantities were recorded: unknown, not zero.
    if (conv && conv.changedQty > 0 && checked > conv.changedQty) {
      return (
        `Lot ${conv.toBatch} was converted from ${conv.fromBatch} with ${conv.changedQty.toLocaleString("en-US")} pieces, ` +
        `so ${checked.toLocaleString("en-US")} checked is more than it holds.`
      );
    }
  }
  return null;
}
