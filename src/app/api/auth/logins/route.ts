// What the sign-in page may offer, before anyone is signed in.
//
// Two lists, and the boundary between them matters:
//
//   people  — active named accounts, grouped by role on the page. Tapping one
//             fills the username in. This is the quick login on a shop-floor
//             terminal, and it keeps every entry attributable to a person.
//   logins  — preset ROLE logins that still work. A shared role password stops
//             working the moment somebody real holds that role, so a retired
//             one is a button that can only ever fail.
//
// ── What this deliberately exposes ─────────────────────────────────────────
// This endpoint is public — it is read by the login page, which by definition
// has no session. Listing staff here means anyone who can reach the app can
// read the names and usernames of everyone who works here. That is a real
// disclosure and it was chosen on purpose: it is how plant MES terminals work,
// a shift should not have to type a name to clock into a screen, and the
// alternative on the table was giving each role a shared password, which would
// have cost the audit trail the thing it exists for.
//
// It follows that this must stay the MINIMUM that makes a card work: who they
// are, what to type, and which role they hold. Never a password hash — the
// user store strips those before they leave it — never an email, never
// last-seen, never a count of failed attempts. If a deployment ever needs the
// staff list hidden, this is the one function to gate; nothing else leaks it.
//
// Deactivated accounts are omitted. They cannot sign in, so a card for one is
// a button that fails, and their absence says nothing a colleague could not
// already tell you.

import { NextResponse } from "next/server";
import { listLoginOptions } from "@/lib/auth/config";
import { companyId, getUserStore, presetLoginAllowed } from "@/lib/auth/users";
import { listRoles } from "@/lib/auth/roles";
import { personaDef } from "@/lib/persona";

export interface LoginPerson {
  username: string;
  displayName: string;
  roleId: string;
  roleLabel: string;
  /** Display initial, from the person's name — not the role's. */
  initial: string;
}

export async function GET() {
  // A store that cannot be read means "no named accounts", exactly as it does
  // on the sign-in path itself: the preset logins still answer, and nobody is
  // locked out by a database problem.
  let people: LoginPerson[] = [];
  let roleOrder: string[] = [];

  try {
    const [users, roles] = await Promise.all([
      getUserStore().list(companyId()),
      listRoles(),
    ]);
    const labelOf = new Map(roles.map((r) => [r.roleId, r.label]));
    roleOrder = roles
      .slice()
      .sort((a, b) => a.sortOrder - b.sortOrder || a.roleId.localeCompare(b.roleId))
      .map((r) => r.roleId);

    people = users
      .filter((u) => u.active)
      .map((u) => ({
        username: u.username,
        displayName: u.displayName,
        roleId: u.role,
        roleLabel: labelOf.get(u.role) ?? personaDef(u.role).label,
        initial: (u.displayName.trim().charAt(0) || u.username.charAt(0) || "?").toUpperCase(),
      }))
      .sort((a, b) => a.displayName.localeCompare(b.displayName));
  } catch {
    /* degrade to presets only */
  }

  // Only the shared logins that can still succeed. Filtering these is not an
  // extra disclosure once `people` is public — a role with a named account is
  // already visible above — and it stops the page offering a dead button.
  const presets = [];
  for (const option of listLoginOptions()) {
    if (await presetLoginAllowed(option.id)) presets.push(option);
  }

  return NextResponse.json({ authEnabled: true, logins: presets, people, roleOrder });
}
