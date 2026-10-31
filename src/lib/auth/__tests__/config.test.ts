import {
  findUser,
  getAuthSecret,
  getAuthUsers,
  isAuthEnabled,
  listLoginOptions,
  passwordForRole,
  authConfigError,
  missingProductionSecrets,
} from "../config";

describe("preset role logins", () => {
  const prev = { ...process.env };

  afterEach(() => {
    process.env = { ...prev };
  });

  it("always requires sign-in with a session secret", () => {
    delete process.env.MOID_AUTH_SECRET;
    expect(isAuthEnabled()).toBe(true);
    expect(getAuthSecret().length).toBeGreaterThanOrEqual(16);
  });

  it("uses MOID_AUTH_SECRET when long enough", () => {
    process.env.MOID_AUTH_SECRET = "plant-override-secret-32chars!!";
    expect(getAuthSecret()).toBe("plant-override-secret-32chars!!");
  });

  it("exposes exactly gm, owner, operator", () => {
    process.env.MOID_AUTH_PASSWORD = "shared-plant";
    const users = getAuthUsers();
    expect(users.map((u) => u.role)).toEqual(["gm", "owner", "operator"]);
    expect(listLoginOptions()).toHaveLength(3);
  });

  it("has no built-in passwords: a role with none configured cannot sign in", () => {
    delete process.env.MOID_AUTH_PASSWORD_GM;
    delete process.env.MOID_AUTH_PASSWORD;
    expect(passwordForRole("gm")).toBeNull();
    for (const guess of ["moid-gm", "gm", "", "password"]) {
      expect(findUser("gm", guess)).toBeNull();
    }
  });

  it("accepts role id + the configured password", () => {
    process.env.MOID_AUTH_PASSWORD_GM = "plant-gm-secret";
    expect(findUser("gm", "plant-gm-secret")?.role).toBe("gm");
    expect(findUser("gm", "wrong")).toBeNull();
  });

  it("honours MOID_AUTH_PASSWORD_OPERATOR override", () => {
    process.env.MOID_AUTH_PASSWORD_OPERATOR = "plant-op-secret";
    expect(passwordForRole("operator")).toBe("plant-op-secret");
    expect(findUser("operator", "plant-op-secret")?.role).toBe("operator");
  });

  it("accepts shared MOID_AUTH_PASSWORD for all roles", () => {
    process.env.MOID_AUTH_PASSWORD = "shared-plant";
    delete process.env.MOID_AUTH_PASSWORD_GM;
    expect(findUser("owner", "shared-plant")?.role).toBe("owner");
  });
});

// Nothing in the repo is a credential. A production server without
// MOID_AUTH_SECRET must refuse to sign or verify sessions at all.
describe("production fails closed without MOID_AUTH_SECRET", () => {
  const prev = { ...process.env };
  afterEach(() => {
    process.env = { ...prev };
  });

  // NODE_ENV is typed readonly; tests legitimately need to simulate a build.
  const setNodeEnv = (v: string) => {
    (process.env as Record<string, string | undefined>).NODE_ENV = v;
  };

  const clearAuthEnv = () => {
    delete process.env.MOID_AUTH_SECRET;
    delete process.env.MOID_AUTH_PASSWORD;
    delete process.env.NEXT_PHASE;
    for (const r of ["GM", "OWNER", "OPERATOR"]) delete process.env[`MOID_AUTH_PASSWORD_${r}`];
  };

  it("names every unset variable", () => {
    clearAuthEnv();
    expect(missingProductionSecrets()).toEqual([
      "MOID_AUTH_SECRET",
      "MOID_AUTH_PASSWORD_GM",
      "MOID_AUTH_PASSWORD_OWNER",
      "MOID_AUTH_PASSWORD_OPERATOR",
    ]);
  });

  it("a shared MOID_AUTH_PASSWORD satisfies all three roles", () => {
    clearAuthEnv();
    process.env.MOID_AUTH_PASSWORD = "one-for-all";
    expect(missingProductionSecrets()).toEqual(["MOID_AUTH_SECRET"]);
  });

  it("throws in production when the secret is missing or too short", () => {
    clearAuthEnv();
    setNodeEnv("production");
    expect(authConfigError()).toMatch(/MOID_AUTH_SECRET/);
    expect(() => getAuthSecret()).toThrow(/MOID_AUTH_SECRET/);
    process.env.MOID_AUTH_SECRET = "too-short";
    expect(() => getAuthSecret()).toThrow();
  });

  it("does not throw during `next build` (nothing is serving requests)", () => {
    clearAuthEnv();
    setNodeEnv("production");
    process.env.NEXT_PHASE = "phase-production-build";
    expect(authConfigError()).toBeNull();
    expect(() => getAuthSecret()).not.toThrow();
  });

  it("uses a dev-only key outside production so a fresh clone still runs", () => {
    clearAuthEnv();
    setNodeEnv("development");
    expect(authConfigError()).toBeNull();
    expect(getAuthSecret()).toMatch(/dev-only/);
  });

  it("a fully configured production deployment uses the real values", () => {
    clearAuthEnv();
    setNodeEnv("production");
    process.env.MOID_AUTH_SECRET = "a-real-secret-well-over-16-chars";
    process.env.MOID_AUTH_PASSWORD = "a-real-password";
    expect(authConfigError()).toBeNull();
    expect(getAuthSecret()).toBe("a-real-secret-well-over-16-chars");
    expect(findUser("gm", "a-real-password")?.role).toBe("gm");
    expect(findUser("gm", "moid-gm")).toBeNull();
  });
});

describe("password comparison", () => {
  it("rejects a prefix of the real password", () => {
    process.env.MOID_AUTH_PASSWORD_GM = "correct-horse-battery";
    expect(findUser("gm", "correct-horse-batter")).toBeNull();
    expect(findUser("gm", "correct-horse-batteryX")).toBeNull();
    expect(findUser("gm", "")).toBeNull();
    expect(findUser("gm", "correct-horse-battery")?.role).toBe("gm");
  });
});
