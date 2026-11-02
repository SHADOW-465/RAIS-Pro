import { QueryClient } from "@tanstack/react-query";
import { EVENTS_STALE_MS } from "./ledger-window";

let bound: QueryClient | null = null;

export function createAppQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: EVENTS_STALE_MS,
        gcTime: 10 * 60_000,
        // Focus must not re-download the ledger. Writes invalidate; a remount
        // after staleTime revalidates in the background (stale-while-revalidate).
        refetchOnWindowFocus: false,
        retry: 1,
      },
    },
  });
}

/** The browser's client, so a write outside React can still invalidate. */
export function bindQueryClient(client: QueryClient): void {
  bound = client;
}

export function getQueryClient(): QueryClient | null {
  return bound;
}
