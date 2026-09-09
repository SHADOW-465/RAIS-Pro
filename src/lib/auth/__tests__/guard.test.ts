// The capability model in persona.ts was declared, documented, and never
// enforced — its own header said "Does not affect APIs". These assert that the
// boundary now honours exactly what that file promises, in particular:
//
//   "an operator must be able to save entries (write) and must NOT be able to
//    erase them once saved"

import type { NextRequest } from "next/server";
import { actorFrom, requireCapability, requireSession, type Capability } from "../guard";
import { createSessionToken, SESSION_COOKIE } from "../session";
import type { PersonaId } from "@/lib/persona";

/** Minimal NextRequest stand-in — the guard only reads one cookie. */
const reqWith = (token?: string) =>
  ({
    cookies: { get: (name: string) => (name === SESSION_COOKIE && token ? { value: token } : undefined) },
  }) as unknown as NextRequest;

const asRole = async (role: PersonaId) =>
  reqWith(await createSessionToken({ username: role, role }));

const anonymous = reqWith(undefined);

describe("authentication", () => {
  test("no cookie is not a session", async () => {
    expect(await actorFrom(anonymous)).toBeNull();
    const g = await requireSession(anonymous);
    expect(g.ok).toBe(false);
    if (!g.ok) expect(g.response.status).toBe(401);
  });

  test("a forged token is rejected", async () => {
    const real = await createSessionToken({ username: "operator", role: "operator" });
    const [body] = real.split(".");
    // Same payload, attacker-chosen signature.
    expect(await actorFrom(reqWith(`${body}.deadbeef`))).toBeNull();
  });

  test("a tampered payload is rejected even with the original signature", async () => {
    const real = await createSessionToken({ username: "operator", role: "operator" });
    const [, sig] = real.split(".");
    const forgedBody = Buffer.from(
      JSON.stringify({ u: "operator", r: "gm", exp: Math.floor(Date.now() / 1000) + 600 }),
    )
      .toString("base64")
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/g, "");
    expect(await actorFrom(reqWith(`${forgedBody}.${sig}`))).toBeNull();
  });

  test("an expired session is not a session", async () => {
    const stale = await createSessionToken({ username: "gm", role: "gm" }, -1);
    expect(await actorFrom(reqWith(stale))).toBeNull();
  });

  test("a valid session yields the role's declared capabilities", async () => {
    const actor = await actorFrom(await asRole("operator"));
    expect(actor).toEqual({
      username: "operator",
      role: "operator",
      roleLabel: "Data Entry Operator",
      capabilities: { write: true, approve: false, configure: false, eraseLedger: false },
    });
  });
});

describe("authorization", () => {
  // The full matrix, straight from the built-in role definitions.
  const MATRIX: Record<PersonaId, Record<Capability, boolean>> = {
    gm: { write: true, approve: true, configure: true, eraseLedger: true },
    owner: { write: false, approve: false, configure: false, eraseLedger: false },
    operator: { write: true, approve: false, configure: false, eraseLedger: false },
  };

  for (const [role, caps] of Object.entries(MATRIX) as [PersonaId, Record<Capability, boolean>][]) {
    for (const [cap, allowed] of Object.entries(caps) as [Capability, boolean][]) {
      test(`${role} ${allowed ? "may" : "may NOT"} ${cap}`, async () => {
        const g = await requireCapability(await asRole(role), cap);
        expect(g.ok).toBe(allowed);
        if (!g.ok) expect(g.response.status).toBe(403);
      });
    }
  }

  test("401 and 403 are distinct — expired session vs genuine permission wall", async () => {
    const anon = await requireCapability(anonymous, "write");
    const viewer = await requireCapability(await asRole("owner"), "write");
    expect(anon.ok).toBe(false);
    expect(viewer.ok).toBe(false);
    if (!anon.ok) expect(anon.response.status).toBe(401);
    if (!viewer.ok) expect(viewer.response.status).toBe(403);
  });

  test("the operator/eraseLedger split persona.ts documents actually holds", async () => {
    const operator = await asRole("operator");
    expect((await requireCapability(operator, "write")).ok).toBe(true);
    expect((await requireCapability(operator, "eraseLedger")).ok).toBe(false);
  });
});
