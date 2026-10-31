// How many pieces of a lot may change size at a station, read from the ledger.
// Pure and read-only: the same grouping Data Entry history and the conversion
// form use, so the server and the screen cannot disagree. The banner, the
// original-lot panel and the server-side cap all read `stationQtyFromGroup`.

import {
  buildEntryRows,
  groupByBatchThenStage,
  type AuditBatchGroup,
  type AuditEventLike,
} from "@/lib/analytics/audit-sessions";
import { canonicalBatchId } from "@/lib/entry/batch-id";
import { sameStage } from "@/lib/entry/process-sequence";
import { eligibleTransferQty } from "./quantity-flow";

/** What one station recorded for one lot, summed over every row at that station. */
export type StationFigures = {
  checked: number;
  /** Passed forward: recorded accepted, else checked − rejected − hold. */
  accepted: number;
  hold: number;
  rejected: number;
  /** Pieces that may change size here. Same number as `accepted`. */
  available: number;
  rowCount: number;
};

/** The lot's group in an already-built grouping, matching by canonical lot code. */
export function findLotGroup(groups: AuditBatchGroup[], lot: string): AuditBatchGroup | null {
  const want = canonicalBatchId(lot) ?? lot.trim().toUpperCase();
  if (!want) return null;
  return (
    groups.find((g) => g.batch.trim().toUpperCase() === want || canonicalBatchId(g.batch) === want) ?? null
  );
}

/** Station figures for a lot group; null when the lot never reached that station. */
export function stationQtyFromGroup(
  group: AuditBatchGroup | null | undefined,
  stageId: string,
): StationFigures | null {
  const bucket = group?.stages.find((s) => sameStage(s.stageId, stageId)) ?? null;
  if (!bucket) return null;
  return {
    checked: bucket.checkedQty,
    accepted: bucket.acceptedQty,
    hold: bucket.holdQty,
    rejected: bucket.rejectedQty,
    available: eligibleTransferQty(bucket) ?? 0,
    rowCount: bucket.rowCount,
  };
}

/** True when the ledger holds at least one row for `lot`. */
export function lotExistsInEvents(events: AuditEventLike[], lot: string): boolean {
  return findLotGroup(groupByBatchThenStage(buildEntryRows(events)), lot) !== null;
}

/** Passed-forward pieces of `lot` at `stageId`; 0 when the lot never reached that station. */
export function eligibleQtyFromEvents(
  events: AuditEventLike[],
  lot: string,
  stageId: string,
): number {
  const group = findLotGroup(groupByBatchThenStage(buildEntryRows(events)), lot);
  return stationQtyFromGroup(group, stageId)?.available ?? 0;
}
