// Role administration. GM only — `configure`, the same capability that gates
// the schema, the calculation policy and plant users.
//
// This is the route that can lock a plant out of its own app, so most of the
// code here is refusals. Four of them, each for a way it actually happens:
//
//   1. A built-in role is deleted, and with it the fallback that makes a broken
//      roles table survivable.
//   2. The last role holding `configure` loses it, and nobody can create users,
//      edit the schema, or undo step 2.
//   3. A GM edits their OWN role and removes their way back to this screen.
//   4. A role is deleted while people are signed in as it — their next request
//      resolves to no role, which the guard reads as signed-out, mid-shift.
//
// Rules that need to see USERS live here rather than in lib/auth/roles.ts:
// users.ts already imports that module to validate a role assignment, and the
// reverse edge would be an import cycle.

import { NextResponse, type NextRequest } from "next/server";
import { requireCapability } from "@/lib/auth/guard";
import {
  BUILTIN_ROLES,
  deleteRole,
  listRoles,
  normalizeRoleId,
  resolveRole,
  roleFromGrants,
  rolesWithConfigure,
  saveRole,
  validateRoleId,
  type RoleRecord,
} from "@/lib/auth/roles";
import { companyId, getUserStore } from "@/lib/auth/users";
import { leafById, screenGrantId } from "@/lib/access/catalog";

const bad = (error: string, status = 400) => NextResponse.json({ error }, { status });

/** Ticked leaves the catalog recognises. Unknown ids are dropped rather than
 *  rejected: a client one deploy behind should not be unable to save. */
function parseGrants(raw: unknown): Set<string> {
  if (!Array.isArray(raw)) return new Set();
  return new Set(raw.filter((v): v is string => typeof v === "string" && !!leafById(v)));
}

/** Active logins holding `roleId`. */
async function holders(roleId: string): Promise<string[]> {
  const users = await getUserStore().list(companyId());
  return users.filter((u) => u.active && u.role === roleId).map((u) => u.username);
}

/**
 * Would this change leave nobody able to administer the plant?
 *
 * Checked against the roles that would exist AFTER the edit, not before — the
 * question is about the resulting state, and asking it of the current one is
 * how a check like this passes while the thing it guards against happens.
 */
async function wouldStrandAdministration(
  roleId: string,
  after: { active: boolean; configure: boolean } | null,
): Promise<boolean> {
  const remaining = (await rolesWithConfigure()).filter((r) => r.roleId !== roleId);
  if (remaining.length > 0) return false;
  return !(after && after.active && after.configure);
}

export async function GET(req: NextRequest) {
  const auth = await requireCapability(req, "configure");
  if (!auth.ok) return auth.response;

  const roles = await listRoles();
  const users = await getUserStore().list(companyId());
  // Holder counts belong with the list: "delete this role" is a very different
  // decision when four people are signed in as it.
  const counts: Record<string, number> = {};
  for (const u of users) {
    if (u.active) counts[u.role] = (counts[u.role] ?? 0) + 1;
  }
  return NextResponse.json({ roles, activeUserCounts: counts, actingRole: auth.actor.role });
}

export async function POST(req: NextRequest) {
  const auth = await requireCapability(req, "configure");
  if (!auth.ok) return auth.response;

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return bad("Invalid JSON body.");
  }

  const roleId = normalizeRoleId(String(body.roleId ?? ""));
  const idErr = validateRoleId(roleId);
  if (idErr) return bad(idErr);
  if (await resolveRole(roleId)) return bad(`Role "${roleId}" already exists.`, 409);

  const label = String(body.label ?? "").trim();
  if (!label) return bad("Give the role a name.");

  const grants = parseGrants(body.grants);
  const base = {
    roleId,
    label,
    title: String(body.title ?? "").trim(),
    initial: (String(body.initial ?? label).trim().charAt(0) || "?").toUpperCase(),
    homeHref: String(body.homeHref ?? "/") || "/",
    builtin: false,
    active: true,
    sortOrder: typeof body.sortOrder === "number" ? body.sortOrder : 100,
  };

  try {
    await saveRole(roleFromGrants(base, grants));
  } catch (e) {
    return bad(e instanceof Error ? e.message : "Failed to save role.", 500);
  }
  return NextResponse.json({ ok: true, roles: await listRoles() });
}

export async function PATCH(req: NextRequest) {
  const auth = await requireCapability(req, "configure");
  if (!auth.ok) return auth.response;

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return bad("Invalid JSON body.");
  }

  const roleId = normalizeRoleId(String(body.roleId ?? ""));
  if (!roleId) return bad("roleId required");
  const current = await resolveRole(roleId);
  if (!current) return bad("No such role.", 404);

  const next: RoleRecord = { ...current };
  if (typeof body.label === "string" && body.label.trim()) next.label = body.label.trim();
  if (typeof body.title === "string") next.title = body.title.trim();
  if (typeof body.homeHref === "string" && body.homeHref) next.homeHref = body.homeHref;
  if (typeof body.initial === "string" && body.initial.trim()) {
    next.initial = body.initial.trim().charAt(0).toUpperCase();
  }
  if (typeof body.active === "boolean") next.active = body.active;

  let grants: Set<string> | null = null;
  if (body.grants !== undefined) {
    grants = parseGrants(body.grants);
    Object.assign(next, roleFromGrants({ ...next }, grants));
  }

  // (3) You may narrow anyone's access but your own way back to this screen.
  // A GM who ticks the wrong box on their own role has no second GM to undo it
  // on a single-administrator plant, which is most of them.
  if (roleId === auth.actor.role) {
    if (!next.active) return bad("You cannot deactivate the role you are signed in as.", 409);
    if (!next.capabilities.configure) {
      return bad(
        "That would remove your own permission to change roles and settings. Grant it to another role first, then sign in as that one.",
        409,
      );
    }
    if (grants && !grants.has(screenGrantId("settings"))) {
      return bad("Your own role has to keep the Settings screen — it is where this page lives.", 409);
    }
  }

  // (2) …and somebody, somewhere, has to keep `configure`.
  if (
    await wouldStrandAdministration(roleId, {
      active: next.active,
      configure: next.capabilities.configure,
    })
  ) {
    return bad(
      "This is the last role that can administer the plant. Give another role permission to change schema, settings and logins first.",
      409,
    );
  }

  try {
    await saveRole(next);
  } catch (e) {
    return bad(e instanceof Error ? e.message : "Failed to save role.", 500);
  }
  return NextResponse.json({ ok: true, roles: await listRoles() });
}

export async function DELETE(req: NextRequest) {
  const auth = await requireCapability(req, "configure");
  if (!auth.ok) return auth.response;

  const roleId = normalizeRoleId(req.nextUrl.searchParams.get("roleId") ?? "");
  if (!roleId) return bad("roleId required");

  // (1) The built-ins are the fallback that makes an unreadable roles table
  // survivable. Deleting one deletes the safety net, not just the row.
  if (BUILTIN_ROLES[roleId]) {
    return bad("Built-in roles cannot be deleted. Deactivate it instead.", 409);
  }
  if (roleId === auth.actor.role) return bad("You cannot delete the role you are signed in as.", 409);

  // (4) Deleting a role people hold signs them out mid-shift, and the ledger
  // still names them as the author of everything they entered.
  const held = await holders(roleId);
  if (held.length > 0) {
    return bad(
      `${held.length} active login${held.length === 1 ? "" : "s"} still use this role (${held
        .slice(0, 3)
        .join(", ")}${held.length > 3 ? ", …" : ""}). Move them to another role first.`,
      409,
    );
  }

  if (await wouldStrandAdministration(roleId, null)) {
    return bad(
      "This is the last role that can administer the plant. Give another role permission to change schema, settings and logins first.",
      409,
    );
  }

  try {
    if (!(await deleteRole(roleId))) return bad("No such role.", 404);
  } catch (e) {
    return bad(e instanceof Error ? e.message : "Failed to delete role.", 500);
  }
  return NextResponse.json({ ok: true, roles: await listRoles() });
}
