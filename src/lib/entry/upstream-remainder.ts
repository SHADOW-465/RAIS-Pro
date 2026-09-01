// How many units the previous gate of a lot has passed forward, minus what
// this gate has already checked on other days. Data Entry prefills Checked
// from this so Balloon on the 4th still sees Visual accepted on the 1st–3rd.

import { canonicalBatchId } from "@/lib/entry/batch-id";
import { passedForward } from "@/lib/entry/passed-forward";
import { resolveStageId } from "@/core/ontology/plant-catalog";
import type { IdentifiableEvent } from "@/lib/entry/identity";

export interface UpstreamEvent extends IdentifiableEvent {
  eventType?: string;
  disposition?: string;
  quantity?: number;
  size?: string | null;
}

export interface UpstreamRemainder {
  previousAccepted: number;
  alreadyChecked: number;
  remaining: number;
}

function lotOf(e: UpstreamEvent): string | null {
  const cf = e.customFields ?? {};
  const raw =
    (typeof e.batchNo === "string" && e.batchNo) ||
    (typeof cf.batch === "string" ? cf.batch : null) ||
    (typeof cf.batchId === "string" ? cf.batchId : null);
  return canonicalBatchId(raw);
}

function dayOf(e: UpstreamEvent): string {
  return e.occurredOn?.start ?? "";
}

function sameStation(a: string | undefined, b: string): boolean {
  if (!a) return false;
  if (a === b) return true;
  const ca = resolveStageId(a);
  const cb = resolveStageId(b);
  return !!ca && ca === cb;
}

/**
 * Remaining units this station can still check for the lot, given what the
 * previous station accepted across every day and what this station has
 * already checked on other days.
 *
 * `excludeDate` is the day currently on the form — that day's own numbers
 * must not count as already used, or a rewrite of Tuesday would shrink
 * Wednesday's remainder.
 */
export function upstreamRemainder(opts: {
  events: UpstreamEvent[];
  lot: string;
  previousStation: string;
  currentStation: string;
  size?: string | null;
  excludeDate?: string | null;
}): UpstreamRemainder {
  const lot = canonicalBatchId(opts.lot);
  const size = opts.size ?? null;
  let prevChecked = 0;
  let prevAccepted = 0;
  let prevRejected = 0;
  let prevHold = 0;
  let alreadyChecked = 0;

  if (!lot) return { previousAccepted: 0, alreadyChecked: 0, remaining: 0 };

  for (const e of opts.events) {
    if (lotOf(e) !== lot) continue;
    if (size && e.size && e.size !== size) continue;
    const qty = Number(e.quantity ?? 0);
    if (qty <= 0) continue;

    if (sameStation(e.stageId, opts.previousStation)) {
      if (e.eventType === "production") prevChecked += qty;
      else if (e.eventType === "inspection" && (e.disposition === "accepted" || e.disposition === "good")) {
        prevAccepted += qty;
      } else if (e.eventType === "inspection" && e.disposition === "rejected") {
        prevRejected += qty;
      } else if (e.eventType === "inspection" && e.disposition === "rework") {
        prevHold += qty;
      }
      continue;
    }

    if (
      sameStation(e.stageId, opts.currentStation) &&
      e.eventType === "production" &&
      (!opts.excludeDate || dayOf(e) !== opts.excludeDate)
    ) {
      alreadyChecked += qty;
    }
  }

  const previousAccepted = passedForward({
    checked: prevChecked,
    accepted: prevAccepted,
    rejected: prevRejected,
    hold: prevHold,
  });

  return {
    previousAccepted,
    alreadyChecked,
    remaining: Math.max(0, previousAccepted - alreadyChecked),
  };
}
