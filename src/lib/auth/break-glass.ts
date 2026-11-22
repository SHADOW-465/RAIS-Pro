// One env-backed break-glass login, used only in Clerk mode.
//
// Clerk (Google / email) stays the normal path. This is a single username
// (GM_PASSWORD_LOGIN_USER) whose password hash lives in GM_PASSWORD_LOGIN_HASH.
// The role is always `gm` — never admin, never manageAccess. Feature is off
// when either env is missing. The hash is verified in Node (login route);
// this module only reads env and inspects an already-signed session cookie,
// so the Edge proxy can allow that one user through.

export const BREAK_GLASS_ROLE = "gm" as const;

export function breakGlassUsername(): string {
  return (process.env.GM_PASSWORD_LOGIN_USER ?? "").trim();
}

export function isBreakGlassEnabled(): boolean {
  const user = breakGlassUsername();
  const hash = (process.env.GM_PASSWORD_LOGIN_HASH ?? "").trim();
  return user.length > 0 && hash.startsWith("scrypt$");
}

export function isBreakGlassUsername(identity: string): boolean {
  if (!isBreakGlassEnabled()) return false;
  return normalizeIdentity(identity) === normalizeIdentity(breakGlassUsername());
}

export function normalizeIdentity(raw: string): string {
  return raw.trim().toLowerCase();
}

/** True when a verified session cookie is the configured break-glass GM. */
export function isBreakGlassSession(
  session: { u: string; r: string } | null | undefined,
): session is { u: string; r: string } {
  if (!session || !isBreakGlassEnabled()) return false;
  if (session.r !== BREAK_GLASS_ROLE) return false;
  return normalizeIdentity(session.u) === normalizeIdentity(breakGlassUsername());
}

/** Length-independent compare so a username typo does not leak its position. */
export function constantTimeEqual(a: string, b: string): boolean {
  const ae = new TextEncoder().encode(a);
  const be = new TextEncoder().encode(b);
  let diff = ae.length ^ be.length;
  const n = Math.max(ae.length, be.length, 1);
  for (let i = 0; i < n; i++) diff |= (ae[i] ?? 0) ^ (be[i] ?? 0);
  return diff === 0;
}
