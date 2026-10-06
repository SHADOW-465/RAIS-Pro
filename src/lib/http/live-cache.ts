/** Responses that change as the plant works. Browsers must not reuse them. */
export const LIVE_CACHE = {
  "Cache-Control": "no-store, no-cache, must-revalidate",
} as const;
