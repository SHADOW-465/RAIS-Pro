// Every API GET answers `private, no-store`: a browser or CDN that keeps an
// API response is how a tab shows yesterday's ledger after a deploy.

import { readFileSync, readdirSync, statSync } from "fs";
import { join } from "path";
import { NextResponse } from "next/server";
import { PRIVATE_NO_STORE, withNoStore } from "../live-cache";

const API = join(process.cwd(), "src", "app", "api");

function routeFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) return name === "__tests__" ? [] : routeFiles(p);
    return name === "route.ts" ? [p] : [];
  });
}

describe("API GET handlers", () => {
  const files = routeFiles(API);

  it("finds the route files", () => {
    expect(files.length).toBeGreaterThan(20);
  });

  it.each(files.map((f) => [f.slice(API.length + 1).split("\\").join("/"), f]))(
    "%s exports GET only through withNoStore",
    (_name, file) => {
      const src = readFileSync(file, "utf8");
      // A bare `export function GET` would skip the header on its error paths.
      expect(src).not.toMatch(/export\s+(async\s+)?function\s+GET\b/);
      const exportsGet = /export\s+const\s+GET\b/.test(src);
      if (exportsGet) expect(src).toMatch(/export\s+const\s+GET\s*=\s*withNoStore\(/);
    },
  );

  it("sets the header on success, error and thrown-then-handled responses alike", async () => {
    const ok = await withNoStore(async () => NextResponse.json({ a: 1 }, { headers: { "Cache-Control": "max-age=999" } }))();
    const bad = await withNoStore(() => NextResponse.json({ error: "x" }, { status: 500 }))();
    const plain = await withNoStore(() => new Response("file", { headers: { "cache-control": "public, immutable" } }))();
    for (const r of [ok, bad, plain]) expect(r.headers.get("cache-control")).toBe(PRIVATE_NO_STORE);
    expect(bad.status).toBe(500);
  });
});
