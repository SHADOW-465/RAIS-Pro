// Clerk-mode request gate, used only when AUTH_PROVIDER=clerk and keys exist.
//
// clerkMiddleware is what lets `auth()` work in route handlers. Protection
// itself stays the same shape as the legacy proxy: public paths pass,
// unsigned-in pages go to /login, APIs get 401, and the nav cookie is an
// advisory screen check that fails open. The authorization boundary remains
// lib/auth/guard.ts, which reads Clerk private metadata and resolveRole.

import { clerkMiddleware } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { SESSION_COOKIE, verifySessionToken } from "./session";
import { deniedScreen, isPublicPath } from "./proxy-gates";

export const handleClerkProxy = clerkMiddleware(async (auth, request) => {
  // Public paths (including /api/auth/me) must still run *inside*
  // clerkMiddleware so auth() in route handlers can see the session.
  // /api/access/* is not public and is gated below; it also needs this wrapper.
  const { pathname } = request.nextUrl;
  if (isPublicPath(pathname)) {
    return NextResponse.next();
  }

  const { userId } = await auth();
  if (!userId) {
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

  // After /api/auth/me, a signed session cookie carries the mapped username
  // and role so the same advisory screen check and x-moid-* headers still
  // work. Until that cookie exists (first request after Google sign-in) we
  // fail open — same as a missing nav cookie today.
  const session = await verifySessionToken(request.cookies.get(SESSION_COOKIE)?.value);
  if (session) {
    const denied = await deniedScreen(request, session.r, pathname);
    if (denied) {
      const home = new URL(denied, request.url);
      home.searchParams.set("denied", "1");
      return NextResponse.redirect(home);
    }
    const res = NextResponse.next();
    res.headers.set("x-moid-user", session.u);
    res.headers.set("x-moid-role", session.r);
    return res;
  }

  return NextResponse.next();
});
