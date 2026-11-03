// The three numbers at the top of Log (plan §4 "Log" L1): entries saved today,
// rows typed here but not yet on the ledger, and when the last save landed.
// Pure, so the tiles never disagree with History.

export interface LogSummary {
  /** Distinct direct-entry saves (ingestions) recorded today. */
  entriesToday: number;
  /** Shift-log rows in this browser not yet on the ledger. */
  pendingSync: number;
  /** recordedAt of the newest direct-entry event, or null. */
  lastSaved: string | null;
}

type LedgerEventLike = { extractedBy?: string; isDirectEntry?: boolean; recordedAt?: string; ingestionId?: string };

export function logSummary(
  events: readonly LedgerEventLike[],
  shiftRows: readonly { synced?: boolean }[],
  today: string, // YYYY-MM-DD, local
): LogSummary {
  const saves = new Set<string>();
  let lastSaved: string | null = null;
  for (const e of events) {
    if (e.extractedBy !== "direct-entry" && e.isDirectEntry !== true) continue;
    if (!e.recordedAt) continue;
    if (!lastSaved || e.recordedAt > lastSaved) lastSaved = e.recordedAt;
    if (localDay(e.recordedAt) === today) saves.add(e.ingestionId ?? e.recordedAt);
  }
  return { entriesToday: saves.size, pendingSync: shiftRows.filter((r) => !r.synced).length, lastSaved };
}

/** YYYY-MM-DD of an ISO timestamp in the browser's timezone. */
export function localDay(iso: string | Date): string {
  const d = typeof iso === "string" ? new Date(iso) : iso;
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
