const KEYS = {
  AUTH_PROVIDER: "clerk",
  NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: "pk_test_dummy",
  CLERK_SECRET_KEY: "sk_test_dummy",
} as const;

for (const [k, v] of Object.entries(KEYS)) process.env[k] = v;

jest.mock("@clerk/nextjs/server", () => ({
  auth: jest.fn(async () => ({ userId: null })),
  clerkClient: async () => ({ users: { getUser: jest.fn() } }),
}));

import { NextRequest } from "next/server";
import { hashPassword } from "@/lib/auth/users";
import { POST as login } from "../route";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/auth/session";
import { __resetLoginThrottleForTests } from "@/lib/auth/login-throttle";
import { __resetRoleStoreForTests } from "@/lib/auth/roles";

const TEST_PASSWORD = "correct-horse-test-only";
let storedHash = "";

function req(body: unknown, ip = "203.0.113.10") {
  return new NextRequest("http://localhost/api/auth/login", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-forwarded-for": ip,
    },
    body: JSON.stringify(body),
  });
}

beforeAll(async () => {
  storedHash = await hashPassword(TEST_PASSWORD);
  process.env.GM_PASSWORD_LOGIN_HASH = storedHash;
});

beforeEach(() => {
  for (const [k, v] of Object.entries(KEYS)) process.env[k] = v;
  process.env.GM_PASSWORD_LOGIN_USER = "gm";
  process.env.GM_PASSWORD_LOGIN_HASH = storedHash;
  __resetLoginThrottleForTests();
  __resetRoleStoreForTests();
});

afterEach(() => {
  for (const k of Object.keys(KEYS)) delete process.env[k];
  delete process.env.GM_PASSWORD_LOGIN_USER;
});

describe("break-glass login in clerk mode", () => {
  test("correct password issues a gm session", async () => {
    const res = await login(req({ username: "gm", password: TEST_PASSWORD }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.user).toMatchObject({ username: "gm", role: "gm" });
    const cookie = res.cookies.get(SESSION_COOKIE)?.value;
    expect(cookie).toBeTruthy();
    const session = await verifySessionToken(cookie);
    expect(session).toMatchObject({ u: "gm", r: "gm" });
  });

  test("wrong password is a generic 401", async () => {
    const res = await login(req({ username: "gm", password: "nope-not-it" }));
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe("Wrong username or password.");
    expect(res.cookies.get(SESSION_COOKIE)?.value).toBeFalsy();
  });

  test("operator legacy login is still refused in clerk mode", async () => {
    const res = await login(req({ username: "operator", password: TEST_PASSWORD }));
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe("Wrong username or password.");
    expect(res.cookies.get(SESSION_COOKIE)?.value).toBeFalsy();
  });

  test("feature is off and password login is 403 when env is missing", async () => {
    delete process.env.GM_PASSWORD_LOGIN_USER;
    delete process.env.GM_PASSWORD_LOGIN_HASH;
    const res = await login(req({ username: "gm", password: TEST_PASSWORD }));
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toMatch(/Password sign-in is disabled/);
  });
});
