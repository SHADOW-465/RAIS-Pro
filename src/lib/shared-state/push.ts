// Browser push of one shared-state document. No domain imports — domain
// modules call this, and the pull path must not import them back through here.

export const SHARED_STATE_EVENT = "moid-shared-state";

/** Kind carried on a shared-state event. Uses the DOM event, not a ledger row. */
export function sharedStateKind(ev: globalThis.Event): string | undefined {
  if (!(ev instanceof CustomEvent)) return undefined;
  const detail = ev.detail as { kind?: string } | null;
  return detail && typeof detail.kind === "string" ? detail.kind : undefined;
}

const revisions = new Map<string, number>();

export function bumpRevision(kind: string): void {
  revisions.set(kind, (revisions.get(kind) ?? 0) + 1);
}

export function revisionOf(kind: string): number {
  return revisions.get(kind) ?? 0;
}

let warning: string | null = null;
const listeners = new Set<() => void>();

export function sharedStateWarning(): string | null {
  return warning;
}

export function subscribeSharedWarning(cb: () => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

export function setSharedWarning(next: string | null): void {
  if (warning === next) return;
  warning = next;
  for (const cb of listeners) cb();
}

type Pending = { timer: ReturnType<typeof setTimeout> };

const pending = new Map<string, Pending>();

async function sendPut(body: Record<string, unknown>): Promise<void> {
  try {
    const res = await fetch("/api/shared-state", {
      method: "PUT",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (res.status === 401 || res.status === 403) return;
    if (res.status === 503) {
      const data = await res.json().catch(() => null);
      setSharedWarning(
        typeof data?.error === "string"
          ? `${data.error} This browser is still using its own copy.`
          : "Plant shared settings are not set up. This browser is still using its own copy.",
      );
    }
  } catch {
    /* offline: the local copy remains */
  }
}

/**
 * Send a document to the plant. `debounceMs` keeps a typing loop (lot memory)
 * from writing once per keystroke. A local write bumps the revision immediately
 * so an in-flight pull cannot paint an older server copy over it.
 */
export function pushShared(kind: string, body: Record<string, unknown>, debounceMs = 0): void {
  if (typeof window === "undefined") return;
  bumpRevision(kind);
  const prev = pending.get(kind);
  if (prev) clearTimeout(prev.timer);
  const fire = () => {
    pending.delete(kind);
    void sendPut(body);
  };
  if (debounceMs <= 0) {
    fire();
    return;
  }
  pending.set(kind, { timer: setTimeout(fire, debounceMs) });
}
