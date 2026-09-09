// Who am I, and what may I see?
//
// The role's DEFINITION travels with the answer, not just its id. The client
// used to look the role up in the `PERSONAS` union, which meant a role the
// plant created matched nothing — and the fallback was the default persona, a
// full-access GM. A supervisor was shown the whole sidebar, Settings included.
// Deny-by-omission only works if the client can tell "no access" apart from
// "no idea", so the server answers with both.

import { NextRequest, NextResponse } from "next/server";
import {
  NAV_COOKIE,
  SESSION_COOKIE,
  createNavToken,
  sessionCookieOptions,
  verifySessionToken,
} from "@/lib/auth/session";
import { resolveRole } from "@/lib/auth/roles";

export async function GET(req: NextRequest) {
  const token = req.cookies.get(SESSION_COOKIE)?.value;
  const session = await verifySessionToken(token);
  if (!session) {
    return NextResponse.json({ authEnabled: true, user: null }, { status: 401 });
  }

  // A role that has been deleted or switched off is not a session any more —
  // the same reading lib/auth/guard.ts takes, so the chrome and the API agree.
  const role = await resolveRole(session.r);
  if (!role || !role.active) {
    return NextResponse.json({ authEnabled: true, user: null }, { status: 401 });
  }

  const res = NextResponse.json({
    authEnabled: true,
    user: { username: session.u, role: role.roleId },
    role: {
      roleId: role.roleId,
      label: role.label,
      title: role.title,
      initial: role.initial,
      homeHref: role.homeHref,
      navAllow: role.navAllow,
      capabilities: role.capabilities,
      grants: role.grants,
    },
  });

  // Re-issued on every check, so editing a role's screens takes effect on the
  // next page load rather than at the next sign-in.
  res.cookies.set(
    NAV_COOKIE,
    await createNavToken(role.roleId, role.navAllow),
    sessionCookieOptions(),
  );
  return res;
}
