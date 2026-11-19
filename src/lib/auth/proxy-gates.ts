// Shared proxy helpers: which paths are public, and the advisory screen check.
// Lives here so src/proxy.ts (legacy) and src/lib/auth/clerk-proxy.ts can
// share them without a circular import.

import type { NextRequest } from "next/server";
import { NAV_COOKIE, verifyNavToken } from "./session";
import { navHref, navKeyForPath, type NavKey } from "@/lib/nav-keys";

export function isPublicPath(pathname: string): boolean {
  if (pathname === "/login" || pathname.startsWith("/login/")) return true;
  if (pathname === "/no-access") return true;
  // login + logins list + logout + me are public; me still returns 401 if needed
  if (pathname.startsWith("/api/auth/")) return true;
  // Plant compose health probe (nginx) — not an app route, but allow if proxied.
  if (pathname === "/healthz") return true;
  // Build id probe: the "new version" banner also has to work on /login.
  if (pathname === "/api/version") return true;
  // Clerk's frontend API proxy path.
  if (pathname.startsWith("/__clerk/")) return true;
  return false;
}

/**
 * The screen this request is for, when the role plainly may not open it.
 * Returns where to send them instead, or null to let the request through.
 *
 * FAILS OPEN: a missing, stale, unreadable, or role-mismatched nav cookie
 * means "let it through". This is a courtesy, not the authorization boundary.
 */
export async function deniedScreen(
  request: NextRequest,
  role: string,
  pathname: string,
): Promise<string | null> {
  if (pathname.startsWith("/api/")) return null;
  const key = navKeyForPath(pathname);
  if (!key) return null;

  const nav = await verifyNavToken(request.cookies.get(NAV_COOKIE)?.value);
  // No list, or one issued for a different role than the session now names:
  // say nothing. /api/auth/me re-issues it on the next page load.
  if (!nav || nav.r !== role) return null;
  if (nav.n.includes(key)) return null;

  // Never redirect to a screen they also lack — that is a loop.
  if (nav.n.includes("dashboard")) return "/";
  const first = nav.n.find((k) => navHref(k as NavKey) !== null);
  return first ? navHref(first as NavKey) : null;
}
