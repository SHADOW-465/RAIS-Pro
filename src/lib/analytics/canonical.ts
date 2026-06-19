// Read-side canonicalizer — the single guarantee that the dashboard NEVER
// double-counts, no matter what is in the store (re-seeds, overlapping files,
// the same workbook uploaded twice, size-wise + whole-line covering the same
// stage·day). Applied once at the /api/events boundary so every screen benefits.
//
// Three collapses, in order, each keyed on the physical inspection a row
// represents — and crucially, NONE of them merge legitimately-distinct rows
// (multiple batches of the same size on the same day are summed, not collapsed):
//
//   1. Exact duplicate — same eventId means a byte-identical event (the eventId
//      is a content hash over type+date+provenance+payload). Re-seeds and
//      re-uploads of the same file collapse to one here.
//   2. Size tier — for a stageId·day, the per-FR-size rows (size != null) are
//      authoritative and SUM to the stage total, so the redundant whole-line
//      aggregate row (size == null) for that same stageId·day is dropped. If only
//      whole-line rows exist (the Final stage, or months with no size-wise file),
//      they are kept.
//   3. Source — if a stageId·day is still described by MORE THAN ONE source file
//      at the surviving tier (two overlapping workbooks), keep only the single
//      highest-precedence file's rows. Multiple rows/batches from ONE file are
//      retained (and summed by the selectors); only cross-file duplication is
//      removed. Source identity is provenance.file (NOT fileHash — disk-seeded
//      events all share fileHash "local").
//
// Non-countable events (dispatch, annotation, correction, aggregate-claim,
// carryover) pass through untouched.

import type { Event } from "@/lib/store/types";
// Import from the leaf types module (pure string/const, no xlsx) so the
// analytics barrel — pulled into many client screens — stays light.
import { routeFamily, PRECEDENCE } from "@/lib/ingest/parsers/types";

const COUNTABLE = new Set(["production", "inspection", "rejection"]);

function stageOf(e: Event): string | null {
  return "stageId" in e ? ((e as any).stageId as string) ?? null : null;
}
function sizeOf(e: Event): string | null {
  return "size" in e ? ((e as any).size as string | null) ?? null : null;
}
function dayOf(e: Event): string {
  return e.occurredOn?.start ?? "";
}
function fileOf(e: Event): string {
  return (e as any).provenance?.file ?? "";
}
function precedenceOf(file: string): number {
  const base = file.split(/[\\/]/).pop() ?? file;
  const fam = routeFamily(base);
  return fam ? (PRECEDENCE[fam] ?? 0) : 0;
}

/** Collapse the event ledger to one authoritative record per physical
 *  inspection. Order-independent and idempotent. */
export function canonicalizeEvents(events: Event[]): Event[] {
  // 1. Exact-duplicate collapse (same content hash).
  const byId = new Map<string, Event>();
  for (const e of events) byId.set(e.eventId, e);
  const deduped = [...byId.values()];

  const countable: Event[] = [];
  const other: Event[] = [];
  for (const e of deduped) {
    if (COUNTABLE.has(e.eventType) && stageOf(e) != null && dayOf(e)) countable.push(e);
    else other.push(e);
  }

  // 2 + 3. Per stage·day: pick the authoritative size tier, then the single
  // winning source file within that tier.
  const groups = new Map<string, Event[]>();
  for (const e of countable) {
    const k = `${stageOf(e)}|${dayOf(e)}`;
    (groups.get(k) ?? groups.set(k, []).get(k)!).push(e);
  }

  const kept: Event[] = [];
  for (const grp of groups.values()) {
    // 2. authoritative size tier
    const hasSized = grp.some((e) => sizeOf(e) != null);
    const tier = hasSized ? grp.filter((e) => sizeOf(e) != null) : grp;

    // 3. winning source file = highest precedence; deterministic tie-break.
    let winner: string | null = null;
    let winnerScore = -1;
    for (const e of tier) {
      const f = fileOf(e);
      const score = precedenceOf(f);
      if (score > winnerScore || (score === winnerScore && (winner === null || f < winner))) {
        winnerScore = score;
        winner = f;
      }
    }
    for (const e of tier) if (fileOf(e) === winner) kept.push(e);
  }

  return [...kept, ...other];
}
