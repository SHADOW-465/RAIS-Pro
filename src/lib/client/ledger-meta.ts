// Other users' changes. The server keeps one counter that moves on every
// business write (/api/ledger-meta). This tab remembers the last number it saw;
// when it changes, the screens reload what they show.
//
// Until the migration is applied the endpoint answers 503 with no number. Then
// there is nothing to compare, so the tab reloads on every tick instead.
//
// Polling, not a Supabase Realtime socket: the app signs in with its own
// cookie, so a browser socket would have to use the public anon key and the
// anon role would need read access to the plant's tables.

export const LEDGER_META_POLL_MS = 60_000;
/** Focus and visibility bursts do not ask more often than this. */
export const LEDGER_META_MIN_GAP_MS = 15_000;

export type MetaReading =
  | { kind: "version"; version: number }
  | { kind: "unavailable" }
  | { kind: "signed-out" }
  | { kind: "error" };

export interface MetaState {
  /** Last counter value seen; null before the first reading or while unavailable. */
  seen: number | null;
  /** True once one reading has landed. The first one only sets the baseline:
   *  the screen just loaded, so it is already current. */
  primed: boolean;
}

export const INITIAL_META_STATE: MetaState = { seen: null, primed: false };

export interface MetaStep {
  state: MetaState;
  invalidate: boolean;
  /** Stop polling: the session is gone. */
  stop: boolean;
}

/** Pure: what to do with one reading. */
export function metaStep(state: MetaState, reading: MetaReading): MetaStep {
  switch (reading.kind) {
    case "version":
      return {
        state: { seen: reading.version, primed: true },
        invalidate: state.primed && state.seen !== reading.version,
        stop: false,
      };
    case "unavailable":
      // No counter to compare: reload on every tick after the first.
      return { state: { seen: null, primed: true }, invalidate: state.primed, stop: false };
    case "signed-out":
      return { state, invalidate: false, stop: true };
    case "error":
      // Offline or restarting: nothing was learned, and a reload would only fail too.
      return { state, invalidate: false, stop: false };
  }
}

export async function readingFrom(res: Response): Promise<MetaReading> {
  if (res.status === 401 || res.status === 403) return { kind: "signed-out" };
  if (res.status === 503) return { kind: "unavailable" };
  if (!res.ok) return { kind: "error" };
  const body = (await res.json().catch(() => null)) as { version?: unknown } | null;
  return typeof body?.version === "number" && Number.isFinite(body.version)
    ? { kind: "version", version: body.version }
    : { kind: "unavailable" };
}
