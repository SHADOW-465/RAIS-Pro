import fs from "node:fs";
import path from "node:path";

// supabase/APPLY_ME_*.sql are hand-run bundles of migrations. This keeps them
// from drifting from the files they copy, keeps the RLS lockdown out of the
// features bundle, and keeps the lockdown last.
const ROOT = process.cwd();
const read = (...p: string[]) => fs.readFileSync(path.join(ROOT, ...p), "utf8");
const norm = (s: string) => s.replace(/\r\n/g, "\n").trim();
const mig = (name: string) => norm(read("supabase", "migrations", `${name}.sql`));

const FEATURES = [
  "20261021_capa_actions",
  "20261031120000_batch_conversion_reversal",
  "20261031130000_batch_conversion_reason",
  "20261031140000_plant_shared_state",
  "20261101120000_effective_events",
  "20261101130000_ledger_meta",
];
const LOCKDOWN = "20261102000000_rls_lockdown";

describe("APPLY_ME features bundle", () => {
  const bundle = norm(read("supabase", "APPLY_ME_2026-10-31.sql"));

  it.each(FEATURES)("contains %s verbatim", (name) => {
    expect(bundle).toContain(mig(name));
  });

  it("keeps the migrations in order", () => {
    const at = FEATURES.map((n, i) => bundle.indexOf(`-- ${i + 1}. ${n}.sql`));
    expect(at.every((i) => i >= 0)).toBe(true);
    expect([...at].sort((a, b) => a - b)).toEqual(at);
  });

  it("does not contain the lockdown", () => {
    expect(bundle).not.toContain(mig(LOCKDOWN));
    expect(bundle).not.toMatch(/ALTER DEFAULT PRIVILEGES/);
  });
});

describe("APPLY_ME lockdown bundle", () => {
  const bundle = norm(read("supabase", "APPLY_ME_2026-10-31_LOCKDOWN.sql"));

  it("contains the lockdown migration verbatim", () => {
    expect(bundle).toContain(mig(LOCKDOWN));
  });

  it("warns to set SUPABASE_SERVICE_ROLE_KEY first", () => {
    expect(bundle.slice(0, 1200)).toMatch(/ONLY run this AFTER SUPABASE_SERVICE_ROLE_KEY/);
  });
});

describe("migration ordering and grants", () => {
  it("the lockdown sorts after every other migration file", () => {
    const files = fs.readdirSync(path.join(ROOT, "supabase", "migrations")).filter((f) => f.endsWith(".sql")).sort();
    expect(files[files.length - 1]).toBe(`${LOCKDOWN}.sql`);
  });

  it("feature migrations use the app's open-then-lockdown pattern (no service_role-only grants)", () => {
    for (const name of FEATURES) {
      const sql = mig(name);
      expect(sql).not.toMatch(/REVOKE ALL ON [\w.]+ FROM anon/i);
      expect(sql).not.toMatch(/FOR ALL TO service_role/i);
    }
    expect(mig("20261101120000_effective_events")).toMatch(/grant select on public\.effective_events to anon, authenticated, service_role/i);
  });

  it("ships a rollback that re-grants anon", () => {
    const sql = read("supabase", "ROLLBACK_LOCKDOWN_2026-10-31.sql");
    expect(sql).toMatch(/GRANT ALL ON TABLE public\.%I TO %s/);
    expect(sql).toMatch(/security_invoker = false/);
  });
});
