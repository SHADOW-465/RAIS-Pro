import { cachedWindowCovers } from "./ledger-window";

/** Another user's rows, a pending placeholder, or a narrower window do not
 *  count as data for this read. */
export function eventsCacheCovers(
  previousKey: readonly unknown[],
  next: { user: string; from?: string; to?: string },
): boolean {
  if (previousKey[0] !== "events" || previousKey.length < 4) return false;
  if (previousKey[1] !== next.user) return false;
  const from = typeof previousKey[2] === "string" && previousKey[2] ? previousKey[2] : undefined;
  const to = typeof previousKey[3] === "string" && previousKey[3] ? previousKey[3] : undefined;
  return cachedWindowCovers({ from, to }, next);
}

export function eventsQueryKey(
  user: string,
  window: { from?: string; to?: string },
): readonly [string, string, string, string] {
  return ["events", user, window.from ?? "", window.to ?? ""];
}

/** Placeholder key while a relative preset is still waiting on the anchor day.
 *  Must not be the unscoped key, or a cached "all data" read would flash. */
export function eventsPendingKey(user: string): readonly [string, string, string] {
  return ["events", user, "pending"];
}

export function boundsQueryKey(user: string): readonly [string, string] {
  return ["ledger-bounds", user];
}

export function schemaQueryKey(user: string): readonly [string, string] {
  return ["schema", user];
}

export function conversionsQueryKey(user: string): readonly [string, string] {
  return ["conversions", user];
}
