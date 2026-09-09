// Next.js 16 proxy (formerly middleware). Auth is always on: unauthenticated
// page requests go to /login; API routes get 401.
//
// It also sends someone away from a screen their role does not have — but that
// is a courtesy, not the authorization boundary. Next is explicit that proxy
// "should not be used as a full session management or authorization solution",
// and this file cannot reach the database anyway: it runs in the Edge runtime
// on every request. The boundary is lib/auth/guard.ts, which resolves the role
// from `plant_roles` on every guarded call.
//
// So the screen check reads a signed, advisory cookie and FAILS OPEN. Missing,
// expired, or issued for a role the session no longer names — all mean "let it
// through". The page renders, its APIs refuse what they should, and a cookie
// problem can never lock a plant out of its own app. API routes are never
// screen-checked here: they answer for themselves.

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import {
  NAV_COOKIE,
  SESSION_COOKIE,
  verifyNavToken,
  verifySessionToken,
} from "@/lib/auth/session";
import { navHref, navKeyForPath, type NavKey } from "@/lib/nav-keys";

function isPublicPath(pathname: string): boolean {
  if (pathname === "/login") return true;
  // login + logins list + logout + me are public; me still returns 401 if needed
  if (pathname.startsWith("/api/auth/")) return true;
  // Plant compose health probe (nginx) — not an app route, but allow if proxied.
  if (pathname === "/healthz") return true;
  return false;
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (isPublicPath(pathname)) {
    return NextResponse.next();
  }

  const token = request.cookies.get(SESSION_COOKIE)?.value;
  const session = await verifySessionToken(token);

  if (session) {
    const denied = await deniedScreen(request, session.r, pathname);
    if (denied) {
      // Their own landing screen, not a 403 page: someone who followed a stale
      // bookmark wants to be somewhere useful, and the sidebar already tells
      // them what they have.
      const home = new URL(denied, request.url);
      home.searchParams.set("denied", "1");
      return NextResponse.redirect(home);
    }
    const res = NextResponse.next();
    res.headers.set("x-moid-user", session.u);
    res.headers.set("x-moid-role", session.r);
    return res;
  }

  if (pathname.startsWith("/api/")) {
    return NextResponse.json(
      { error: "Unauthorized. Sign in required." },
      { status: 401 },
    );
  }

  const login = new URL("/login", request.url);
  login.searchParams.set("next", pathname + request.nextUrl.search);
  return NextResponse.redirect(login);
}

/**
 * The screen this request is for, when the role plainly may not open it.
 * Returns where to send them instead, or null to let the request through.
 */
async function deniedScreen(
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


export const config = {
  matcher: [
    /*
     * Match all paths except Next internals and common static assets.
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
