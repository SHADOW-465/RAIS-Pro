const KEYS = {
  AUTH_PROVIDER: "clerk",
  NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: "pk_test_dummy",
  CLERK_SECRET_KEY: "sk_test_dummy",
} as const;

for (const [k, v] of Object.entries(KEYS)) process.env[k] = v;

const auth = jest.fn();

jest.mock("@clerk/nextjs/server", () => ({
  auth: () => auth(),
  clerkClient: async () => ({ users: { getUser: jest.fn() } }),
}));

import { NextRequest } from "next/server";
import { actorFrom } from "../guard";
import { createSessionToken, SESSION_COOKIE } from "../session";
import { clearClerkActorCache } from "../clerk-actor";
import { isBreakGlassEnabled, isBreakGlassSession } from "../break-glass";
import { __resetRoleStoreForTests } from "../roles";

function reqWith(token?: string) {
  return {
    cookies: {
      get: (name: string) => (name === SESSION_COOKIE && token ? { value: token } : undefined),
    },
  } as unknown as NextRequest;
}

beforeEach(() => {
  for (const [k, v] of Object.entries(KEYS)) process.env[k] = v;
  delete process.env.GM_PASSWORD_LOGIN_USER;
  delete process.env.GM_PASSWORD_LOGIN_HASH;
  auth.mockReset().mockResolvedValue({ userId: null });
  clearClerkActorCache();
  __resetRoleStoreForTests();
});

afterEach(() => {
  for (const k of Object.keys(KEYS)) delete process.env[k];
  delete process.env.GM_PASSWORD_LOGIN_USER;
  delete process.env.GM_PASSWORD_LOGIN_HASH;
});

describe("isBreakGlassEnabled", () => {
  test("is off when env is missing", () => {
    expect(isBreakGlassEnabled()).toBe(false);
    process.env.GM_PASSWORD_LOGIN_USER = "gm";
    expect(isBreakGlassEnabled()).toBe(false);
    process.env.GM_PASSWORD_LOGIN_HASH = "not-a-scrypt-hash";
    expect(isBreakGlassEnabled()).toBe(false);
  });

  test("is on when user and scrypt hash are set", () => {
    process.env.GM_PASSWORD_LOGIN_USER = "gm";
    process.env.GM_PASSWORD_LOGIN_HASH = "scrypt$16384$ab$cd";
    expect(isBreakGlassEnabled()).toBe(true);
  });
});

describe("actorFrom in clerk mode with a break-glass cookie", () => {
  test("a signed gm cookie is a GM session when the feature is on", async () => {
    process.env.GM_PASSWORD_LOGIN_USER = "gm";
    process.env.GM_PASSWORD_LOGIN_HASH = "scrypt$16384$ab$cd";
    const token = await createSessionToken({ username: "gm", role: "gm" });
    const actor = await actorFrom(reqWith(token));
    expect(actor).toMatchObject({ username: "gm", role: "gm" });
    expect(actor?.capabilities.manageAccess).toBe(false);
  });

  test("an operator cookie is not a session in clerk mode", async () => {
    process.env.GM_PASSWORD_LOGIN_USER = "gm";
    process.env.GM_PASSWORD_LOGIN_HASH = "scrypt$16384$ab$cd";
    const token = await createSessionToken({ username: "operator", role: "operator" });
    expect(await actorFrom(reqWith(token))).toBeNull();
  });

  test("a gm cookie is ignored when the feature is off", async () => {
    const token = await createSessionToken({ username: "gm", role: "gm" });
    expect(isBreakGlassSession({ u: "gm", r: "gm" })).toBe(false);
    expect(await actorFrom(reqWith(token))).toBeNull();
  });
});
