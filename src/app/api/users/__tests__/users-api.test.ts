// User administration is GM-only and must never hand back a password hash.
process.env.MOID_STORE = "memory";

import { NextRequest } from "next/server";
import { GET, POST, PATCH } from "../route";
import { sessionCookie } from "@/__tests__/fixtures/auth";
import { __resetUserStoreForTests } from "@/lib/auth/users";
import type { PersonaId } from "@/lib/persona";

async function call(
  handler: (r: NextRequest) => Promise<Response>,
  method: string,
  role: PersonaId | null,
  body?: unknown,
) {
  const headers: Record<string, string> = {};
  if (body !== undefined) headers["content-type"] = "application/json";
  if (role) headers["Cookie"] = await sessionCookie(role);
  return handler(
    new NextRequest("http://localhost/api/users", {
      method,
      headers,
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    }),
  );
}

const newUser = (over: Record<string, unknown> = {}) => ({
  username: "r.kumar",
  displayName: "R. Kumar",
  role: "operator",
  password: "shopfloor-1",
  ...over,
});

beforeEach(() => __resetUserStoreForTests());

describe("authorization", () => {
  it("is closed to anonymous callers", async () => {
    expect((await call(GET, "GET", null)).status).toBe(401);
    expect((await call(POST, "POST", null, newUser())).status).toBe(401);
  });

  it("is closed to operators and owners — creating accounts is `configure`", async () => {
    for (const role of ["operator", "owner"] as PersonaId[]) {
      expect((await call(GET, "GET", role)).status).toBe(403);
      expect((await call(POST, "POST", role, newUser())).status).toBe(403);
      expect((await call(PATCH, "PATCH", role, { username: "x", action: "deactivate" })).status).toBe(403);
    }
  });

  it("lets a GM through", async () => {
    expect((await call(GET, "GET", "gm")).status).toBe(200);
  });
});

describe("creating people", () => {
  it("creates a user and never returns a password hash", async () => {
    expect((await call(POST, "POST", "gm", newUser())).status).toBe(200);

    const body = await (await call(GET, "GET", "gm")).json();
    expect(body.users).toHaveLength(1);
    expect(body.users[0]).toMatchObject({ username: "r.kumar", role: "operator", active: true });

    // The whole payload, not just the one field — a hash must not ride along
    // inside any nested shape either.
    expect(JSON.stringify(body)).not.toContain("scrypt$");
    expect(body.users[0].passwordHash).toBeUndefined();
  });

  it("records who created the account, from the session", async () => {
    await call(POST, "POST", "gm", newUser());
    const body = await (await call(GET, "GET", "gm")).json();
    expect(body.users[0].createdBy).toBe("gm");
  });

  it("rejects a short password, a reserved name and an unknown role", async () => {
    expect((await call(POST, "POST", "gm", newUser({ password: "abc" }))).status).toBe(400);
    expect((await call(POST, "POST", "gm", newUser({ username: "gm" }))).status).toBe(400);
    expect((await call(POST, "POST", "gm", newUser({ role: "superuser" }))).status).toBe(400);
  });
});

describe("shared-login status", () => {
  it("reports every role as shared while no named users exist", async () => {
    const body = await (await call(GET, "GET", "gm")).json();
    expect(body.sharedLoginsActive).toEqual(["gm", "owner", "operator"]);
  });

  it("drops a role from the list once somebody real holds it", async () => {
    await call(POST, "POST", "gm", newUser());
    const body = await (await call(GET, "GET", "gm")).json();
    expect(body.sharedLoginsActive).not.toContain("operator");
    expect(body.sharedLoginsActive).toContain("gm");
  });
});

describe("deactivation guards", () => {
  // The guard asks about the `configure` capability, not about the literal
  // role id "gm" — see the note in the route. A plant that renames its admin
  // role, or grants administration to a second one, is still protected.
  it("will not strand the plant without an active login that can administer it", async () => {
    await call(POST, "POST", "gm", newUser({ username: "a.singh", role: "gm", displayName: "A. Singh" }));
    const res = await call(PATCH, "PATCH", "gm", { username: "a.singh", action: "deactivate" });
    expect(res.status).toBe(409);
    expect((await res.json()).error).toMatch(/last active login that can administer/);
  });

  it("allows it once a second GM exists", async () => {
    await call(POST, "POST", "gm", newUser({ username: "a.singh", role: "gm", displayName: "A" }));
    await call(POST, "POST", "gm", newUser({ username: "b.rao", role: "gm", displayName: "B" }));
    expect((await call(PATCH, "PATCH", "gm", { username: "a.singh", action: "deactivate" })).status).toBe(200);
  });

  it("deactivates an operator, and can re-enable them", async () => {
    await call(POST, "POST", "gm", newUser());
    expect((await call(PATCH, "PATCH", "gm", { username: "r.kumar", action: "deactivate" })).status).toBe(200);
    let body = await (await call(GET, "GET", "gm")).json();
    expect(body.users[0].active).toBe(false);
    // …and the shared operator login comes back, since nobody real holds it now.
    expect(body.sharedLoginsActive).toContain("operator");

    expect((await call(PATCH, "PATCH", "gm", { username: "r.kumar", action: "activate" })).status).toBe(200);
    body = await (await call(GET, "GET", "gm")).json();
    expect(body.users[0].active).toBe(true);
  });

  it("404s on an unknown user and 400s on a bad action", async () => {
    expect((await call(PATCH, "PATCH", "gm", { username: "nobody", action: "deactivate" })).status).toBe(404);
    expect((await call(PATCH, "PATCH", "gm", { username: "nobody", action: "explode" })).status).toBe(400);
  });
});
