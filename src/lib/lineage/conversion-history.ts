// Conversion-page history is derived from persisted lineage rows plus the
// same Audit conversion lookup (explicit edge or same-stem CT inference).
// Ordinary production lots never qualify on their own.

import { batchOf, type AuditEventLike } from "@/lib/analytics/audit-sessions";
import { canonLot, historyNameForLot, sizeOfLot } from "./ids";
import type { AuditConversionLookup } from "./open-lot-groups";
import type { BatchConversion } from "./types";

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

function addLot(ids: Set<string>, raw: string | null | undefined) {
  if (!raw) return;
  const lot = canonLot(raw) ?? raw.trim().toUpperCase();
  if (lot) ids.add(lot);
}

function pairKey(from: string, to: string): string {
  return `${from}>${to}`;
}

/** A stored row is shown as conversion history only when identity, size change, qty, station, and date are present. */
export function isValidRecordedConversion(
  row: Partial<BatchConversion> | null | undefined,
): boolean {
  if (!row) return false;
  const from = canonLot(row.fromBatch);
  const to = canonLot(row.toBatch);
  if (!from || !to || from === to) return false;
  const fromSize = sizeOfLot(from);
  const toSize = sizeOfLot(to);
  if (!fromSize || !toSize || fromSize === toSize) return false;
  const qty = Number(row.changedQty);
  if (!Number.isInteger(qty) || qty <= 0) return false;
  if (!row.convertedOn || !ISO_DAY.test(row.convertedOn)) return false;
  if (!(row.stageId && String(row.stageId).trim())) return false;
  return true;
}

/**
 * Original + converted identities of recorded lineage rows and of lots Audit
 * classifies as converted (explicit edge or same-stem CT inference).
 */
export function conversionHistoryLotIds(
  conversions: BatchConversion[],
  lookup?: AuditConversionLookup | null,
): Set<string> {
  const ids = new Set<string>();
  for (const c of conversions) {
    if (!isValidRecordedConversion(c)) continue;
    addLot(ids, c.fromBatch);
    addLot(ids, c.toBatch);
  }
  if (lookup) {
    for (const info of Object.values(lookup.byBatch)) {
      if (!info?.isConverted) continue;
      addLot(ids, info.fromBatch);
      addLot(ids, info.toBatch);
      addLot(ids, info.batch);
    }
  }
  return ids;
}

/** Shop-floor CT label when Audit has one; otherwise the persisted history name. */
export function conversionHistoryLabel(
  batch: string,
  conversions: BatchConversion[],
  lookup?: AuditConversionLookup | null,
): string {
  const key = canonLot(batch) ?? batch.trim().toUpperCase();
  const info = lookup?.byBatch[key] ?? lookup?.byBatch[batch];
  if (info?.isConverted && info.displayCode) return info.displayCode;
  return historyNameForLot(batch, conversions);
}

/**
 * Unique original→converted pairs for the lineage table: recorded rows first,
 * then Audit-inferred CT relationships that are not already stored.
 */
export function lineageRowsForHistory(
  conversions: BatchConversion[],
  lookup?: AuditConversionLookup | null,
): BatchConversion[] {
  const rows: BatchConversion[] = [];
  const seen = new Set<string>();
  const push = (row: BatchConversion) => {
    const from = canonLot(row.fromBatch) ?? row.fromBatch.trim().toUpperCase();
    const to = canonLot(row.toBatch) ?? row.toBatch.trim().toUpperCase();
    if (!from || !to || from === to) return;
    const key = pairKey(from, to);
    if (seen.has(key)) return;
    seen.add(key);
    rows.push(row);
  };

  for (const c of conversions) {
    if (isValidRecordedConversion(c)) push(c);
  }

  if (lookup) {
    for (const info of Object.values(lookup.byBatch)) {
      if (!info?.isConverted) continue;
      const from = info.fromBatch;
      const to = info.toBatch && info.toBatch !== from ? info.toBatch : info.batch !== from ? info.batch : null;
      if (!from || !to || from === to) continue;
      if (info.explicitConversion && isValidRecordedConversion(info.explicitConversion)) {
        push(info.explicitConversion);
        continue;
      }
      push({
        id: `inferred_${from}_${to}`,
        fromBatch: from,
        toBatch: to,
        fromSize: sizeOfLot(from) ?? "",
        toSize: sizeOfLot(to) ?? "",
        changedQty: 0,
        stageId: "",
        convertedOn: "",
        reason: "Audit process track",
        createdAt: "",
        createdBy: "",
      });
    }
  }

  return rows;
}

/**
 * Ledger events that belong on Batch Conversion history.
 * A lot is included when it is the original or converted identity of a valid
 * lineage row, or of an Audit-identified converted lot.
 */
export function eventsForConversionHistory(
  events: AuditEventLike[],
  conversions: BatchConversion[],
  lookup?: AuditConversionLookup | null,
): AuditEventLike[] {
  const ids = conversionHistoryLotIds(conversions, lookup);
  if (ids.size === 0) return [];
  return events.filter((e) => {
    const raw = batchOf(e);
    const lot = canonLot(raw) ?? (typeof raw === "string" ? raw.trim().toUpperCase() : null);
    return !!lot && ids.has(lot);
  });
}
