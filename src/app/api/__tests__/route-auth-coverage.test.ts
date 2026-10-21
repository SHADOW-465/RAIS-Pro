// Every mutating API route must authorize at its own boundary.
//
// `src/proxy.ts` authenticates (valid session or 401) but is role-blind, so it
// cannot tell an Owner marked "View only" apart from a GM. Capability checks
// therefore live in the handlers — and Next is explicit that proxy "should not
// be used as a full session management or authorization solution", so there is
// deliberately no blanket authorization net above them.
//
// That makes "someone adds a route and forgets the guard" the live risk: the
// route would still require a session, but every signed-in role would get the
// full run of it. This test is the backstop. It walks the route tree rather
// than checking a hand-written list, so a new route is covered the moment it
// exists.

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const API_DIR = join(process.cwd(), "src", "app", "api");
const MUTATING = ["POST", "PUT", "PATCH", "DELETE"] as const;

/** Auth endpoints establish the session, so they cannot require one.
 *  Anything added here is a deliberate public write — justify it in review. */
const PUBLIC_WRITE_ROUTES = new Set(["auth/login", "auth/logout"]);

function routeFiles(dir: string, base = ""): { rel: string; file: string }[] {
  const out: { rel: string; file: string }[] = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) {
      out.push(...routeFiles(full, base ? `${base}/${name}` : name));
    } else if (name === "route.ts" || name === "route.tsx") {
      out.push({ rel: base || "(root)", file: full });
    }
  }
  return out;
}

const routes = routeFiles(API_DIR);
const countOf = (haystack: string, needle: string) => haystack.split(needle).length - 1;

test("the route tree is actually being walked", () => {
  expect(routes.length).toBeGreaterThan(20);
});

describe.each(routes)("%s", ({ rel, file }) => {
  const src = readFileSync(file, "utf8");
  const handlers = MUTATING.filter(
    (m) =>
      src.includes(`export async function ${m}(`) || src.includes(`export function ${m}(`),
  );

  test(`${rel}: every mutating handler is behind requireCapability / requireSession`, () => {
    if (handlers.length === 0) return; // read-only route
    if (PUBLIC_WRITE_ROUTES.has(rel)) return;

    // One guard call per mutating handler — a file exporting POST and DELETE
    // that guards only POST must not pass.
    const guardCalls =
      countOf(src, "requireCapability(req") +
      countOf(src, "requireSession(req") +
      countOf(src, "requireAdmin(req");
    expect(guardCalls).toBeGreaterThanOrEqual(handlers.length);
  });

  test(`${rel}: authority is never read from the request body`, () => {
    // A role/actor named by the caller is self-asserted. The session is the
    // only trustworthy source. (A *target* persona on a notification is fine —
    // hence these two narrow names rather than a blanket /role/ ban.)
    expect(src).not.toContain("body?.actorPersona");
    expect(src).not.toContain("body.actorPersona");
    expect(src).not.toContain("body?.createdBy");
    expect(src).not.toContain("body.createdBy");
  });
});
