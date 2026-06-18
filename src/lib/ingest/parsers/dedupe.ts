import { PRECEDENCE, type PrecededRecord } from "./types";

export interface DedupeResult {
  kept: PrecededRecord[];
  shadowed: PrecededRecord[];
  claims: PrecededRecord[];
}

function keyOf(p: PrecededRecord): string {
  const r = p.record;
  return `${r.stageId}|${r.size ?? "·"}|${r.occurredOn.start}`;
}

export function dedupeByPrecedence(records: PrecededRecord[]): DedupeResult {
  const claims: PrecededRecord[] = [];
  const best = new Map<string, PrecededRecord>();
  const shadowed: PrecededRecord[] = [];

  for (const p of records) {
    if (PRECEDENCE[p.family] === 0) { claims.push(p); continue; }
    const k = keyOf(p);
    const cur = best.get(k);
    if (!cur) { best.set(k, p); continue; }
    if (PRECEDENCE[p.family] > PRECEDENCE[cur.family]) {
      shadowed.push(cur);
      best.set(k, p);
    } else {
      shadowed.push(p);
    }
  }
  return { kept: [...best.values()], shadowed, claims };
}
