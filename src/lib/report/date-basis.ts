// Report date basis. Only "entry-date" is confirmed by the company.
//
// Date of Entry = the calendar date the ledger record was created in the app.
// Authoritative field: CanonicalEvent.recordedAt (ISO datetime on the D1 envelope).
//
// This is NOT the lot calendar encoded in the batch ID (eventLotDate) and NOT
// occurredOn (business period of the row). Dashboard / analysis screens keep
// using lot-calendar filtering via scopeEvents; reports must not relabel that
// filter as Date of Entry.
//
// A second custom-range date basis has been mentioned but is not confirmed.
// Do not invent production date, inspection date, batch date, occurrence date,
// upload date, or ledger-commit date as a selectable option until the company
// names it.

import type { Event } from "@/lib/store/types";
import { isIsoDate } from "./financial-year";

export type ReportDateBasis = "entry-date";

export const REPORT_DATE_BASIS: ReportDateBasis = "entry-date";
export const REPORT_DATE_BASIS_LABEL = "Date of Entry";

const ISO_DAY = /^\d{4}-\d{2}-\d{2}/;

/**
 * Resolve the selected report date from an event.
 * Centralized — do not parse recordedAt in report components.
 */
export function eventEntryDate(event: Pick<Event, "recordedAt"> | { recordedAt?: string | null }): string | null {
  const raw = event.recordedAt;
  if (!raw || typeof raw !== "string") return null;
  const day = ISO_DAY.test(raw) ? raw.slice(0, 10) : "";
  if (!isIsoDate(day)) return null;
  return day;
}

export type EntryDatePartition<T extends { recordedAt?: string | null }> = {
  included: T[];
  missingEntryDate: T[];
  outOfRange: T[];
};

/**
 * Split events by Date of Entry against an inclusive ISO range.
 * Missing/invalid recordedAt is never silently reassigned to occurredOn or lot date.
 */
export function partitionByEntryDate<T extends { recordedAt?: string | null }>(
  events: T[],
  from: string,
  to: string,
): EntryDatePartition<T> {
  const included: T[] = [];
  const missingEntryDate: T[] = [];
  const outOfRange: T[] = [];
  for (const e of events) {
    const day = eventEntryDate(e);
    if (!day) {
      missingEntryDate.push(e);
      continue;
    }
    if (day < from || day > to) {
      outOfRange.push(e);
      continue;
    }
    included.push(e);
  }
  return { included, missingEntryDate, outOfRange };
}
