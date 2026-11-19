// Clerk actor mapping. Clerk is mocked — these never call a live API.

const KEYS = {
  AUTH_PROVIDER: "clerk",
  NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: "pk_test_dummy",
  CLERK_SECRET_KEY: "sk_test_dummy",
} as const;

for (const [k, v] of Object.entries(KEYS)) process.env[k] = v;

const auth = jest.fn();
const getUser = jest.fn();
const updateUserMetadata = jest.fn();
const clerkClient = jest.fn(async () => ({ users: { getUser, updateUserMetadata } }));

jest.mock("@clerk/nextjs/server", () => ({
  auth: () => auth(),
  clerkClient: () => clerkClient(),
}));

import type { NextRequest } from "next/server";
import { actorFrom } from "../guard";
import {
  clearClerkActorCache,
  invalidateClerkActorCache,
  mappingsFromClerkUser,
  parseMoidMapping,
} from "../clerk-actor";
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
  updateUserMetadata.mockReset().mockResolvedValue({});
  clerkClient.mockClear();
});

afterEach(() => {
  for (const k of Object.keys(KEYS)) delete process.env[k];
  jest.restoreAllMocks();
});

describe("parseMoidMapping", () => {
  test("reads username and role from private metadata", () => {
    expect(parseMoidMapping({ moid: { username: "r.kumar", role: "operator" } })).toEqual({
      username: "r.kumar",
      role: "operator",
    });
  });

  test("accepts a capitalised username such as Lakshun", () => {
    expect(parseMoidMapping({ moid: { username: "Lakshun", role: "gm" } })).toEqual({
      username: "Lakshun",
      role: "gm",
    });
  });

  test("rejects missing or incomplete metadata", () => {
    expect(parseMoidMapping(undefined)).toBeNull();
    expect(parseMoidMapping({})).toBeNull();
    expect(parseMoidMapping({ moid: { username: "r.kumar" } })).toBeNull();
    expect(parseMoidMapping({ moid: { role: "gm" } })).toBeNull();
    expect(parseMoidMapping({ moid: { username: "  ", role: "gm" } })).toBeNull();
    // A role sitting in some other bag is not a mapping.
    expect(parseMoidMapping({ role: "gm", username: "gm" })).toBeNull();
  });

  test("reads REST snake_case metadata bags", () => {
    const { privateMapping, publicMapping } = mappingsFromClerkUser({
      private_metadata: {},
      public_metadata: { moid: { username: "Lakshun", role: "gm" } },
    });
    expect(privateMapping).toBeNull();
    expect(publicMapping).toEqual({ username: "Lakshun", role: "gm" });
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

  test("a public-only mapping is honoured and promoted into private metadata", async () => {
    auth.mockResolvedValue({ userId: "user_lakshun" });
    getUser.mockResolvedValue({
      privateMetadata: {},
      publicMetadata: { moid: { username: "Lakshun", role: "gm" } },
    });
    const actor = await actorFrom(req);
    expect(actor).toMatchObject({ username: "Lakshun", role: "gm" });
    expect(updateUserMetadata).toHaveBeenCalledWith("user_lakshun", {
      privateMetadata: { moid: { username: "Lakshun", role: "gm" } },
    });
  });

  test("a public-only mapping is still a session if promotion fails", async () => {
    auth.mockResolvedValue({ userId: "user_pub" });
    getUser.mockResolvedValue({
      privateMetadata: {},
      publicMetadata: { moid: { username: "Lakshun", role: "gm" } },
    });
    updateUserMetadata.mockRejectedValue(new Error("merge failed"));
    const err = jest.spyOn(console, "error").mockImplementation(() => {});
    const actor = await actorFrom(req);
    expect(actor).toMatchObject({ username: "Lakshun", role: "gm" });
    expect(err).toHaveBeenCalled();
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

  test("auth() throwing is logged and is not a session", async () => {
    auth.mockRejectedValue(new Error("clerk unavailable"));
    const err = jest.spyOn(console, "error").mockImplementation(() => {});
    expect(await actorFrom(req)).toBeNull();
    expect(err).toHaveBeenCalled();
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

  test("a null mapping is not cached for a full minute", async () => {
    let now = 1_000_000;
    jest.spyOn(Date, "now").mockImplementation(() => now);
    auth.mockResolvedValue({ userId: "user_miss" });
    getUser.mockResolvedValue({ privateMetadata: {}, publicMetadata: {} });

    expect(await actorFrom(req)).toBeNull();
    expect(getUser).toHaveBeenCalledTimes(1);

    now += 4_000;
    expect(await actorFrom(req)).toBeNull();
    expect(getUser).toHaveBeenCalledTimes(1);

    now += 2_000;
    getUser.mockResolvedValue({
      publicMetadata: { moid: { username: "qa_test", role: "operator" } },
    });
    const actor = await actorFrom(req);
    expect(actor).toMatchObject({ username: "qa_test", role: "operator" });
    expect(getUser).toHaveBeenCalledTimes(2);
  });

  test("invalidateClerkActorCache drops a user so a re-grant is visible immediately", async () => {
    auth.mockResolvedValue({ userId: "user_5" });
    getUser.mockResolvedValue({ privateMetadata: {}, publicMetadata: {} });
    expect(await actorFrom(req)).toBeNull();
    expect(getUser).toHaveBeenCalledTimes(1);

    invalidateClerkActorCache("user_5");
    getUser.mockResolvedValue({
      privateMetadata: { moid: { username: "qa_test", role: "operator" } },
    });
    expect(await actorFrom(req)).toMatchObject({ username: "qa_test", role: "operator" });
    expect(getUser).toHaveBeenCalledTimes(2);
  });
});
