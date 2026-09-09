// The proxy's screen redirect.
//
// It is a courtesy, not the authorization boundary — lib/auth/guard.ts is, and
// it reads the role from the database on every guarded call. The proxy runs in
// the Edge runtime and cannot reach the database, so it reads a signed,
// advisory cookie.
//
// That makes FAILING OPEN the property to defend. Every uncertainty — no
// cookie, an expired one, one issued for a role the session no longer names —
// has to mean "let the request through", so that a cookie problem can never
// take a plant off its own app. These tests exist to stop someone tightening
// this into a lockout later, and each one says which uncertainty it covers.
process.env.MOID_STORE = "memory";

import { NextRequest } from "next/server";
import { proxy } from "@/proxy";
import {
  NAV_COOKIE,
  SESSION_COOKIE,
  createNavToken,
  createSessionToken,
} from "@/lib/auth/session";

async function req(
  path: string,
  opts: { role?: string; navRole?: string; nav?: string[]; navToken?: string; ttl?: number } = {},
) {
  const r = new NextRequest(`http://localhost${path}`);
  if (opts.role) r.cookies.set(SESSION_COOKIE, await createSessionToken({ username: "u", role: opts.role }));
  if (opts.navToken !== undefined) r.cookies.set(NAV_COOKIE, opts.navToken);
  else if (opts.nav) {
    r.cookies.set(NAV_COOKIE, await createNavToken(opts.navRole ?? opts.role ?? "gm", opts.nav, opts.ttl));
  }
  return r;
}

const SUP = { role: "supervisor.moulding", nav: ["dashboard", "data-entry", "hold"] };

describe("unchanged behaviour", () => {
  test("no session still redirects a page to /login", async () => {
    const res = await proxy(await req("/spc"));
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toContain("/login");
  });

  test("no session still 401s an API route", async () => {
    expect((await proxy(await req("/api/events"))).status).toBe(401);
  });
});

describe("a screen the role does not have", () => {
  test("redirects to the dashboard, flagged so the app can say why", async () => {
    const res = await proxy(await req("/settings", SUP));
    expect(res.status).toBe(307);
    const to = new URL(res.headers.get("location") as string);
    expect(to.pathname).toBe("/");
    expect(to.searchParams.get("denied")).toBe("1");
  });

  test("covers sub-routes, so /settings/rules is not a way in", async () => {
    const res = await proxy(await req("/settings/rules", SUP));
    expect(new URL(res.headers.get("location") as string).pathname).toBe("/");
  });

  // Redirecting to a screen they also lack would bounce forever.
  test("falls back to a screen they DO have when the dashboard is denied", async () => {
    const res = await proxy(await req("/settings", { role: "r", nav: ["data-entry"] }));
    expect(new URL(res.headers.get("location") as string).pathname).toBe("/data-entry");
  });

  test("lets a screen they do have straight through", async () => {
    const res = await proxy(await req("/hold", SUP));
    expect(res.status).toBe(200);
    expect(res.headers.get("x-moid-role")).toBe("supervisor.moulding");
  });
});

describe("every uncertainty fails open", () => {
  test("no nav cookie at all", async () => {
    expect((await proxy(await req("/settings", { role: SUP.role }))).status).toBe(200);
  });

  test("an unreadable or tampered nav cookie", async () => {
    expect((await proxy(await req("/settings", { role: SUP.role, navToken: "junk" }))).status).toBe(200);
  });

  test("an expired nav cookie", async () => {
    const res = await proxy(await req("/settings", { ...SUP, ttl: -1 }));
    expect(res.status).toBe(200);
  });

  // The GM widened this role a moment ago; the cookie is one page load stale.
  // Honouring it would bounce someone away from a screen they now have.
  test("a nav cookie issued for a different role than the session names", async () => {
    const res = await proxy(await req("/settings", { role: SUP.role, navRole: "operator", nav: ["dashboard"] }));
    expect(res.status).toBe(200);
  });

  // API routes authorize themselves, with the database, per call.
  test("API routes are never screen-checked here", async () => {
    expect((await proxy(await req("/api/schema", SUP))).status).toBe(200);
  });

  test("a path that is not a screen is left alone", async () => {
    expect((await proxy(await req("/healthz", SUP))).status).toBe(200);
  });
});
