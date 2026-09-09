// /api/auth/me carries the ROLE DEFINITION, not just its id.
//
// This is the regression that matters. The client used to look a session's
// role up in the `PERSONAS` union; a role the plant created matched nothing,
// and the fallback was the default persona — a full-access GM. A supervisor
// was rendered the entire sidebar, Settings included, while the API correctly
// refused every action behind it. Chrome that lies about what someone may do
// is worse than chrome that is merely wrong: it invites the 403.
//
// So: the server answers with navAllow and capabilities, and the client renders
// exactly that. If this test goes red, the sidebar has stopped being trustworthy.
//
// Lives beside the route rather than in src/app/api/auth/__tests__: that folder
// is a grouping segment with no route.ts of its own, and putting a __tests__
// directory directly in it made Next 404 every route under /api/auth. Tests go
// in the LEAF route directory here, same as api/users and api/ingest.
process.env.MOID_STORE = "memory";

import { NextRequest } from "next/server";
import { GET } from "../route";
import { sessionCookie } from "@/__tests__/fixtures/auth";
import { __resetRoleStoreForTests, __seedRoleForTests, type RoleRecord } from "@/lib/auth/roles";

const SUPERVISOR: RoleRecord = {
  roleId: "supervisor.moulding",
  label: "Supervisor — Moulding",
  title: "Line oversight",
  initial: "S",
  homeHref: "/data-entry",
  navAllow: ["dashboard", "data-entry", "hold"],
  capabilities: { write: true, approve: false, configure: false, eraseLedger: false },
  grants: ["screen.dashboard", "screen.data-entry", "screen.hold", "permission.write"],
  builtin: false,
  active: true,
  sortOrder: 30,
};

const call = async (role: string | null) => {
  const headers: Record<string, string> = {};
  if (role) headers["Cookie"] = await sessionCookie(role as "gm");
  return GET(new NextRequest("http://localhost/api/auth/me", { headers }));
};

beforeEach(() => __resetRoleStoreForTests());

test("no session is 401", async () => {
  expect((await call(null)).status).toBe(401);
});

test("a built-in role gets its own definition", async () => {
  const body = await (await call("operator")).json();
  expect(body.role.label).toBe("Data Entry Operator");
  expect(body.role.capabilities.configure).toBe(false);
  expect(body.role.navAllow).not.toContain("settings");
});

test("a plant-created role gets ITS definition, not a fallback to full access", async () => {
  __seedRoleForTests(SUPERVISOR);
  const body = await (await call("supervisor.moulding")).json();

  expect(body.user.role).toBe("supervisor.moulding");
  expect(body.role.label).toBe("Supervisor — Moulding");
  expect(body.role.homeHref).toBe("/data-entry");
  expect(body.role.navAllow).toEqual(["dashboard", "data-entry", "hold"]);
  // The screens that would have appeared under the old union fallback.
  for (const denied of ["settings", "schema", "copq", "audit", "reports"]) {
    expect(body.role.navAllow).not.toContain(denied);
  }
  expect(body.role.capabilities.configure).toBe(false);
});

// The chrome and lib/auth/guard.ts have to agree about what a dead role means,
// or someone is left signed in to a shell where nothing works.
test("a role that was deleted or switched off reads as no session", async () => {
  expect((await call("supervisor.deleted")).status).toBe(401);

  __seedRoleForTests({ ...SUPERVISOR, active: false });
  expect((await call("supervisor.moulding")).status).toBe(401);
});
