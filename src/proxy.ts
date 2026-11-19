// Next.js 16 proxy (formerly middleware). Auth is always on: unauthenticated
// page requests go to /login; API routes get 401.
//
// It also sends someone away from a screen their role does not have — but that
// is a courtesy, not the authorization boundary. Next is explicit that proxy
// "should not be used as a full session management or authorization solution",
// and this file does not reach the database: the role's screen list travels in
// a signed, advisory cookie. The boundary is lib/auth/guard.ts, which resolves
// the role (from `plant_roles`, or from Clerk private metadata then
// `plant_roles`) on every guarded call.
//
// So the screen check reads a signed, advisory cookie and FAILS OPEN. Missing,
// expired, or issued for a role the session no longer names — all mean "let it
// through". The page renders, its APIs refuse what they should, and a cookie
// problem can never lock a plant out of its own app. API routes are never
// screen-checked here: they answer for themselves.
//
// When AUTH_PROVIDER=clerk, the same rules run through clerkMiddleware so
// `auth()` works in route handlers. See lib/auth/clerk-proxy.ts.

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/auth/session";
import { deniedScreen, isPublicPath } from "@/lib/auth/proxy-gates";
import { isClerkAuth } from "@/lib/auth/provider";

async function legacyProxy(request: NextRequest) {
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

export async function proxy(
  request: NextRequest,
  event?: unknown,
): Promise<NextResponse> {
  if (isClerkAuth()) {
    const { handleClerkProxy } = await import("@/lib/auth/clerk-proxy");
    // clerkMiddleware's Next handler takes (request, event).
    const res = await handleClerkProxy(request, event as never);
    return (res as NextResponse | undefined) ?? NextResponse.next();
  }
  return legacyProxy(request);
}

export const config = {
  matcher: [
    /*
     * Match everything except Next internals and static files. A static asset
     * must never be redirected to /login: a signed-out tab (or a browser
     * fetching the manifest, service worker or icons before the session
     * cookie is sent) would be handed an HTML page where it expected a file,
     * and keep it.
     */
    "/((?!_next/|favicon\.ico$|manifest\.(?:json|webmanifest)$|sw\.js$|workbox-.*\.js$|robots\.txt$|sitemap\.xml$|apple-touch-icon.*|icon.*|.*\.(?:svg|png|jpg|jpeg|gif|webp|avif|ico|css|js|map|woff2?|ttf|otf|txt|xml|webmanifest)$).*)",
    // Clerk's frontend API proxy path, when AUTH_PROVIDER=clerk.
    "/__clerk/(.*)",
  ],
};
