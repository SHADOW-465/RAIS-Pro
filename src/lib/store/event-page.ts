// Stable ledger pages. PostgREST stops at 1000 rows, and ordering by
// recorded_at alone repeats or skips a row when two events share a timestamp.
// The order is (recorded_at, event_id). A cursor is the last row of the page
// the caller already has; the next page starts strictly after that pair.

import type { Event } from "./types";

export class EventPageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EventPageError";
  }
}

const PAGE_DEFAULT = 1000;
/** Largest page a caller may ask for. ~1.1 KB per row keeps 2500 rows near
 *  2.8 MB, under Vercel's 4.5 MB response cap. */
const PAGE_MAX = 2500;

/** Inclusive UTC window: today−30 through today. Pure so tests can pin `now`. */
export function defaultEventRange(now: Date): { from: string; to: string } {
  const to = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const from = new Date(to.getTime());
  from.setUTCDate(from.getUTCDate() - 30);
  return { from: from.toISOString().slice(0, 10), to: to.toISOString().slice(0, 10) };
}

export function parseEventLimit(raw: string | null): number {
  if (raw == null || raw.trim() === "") return PAGE_DEFAULT;
  const n = Number(raw);
  if (!Number.isFinite(n)) return PAGE_DEFAULT;
  return Math.min(PAGE_MAX, Math.max(1, Math.trunc(n)));
}

function stamp(e: Event): string {
  return e.recordedAt ?? "";
}

export function compareEvents(a: Event, b: Event): number {
  const ta = stamp(a);
  const tb = stamp(b);
  if (ta < tb) return -1;
  if (ta > tb) return 1;
  if (a.eventId < b.eventId) return -1;
  if (a.eventId > b.eventId) return 1;
  return 0;
}

export function encodeEventCursor(e: Pick<Event, "eventId"> & { recordedAt?: string | null }): string {
  return Buffer.from(JSON.stringify({ t: e.recordedAt ?? "", id: e.eventId }), "utf8").toString("base64url");
}

export function decodeEventCursor(raw: string): { t: string; id: string } {
  try {
    const parsed = JSON.parse(Buffer.from(raw, "base64url").toString("utf8")) as { t?: unknown; id?: unknown };
    if (!parsed || typeof parsed.t !== "string" || typeof parsed.id !== "string" || parsed.id.length === 0) {
      throw new Error("bad cursor");
    }
    return { t: parsed.t, id: parsed.id };
  } catch (err) {
    if (err instanceof EventPageError) throw err;
    throw new EventPageError("Invalid cursor");
  }
}

function afterCursor(e: Event, cursor: { t: string; id: string }): boolean {
  const t = stamp(e);
  if (t > cursor.t) return true;
  if (t < cursor.t) return false;
  return e.eventId > cursor.id;
}

/** Non-negative integer offset, or null when absent/invalid. */
export function parseEventOffset(raw: string | null): number | null {
  if (raw == null || raw.trim() === "") return null;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.trunc(n);
}

export function pageEvents(
  events: Event[],
  opts: { limit?: number; cursor?: string | null; offset?: number | null } = {},
): { events: Event[]; nextCursor: string | null } {
  const limit = opts.limit ?? PAGE_DEFAULT;
  if (!Number.isInteger(limit) || limit < 1 || limit > PAGE_MAX) {
    throw new EventPageError("Invalid limit");
  }
  const sorted = [...events].sort(compareEvents);
  const cursor = opts.cursor ? decodeEventCursor(opts.cursor) : null;
  let start = 0;
  if (!cursor && opts.offset != null) {
    // Offset pages let the client fetch the rest of the ledger in parallel
    // once the first page reports the total. A cursor still wins.
    start = Math.min(sorted.length, opts.offset);
  } else if (cursor) {
    const idx = sorted.findIndex((e) => afterCursor(e, cursor));
    start = idx < 0 ? sorted.length : idx;
  }
  const page = sorted.slice(start, start + limit);
  const more = start + page.length < sorted.length;
  const last = page[page.length - 1];
  return {
    events: page,
    nextCursor: more && last ? encodeEventCursor(last) : null,
  };
}
