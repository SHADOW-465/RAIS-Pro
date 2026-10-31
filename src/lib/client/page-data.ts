import type { QueryClient } from "@tanstack/react-query";
import type { NavKey } from "@/lib/nav-keys";
import { canReport } from "@/lib/report/blocks";
import { fetchConversions, fetchEvents, fetchLedgerBounds, fetchSchema } from "./fetchers";
import { EVENTS_STALE_MS, ledgerFetchWindow, type LedgerAnchor, type LedgerDateTweaks } from "./ledger-window";
import { boundsQueryKey, conversionsQueryKey, eventsQueryKey, schemaQueryKey } from "./query-keys";

/** Screens that read ledger rows. Staging, CAPA and Alerts do not — they must
 *  not download the ledger just because the shell mounted. */
export function routeReadsLedger(key: NavKey): boolean {
  switch (key) {
    case "staging":
    case "capa":
    case "alerts":
    case "ask":
      return false;
    default:
      return true;
  }
}

/** Conversions are used by entry, the conversion page, and any screen that can
 *  open the report panel (that panel reads lineage). */
export function routeReadsLineage(key: NavKey): boolean {
  return key === "data-entry" || key === "batch-conversion" || canReport(key);
}

export interface NavQuery {
  id: "schema" | "events" | "ledger-bounds" | "conversions";
  queryKey: readonly unknown[];
  queryFn: () => Promise<unknown>;
}

export function queriesForNav(
  key: NavKey,
  tweaks: LedgerDateTweaks,
  anchor: LedgerAnchor,
  user: string,
  opts?: { unscoped?: boolean },
): NavQuery[] {
  const out: NavQuery[] = [];
  if (key !== "ask") {
    out.push({ id: "schema", queryKey: schemaQueryKey(user), queryFn: fetchSchema });
  }
  if (routeReadsLedger(key)) {
    const window = ledgerFetchWindow(tweaks, anchor, opts);
    if (window.needsAnchor) {
      out.push({ id: "ledger-bounds", queryKey: boundsQueryKey(user), queryFn: fetchLedgerBounds });
    } else {
      out.push({
        id: "events",
        queryKey: eventsQueryKey(user, window),
        queryFn: () => fetchEvents({ from: window.from, to: window.to, span: window.span }),
      });
    }
  }
  if (routeReadsLineage(key)) {
    out.push({ id: "conversions", queryKey: conversionsQueryKey(user), queryFn: fetchConversions });
  }
  return out;
}

/** Warm the cache for a sidebar destination. Relative presets prefetch the
 *  anchor day first, then the window that day selects. */
export async function prefetchNav(
  client: QueryClient,
  key: NavKey,
  tweaks: LedgerDateTweaks,
  user: string,
): Promise<void> {
  const cached = client.getQueryData<{ min?: string; max?: string; maxEnd?: string; unavailable?: boolean }>(
    boundsQueryKey(user),
  );
  let anchor: LedgerAnchor = { ready: !!cached, min: cached?.min, max: cached?.max, maxEnd: cached?.maxEnd };
  let unscoped = cached?.unavailable === true;
  const first = queriesForNav(key, tweaks, anchor, user, { unscoped });
  const bounds = first.find((q) => q.id === "ledger-bounds");
  if (bounds) {
    await client.prefetchQuery({
      queryKey: bounds.queryKey,
      queryFn: bounds.queryFn,
      staleTime: EVENTS_STALE_MS,
    });
    const next = client.getQueryData<{ min?: string; max?: string; maxEnd?: string; unavailable?: boolean }>(
      boundsQueryKey(user),
    );
    anchor = { ready: true, min: next?.min, max: next?.max, maxEnd: next?.maxEnd };
    unscoped = next?.unavailable === true;
  }
  const queries = queriesForNav(key, tweaks, anchor, user, { unscoped }).filter((q) => q.id !== "ledger-bounds");
  await Promise.all(
    queries.map((q) =>
      client.prefetchQuery({ queryKey: q.queryKey, queryFn: q.queryFn, staleTime: EVENTS_STALE_MS }),
    ),
  );
}
