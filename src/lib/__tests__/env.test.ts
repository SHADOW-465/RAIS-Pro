import { productionEnvProblems } from "../env";

describe("productionEnvProblems", () => {
  const prev = { ...process.env };
  afterEach(() => {
    process.env = { ...prev };
  });
  const env = process.env as Record<string, string | undefined>;

  it("lists every missing production variable", () => {
    env.NODE_ENV = "production";
    delete env.NEXT_PHASE;
    delete env.MOID_STORE;
    delete env.MOID_AUTH_SECRET;
    delete env.NEXT_PUBLIC_SUPABASE_URL;
    delete env.SUPABASE_INTERNAL_URL;
    delete env.SUPABASE_SERVICE_ROLE_KEY;
    const text = productionEnvProblems().join(" ");
    expect(text).toMatch(/MOID_AUTH_SECRET/);
    expect(text).toMatch(/NEXT_PUBLIC_SUPABASE_URL/);
    expect(text).toMatch(/SUPABASE_SERVICE_ROLE_KEY/);
  });

  it("is empty when fully configured", () => {
    env.NODE_ENV = "production";
    delete env.NEXT_PHASE;
    delete env.MOID_STORE;
    env.MOID_AUTH_SECRET = "x".repeat(32);
    env.NEXT_PUBLIC_SUPABASE_URL = "https://x.supabase.co";
    env.SUPABASE_SERVICE_ROLE_KEY = "svc";
    expect(productionEnvProblems()).toEqual([]);
  });

  it("does not demand Supabase when the memory store is forced", () => {
    env.NODE_ENV = "production";
    delete env.NEXT_PHASE;
    env.MOID_STORE = "memory";
    env.MOID_AUTH_SECRET = "x".repeat(32);
    delete env.SUPABASE_SERVICE_ROLE_KEY;
    expect(productionEnvProblems()).toEqual([]);
  });

  it("is empty outside production", () => {
    env.NODE_ENV = "development";
    delete env.MOID_AUTH_SECRET;
    expect(productionEnvProblems().filter((p) => /AUTH/.test(p))).toEqual([]);
  });
});
