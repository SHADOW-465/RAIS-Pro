import { NextResponse } from "next/server";
import { isClerkAuth } from "@/lib/auth/provider";
import { NAV_COOKIE, SESSION_COOKIE } from "@/lib/auth/session";

export async function POST() {
  if (isClerkAuth()) {
    try {
      const { auth, clerkClient } = await import("@clerk/nextjs/server");
      const { sessionId } = await auth();
      if (sessionId) {
        const client = await clerkClient();
        await client.sessions.revokeSession(sessionId);
      }
    } catch (err) {
      // Still clear local cookies below — a Clerk API blip must not leave
      // someone signed in on this terminal.
      // eslint-disable-next-line no-console
      console.error("[auth] Clerk sign-out failed:", err);
    }
  }

  const res = NextResponse.json({ ok: true });
  const secure =
    process.env.MOID_AUTH_COOKIE_SECURE === "1" ||
    process.env.VERCEL === "1" ||
    process.env.MOID_AUTH_COOKIE_SECURE === "true";
  // Both, or the next person on a shared shop-floor terminal signs in and
  // carries the previous role's screen list until /api/auth/me replaces it.
  for (const name of [SESSION_COOKIE, NAV_COOKIE]) {
    res.cookies.set(name, "", {
      httpOnly: true,
      sameSite: "lax",
      secure,
      path: "/",
      maxAge: 0,
    });
  }
  return res;
}
