// TypeScript reference of the SQL in
// supabase/migrations/20261101120000_effective_events.sql.
//
// These functions do not call aggregate(), byStage(), or byDefect(). The jest
// suite compares their output to those selectors. If this file drifts from the
// migration, the numbers here drift from the database once that migration is
// applied — keep the two copies on the same rules.

import type { Event } from "@/lib/store/types";
import { collapseKey } from "@/core/ontology/normalize";
import { stripCanonicalPrefix, resolveDefectCode, type DefectAliasRef } from "./defect-alias";

export interface SqlTotalsOpts {
  /** Inclusive occurredOn.start lower bound. Null or omitted = no lower bound. */
  from?: string | null;
  /** Inclusive occurredOn.end (falling back to start) upper bound. */
  to?: string | null;
  /** Empty or omitted = every stage. Matches the RPC's empty-array behaviour. */
  stageIds?: string[] | null;
  reworkCountsAs?: "excluded" | "checked";
}

export interface SqlStageOpts extends SqlTotalsOpts {
  /**
   * Catalog order the server passes as p_stage_order (the ids from stagesFor).
   * Stages in the ledger but missing here are appended, sorted by id.
   */
  stageOrder?: string[] | null;
}

export interface SqlAlias extends DefectAliasRef {
  label?: string;
}

export interface SqlDailyRow {
  day: string;
  checked: number;
  good: number;
  rework: number;
  rejected: number;
}

export interface SqlStageRow {
  stageId: string;
  checked: number;
  good: number;
  rework: number;
  rejected: number;
}

export interface SqlDefectRow {
  defectCode: string | null;
  label: string;
  rejected: number;
  unresolved: boolean;
  pct: number;
  cumPct: number;
}

interface QtyParts {
  checked: number;
  good: number;
  rework: number;
  rejected: number;
  defectRej: number;
}

function qtyOf(e: Event): number {
  if (!("quantity" in e)) return 0;
  const q = (e as { quantity?: unknown }).quantity;
  return typeof q === "number" && Number.isFinite(q) ? q : 0;
}

function stageOf(e: Event): string | null {
  if (!("stageId" in e)) return null;
  const id = (e as { stageId?: string | null }).stageId;
  return id ?? null;
}

/** Same rule as batchCascadedAgg: a present batchNo is not replaced by customFields.batch. */
export function sqlBatchKey(e: Event): string | null {
  const raw = "batchNo" in e ? (e as { batchNo?: unknown }).batchNo : (e as { customFields?: { batch?: unknown } }).customFields?.batch;
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  return trimmed ? trimmed : null;
}

function inWindow(e: Event, from?: string | null, to?: string | null): boolean {
  const start = e.occurredOn?.start ?? "";
  const end = e.occurredOn?.end || start;
  if (from && (!start || start < from)) return false;
  if (to && (!end || end > to)) return false;
  return true;
}

function stageAllowed(e: Event, stageIds?: string[] | null): boolean {
  if (!stageIds || stageIds.length === 0) return true;
  const sid = stageOf(e);
  return sid != null && stageIds.includes(sid);
}

/**
 * Rows a correction has superseded. The correction row itself stays.
 * Same predicate as effective_events and MemoryEventStore.effective().
 */
export function effectiveEvents(events: Event[]): Event[] {
  const superseded = new Set<string>();
  for (const e of events) {
    if (e.eventType !== "correction") continue;
    const id = (e as { supersedesEventId?: string }).supersedesEventId;
    if (id) superseded.add(id);
  }
  if (superseded.size === 0) return events;
  return events.filter((e) => !superseded.has(e.eventId));
}

function countable(events: Event[], opts: SqlTotalsOpts): Event[] {
  return effectiveEvents(events).filter((e) => {
    if (e.eventType !== "production" && e.eventType !== "inspection" && e.eventType !== "rejection") return false;
    if (!inWindow(e, opts.from, opts.to)) return false;
    if (!stageAllowed(e, opts.stageIds)) return false;
    return true;
  });
}

function addParts(into: QtyParts, e: Event): void {
  const q = qtyOf(e);
  if (e.eventType === "production") into.checked += q;
  else if (e.eventType === "inspection" && (e as { disposition?: string }).disposition === "rejected") into.rejected += q;
  else if (e.eventType === "inspection" && (e as { disposition?: string }).disposition === "accepted") into.good += q;
  else if (e.eventType === "inspection" && (e as { disposition?: string }).disposition === "rework") into.rework += q;
  else if (e.eventType === "rejection") into.defectRej += q;
}

function finishParts(parts: QtyParts, reworkCountsAs: "excluded" | "checked"): { checked: number; good: number; rework: number; rejected: number } {
  const rejected = parts.rejected === 0 && parts.defectRej > 0 ? parts.defectRej : parts.rejected;
  const checked = reworkCountsAs === "checked" ? parts.checked + parts.rework : parts.checked;
  return { checked, good: parts.good, rework: parts.rework, rejected };
}

function emptyParts(): QtyParts {
  return { checked: 0, good: 0, rework: 0, rejected: 0, defectRej: 0 };
}

/** totals_daily: one row per occurredOn.start. */
export function totalsDaily(events: Event[], opts: SqlTotalsOpts = {}): SqlDailyRow[] {
  const policy = opts.reworkCountsAs ?? "excluded";
  const byDay = new Map<string, QtyParts>();
  for (const e of countable(events, opts)) {
    const day = e.occurredOn?.start;
    if (!day) continue;
    const cur = byDay.get(day) ?? emptyParts();
    addParts(cur, e);
    byDay.set(day, cur);
  }
  return [...byDay.keys()]
    .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))
    .map((day) => ({ day, ...finishParts(byDay.get(day)!, policy) }));
}

function orderedStages(present: string[], stageOrder?: string[] | null): string[] {
  const ids = [...new Set(present)];
  if (!stageOrder || stageOrder.length === 0) return ids.sort((a, b) => a.localeCompare(b));
  const rank = new Map(stageOrder.map((id, i) => [id, i]));
  return ids.sort((a, b) => {
    const ia = rank.get(a) ?? 100000;
    const ib = rank.get(b) ?? 100000;
    if (ia !== ib) return ia - ib;
    return a.localeCompare(b);
  });
}

/** totals_stage: unbatched sums plus the batch cascade in batchCascadedAgg. */
export function totalsStage(events: Event[], opts: SqlStageOpts = {}): SqlStageRow[] {
  const policy = opts.reworkCountsAs ?? "excluded";
  const rows = countable(events, opts).filter((e) => stageOf(e) != null);
  const order = orderedStages(
    rows.map((e) => stageOf(e)!),
    opts.stageOrder,
  );
  const acc = new Map<string, { checked: number; good: number; rework: number; rejected: number }>();
  for (const sid of order) acc.set(sid, { checked: 0, good: 0, rework: 0, rejected: 0 });

  const byBatch = new Map<string, Map<string, Event[]>>();
  const unbatched = new Map<string, Event[]>();
  for (const e of rows) {
    const sid = stageOf(e)!;
    const key = sqlBatchKey(e);
    const target = key ? (byBatch.get(key) ?? byBatch.set(key, new Map()).get(key)!) : unbatched;
    const list = target.get(sid);
    if (list) list.push(e);
    else target.set(sid, [e]);
  }

  for (const [sid, list] of unbatched) {
    const cur = acc.get(sid);
    if (!cur) continue;
    const a = finishParts(list.reduce((p, e) => (addParts(p, e), p), emptyParts()), policy);
    cur.checked += a.checked;
    cur.good += a.good;
    cur.rework += a.rework;
    cur.rejected += a.rejected;
  }

  for (const stageEvents of byBatch.values()) {
    const present = order.filter((sid) => stageEvents.has(sid));
    let initialChecked = 0;
    let prevAccepted: number | null = null;
    for (let i = 0; i < present.length; i++) {
      const sid = present[i]!;
      const a = finishParts(stageEvents.get(sid)!.reduce((p, e) => (addParts(p, e), p), emptyParts()), policy);
      if (i === 0) initialChecked = a.checked;
      let checked = a.checked;
      let good = a.good > 0 ? a.good : Math.max(0, checked - a.rejected);
      if (i > 0 && prevAccepted != null && prevAccepted > 0 && (checked === initialChecked || checked === 0)) {
        checked = prevAccepted;
        good = Math.max(0, checked - a.rejected);
      }
      prevAccepted = good;
      const cur = acc.get(sid);
      if (!cur) continue;
      cur.checked += checked;
      cur.good += good;
      cur.rework += a.rework;
      cur.rejected += a.rejected;
    }
  }

  return order
    .map((stageId) => ({ stageId, ...acc.get(stageId)! }))
    .filter((r) => r.checked > 0 || r.rejected > 0);
}

function aliasLabel(code: string, aliases: SqlAlias[]): string {
  const norm = collapseKey(code);
  for (const a of aliases) {
    const id = stripCanonicalPrefix(a.canonicalId);
    const keyNorm = collapseKey(a.key);
    const idNorm = collapseKey(id);
    if ((idNorm && idNorm === norm) || (keyNorm && keyNorm === norm)) {
      const label = a.label?.trim();
      if (label) return label;
    }
  }
  return code;
}

/** totals_defect: rejection rows, alias resolution, Pareto pct. */
export function totalsDefect(events: Event[], opts: SqlTotalsOpts & { aliases?: SqlAlias[] | null } = {}): SqlDefectRow[] {
  const aliases = opts.aliases ?? [];
  const refs: DefectAliasRef[] = aliases;
  const sums = new Map<string, { code: string | null; label: string; qty: number; unresolved: boolean; bucket: string }>();
  for (const e of countable(events, opts)) {
    if (e.eventType !== "rejection") continue;
    const raw = String((e as { defectCodeRaw?: string }).defectCodeRaw ?? "").trim();
    const stored = ((e as { defectCode?: string | null }).defectCode ?? "") || "";
    const hit = resolveDefectCode(stored || null, raw, refs);
    let bucket: string;
    let code: string | null;
    let unresolved: boolean;
    let label: string;
    if (hit.code) {
      code = hit.code;
      unresolved = false;
      label = aliasLabel(hit.code, aliases);
      bucket = `code:${hit.code}`;
    } else if (raw) {
      code = null;
      unresolved = true;
      label = `${raw} · unresolved`;
      bucket = `raw:${raw}`;
    } else {
      code = null;
      unresolved = false;
      label = "Unclassified";
      bucket = "unclassified";
    }
    const cur = sums.get(bucket) ?? { code, label, qty: 0, unresolved, bucket };
    cur.qty += qtyOf(e);
    sums.set(bucket, cur);
  }
  const total = [...sums.values()].reduce((a, s) => a + s.qty, 0);
  let cum = 0;
  return [...sums.values()]
    .sort((a, b) => b.qty - a.qty || (a.bucket < b.bucket ? -1 : a.bucket > b.bucket ? 1 : 0))
    .map((s) => {
      const pct = total > 0 ? (s.qty / total) * 100 : 0;
      cum += pct;
      return { defectCode: s.code, label: s.label, rejected: s.qty, unresolved: s.unresolved, pct, cumPct: cum };
    });
}
