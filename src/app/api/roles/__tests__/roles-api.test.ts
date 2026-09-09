// Role administration is the route that can lock a plant out of its own app,
// so what is pinned here is mostly the refusals. Each one corresponds to a way
// it actually happens — see the four numbered cases in the route header.
process.env.MOID_STORE = "memory";

import { NextRequest } from "next/server";
import { GET, POST, PATCH, DELETE } from "../route";
import { sessionCookie } from "@/__tests__/fixtures/auth";
import { __resetRoleStoreForTests, resolveRole } from "@/lib/auth/roles";
import { __resetUserStoreForTests, createUser } from "@/lib/auth/users";
import { grantsFromRole, permissionGrantId, screenGrantId } from "@/lib/access/catalog";
import { PERSONAS } from "@/lib/persona";

async function call(
  handler: (r: NextRequest) => Promise<Response>,
  method: string,
  role: string | null,
  body?: unknown,
  query = "",
) {
  const headers: Record<string, string> = {};
  if (body !== undefined) headers["content-type"] = "application/json";
  if (role) headers["Cookie"] = await sessionCookie(role as "gm");
  return handler(
    new NextRequest(`http://localhost/api/roles${query}`, {
      method,
      headers,
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    }),
  );
}

/** A supervisor role: the plant's own, no administration rights. */
const supervisor = (over: Record<string, unknown> = {}) => ({
  roleId: "supervisor.moulding",
  label: "Supervisor — Moulding",
  title: "Line oversight",
  homeHref: "/data-entry",
  grants: [
    screenGrantId("dashboard"),
    screenGrantId("data-entry"),
    screenGrantId("hold"),
    permissionGrantId("write"),
  ],
  ...over,
});

beforeEach(() => {
  __resetRoleStoreForTests();
  __resetUserStoreForTests();
});

describe("authorization", () => {
  it("is closed to anonymous callers", async () => {
    expect((await call(GET, "GET", null)).status).toBe(401);
  });

  it("is closed to roles without `configure`", async () => {
    expect((await call(GET, "GET", "operator")).status).toBe(403);
    expect((await call(POST, "POST", "owner", supervisor())).status).toBe(403);
  });
});

describe("creating a role", () => {
  it("stores the grants a GM ticked, as all three access columns at once", async () => {
    const res = await call(POST, "POST", "gm", supervisor());
    expect(res.status).toBe(200);

    const role = await resolveRole("supervisor.moulding");
    expect(role?.label).toBe("Supervisor — Moulding");
    // Screens land in navAllow, permissions in capabilities, everything in grants.
    expect(role?.navAllow.sort()).toEqual(["dashboard", "data-entry", "hold"]);
    expect(role?.capabilities).toEqual({
      write: true,
      approve: false,
      configure: false,
      eraseLedger: false,
    });
    expect(role?.grants).toContain(permissionGrantId("write"));
    expect(role?.builtin).toBe(false);
  });

  it("rejects a duplicate id rather than overwriting a live role", async () => {
    await call(POST, "POST", "gm", supervisor());
    const res = await call(POST, "POST", "gm", supervisor({ label: "Something else" }));
    expect(res.status).toBe(409);
    expect((await resolveRole("supervisor.moulding"))?.label).toBe("Supervisor — Moulding");
  });

  it("refuses a malformed id and a role with no name", async () => {
    expect((await call(POST, "POST", "gm", supervisor({ roleId: "!!" }))).status).toBe(400);
    expect((await call(POST, "POST", "gm", supervisor({ label: "  " }))).status).toBe(400);
  });

  // A client one deploy behind should still be able to save.
  it("drops grant ids the catalog does not know instead of failing the save", async () => {
    await call(POST, "POST", "gm", supervisor({ grants: ["screen.dashboard", "screen.invented"] }));
    const role = await resolveRole("supervisor.moulding");
    expect(role?.grants).toEqual(["screen.dashboard"]);
  });
});

describe("editing a role", () => {
  it("narrows access when the GM unticks a screen", async () => {
    await call(POST, "POST", "gm", supervisor());
    await call(PATCH, "PATCH", "gm", {
      roleId: "supervisor.moulding",
      grants: [screenGrantId("dashboard")],
    });
    const role = await resolveRole("supervisor.moulding");
    expect(role?.navAllow).toEqual(["dashboard"]);
    expect(role?.capabilities.write).toBe(false);
  });

  it("can rename and deactivate someone else's role", async () => {
    await call(POST, "POST", "gm", supervisor());
    await call(PATCH, "PATCH", "gm", {
      roleId: "supervisor.moulding",
      label: "Supervisor — Line 1",
      active: false,
    });
    const role = await resolveRole("supervisor.moulding");
    expect(role?.label).toBe("Supervisor — Line 1");
    expect(role?.active).toBe(false);
  });

  it("404s for a role that does not exist", async () => {
    expect((await call(PATCH, "PATCH", "gm", { roleId: "nope", label: "x" })).status).toBe(404);
  });
});

// ── The refusals ────────────────────────────────────────────────────────────
// Everything below is a way a plant loses the ability to administer itself.

describe("a GM cannot cut off their own way back", () => {
  const gmGrants = () => [...grantsFromRole(PERSONAS.gm)];

  it("refuses to drop `configure` from the role they are signed in as", async () => {
    const res = await call(PATCH, "PATCH", "gm", {
      roleId: "gm",
      grants: gmGrants().filter((g) => g !== permissionGrantId("configure")),
    });
    expect(res.status).toBe(409);
    expect((await res.json()).error).toMatch(/your own permission/i);
    expect((await resolveRole("gm"))?.capabilities.configure).toBe(true);
  });

  it("refuses to hide the Settings screen from their own role", async () => {
    const res = await call(PATCH, "PATCH", "gm", {
      roleId: "gm",
      grants: gmGrants().filter((g) => g !== screenGrantId("settings")),
    });
    expect(res.status).toBe(409);
    expect((await res.json()).error).toMatch(/Settings screen/);
  });

  it("refuses to deactivate or delete the role they are signed in as", async () => {
    expect((await call(PATCH, "PATCH", "gm", { roleId: "gm", active: false })).status).toBe(409);
    expect((await call(DELETE, "DELETE", "gm", undefined, "?roleId=gm")).status).toBe(409);
  });
});

describe("somebody has to be able to administer the plant", () => {
  it("lets `configure` move to another role once that role has it", async () => {
    // Second admin first, then the original may be narrowed — the check asks
    // about the state AFTER the edit, which is what makes this order work.
    await call(POST, "POST", "gm", {
      roleId: "plant.admin",
      label: "Plant Admin",
      grants: [screenGrantId("settings"), permissionGrantId("configure")],
    });
    const res = await call(PATCH, "PATCH", "gm", { roleId: "plant.admin", active: false });
    expect(res.status).toBe(200);
    expect((await resolveRole("plant.admin"))?.active).toBe(false);
  });
});

describe("deleting a role", () => {
  it("refuses to delete a built-in — it is the fallback for a broken table", async () => {
    const res = await call(DELETE, "DELETE", "gm", undefined, "?roleId=operator");
    expect(res.status).toBe(409);
    expect((await res.json()).error).toMatch(/Built-in/);
    expect(await resolveRole("operator")).not.toBeNull();
  });

  it("refuses while active logins still hold it, and names them", async () => {
    await call(POST, "POST", "gm", supervisor());
    await createUser({
      username: "r.kumar",
      displayName: "R. Kumar",
      role: "supervisor.moulding",
      password: "shopfloor-1",
      createdBy: "gm",
    });

    const res = await call(DELETE, "DELETE", "gm", undefined, "?roleId=supervisor.moulding");
    expect(res.status).toBe(409);
    expect((await res.json()).error).toMatch(/r\.kumar/);
    expect(await resolveRole("supervisor.moulding")).not.toBeNull();
  });

  it("goes through once nobody holds it", async () => {
    await call(POST, "POST", "gm", supervisor());
    const res = await call(DELETE, "DELETE", "gm", undefined, "?roleId=supervisor.moulding");
    expect(res.status).toBe(200);
    expect(await resolveRole("supervisor.moulding")).toBeNull();
  });
});

describe("the list a GM picks from", () => {
  it("carries every role plus how many active logins hold each", async () => {
    await call(POST, "POST", "gm", supervisor());
    await createUser({
      username: "r.kumar",
      displayName: "R. Kumar",
      role: "supervisor.moulding",
      password: "shopfloor-1",
      createdBy: "gm",
    });

    const body = await (await call(GET, "GET", "gm")).json();
    expect(body.roles.map((r: { roleId: string }) => r.roleId)).toEqual(
      expect.arrayContaining(["gm", "owner", "operator", "supervisor.moulding"]),
    );
    expect(body.activeUserCounts["supervisor.moulding"]).toBe(1);
    expect(body.actingRole).toBe("gm");
  });
});
