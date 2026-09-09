import { NextResponse } from "next/server";
import { NAV_COOKIE, SESSION_COOKIE } from "@/lib/auth/session";

export async function POST() {
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
