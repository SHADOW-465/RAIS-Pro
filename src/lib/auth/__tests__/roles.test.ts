// Roles as rows — the properties that keep this from becoming a lockout.
//
// The whole point of moving roles into `plant_roles` is that a plant can add a
// Supervisor without a deploy. The whole point of keeping the built-ins in code
// is that no database problem can take a GM's capabilities away. These two have
// to hold at the same time, which is what this file pins down.

import { NextRequest } from "next/server";
import {
  BUILTIN_ROLES,
  __resetRoleStoreForTests,
  __seedRoleForTests,
  isAssignableRole,
  invalidateRoleCache,
  listRoles,
  resolveRole,
  type RoleRecord,
} from "@/lib/auth/roles";
import { actorFrom } from "@/lib/auth/guard";
import { SESSION_COOKIE, createSessionToken } from "@/lib/auth/session";
import { personaDef, PERSONAS } from "@/lib/persona";

const SUPERVISOR: RoleRecord = {
  roleId: "supervisor.moulding",
  label: "Supervisor — Moulding",
  title: "Line oversight",
  initial: "S",
  homeHref: "/data-entry",
  navAllow: ["dashboard", "data-entry", "hold", "open-lots", "defect"],
  capabilities: { write: true, approve: false, configure: false, eraseLedger: false },
  grants: ["screen.dashboard", "screen.data-entry", "permission.write"],
  builtin: false,
  active: true,
  sortOrder: 30,
};

beforeEach(() => {
  __resetRoleStoreForTests();
});

/** A request carrying a signed session for `role`. */
async function asRole(role: string): Promise<NextRequest> {
  const token = await createSessionToken({ username: `u.${role}`, role });
  const req = new NextRequest("http://localhost/api/anything");
  req.cookies.set(SESSION_COOKIE, token);
  return req;
}

describe("built-in roles", () => {
  test("are projected from persona.ts, so there is one definition of GM", () => {
    for (const id of Object.keys(PERSONAS) as (keyof typeof PERSONAS)[]) {
      const role = BUILTIN_ROLES[id];
      expect(role.capabilities).toEqual(PERSONAS[id].capabilities);
      expect(role.navAllow).toEqual([...PERSONAS[id].navAllow]);
      expect(role.builtin).toBe(true);
    }
  });

  test("resolve without any database row present", async () => {
    const gm = await resolveRole("gm");
    expect(gm?.capabilities.eraseLedger).toBe(true);
    expect(gm?.label).toBe("General Manager (GM)");
  });

  test("are always listed, so a GM can never be left with no role to assign", async () => {
    const ids = (await listRoles()).map((r) => r.roleId);
    expect(ids).toEqual(expect.arrayContaining(["gm", "owner", "operator"]));
  });
});

describe("plant-created roles", () => {
  test("resolve, and carry their own capabilities", async () => {
    __seedRoleForTests(SUPERVISOR);
    const role = await resolveRole("supervisor.moulding");
    expect(role?.label).toBe("Supervisor — Moulding");
    expect(role?.capabilities).toEqual({
      write: true,
      approve: false,
      configure: false,
      eraseLedger: false,
    });
  });

  test("are assignable to a login; a role nobody defined is not", async () => {
    __seedRoleForTests(SUPERVISOR);
    expect(await isAssignableRole("supervisor.moulding")).toBe(true);
    expect(await isAssignableRole("supervisor.invented")).toBe(false);
    expect(await isAssignableRole("")).toBe(false);
  });

  test("a deactivated role is no longer assignable", async () => {
    __seedRoleForTests({ ...SUPERVISOR, active: false });
    expect(await isAssignableRole("supervisor.moulding")).toBe(false);
  });
});

describe("the guard reads capabilities from the role, not from a union", () => {
  test("a session for a plant-created role authorizes by that role's bits", async () => {
    __seedRoleForTests(SUPERVISOR);
    invalidateRoleCache();
    const actor = await actorFrom(await asRole("supervisor.moulding"));
    expect(actor).toEqual({
      username: "u.supervisor.moulding",
      role: "supervisor.moulding",
      roleLabel: "Supervisor — Moulding",
      capabilities: { write: true, approve: false, configure: false, eraseLedger: false },
    });
  });

  // A token is signed, so `r` cannot be tampered with — but a role CAN be
  // deleted or switched off after it was issued. Treating that as "signed in
  // with no permissions" would leave someone collecting 403s on every screen
  // with no way to understand why; treating it as no session sends them back
  // to sign in, which is the honest answer.
  test("a session naming a role that no longer exists is not a session", async () => {
    expect(await actorFrom(await asRole("supervisor.deleted"))).toBeNull();
  });

  test("a session for a deactivated role is not a session either", async () => {
    __seedRoleForTests({ ...SUPERVISOR, active: false });
    invalidateRoleCache();
    expect(await actorFrom(await asRole("supervisor.moulding"))).toBeNull();
  });
});

describe("deny by omission", () => {
  // The client only knows the built-ins until the roles API ships. Anything it
  // does not recognise must render as no-access chrome rather than throw on
  // `.label` somewhere deep inside the sidebar.
  test("personaDef gives an unknown role a zero-access definition", () => {
    const def = personaDef("supervisor.moulding");
    expect(def.navAllow).toEqual([]);
    expect(def.capabilities).toEqual({
      write: false,
      approve: false,
      configure: false,
      eraseLedger: false,
    });
    expect(def.label).toBe("supervisor.moulding");
  });

  test("personaDef still returns the real definition for a built-in", () => {
    expect(personaDef("gm").capabilities.configure).toBe(true);
  });
});
