// Everything that can be wrong with an entry, decided in one place.
//
// This used to be a chain of confirm() calls inside submitForm: each guard
// added independently, in whatever order it was written, inside a 2,600-line
// client component where no test could reach it. That is exactly how a guard
// keyed on "all four assembly gates are done" shipped while meaning "this
// station is already recorded" — it locked finished lots out of every other
// station, and nothing could have caught it but a person noticing in
// production.
//
// So: one pure function, one verdict, three severities.
//
//   block    the save cannot proceed. The data would be wrong or unreadable.
//   warn     the save may proceed once the operator acknowledges it. These are
//            "this is probably not what you meant", not "this is illegal".
//   note     worth saying, nothing to decide.
//
// Warnings carry an `ack` id so the UI can record WHICH warning was accepted
// rather than treating one blanket confirm as consent to everything.

import { isValidBatchId } from "@/lib/entry/batch-id";
import {
  entryIdentity,
  identityKey,
  identityOfEvent,
  isDirectEntryEvent,
  sizeDisagreement,
  type EntryIdentity,
  type IdentifiableEvent,
} from "@/lib/entry/identity";

export type EntryProblemSeverity = "block" | "warn" | "note";

export interface EntryProblem {
  /** Stable id — used to record acknowledgement and to test precedence. */
  code: string;
  severity: EntryProblemSeverity;
  /** Plain sentence for the operator. No codes, no field names. */
  message: string;
  /** What to do about it, when there is something to do. */
  action?: string;
}

export interface EntryVerdict {
  blocks: EntryProblem[];
  warnings: EntryProblem[];
  notes: EntryProblem[];
  /** Convenience: nothing stops this save. */
  canSave: boolean;
  /** Identity this draft resolves to, when it resolves at all. */
  identity: EntryIdentity | null;
}

export interface EntryDraft {
  lot: string;
  station: string;
  stationLabel?: string;
  /** Declared pass. 1 unless the operator said this is a repeat. */
  pass?: number;
  passReason?: string | null;
  /** Size the operator selected. The lot code is authoritative; this is checked against it. */
  size?: string | null;
  date: string;
  checked: number;
  accepted: number;
  hold: number;
  rejected: number;
  defectSum: number;
  /** Whether this station records these at all, from the schema. */
  capturesAccepted: boolean;
  capturesHold: boolean;
  capturesRejected: boolean;
  capturesDefects: boolean;
  /** Set when revising an existing row rather than creating one. */
  editing?: boolean;
}

/** One entry already on the ledger, folded from its events. */
export interface LedgerEntrySummary {
  identity: EntryIdentity;
  date: string | null;
  checked: number;
  accepted: number;
  rejected: number;
  shift: string | null;
}

/**
 * Fold direct-entry events into one summary per identity.
 *
 * Excel-sourced events are deliberately excluded: a workbook row and a typed
 * row are different statements about the plant, and direct entry must never
 * silently supersede an import.
 */
export function summariseLedger(events: IdentifiableEvent[]): Map<string, LedgerEntrySummary> {
  const out = new Map<string, LedgerEntrySummary>();
  for (const e of events) {
    if (!isDirectEntryEvent(e)) continue;
    const identity = identityOfEvent(e);
    if (!identity) continue;
    const key = identityKey(identity);
    const any = e as IdentifiableEvent & {
      eventType?: string;
      disposition?: string;
      quantity?: number;
      occurredOn?: { start?: string };
    };
    const cur =
      out.get(key) ??
      ({
        identity,
        date: any.occurredOn?.start ?? null,
        checked: 0,
        accepted: 0,
        rejected: 0,
        shift: e.provenance?.sheet ?? null,
      } satisfies LedgerEntrySummary);
    const q = any.quantity ?? 0;
    if (any.eventType === "production") cur.checked += q;
    else if (any.eventType === "inspection" && any.disposition === "accepted") cur.accepted += q;
    else if (any.eventType === "inspection" && any.disposition === "rejected") cur.rejected += q;
    cur.date ??= any.occurredOn?.start ?? null;
    out.set(key, cur);
  }
  return out;
}

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Judge one draft against the ledger.
 *
 * Pure: same inputs, same verdict, no clock and no I/O. `today` is passed in so
 * the future-date rule is testable.
 */
export function checkEntry(
  draft: EntryDraft,
  ledger: Map<string, LedgerEntrySummary>,
  today: string,
): EntryVerdict {
  const blocks: EntryProblem[] = [];
  const warnings: EntryProblem[] = [];
  const notes: EntryProblem[] = [];

  const lot = draft.lot.trim().toUpperCase();
  const station = draft.stationLabel || draft.station;

  // ── Identity must resolve ───────────────────────────────────────────────
  if (!isValidBatchId(lot)) {
    blocks.push({
      code: "lot-code-invalid",
      severity: "block",
      message: `"${lot || "(empty)"}" is not a lot code.`,
      action: "Expected two digits, a month letter A–L, the day, then the size — like 26H25-18.",
    });
  }

  // ── The day ─────────────────────────────────────────────────────────────
  // Date is part of identity, so judge it before the identity early-return
  // or an invalid recorded-on date would fail silently with no message.
  if (!ISO_DAY.test(draft.date)) {
    blocks.push({
      code: "date-invalid",
      severity: "block",
      message: "The recorded-on date is not a real date.",
    });
  } else if (draft.date > today) {
    blocks.push({
      code: "date-in-future",
      severity: "block",
      message: `Recorded on ${draft.date} is in the future.`,
      action: "A station cannot have run a lot that has not happened yet.",
    });
  } else if (draft.date < today) {
    notes.push({
      code: "date-backdated",
      severity: "note",
      message: `This will be recorded against ${draft.date}, not today.`,
    });
  }

  const identity = entryIdentity(lot, draft.station, draft.date, draft.pass ?? 1);
  if (!identity) {
    return { blocks, warnings, notes, canSave: false, identity: null };
  }

  // The lot code carries the size, so a mismatch means one of the two is wrong
  // and only the operator knows which.
  const sizeClash = sizeDisagreement(lot, draft.size);
  if (sizeClash) {
    blocks.push({
      code: "size-disagrees-with-lot",
      severity: "block",
      message: `Lot ${lot} is a ${sizeClash.fromLot} lot, but ${sizeClash.selected} is selected.`,
      action: `Change the size to ${sizeClash.fromLot}, or use the lot code for the ${sizeClash.selected} lot.`,
    });
  }

  // ── Counts ──────────────────────────────────────────────────────────────
  if (draft.checked <= 0) {
    blocks.push({
      code: "nothing-checked",
      severity: "block",
      message: "No quantity has been entered.",
    });
  }

  for (const [label, value] of [
    ["Checked", draft.checked],
    ["Accepted", draft.accepted],
    ["Hold", draft.hold],
    ["Rejected", draft.rejected],
  ] as const) {
    if (value < 0) {
      blocks.push({
        code: "negative-count",
        severity: "block",
        message: `${label} cannot be negative.`,
      });
    }
  }

  const parts =
    (draft.capturesAccepted ? draft.accepted : 0) +
    (draft.capturesHold ? draft.hold : 0) +
    (draft.capturesRejected ? draft.rejected : 0);
  if (draft.capturesRejected && draft.checked > 0 && parts !== draft.checked) {
    blocks.push({
      code: "counts-do-not-balance",
      severity: "block",
      message: `The parts add up to ${parts}, but ${draft.checked} were checked.`,
      action: `${draft.checked} must equal Accepted + Hold + Rejected.`,
    });
  }

  // Defects EXPLAIN Rejected; they never redefine it.
  if (draft.capturesDefects && draft.capturesRejected) {
    if (draft.defectSum > draft.rejected) {
      blocks.push({
        code: "defects-exceed-rejected",
        severity: "block",
        message: `The defect reasons total ${draft.defectSum}, more than the ${draft.rejected} rejected.`,
        action: "A defect count is too high, or Accepted / Hold is wrong.",
      });
    } else if (draft.rejected > 0 && draft.defectSum < draft.rejected) {
      const gap = draft.rejected - draft.defectSum;
      warnings.push({
        code: "rejected-not-fully-explained",
        severity: "warn",
        message: `${gap} of ${draft.rejected} rejected ${gap === 1 ? "piece has" : "pieces have"} no reason.`,
        action: "Add the reasons, or save with the cause recorded as unknown.",
      });
    }
  }

  // ── The lot already being at this station ───────────────────────────────
  //
  // Same lot + station + recorded-on date is a rewrite of that day's row.
  // A different date is a split-day continuation — Visual on the 1st and
  // Visual on the 3rd both stand. Re-saving the same day still warns.
  const prior = ledger.get(identityKey(identity));
  if (prior && !draft.editing) {
    const when = prior.date ? ` on ${prior.date}` : "";
    warnings.push({
      code: "station-already-recorded",
      severity: "warn",
      message: `${station} already has lot ${lot}${when} — ${prior.checked} checked, ${prior.rejected} rejected.`,
      action: "Saving replaces this day's entry. To record another day, change Recorded on.",
    });
  }

  const otherDays = [...ledger.values()]
    .filter(
      (p) =>
        p.identity.lot === identity.lot &&
        p.identity.station === identity.station &&
        p.identity.pass === identity.pass &&
        p.identity.date !== identity.date,
    )
    .sort((a, b) => (a.date ?? "").localeCompare(b.date ?? ""));
  if (otherDays.length > 0 && !draft.editing) {
    const list = otherDays
      .map((p) => `${p.date ?? "an earlier day"} (${p.checked} checked)`)
      .join(", ");
    notes.push({
      code: "split-day-entry",
      severity: "note",
      message:
        otherDays.length === 1
          ? `${station} already has lot ${lot} on ${list}. This records a new day.`
          : `${station} already has ${otherDays.length} other days on lot ${lot} — ${list}. This records a new day.`,
    });
  }

  // ── Same numbers under a different lot code ─────────────────────────────
  //
  // Two lot codes, same station, same three counts. The plant runs one lot per
  // size per day, so this is nearly always one lot typed twice with the code
  // mistyped the second time.
  //
  // Only where the counts actually discriminate. A quantity-only station
  // (Hanging, Eye Punching) records ONE number, and that number is a round
  // 1000 all day — matching it says nothing, so this fired on every second
  // lot and taught operators to tick the box without reading it.
  if (!draft.editing && draft.checked > 0 && draft.capturesRejected) {
    for (const other of ledger.values()) {
      if (other.identity.station !== identity.station) continue;
      if (other.identity.lot === identity.lot) continue;
      if (other.date !== draft.date) continue;
      if (
        other.checked === draft.checked &&
        other.accepted === draft.accepted &&
        other.rejected === draft.rejected
      ) {
        warnings.push({
          code: "same-counts-different-lot",
          severity: "warn",
          message:
            `Lot ${other.identity.lot} has the same counts at ${station} today ` +
            `(${other.checked} / ${other.accepted} / ${other.rejected}).`,
          action: "Check the lot code — this may be one lot entered twice.",
        });
        break;
      }
    }
  }

  return {
    blocks,
    warnings,
    notes,
    canSave: blocks.length === 0,
    identity,
  };
}
