import { PRECEDENCE, type PrecededRecord } from "./types";

export interface DedupeResult {
  kept: PrecededRecord[];
  shadowed: PrecededRecord[];
  claims: PrecededRecord[];
}

// A stage on a given day is ONE physical inspection, regardless of how many
// size rows describe it. The size-wise files (per-FR rows) and the whole-line
// daily files (one row, size = null) report the SAME units — so the dedup
// identity is `stageId|date`, NOT `stageId|size|date`. Including size in the key
// was the double-counting bug: a null-size whole-line record and the per-Fr
// records never collided, so both survived and the stage total was counted
// twice (≈2× inflation observed on real data).
function groupKey(p: PrecededRecord): string {
  const r = p.record;
  return `${r.stageId}|${r.occurredOn.start}`;
}

/**
 * Collapse overlapping reports of the same stage·day to a single authoritative
 * SOURCE, keeping ALL of that source's rows (so a size-wise winner contributes
 * every per-Fr row, which sum to the stage total). Other families covering the
 * same stage·day are shadowed. Precedence: size-wise (40) is authoritative;
 * whole-line dailies only fill stage·days the size-wise files don't cover
 * (e.g. the Final stage, and months outside the size-wise date range).
 * `cumulative` (precedence 0) is never a count source — emitted as claims.
 */
export function dedupeByPrecedence(records: PrecededRecord[]): DedupeResult {
  const claims: PrecededRecord[] = [];
  const groups = new Map<string, PrecededRecord[]>();

  for (const p of records) {
    if (PRECEDENCE[p.family] === 0) { claims.push(p); continue; }
    const k = groupKey(p);
    const arr = groups.get(k);
    if (arr) arr.push(p);
    else groups.set(k, [p]);
  }

  const kept: PrecededRecord[] = [];
  const shadowed: PrecededRecord[] = [];

  for (const arr of groups.values()) {
    // Winning family = highest precedence present for this stage·day.
    let winningFamily = arr[0].family;
    for (const p of arr) {
      if (PRECEDENCE[p.family] > PRECEDENCE[winningFamily]) winningFamily = p.family;
    }
    // …and a SINGLE winning source file within that family. A stage·day's data
    // lives in exactly one monthly workbook, so if two same-family files both
    // cover it they are overlapping duplicates — keep one (deterministic
    // lexicographic tie-break) rather than summing both. Multiple rows/sizes
    // from that one file are all retained. This mirrors the read-side
    // canonicalizer so the seed store and the dashboard agree.
    const winners = arr.filter((p) => p.family === winningFamily);
    let winningFile = winners[0].record.source.file;
    for (const p of winners) if (p.record.source.file < winningFile) winningFile = p.record.source.file;
    for (const p of arr) {
      if (p.family === winningFamily && p.record.source.file === winningFile) kept.push(p);
      else shadowed.push(p);
    }
  }

  return { kept, shadowed, claims };
}
