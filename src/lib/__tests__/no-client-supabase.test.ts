/**
 * The browser must never reach the Supabase client: the RLS lockdown denies
 * anon/authenticated, so every DB call has to go through an API route. Walks
 * the import graph from each 'use client' file and fails if it reaches
 * src/lib/supabase.ts (or the supabase-js package).
 */
import fs from "fs";
import path from "path";

const SRC = path.resolve(__dirname, "../..");
const SERVER_CLIENT = path.join(SRC, "lib", "supabase.ts");
// `import type` / `export type` are erased at compile time, so they cannot pull
// a module into a bundle; comments are stripped before matching.
const IMPORT_RE =
  /(?:import|export)\s[^'"]*?from\s*['"]([^'"]+)['"]|import\s*['"]([^'"]+)['"]|(?:require|import)\(\s*['"]([^'"]+)['"]\s*\)/g;
const TYPE_ONLY_RE = /\b(?:import|export)\s+type\b[^;'"]*?from\s*['"][^'"]+['"]/g;
const stripComments = (s: string) => s.replace(TYPE_ONLY_RE, "").replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

function walk(dir: string, out: string[] = []): string[] {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name !== "__tests__" && e.name !== "node_modules") walk(p, out);
    } else if (/\.(ts|tsx)$/.test(e.name) && !/\.test\.tsx?$/.test(e.name)) out.push(p);
  }
  return out;
}

function resolve(from: string, spec: string): string | null {
  const base = spec.startsWith("@/") ? path.join(SRC, spec.slice(2)) : spec.startsWith(".") ? path.resolve(path.dirname(from), spec) : null;
  if (!base) return null;
  for (const c of [base, `${base}.ts`, `${base}.tsx`, path.join(base, "index.ts"), path.join(base, "index.tsx")]) {
    if (fs.existsSync(c) && fs.statSync(c).isFile()) return c;
  }
  return null;
}

const isClientFile = (src: string) => /^\s*(?:\/\/[^\n]*\n|\/\*[\s\S]*?\*\/\s*)*['"]use client['"]/.test(src);

it("no 'use client' file reaches the server Supabase client", () => {
  const files = walk(SRC);
  const source = new Map(files.map((f) => [f, fs.readFileSync(f, "utf8")]));
  const clients = files.filter((f) => isClientFile(source.get(f)!));
  expect(clients.length).toBeGreaterThan(10); // guard against a broken detector

  const offenders: string[] = [];
  for (const entry of clients) {
    // BFS keeping a parent trail so a failure names the import chain.
    const parent = new Map<string, string | null>([[entry, null]]);
    const queue = [entry];
    while (queue.length) {
      const cur = queue.shift()!;
      const text = stripComments(source.get(cur) ?? fs.readFileSync(cur, "utf8"));
      for (const m of text.matchAll(IMPORT_RE)) {
        const spec = m[1] ?? m[2] ?? m[3];
        if (/^@supabase\//.test(spec)) {
          offenders.push(`${path.relative(SRC, entry)} -> ... ${path.relative(SRC, cur)} imports ${spec}`);
          continue;
        }
        const next = resolve(cur, spec);
        if (!next || parent.has(next)) continue;
        parent.set(next, cur);
        if (next === SERVER_CLIENT) {
          const chain: string[] = [];
          for (let n: string | null = next; n; n = parent.get(n) ?? null) chain.unshift(path.relative(SRC, n));
          offenders.push(chain.join(" -> "));
        } else queue.push(next);
      }
    }
  }
  expect(offenders).toEqual([]);
});

it("no client-side code reads NEXT_PUBLIC_SUPABASE_* to talk to the DB", () => {
  const hits = walk(SRC).filter(
    (f) => isClientFile(fs.readFileSync(f, "utf8")) && /NEXT_PUBLIC_SUPABASE/.test(fs.readFileSync(f, "utf8")),
  );
  expect(hits.map((f) => path.relative(SRC, f))).toEqual([]);
});
