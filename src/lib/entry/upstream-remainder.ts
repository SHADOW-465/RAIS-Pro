// How many units the previous gate of a lot has passed forward, minus what
// this gate has already checked on other days. Data Entry prefills Checked
// from this so Balloon on the 4th still sees Visual accepted on the 1st–3rd.

import { canonicalBatchId } from "@/lib/entry/batch-id";
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
  let previousAccepted = 0;
  let alreadyChecked = 0;

  if (!lot) return { previousAccepted: 0, alreadyChecked: 0, remaining: 0 };

  for (const e of opts.events) {
    if (lotOf(e) !== lot) continue;
    if (size && e.size && e.size !== size) continue;
    const qty = Number(e.quantity ?? 0);
    if (qty <= 0) continue;

    if (
      e.stageId === opts.previousStation &&
      e.eventType === "inspection" &&
      (e.disposition === "accepted" || e.disposition === "good")
    ) {
      previousAccepted += qty;
      continue;
    }

    if (
      e.stageId === opts.currentStation &&
      e.eventType === "production" &&
      (!opts.excludeDate || dayOf(e) !== opts.excludeDate)
    ) {
      alreadyChecked += qty;
    }
  }

  return {
    previousAccepted,
    alreadyChecked,
    remaining: Math.max(0, previousAccepted - alreadyChecked),
  };
}
