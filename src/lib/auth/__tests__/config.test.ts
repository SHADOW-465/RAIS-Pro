import {
  findUser,
  getAuthSecret,
  getAuthUsers,
  isAuthEnabled,
  listLoginOptions,
  passwordForRole,
  DEFAULT_AUTH_SECRET,
  DEFAULT_PRESET_PASSWORDS,
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
    expect(getAuthSecret()).toBe(DEFAULT_AUTH_SECRET);
  });

  it("uses MOID_AUTH_SECRET when long enough", () => {
    process.env.MOID_AUTH_SECRET = "plant-override-secret-32chars!!";
    expect(getAuthSecret()).toBe("plant-override-secret-32chars!!");
  });

  it("exposes exactly gm, owner, operator", () => {
    const users = getAuthUsers();
    expect(users.map((u) => u.role)).toEqual(["gm", "owner", "operator"]);
    expect(listLoginOptions()).toHaveLength(3);
  });

  it("accepts role id + default password", () => {
    delete process.env.MOID_AUTH_PASSWORD_GM;
    delete process.env.MOID_AUTH_PASSWORD;
    const u = findUser("gm", DEFAULT_PRESET_PASSWORDS.gm);
    expect(u?.role).toBe("gm");
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

// The built-in secret and passwords are in the repo, so a deployment still
// using them is forgeable by anyone with a checkout — every capability check
// in guard.ts rests on the session being unforgeable. Production must refuse
// them rather than quietly carry on.
describe("production refuses the repo's public credentials", () => {
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

  it("never throws in production, whatever is or isn't set — this is what runs on every request", () => {
    // getAuthSecret/passwordForRole sit under src/proxy.ts, which runs on
    // every single request. A version of this that threw here once took the
    // entire app down on Vercel, which sets NODE_ENV=production automatically
    // and never sees .env.local. A security check that can 500 every page is
    // worse than the exposure it guards against.
    clearAuthEnv();
    setNodeEnv("production");
    expect(() => getAuthSecret()).not.toThrow();
    expect(() => passwordForRole("gm")).not.toThrow();
    // …and still falls back to the usable (if public) defaults, so a plant
    // that wants the simple pilot passwords keeps working unattended.
    expect(getAuthSecret()).toBe(DEFAULT_AUTH_SECRET);
    expect(passwordForRole("gm")).toBe(DEFAULT_PRESET_PASSWORDS.gm);
  });

  it("stays permissive in development so a fresh clone still runs", () => {
    clearAuthEnv();
    setNodeEnv("development");
    expect(getAuthSecret()).toBe(DEFAULT_AUTH_SECRET);
    expect(passwordForRole("gm")).toBe(DEFAULT_PRESET_PASSWORDS.gm);
  });

  it("a fully configured production deployment uses the real values", () => {
    clearAuthEnv();
    setNodeEnv("production");
    process.env.MOID_AUTH_SECRET = "a-real-secret-well-over-16-chars";
    process.env.MOID_AUTH_PASSWORD = "a-real-password";
    expect(getAuthSecret()).toBe("a-real-secret-well-over-16-chars");
    expect(findUser("gm", "a-real-password")?.role).toBe("gm");
    expect(findUser("gm", DEFAULT_PRESET_PASSWORDS.gm)).toBeNull();
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
