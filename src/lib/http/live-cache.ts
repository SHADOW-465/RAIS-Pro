/** Responses that change as the plant works. Browsers must not reuse them. */
export const LIVE_CACHE = {
  "Cache-Control": "no-store, no-cache, must-revalidate",
} as const;

/** What every API GET answers with. `private` keeps shared caches out of per-user data. */
export const PRIVATE_NO_STORE = "private, no-store";

/**
 * Wrap a route's GET so EVERY response it returns — success, 4xx, 5xx — says
 * `private, no-store`. A browser or CDN that keeps an API answer is how a tab
 * ends up showing yesterday's ledger, so this is the only way GET is exported
 * (enforced by http/__tests__/no-store.test.ts).
 */
export function withNoStore<A extends unknown[]>(handler: (...args: A) => Response | Promise<Response>) {
  return async (...args: A): Promise<Response> => {
    const res = await handler(...args);
    res.headers.set("Cache-Control", PRIVATE_NO_STORE);
    return res;
  };
}
