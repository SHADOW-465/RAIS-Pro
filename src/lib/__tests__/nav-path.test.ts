// Which screen a URL belongs to, and the nav cookie the proxy reads it with.
//
// The proxy uses both to send someone away from a screen their role does not
// have. It is a courtesy, not the authorization boundary — so the property
// worth pinning hardest is that every failure mode is a quiet "allow", never a
// lockout. A cookie problem must not be able to take a plant off its own app.

import { navKeyForPath, NAV_ROUTES, ROUTED_NAV_KEYS, type NavKey } from "@/lib/nav-keys";
import { createNavToken, verifyNavToken } from "@/lib/auth/session";

describe("navKeyForPath", () => {
  test("every routed destination resolves back to itself", () => {
    for (const key of ROUTED_NAV_KEYS) {
      expect(navKeyForPath(NAV_ROUTES[key].href as string)).toBe(key);
    }
  });

  test("the dashboard is matched exactly, not as a prefix of everything", () => {
    expect(navKeyForPath("/")).toBe("dashboard");
    expect(navKeyForPath("/spc")).toBe("spc");
  });

  // Settings has real sub-routes; resolving one to null would let a role
  // without Settings walk straight into /settings/rules.
  test("a sub-route resolves to its parent screen", () => {
    expect(navKeyForPath("/settings/rules")).toBe("settings");
    expect(navKeyForPath("/data-entry/anything/deeper")).toBe("data-entry");
  });

  test("a trailing slash changes nothing", () => {
    expect(navKeyForPath("/settings/")).toBe("settings");
  });

  test("non-screens resolve to null", () => {
    for (const path of ["/api/events", "/login", "/healthz", "/nope"]) {
      expect(navKeyForPath(path)).toBeNull();
    }
  });

  // "/hold" must not swallow "/holdings"; prefix matching is on path segments.
  test("a longer path that merely starts with a screen's name is not that screen", () => {
    expect(navKeyForPath("/holdings")).toBeNull();
  });
});

describe("the nav cookie", () => {
  const NAV: NavKey[] = ["dashboard", "data-entry", "hold"];

  test("round-trips the role and its screens", async () => {
    const payload = await verifyNavToken(await createNavToken("supervisor.moulding", NAV));
    expect(payload?.r).toBe("supervisor.moulding");
    expect(payload?.n).toEqual(NAV);
  });

  // It is signed with the session key, so widening your own access by editing
  // a cookie does not work — and would only change chrome if it did.
  test("a tampered payload does not verify", async () => {
    const token = await createNavToken("supervisor.moulding", NAV);
    const [body, sig] = token.split(".");
    const forged = Buffer.from(
      JSON.stringify({ r: "supervisor.moulding", n: ["settings"], exp: 9999999999 }),
    )
      .toString("base64url")
      .replace(/=+$/, "");
    expect(await verifyNavToken(`${forged}.${sig}`)).toBeNull();
    expect(await verifyNavToken(`${body}.deadbeef`)).toBeNull();
  });

  test("garbage and absence are null, not a throw", async () => {
    for (const t of [undefined, null, "", "nodot", "a.b"]) {
      expect(await verifyNavToken(t)).toBeNull();
    }
  });

  test("an expired list does not verify", async () => {
    expect(await verifyNavToken(await createNavToken("gm", NAV, -1))).toBeNull();
  });
});
