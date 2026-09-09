// Plant user administration. GM only — `configure`, the same capability that
// gates the schema and the calculation policy.
//
// Password hashes never leave lib/auth/users.ts, so nothing here can return one
// even by accident: the store's list() strips the field before it returns.

import { NextResponse, type NextRequest } from "next/server";
import { requireCapability } from "@/lib/auth/guard";
import {
  companyId,
  createUser,
  getUserStore,
  normalizeUsername,
  presetLoginAllowed,
  validatePassword,
  hashPassword,
} from "@/lib/auth/users";
import { PERSONA_ORDER, type RoleId } from "@/lib/persona";
import { listRoles, resolveRole } from "@/lib/auth/roles";

export async function GET(req: NextRequest) {
  const auth = await requireCapability(req, "configure");
  if (!auth.ok) return auth.response;

  const users = await getUserStore().list(companyId());
  // Which roles still answer to their shared password, so the UI can say so
  // rather than leaving the GM to guess whether `moid-gm` still works.
  const sharedLoginsActive: RoleId[] = [];
  for (const role of PERSONA_ORDER) {
    if (await presetLoginAllowed(role)) sharedLoginsActive.push(role);
  }
  return NextResponse.json({ users, sharedLoginsActive });
}

export async function POST(req: NextRequest) {
  const auth = await requireCapability(req, "configure");
  if (!auth.ok) return auth.response;

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  // Any role in plant_roles, not just the three built-ins — that is the point
  // of the Roles & access screen. `createUser` re-checks, so this is only here
  // to answer with something better than "Unknown role.".
  const role = String(body.role ?? "");
  if (!(await resolveRole(role))) {
    return NextResponse.json({ error: "Unknown role." }, { status: 400 });
  }

  try {
    const error = await createUser({
      username: String(body.username ?? ""),
      displayName: String(body.displayName ?? ""),
      role,
      password: String(body.password ?? ""),
      createdBy: auth.actor.username,
    });
    if (error) return NextResponse.json({ error }, { status: 400 });
  } catch (e) {
    // Most likely the migration has not been applied — say so rather than 500.
    return NextResponse.json({ error: e instanceof Error ? e.message : "Failed to create user." }, { status: 500 });
  }

  return NextResponse.json({ ok: true, users: await getUserStore().list(companyId()) });
}

export async function PATCH(req: NextRequest) {
  const auth = await requireCapability(req, "configure");
  if (!auth.ok) return auth.response;

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const username = normalizeUsername(String(body.username ?? ""));
  const action = String(body.action ?? "");
  if (!username) return NextResponse.json({ error: "username required" }, { status: 400 });

  const store = getUserStore();

  if (action === "set-password") {
    const password = String(body.password ?? "");
    const pwErr = validatePassword(password);
    if (pwErr) return NextResponse.json({ error: pwErr }, { status: 400 });
    const ok = await store.setPassword(companyId(), username, await hashPassword(password));
    if (!ok) return NextResponse.json({ error: "No such user." }, { status: 404 });
    return NextResponse.json({ ok: true });
  }

  if (action === "activate" || action === "deactivate") {
    const active = action === "activate";
    // Deactivating the last active GM would leave nobody able to administer the
    // plant. The preset login would come back, but only for whoever knows the
    // shared password — which is the arrangement this feature exists to end.
    if (!active) {
      const users = await store.list(companyId());
      const target = users.find((u) => u.username === username);
      // "The last GM" used to mean literally role === "gm". Once a plant can
      // create its own roles that is the wrong question twice over: a custom
      // Plant Admin role holding `configure` should count, and a GM role a
      // plant has stripped of `configure` should not. Ask about the capability
      // that actually administers the plant.
      const adminRoles = new Set(
        (await listRoles()).filter((r) => r.active && r.capabilities.configure).map((r) => r.roleId),
      );
      if (target && adminRoles.has(target.role)) {
        const otherAdmins = users.filter(
          (u) => u.active && u.username !== username && adminRoles.has(u.role),
        );
        if (otherAdmins.length === 0) {
          return NextResponse.json(
            {
              error:
                "This is the last active login that can administer the plant. Create another one before deactivating this.",
            },
            { status: 409 },
          );
        }
      }
      if (username === auth.actor.username) {
        return NextResponse.json({ error: "You cannot deactivate your own account." }, { status: 409 });
      }
    }
    const ok = await store.setActive(companyId(), username, active);
    if (!ok) return NextResponse.json({ error: "No such user." }, { status: 404 });
    return NextResponse.json({ ok: true, users: await store.list(companyId()) });
  }

  return NextResponse.json({ error: "action must be set-password, activate or deactivate." }, { status: 400 });
}
