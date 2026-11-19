// Invitation accept links must be absolute. Clerk resolves a relative
// redirectUrl such as "/login" against accounts.dev and the invitee lands
// on a 404. Prefer the origin of the request that created the invite, then
// APP_URL / NEXT_PUBLIC_APP_URL, then the production host.

const FALLBACK_ORIGIN = "https://rais-pro.vercel.app";

/** Origin only (scheme + host + optional port), or null if it is not a usable http(s) URL. */
export function normalizeOrigin(raw?: string | null): string | null {
  if (raw == null) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  // A relative path must never be treated as a host.
  if (trimmed.startsWith("/") || trimmed.startsWith("\\")) return null;
  try {
    const withScheme = /^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(trimmed) ? trimmed : `https://${trimmed}`;
    const url = new URL(withScheme);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    if (!url.hostname) return null;
    return url.origin;
  } catch {
    return null;
  }
}

/**
 * Absolute `/login` URL used as Clerk's invitation redirectUrl.
 * `requestOrigin` should be the origin the Access screen was served from.
 */
export function resolveInvitationRedirectUrl(
  requestOrigin?: string | null,
  env: NodeJS.Dict<string> = process.env,
): string {
  const candidates = [requestOrigin, env.APP_URL, env.NEXT_PUBLIC_APP_URL, FALLBACK_ORIGIN];
  for (const raw of candidates) {
    const origin = normalizeOrigin(raw);
    if (origin) return `${origin}/login`;
  }
  return `${FALLBACK_ORIGIN}/login`;
}

/** Host the invite API was called on. Prefers forwarded headers on Vercel. */
export function originFromRequest(req: {
  url: string;
  headers: { get(name: string): string | null };
}): string | null {
  const forwardedHost = req.headers.get("x-forwarded-host");
  if (forwardedHost) {
    const host = forwardedHost.split(",")[0]?.trim();
    const proto = (req.headers.get("x-forwarded-proto")?.split(",")[0] || "https").trim() || "https";
    if (host) return normalizeOrigin(`${proto}://${host}`);
  }
  try {
    return normalizeOrigin(new URL(req.url).origin);
  } catch {
    return null;
  }
}
