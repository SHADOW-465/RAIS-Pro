// How many pieces of a lot may change size at a station, read from the ledger.
// Pure and read-only: the same grouping Data Entry history and the conversion
// form use, so the server and the screen cannot disagree.

import {
  buildEntryRows,
  groupByBatchThenStage,
  type AuditEventLike,
} from "@/lib/analytics/audit-sessions";
import { canonicalBatchId } from "@/lib/entry/batch-id";
import { sameStage } from "@/lib/entry/process-sequence";
import { eligibleTransferQty } from "./quantity-flow";

/** Passed-forward pieces of `lot` at `stageId`; 0 when the lot never reached that station. */
export function eligibleQtyFromEvents(
  events: AuditEventLike[],
  lot: string,
  stageId: string,
): number {
  const want = canonicalBatchId(lot) ?? lot.trim().toUpperCase();
  const group = groupByBatchThenStage(buildEntryRows(events)).find(
    (g) => g.batch.trim().toUpperCase() === want || canonicalBatchId(g.batch) === want,
  );
  const bucket = group?.stages.find((s) => sameStage(s.stageId, stageId)) ?? null;
  return eligibleTransferQty(bucket) ?? 0;
}
