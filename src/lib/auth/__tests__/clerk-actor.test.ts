// Clerk actor mapping. Clerk is mocked — these never call a live API.

const KEYS = {
  AUTH_PROVIDER: "clerk",
  NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: "pk_test_dummy",
  CLERK_SECRET_KEY: "sk_test_dummy",
} as const;

for (const [k, v] of Object.entries(KEYS)) process.env[k] = v;

const auth = jest.fn();
const getUser = jest.fn();
const clerkClient = jest.fn(async () => ({ users: { getUser } }));

jest.mock("@clerk/nextjs/server", () => ({
  auth: () => auth(),
  clerkClient: () => clerkClient(),
}));

import type { NextRequest } from "next/server";
import { actorFrom } from "../guard";
import { clearClerkActorCache, parseMoidMapping } from "../clerk-actor";
import { __resetRoleStoreForTests, __seedRoleForTests, type RoleRecord } from "../roles";

const req = {} as NextRequest;

const SUPERVISOR: RoleRecord = {
  roleId: "supervisor.moulding",
  label: "Supervisor — Moulding",
  title: "Line oversight",
  initial: "S",
  homeHref: "/data-entry",
  navAllow: ["dashboard", "data-entry", "hold"],
  capabilities: { write: true, approve: false, configure: false, eraseLedger: false, manageAccess: false },
  grants: ["screen.dashboard", "screen.data-entry", "screen.hold", "permission.write"],
  scope: { stages: [] },
  builtin: false,
  active: true,
  sortOrder: 30,
};

beforeEach(() => {
  for (const [k, v] of Object.entries(KEYS)) process.env[k] = v;
  clearClerkActorCache();
  __resetRoleStoreForTests();
  auth.mockReset();
  getUser.mockReset();
  clerkClient.mockClear();
});

afterEach(() => {
  for (const k of Object.keys(KEYS)) delete process.env[k];
});

describe("parseMoidMapping", () => {
  test("reads username and role from private metadata", () => {
    expect(parseMoidMapping({ moid: { username: "r.kumar", role: "operator" } })).toEqual({
      username: "r.kumar",
      role: "operator",
    });
  });

  test("rejects missing, public-shaped, or incomplete metadata", () => {
    expect(parseMoidMapping(undefined)).toBeNull();
    expect(parseMoidMapping({})).toBeNull();
    expect(parseMoidMapping({ moid: { username: "r.kumar" } })).toBeNull();
    expect(parseMoidMapping({ moid: { role: "gm" } })).toBeNull();
    expect(parseMoidMapping({ moid: { username: "  ", role: "gm" } })).toBeNull();
    // A role sitting in some other bag is not a mapping.
    expect(parseMoidMapping({ role: "gm", username: "gm" })).toBeNull();
  });
});

describe("actorFrom in clerk mode", () => {
  test("a mapped, active role becomes a MOID Actor", async () => {
    auth.mockResolvedValue({ userId: "user_1" });
    getUser.mockResolvedValue({
      privateMetadata: { moid: { username: "r.kumar", role: "operator" } },
    });

    const actor = await actorFrom(req);
    expect(actor).toEqual({
      username: "r.kumar",
      role: "operator",
      roleLabel: "Data Entry Operator",
      capabilities: { write: true, approve: false, configure: false, eraseLedger: false, manageAccess: false },
    });
  });

  test("an unmapped Clerk user is not a session", async () => {
    auth.mockResolvedValue({ userId: "user_2" });
    getUser.mockResolvedValue({ privateMetadata: {} });
    expect(await actorFrom(req)).toBeNull();
  });

  test("no Clerk session is not a session", async () => {
    auth.mockResolvedValue({ userId: null });
    expect(await actorFrom(req)).toBeNull();
    expect(getUser).not.toHaveBeenCalled();
  });

  test("a mapped but inactive role is not a session", async () => {
    __seedRoleForTests({ ...SUPERVISOR, active: false });
    auth.mockResolvedValue({ userId: "user_3" });
    getUser.mockResolvedValue({
      privateMetadata: { moid: { username: "s.patel", role: "supervisor.moulding" } },
    });
    expect(await actorFrom(req)).toBeNull();
  });

  test("a mapped role that does not exist is not a session", async () => {
    auth.mockResolvedValue({ userId: "user_4" });
    getUser.mockResolvedValue({
      privateMetadata: { moid: { username: "x", role: "does-not-exist" } },
    });
    expect(await actorFrom(req)).toBeNull();
  });
});
