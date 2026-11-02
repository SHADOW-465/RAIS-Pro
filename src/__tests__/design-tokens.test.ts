/**
 * Design-token guard (UI redesign phase 1).
 * - Font weights are capped at 600 (400/500/600 only).
 * - Every `var(--x)` used in src resolves to a token defined in globals.css,
 *   so nothing silently falls back to a hard-coded colour.
 */
import { readFileSync, readdirSync, statSync } from "fs";
import { join } from "path";

const SRC = join(__dirname, "..");

function files(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === "__tests__" || name === "node_modules") continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) files(p, out);
    else if (/\.(tsx?|css)$/.test(name)) out.push(p);
  }
  return out;
}

const all = files(SRC).map((p) => ({ p, s: readFileSync(p, "utf8") }));

test("no font weight above 600", () => {
  const heavy = /(fontWeight[=:]\s*\{?\s*["']?|font-weight:\s*)(700|800|900|bold|bolder)\b|\bfont-(bold|extrabold|black)\b|[Ww]eight[^\n]{0,60}[?:]\s*(700|800|900)\b/;
  const offenders = all.filter(({ s }) => heavy.test(s)).map(({ p }) => p);
  expect(offenders).toEqual([]);
});

test("every CSS variable used is defined", () => {
  const globals = readFileSync(join(SRC, "app", "globals.css"), "utf8");
  const defined = new Set(globals.match(/--[a-z0-9-]+(?=\s*:)/g));
  // Injected by next/font on <html>; viz-N is built as `var(--viz-${n})`.
  ["--font-geist-sans", "--font-geist-mono"].forEach((v) => defined.add(v));
  const missing = new Set<string>();
  for (const { s } of all) {
    for (const m of s.matchAll(/var\((--[a-z0-9-]+)/g)) {
      if (m[1] !== "--viz-" && !defined.has(m[1])) missing.add(m[1]);
    }
  }
  expect([...missing]).toEqual([]);
});
