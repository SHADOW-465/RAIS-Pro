import { clerkKeysPresent, getAuthProvider, isClerkAuth } from "../provider";

const KEYS = {
  NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: "pk_test_dummy",
  CLERK_SECRET_KEY: "sk_test_dummy",
} as const;

function setEnv(map: Record<string, string | undefined>) {
  for (const [k, v] of Object.entries(map)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
}

afterEach(() => {
  setEnv({
    AUTH_PROVIDER: undefined,
    NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: undefined,
    CLERK_SECRET_KEY: undefined,
  });
});

test("defaults to legacy when nothing is set", () => {
  setEnv({ AUTH_PROVIDER: undefined, ...{ NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: undefined, CLERK_SECRET_KEY: undefined } });
  expect(getAuthProvider()).toBe("legacy");
  expect(isClerkAuth()).toBe(false);
  expect(clerkKeysPresent()).toBe(false);
});

test("AUTH_PROVIDER=clerk without keys still falls back to legacy", () => {
  setEnv({ AUTH_PROVIDER: "clerk", NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: undefined, CLERK_SECRET_KEY: undefined });
  expect(getAuthProvider()).toBe("legacy");
  expect(isClerkAuth()).toBe(false);
});

test("AUTH_PROVIDER=clerk with both keys is clerk mode", () => {
  setEnv({ AUTH_PROVIDER: "clerk", ...KEYS });
  expect(clerkKeysPresent()).toBe(true);
  expect(getAuthProvider()).toBe("clerk");
  expect(isClerkAuth()).toBe(true);
});

test("keys alone, without AUTH_PROVIDER=clerk, stay on legacy", () => {
  setEnv({ AUTH_PROVIDER: undefined, ...KEYS });
  expect(clerkKeysPresent()).toBe(true);
  expect(getAuthProvider()).toBe("legacy");
});
