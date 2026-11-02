// After a deploy, an open tab still runs the OLD build, whose JS files are
// gone: the next route change throws ChunkLoadError / "Failed to fetch
// dynamically imported module". The cure is a reload — once. A second failure
// right after a reload means the problem is not a stale tab, so it is shown to
// the user instead of looping.

import { z } from "zod";
import { slot } from "@/lib/storage";

const MESSAGES = [
  /ChunkLoadError/i,
  /Loading chunk [\w-]+ failed/i,
  /Loading CSS chunk/i,
  /Failed to fetch dynamically imported module/i,
  /error loading dynamically imported module/i,
  /Importing a module script failed/i,
];

export function isChunkLoadError(err: unknown): boolean {
  if (!err) return false;
  const e = err as { name?: unknown; message?: unknown };
  const text = `${typeof e.name === "string" ? e.name : ""} ${typeof e.message === "string" ? e.message : typeof err === "string" ? err : ""}`;
  return MESSAGES.some((re) => re.test(text));
}

/** A reload within this window of the last automatic one is not repeated. */
export const RELOAD_GUARD_MS = 60_000;

const guard = slot({ name: "chunk-reload-at", schema: z.number(), area: "session" });

/**
 * Reload the page once for a chunk error. Returns true when a reload was
 * started; false when one already happened a moment ago (or this is not a
 * chunk error), so the caller shows its retry UI.
 */
export function reloadOnceForChunkError(
  err: unknown,
  now: number = Date.now(),
  reload: () => void = () => window.location.reload(),
): boolean {
  if (!isChunkLoadError(err)) return false;
  const last = guard.get();
  if (last !== undefined && now - last < RELOAD_GUARD_MS) return false;
  // If the guard cannot be saved (storage blocked), a reload could loop forever.
  if (!guard.set(now)) return false;
  reload();
  return true;
}
