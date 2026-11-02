import { createServerClient, supabaseKeyKind } from "@/lib/supabase";

describe("server Supabase key preference", () => {
  const OLD = { ...process.env };
  beforeEach(() => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://x.supabase.co";
    delete process.env.SUPABASE_INTERNAL_URL;
  });
  afterEach(() => {
    process.env = { ...OLD };
    jest.restoreAllMocks();
  });

  it("prefers the service-role key and does not warn", () => {
    process.env.SUPABASE_SERVICE_ROLE_KEY = "svc";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon";
    const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
    expect(supabaseKeyKind()).toBe("service_role");
    createServerClient();
    expect(warn).not.toHaveBeenCalled();
  });

  it("falls back to the anon key and warns once, never crashes", () => {
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon";
    const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
    expect(supabaseKeyKind()).toBe("anon");
    createServerClient();
    createServerClient();
    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0][0])).toMatch(/service role key missing/);
  });

  it("reports none (and throws) with neither key", () => {
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    expect(supabaseKeyKind()).toBe("none");
    expect(() => createServerClient()).toThrow(/Neither/);
  });
});
