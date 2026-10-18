// Pair original + converted lots for Audit Trail.
// Converted identities are not listed as their own accordion; they hang
// off the original row as a convert half.

import { canonicalBatchId } from "@/lib/entry/batch-id";
import type { AuditBatchGroup } from "@/lib/analytics/audit-sessions";
import type { BatchConversion } from "./types";

export type AuditBatchGroupWithConvert = AuditBatchGroup & {
  conversion: BatchConversion | null;
  convertGroup: AuditBatchGroup | null;
};

function canon(batch: string): string {
  return canonicalBatchId(batch) || batch.trim().toUpperCase();
}

export function attachConversionHalves(
  groups: AuditBatchGroup[],
  conversions: BatchConversion[],
): AuditBatchGroupWithConvert[] {
  const byBatch = new Map<string, AuditBatchGroup>();
  for (const g of groups) byBatch.set(canon(g.batch), g);

  const outgoing = new Map<string, BatchConversion>();
  const convertedIds = new Set<string>();
  for (const c of conversions) {
    outgoing.set(canon(c.fromBatch), c);
    convertedIds.add(canon(c.toBatch));
  }

  const out: AuditBatchGroupWithConvert[] = [];
  for (const g of groups) {
    const key = canon(g.batch);
    if (convertedIds.has(key) && !outgoing.has(key)) continue;
    const conversion = outgoing.get(key) ?? null;
    const convertGroup = conversion ? byBatch.get(canon(conversion.toBatch)) ?? null : null;
    out.push({ ...g, conversion, convertGroup });
  }
  return out;
}
