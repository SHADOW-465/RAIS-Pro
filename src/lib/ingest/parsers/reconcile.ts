// src/lib/ingest/parsers/reconcile.ts
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
    const a = rejOf(prior);
    const b = rejOf(inc);
    if (a === b) continue; // identical → drop duplicate
    toWrite.push(inc);
    conflicts.push({
      stageId: inc.stageId,
      size: inc.size ?? null,
      day: inc.occurredOn.start,
      existing: a ?? 0,
      incoming: b ?? 0,
    });
  }
  return { toWrite, conflicts };
}
