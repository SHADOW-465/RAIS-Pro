import fs from "node:fs";
import path from "node:path";

// supabase/APPLY_ME_*.sql is a hand-run bundle of migrations. This keeps it from
// drifting from the files it copies, and keeps the RLS lockdown last.
const ROOT = process.cwd();
const BUNDLE = fs.readFileSync(path.join(ROOT, "supabase", "APPLY_ME_2026-10-31.sql"), "utf8");
const ORDER = [
  "20261021_capa_actions",
  "20261031120000_batch_conversion_reversal",
  "20261031130000_batch_conversion_reason",
  "20261031140000_plant_shared_state",
  "20261101120000_effective_events",
  "20261101130000_ledger_meta",
  "20261102000000_rls_lockdown",
];
const norm = (s: string) => s.replace(/\r\n/g, "\n").trim();

describe("APPLY_ME bundle", () => {
  const bundle = norm(BUNDLE);

  it.each(ORDER)("contains %s verbatim", (name) => {
    const sql = fs.readFileSync(path.join(ROOT, "supabase", "migrations", `${name}.sql`), "utf8");
    expect(bundle).toContain(norm(sql));
  });

  it("keeps the migrations in order, RLS lockdown last", () => {
    const at = ORDER.map((n) => bundle.indexOf(`-- ${ORDER.indexOf(n) + 1}. ${n}.sql`));
    expect(at.every((i) => i >= 0)).toBe(true);
    expect([...at].sort((a, b) => a - b)).toEqual(at);
  });

  it("the lockdown sorts after every other migration file", () => {
    const files = fs.readdirSync(path.join(ROOT, "supabase", "migrations")).filter((f) => f.endsWith(".sql")).sort();
    expect(files[files.length - 1]).toBe("20261102000000_rls_lockdown.sql");
  });
});
