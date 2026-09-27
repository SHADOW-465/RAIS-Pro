// Secondary trackability on the shop floor is two stations, in order:
//   1/2 Eye Punching
//   2/2 Hanging
//
// The lumped Data Entry row `secondary` (Secondary Production / P10–P14 qty)
// is the same department written as one number — it fills both slots so a
// plant that only types that row is not stuck at 0/1.

import { resolveStageId } from "@/core/ontology/plant-catalog";

function sameStage(a: string, b: string): boolean {
  if (a === b) return true;
  const ca = resolveStageId(a);
  const cb = resolveStageId(b);
  return Boolean(ca && cb && ca === cb);
}

export const SECONDARY_TRACK = [
  { stageId: "eye-punching", label: "Eye Punching" },
  { stageId: "hanging", label: "Hanging" },
] as const;

export type SecondaryTrack = {
  done: number;
  total: 2;
  complete: boolean;
  started: boolean;
  nextStageId: string | null;
  nextStageLabel: string | null;
};

function occupiedHas(occupied: Iterable<string>, stageId: string): boolean {
  for (const id of occupied) {
    if (sameStage(id, stageId)) return true;
  }
  return false;
}

export function secondaryTrack(occupied: Iterable<string>): SecondaryTrack {
  const lumped = occupiedHas(occupied, "secondary");
  const hits = SECONDARY_TRACK.map((st) => lumped || occupiedHas(occupied, st.stageId));
  const done = hits.filter(Boolean).length;
  const nextIdx = hits.findIndex((h) => !h);
  const next = nextIdx >= 0 ? SECONDARY_TRACK[nextIdx] : null;
  return {
    done,
    total: 2,
    complete: done === 2,
    started: done > 0,
    nextStageId: next?.stageId ?? null,
    nextStageLabel: next?.label ?? null,
  };
}
