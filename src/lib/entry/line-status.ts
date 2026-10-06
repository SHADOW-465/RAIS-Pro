// Live line tracker for Data Entry: how far this lot has walked
// Dipping → Secondary → Assembly, and which station opens next.

import { canonicalBatchId, isValidBatchId } from "@/lib/entry/batch-id";
import {
  schemaCategories,
  stationById,
  stationsIn,
  type ResolvedEntrySchema,
} from "@/lib/entry/entry-schema";
import { lotHasStage, sameStage, stageIsBefore } from "@/lib/entry/process-sequence";
import { SECONDARY_TRACK, secondaryTrack } from "@/lib/entry/secondary-track";

export type LaneStatus = {
  id: string;
  label: string;
  done: number;
  total: number;
  complete: boolean;
  started: boolean;
  nextStationId: string | null;
  /** Earlier process on a converted lot. It stays on the original batch. */
  waived?: boolean;
};

export type LineStatus = {
  lot: string | null;
  isBlank: boolean;
  isNew: boolean;
  isComplete: boolean;
  lanes: LaneStatus[];
  nextStationId: string | null;
  nextStationLabel: string | null;
  nextLaneId: string | null;
  headline: string;
};

function shortLabel(schema: ResolvedEntrySchema, stageId: string): string {
  return stationById(schema, stageId)?.label?.replace(/\s*\(.*\)$/, "") || stageId;
}

export function laneCaption(lane: LaneStatus): string {
  if (lane.waived) return "On original lot";
  if (lane.total === 0) return "";
  if (lane.complete) {
    return lane.total > 1 ? `${lane.done}/${lane.total} completed` : "Completed";
  }
  if (!lane.started) return "Not started";
  return `${lane.done}/${lane.total} complete`;
}

function headlineFor(status: Omit<LineStatus, "headline">): string {
  if (status.isBlank) {
    return "Enter a lot code. New lots start at Production Dipping.";
  }
  const lot = status.lot!;
  if (status.isNew) {
    return `New lot ${lot} — start at ${status.nextStationLabel ?? "Production Dipping"}.`;
  }
  if (status.isComplete) {
    return `Lot ${lot} is complete on the line.`;
  }
  const current = status.lanes.find((l) => l.id === status.nextLaneId);
  if (current?.started && !current.complete) {
    return `${current.label} ${current.done}/${current.total} complete. Next: ${status.nextStationLabel}.`;
  }
  const lastDone = [...status.lanes].reverse().find((l) => l.complete);
  if (lastDone) {
    return `${lastDone.label} completed. Next: ${status.nextStationLabel}.`;
  }
  return `Next: ${status.nextStationLabel}.`;
}

/**
 * Status of one lot on the plant line. Occupied ids are ledger + unsynced
 * local rows (alias-aware: production-dipping counts as dipping).
 */
export function buildLineStatus(opts: {
  lot: string;
  schema: ResolvedEntrySchema;
  occupied: Set<string>;
  /** Converted lot: the station where the size changed. Earlier stations are waived. */
  entryFromStageId?: string | null;
}): LineStatus {
  const raw = opts.lot.trim().toUpperCase();
  const lot = isValidBatchId(raw) ? (canonicalBatchId(raw) ?? raw) : raw || null;
  const isBlank = !lot || !isValidBatchId(lot);
  const entryFrom = (opts.entryFromStageId ?? "").trim();
  const waived = (stageId: string) => Boolean(entryFrom) && stageIsBefore(stageId, entryFrom);
  const lanes: LaneStatus[] = schemaCategories(opts.schema).map((cat) => {
    const label = cat.label.replace(/\s*\(.*\)$/, "");
    if (cat.id === "secondary" && !entryFrom) {
      const track = isBlank
        ? {
            done: 0,
            total: 2 as const,
            complete: false,
            started: false,
            nextStageId: "eye-punching",
          }
        : secondaryTrack(opts.occupied);
      return {
        id: cat.id,
        label,
        done: track.done,
        total: track.total,
        complete: track.complete,
        started: track.started,
        nextStationId: track.nextStageId,
      };
    }
    const stations = stationsIn(opts.schema, cat.id);
    const live = stations.filter((s) => !waived(s.stageId));
    if (!isBlank && stations.length > 0 && live.length === 0) {
      return {
        id: cat.id,
        label,
        done: stations.length,
        total: stations.length,
        complete: true,
        started: true,
        nextStationId: null,
        waived: true,
      };
    }
    const counted = entryFrom ? live : stations;
    const done = counted.filter((s) => lotHasStage(opts.occupied, s.stageId)).length;
    const next = isBlank
      ? null
      : (counted.find((s) => !lotHasStage(opts.occupied, s.stageId))?.stageId ?? null);
    return {
      id: cat.id,
      label,
      done,
      total: counted.length,
      complete: counted.length > 0 && done === counted.length,
      started: done > 0,
      nextStationId: next,
    };
  });

  let nextStationId: string | null = null;
  let nextLaneId: string | null = null;
  if (isBlank) {
    const first = lanes[0];
    const firstSt = first ? stationsIn(opts.schema, first.id)[0] : undefined;
    nextStationId = firstSt?.stageId ?? null;
    nextLaneId = first?.id ?? null;
  } else {
    for (const lane of lanes) {
      if (lane.nextStationId) {
        nextStationId = lane.nextStationId;
        nextLaneId = lane.id;
        break;
      }
    }
  }

  const isNew = !isBlank && lanes.every((l) => !l.started);
  const isComplete = !isBlank && lanes.length > 0 && lanes.every((l) => l.total === 0 || l.complete);
  const nextStationLabel = nextStationId
    ? (SECONDARY_TRACK.find((s) => s.stageId === nextStationId)?.label ??
      shortLabel(opts.schema, nextStationId))
    : null;

  const base: Omit<LineStatus, "headline"> = {
    lot: isBlank ? null : lot,
    isBlank,
    isNew,
    isComplete,
    lanes,
    nextStationId,
    nextStationLabel,
    nextLaneId,
  };
  let headline = headlineFor(base);
  if (
    entryFrom &&
    lot &&
    nextStationId &&
    sameStage(nextStationId, entryFrom) &&
    !lotHasStage(opts.occupied, entryFrom)
  ) {
    headline = `Converted lot ${lot} — enter from ${nextStationLabel} through the end of the line.`;
  }
  return { ...base, headline };
}
