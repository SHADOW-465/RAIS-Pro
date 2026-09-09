import { NextRequest, NextResponse } from "next/server";
import { authenticate } from "@/lib/auth/users";
import {
  SESSION_COOKIE,
  createSessionToken,
  sessionCookieOptions,
} from "@/lib/auth/session";
import { personaDef } from "@/lib/persona";
import { resolveRole } from "@/lib/auth/roles";

export async function POST(req: NextRequest) {
  let body: { username?: string; role?: string; password?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  // Prefer role (from the picker); username accepted as alias for the same id.
  const identity = String(body.role ?? body.username ?? "").trim();
  const password = String(body.password ?? "");
  if (!identity || !password) {
    return NextResponse.json(
      { error: "Select a role and enter its password." },
      { status: 400 },
    );
  }

  // Wrapped end to end: `authenticate` reaches Supabase (named-user lookup)
  // and a database problem there — a bad grant, a network blip — must surface
  // as a clean 500 an operator can act on, never an unhandled crash. This is
  // what every other write route in the app already does; login didn't,
  // which is exactly how a plant_users permission error took sign-in down.
  try {
    const user = await authenticate(identity, password);
    if (!user) {
      // One message for unknown user, wrong password and disabled account —
      // anything more specific is a way to enumerate who works here.
      return NextResponse.json(
        { error: "Wrong username or password." },
        { status: 401 },
      );
    }

    const token = await createSessionToken(user);
    // The stored role wins over the built-in definition: a plant that renamed
    // its Operator role, or created a Supervisor one, should see that name on
    // the way in and land where that role says it lands.
    const role = await resolveRole(user.role);
    const persona = role ?? personaDef(user.role);
    const res = NextResponse.json({
      ok: true,
      user: {
        username: user.username,
        displayName: user.displayName,
        role: user.role,
        label: persona.label,
        homeHref: persona.homeHref,
      },
    });
    res.cookies.set(SESSION_COOKIE, token, sessionCookieOptions());
    return res;
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("[auth] login failed unexpectedly:", err);
    return NextResponse.json(
      { error: "Sign-in is temporarily unavailable. Try again shortly." },
      { status: 500 },
    );
  }
}
