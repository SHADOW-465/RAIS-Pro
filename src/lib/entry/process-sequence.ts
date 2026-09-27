// Data Entry follows the plant line: Dipping → Secondary → Assembly
// (Visual → Balloon → Valve → Final). A later station cannot be typed
// until the lot has a recorded quantity at the process before it.

import { canonicalBatchId } from "@/lib/entry/batch-id";
import { resolveStageId, stageCategoryOf } from "@/core/ontology/plant-catalog";
import {
  previousAcceptedStageId,
  schemaCategories,
  stationById,
  stationsIn,
  type ResolvedEntrySchema,
} from "@/lib/entry/entry-schema";
import { secondaryTrack } from "@/lib/entry/secondary-track";

export type ProcessEventLike = {
  stageId?: string;
  batchNo?: string | null;
  eventType?: string;
  quantity?: number;
  customFields?: Record<string, unknown> | null;
};

export type ProcessLocalRow = {
  batchId: string;
  stageId?: string | null;
  micro?: string | null;
  macro?: string | null;
  checked?: number;
};

export type ProcessGap = {
  code: "process-incomplete";
  missingLane: string;
  missingStationId: string;
  missingStationLabel: string;
  message: string;
  action: string;
};

function lotOfEvent(e: ProcessEventLike): string | null {
  const cf = e.customFields ?? {};
  const raw =
    (typeof e.batchNo === "string" && e.batchNo) ||
    (typeof cf.batch === "string" ? cf.batch : null) ||
    (typeof cf.batchId === "string" ? cf.batchId : null);
  return canonicalBatchId(typeof raw === "string" ? raw : null);
}

function sameLot(a: string | null | undefined, b: string | null | undefined): boolean {
  const ca = canonicalBatchId(a ?? null);
  const cb = canonicalBatchId(b ?? null);
  if (ca && cb) return ca === cb;
  const aa = (a ?? "").trim().toUpperCase();
  const bb = (b ?? "").trim().toUpperCase();
  return aa.length > 0 && aa === bb;
}

export function sameStage(a: string, b: string): boolean {
  if (a === b) return true;
  const ca = resolveStageId(a);
  const cb = resolveStageId(b);
  return Boolean(ca && cb && ca === cb);
}

/**
 * Stations this lot has already run — ledger (Excel or typed) plus unsynced
 * local shift rows. Any positive quantity counts; the gate is "was this
 * station entered", not "did it pass".
 */
export function occupiedStageIds(
  events: ProcessEventLike[],
  lot: string,
  local: ProcessLocalRow[] = [],
): Set<string> {
  const out = new Set<string>();
  if (!lot.trim()) return out;
  for (const e of events) {
    if (!sameLot(lotOfEvent(e) ?? e.batchNo, lot)) continue;
    if (!e.stageId) continue;
    if ((e.quantity ?? 0) <= 0) continue;
    out.add(e.stageId);
  }
  for (const row of local) {
    if (!sameLot(row.batchId, lot)) continue;
    if ((row.checked ?? 0) <= 0) continue;
    const sid = (row.stageId ?? "").trim() || (row.micro ?? "").trim();
    if (sid) out.add(sid);
  }
  return out;
}

export function lotHasStage(occupied: Set<string>, stageId: string): boolean {
  for (const id of occupied) {
    if (sameStage(id, stageId)) return true;
  }
  return false;
}

function lotHasLane(
  occupied: Set<string>,
  schema: ResolvedEntrySchema,
  lane: string,
): boolean {
  if (lane === "secondary") return secondaryTrack(occupied).started;
  return stationsIn(schema, lane).some((s) => lotHasStage(occupied, s.stageId));
}

function labelOf(schema: ResolvedEntrySchema, stageId: string): string {
  return stationById(schema, stageId)?.label?.replace(/\s*\(.*\)$/, "") || stageId;
}

function gapForStation(
  schema: ResolvedEntrySchema,
  stationId: string,
  lot: string,
): ProcessGap {
  const station = stationById(schema, stationId);
  const lane = station?.category || stageCategoryOf(stationId) || "primary";
  const label = labelOf(schema, stationId);
  const lotBit = lot.trim() ? `Lot ${lot.trim().toUpperCase()}` : "This lot";
  return {
    code: "process-incomplete",
    missingLane: lane,
    missingStationId: stationId,
    missingStationLabel: label,
    message: `${lotBit} has not been entered at ${label} yet. Complete the line in order: Dipping, then Secondary, then Assembly.`,
    action: `Open ${label} and save this lot there first.`,
  };
}

/**
 * The next station the operator must complete before `station`.
 * Null when this station is the start of the line, the prior steps are
 * already on the lot, or the row is being revised.
 */
export function missingProcessStep(opts: {
  lot: string;
  station: string;
  schema: ResolvedEntrySchema | null | undefined;
  occupied: Set<string>;
  editing?: boolean;
}): ProcessGap | null {
  const { lot, station, schema, occupied, editing } = opts;
  if (editing) return null;
  if (!schema) return null;
  const target = stationById(schema, station);
  if (!target) return null;

  const lanes = schemaCategories(schema).map((c) => c.id);
  const targetLaneIdx = lanes.indexOf(target.category);
  if (targetLaneIdx > 0) {
    for (let i = 0; i < targetLaneIdx; i++) {
      const lane = lanes[i];
      if (lotHasLane(occupied, schema, lane)) continue;
      const first = stationsIn(schema, lane)[0];
      if (!first) continue;
      return gapForStation(schema, first.stageId, lot);
    }
  }

  const prev = previousAcceptedStageId(schema, station);
  if (prev) {
    const prevStation = stationById(schema, prev);
    if (
      prevStation &&
      prevStation.category === target.category &&
      !lotHasStage(occupied, prev)
    ) {
      return gapForStation(schema, prevStation.stageId, lot);
    }
  }
  return null;
}

/** Final Inspection is the last gate on the lot. Saving it releases Memory
 *  so the next lot starts blank at Dipping. */
export function isLineCompleteStage(stageId: string): boolean {
  return resolveStageId(stageId) === "final";
}

/**
 * Whether the operator may open this station on the form.
 *
 * Existing entries are always open (inspection / correction). A GM may open
 * any station to walk the lot. Everyone else still cannot skip ahead into
 * an empty later station.
 */
export function mayOpenStation(opts: {
  lot: string;
  station: string;
  schema: ResolvedEntrySchema | null | undefined;
  occupied: Set<string>;
  editing?: boolean;
  inspectAll?: boolean;
}): { ok: true } | { ok: false; gap: ProcessGap } {
  if (opts.editing || opts.inspectAll) return { ok: true };
  if (lotHasStage(opts.occupied, opts.station)) return { ok: true };
  const gap = missingProcessStep({
    lot: opts.lot,
    station: opts.station,
    schema: opts.schema,
    occupied: opts.occupied,
  });
  if (!gap) return { ok: true };
  return { ok: false, gap };
}
