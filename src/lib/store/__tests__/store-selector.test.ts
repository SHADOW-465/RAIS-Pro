import { shouldUseSupabase } from "../index";

describe("shouldUseSupabase", () => {
  const OLD = { ...process.env };
  afterEach(() => { process.env = { ...OLD }; });

  it("is true when URL + a key are present (durable by default)", () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://x.supabase.co";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "svc";
    delete process.env.MOID_STORE;
    expect(shouldUseSupabase()).toBe(true);
  });

  it("is false when MOID_STORE=memory forces memory (test mode)", () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://x.supabase.co";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "svc";
    process.env.MOID_STORE = "memory";
    expect(shouldUseSupabase()).toBe(false);
  });

  it("is false when no Supabase env is configured", () => {
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    delete process.env.MOID_STORE;
    expect(shouldUseSupabase()).toBe(false);
  });
});
