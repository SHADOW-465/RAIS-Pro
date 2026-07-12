// src/core/ingest/reconcile.ts — relocated from the deleted parsers dir (live ingest logic).
import type { StageDayRecord } from "@/lib/ingest/emit";

export interface Conflict {
  stageId: string;
  size: string | null;
  day: string;
  existing: number;
  incoming: number;
}

export interface ReconcileResult {
  toWrite: StageDayRecord[];
  conflicts: Conflict[];
}

const keyOf = (r: StageDayRecord) => `${r.stageId}|${r.size ?? "·"}|${r.occurredOn.start}`;
const rejOf = (r: StageDayRecord) => r.rejected?.value ?? null;
const valOf = (sv: { value: number } | null | undefined) => sv?.value ?? null;

// A "duplicate to drop" must match on every countable field, not just
// rejected — comparing rejected alone treated a record as identical whenever
// ONLY checked/acceptedGood/rework had changed (e.g. an edit that corrects
// Checked Qty but leaves Rejected the same), silently discarding the edit
// with zero events emitted and no error.
function isIdentical(a: StageDayRecord, b: StageDayRecord): boolean {
  return valOf(a.checked) === valOf(b.checked)
    && valOf(a.rejected) === valOf(b.rejected)
    && valOf(a.acceptedGood) === valOf(b.acceptedGood)
    && valOf(a.rework) === valOf(b.rework);
}

export function reconcileConflicts(existing: StageDayRecord[], incoming: StageDayRecord[]): ReconcileResult {
  const byKey = new Map<string, StageDayRecord>();
  for (const e of existing) byKey.set(keyOf(e), e);

  const toWrite: StageDayRecord[] = [];
  const conflicts: Conflict[] = [];

  for (const inc of incoming) {
    const k = keyOf(inc);
    const prior = byKey.get(k);
    if (!prior) {
      toWrite.push(inc);
      continue;
    }
    if (isIdentical(prior, inc)) continue; // nothing changed → drop duplicate

    toWrite.push(inc);
    // The Finding/adjudication signal is specifically about Rejected
    // disagreeing between two sources — a checked-only edit still writes
    // (above) but doesn't need a GM-adjudicated conflict raised for it.
    const a = rejOf(prior);
    const b = rejOf(inc);
    if (a !== b) {
      conflicts.push({
        stageId: inc.stageId,
        size: inc.size ?? null,
        day: inc.occurredOn.start,
        existing: a ?? 0,
        incoming: b ?? 0,
      });
    }
  }
  return { toWrite, conflicts };
}
