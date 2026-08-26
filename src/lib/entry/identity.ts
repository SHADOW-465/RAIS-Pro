// What makes one Data Entry row *that* row, and nothing else.
//
// The identity is (lot · station · date · pass):
//
//   lot      the canonical lot code. It already encodes the size, so size is
//            DERIVED here rather than stored beside it where the two can drift.
//   station  the ledger stageId.
//   date     the recorded-on day this station ran the lot. A lot can sit at
//            Visual (or Balloon, Valve, Final) across several days, so each
//            day is its own row — Visual on the 1st and Visual on the 3rd are
//            two inspections, not a rewrite of one.
//   pass     1 for the normal case. A second pass on the SAME day is a
//            re-inspection; a different day does not need a new pass.
//
// Shift, operator, product type, and source file remain attributes, never
// part of the name. Re-saving the same (lot, station, date) still supersedes.

import { canonicalBatchId, frDigitsFromSize } from "@/lib/entry/batch-id";

export interface EntryIdentity {
  /** Canonical lot code, e.g. "26H25-18". */
  lot: string;
  /** Ledger stageId, e.g. "visual". */
  station: string;
  /** ISO day this station ran the lot, e.g. "2026-08-21". */
  date: string;
  /** 1 unless a second pass was explicitly declared for the same day. */
  pass: number;
}

/** The row's facts. None of these change which row it is. */
export interface EntryAttributes {
  shift?: string | null;
  operator?: string | null;
  productType?: string | null;
  /** Why a pass beyond the first exists. Required when pass > 1. */
  passReason?: string | null;
}

/**
 * Size implied by a lot code. `26H25-18` is an Fr18 lot — the code carries it,
 * so nothing else needs to.
 */
export function sizeFromLot(lot: string | null | undefined): string | null {
  const canon = canonicalBatchId(lot ?? null);
  if (!canon) return null;
  const dash = canon.lastIndexOf("-");
  if (dash < 0) return null;
  const digits = frDigitsFromSize(canon.slice(dash + 1));
  return digits ? `Fr${digits}` : null;
}

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

/** Build an identity, normalising the lot code and clamping the pass. */
export function entryIdentity(
  lot: string | null | undefined,
  station: string,
  date: string | null | undefined,
  pass: number = 1,
): EntryIdentity | null {
  const canon = canonicalBatchId(lot ?? null);
  const day = (date ?? "").trim();
  if (!canon || !station.trim() || !ISO_DAY.test(day)) return null;
  const p = Number.isInteger(pass) && pass >= 1 ? pass : 1;
  return { lot: canon, station: station.trim(), date: day, pass: p };
}

/** Stable string form, for Map keys and equality. */
export function identityKey(id: EntryIdentity): string {
  // Pass 1 omits its suffix so keys written before passes existed still match.
  const base = `${id.lot}|${id.station}|${id.date}`;
  return id.pass === 1 ? base : `${base}|${id.pass}`;
}

export function sameIdentity(a: EntryIdentity | null, b: EntryIdentity | null): boolean {
  if (!a || !b) return false;
  return identityKey(a) === identityKey(b);
}

/** A ledger event, only the fields identity cares about. */
export interface IdentifiableEvent {
  stageId?: string;
  batchNo?: string | null;
  customFields?: Record<string, unknown> | null;
  extractedBy?: string;
  isDirectEntry?: boolean;
  occurredOn?: { start?: string } | null;
  provenance?: { sheet?: string; is_direct_entry?: boolean } | null;
}

/** Recover the identity a stored event belongs to. */
export function identityOfEvent(e: IdentifiableEvent): EntryIdentity | null {
  const cf = e.customFields ?? {};
  const lot =
    (typeof e.batchNo === "string" && e.batchNo) ||
    (typeof cf.batch === "string" ? cf.batch : null) ||
    (typeof cf.batchId === "string" ? cf.batchId : null);
  if (!lot || !e.stageId) return null;
  const rawPass = cf.pass;
  const pass = typeof rawPass === "number" ? rawPass : 1;
  const date = e.occurredOn?.start ?? null;
  return entryIdentity(lot, e.stageId, date, pass);
}

export function isDirectEntryEvent(e: IdentifiableEvent): boolean {
  return (
    e.extractedBy === "direct-entry" ||
    e.isDirectEntry === true ||
    e.provenance?.is_direct_entry === true
  );
}

/**
 * The size the operator picked vs the size the lot code declares.
 *
 * The code is authoritative, so a mismatch is not something to silently
 * reconcile — it means one of the two was chosen wrongly and the operator is
 * the only one who knows which.
 */
export function sizeDisagreement(
  lot: string | null | undefined,
  selectedSize: string | null | undefined,
): { fromLot: string; selected: string } | null {
  const fromLot = sizeFromLot(lot);
  if (!fromLot || !selectedSize) return null;
  const digits = frDigitsFromSize(selectedSize);
  const selected = digits ? `Fr${digits}` : null;
  if (!selected || selected === fromLot) return null;
  return { fromLot, selected };
}
