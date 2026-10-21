// The CAPA register is a plant record now, not a browser's. Pinned here: who
// may read and write it, that a bad record is refused, and that a browser's
// local list is imported only into an empty register.
process.env.MOID_STORE = "memory";

import { NextRequest } from "next/server";
import { GET, PUT, DELETE } from "../route";
import { sessionCookie } from "@/__tests__/fixtures/auth";
import { __resetCapaStoreForTests } from "@/lib/capa/store";
import type { PersonaId } from "@/lib/persona";

async function call(
  handler: (r: NextRequest) => Promise<Response>,
  method: string,
  role: PersonaId | null,
  body?: unknown,
  query = "",
) {
  const headers: Record<string, string> = {};
  if (body !== undefined) headers["content-type"] = "application/json";
  if (role) headers["Cookie"] = await sessionCookie(role);
  return handler(
    new NextRequest(`http://localhost/api/capa${query}`, {
      method,
      headers,
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    }),
  );
}

const capa = (id: string, over: Record<string, unknown> = {}) => ({
  id,
  title: "Thin tip at Visual",
  problem: "Thin tip share above target",
  rootCause: "",
  action: "Re-check dip speed",
  owner: "Quality Manager",
  dueDate: "2026-11-01",
  priority: "High",
  status: "Open",
  stage: "Visual",
  source: "manual",
  ruleId: null,
  ruleVersion: null,
  createdAt: `2026-10-2${id.slice(-1)}T00:00:00.000Z`,
  ...over,
});

beforeEach(() => __resetCapaStoreForTests());

test("anonymous callers are refused; view-only roles may read but not write", async () => {
  expect((await call(GET, "GET", null)).status).toBe(401);
  expect((await call(GET, "GET", "owner")).status).toBe(200);
  expect((await call(PUT, "PUT", "owner", { capa: capa("c-1") })).status).toBe(403);
  expect((await call(DELETE, "DELETE", "owner", undefined, "?id=c-1")).status).toBe(403);
});

test("a saved CAPA is visible to every other signed-in role", async () => {
  const put = await call(PUT, "PUT", "operator", { capa: capa("c-1") });
  expect(put.status).toBe(200);
  const read = await (await call(GET, "GET", "owner")).json();
  expect(read.source).toBe("db");
  expect(read.capas.map((c: { id: string }) => c.id)).toEqual(["c-1"]);

  await call(PUT, "PUT", "gm", { capa: capa("c-1", { status: "Completed" }) });
  const after = await (await call(GET, "GET", "gm")).json();
  expect(after.capas).toHaveLength(1);
  expect(after.capas[0].status).toBe("Completed");
});

test("a record outside the schema is refused", async () => {
  expect((await call(PUT, "PUT", "gm", { capa: capa("c-1", { status: "Closed" }) })).status).toBe(400);
  expect((await call(PUT, "PUT", "gm", { capa: { id: "c-1" } })).status).toBe(400);
  expect((await call(PUT, "PUT", "gm", "nonsense")).status).toBe(400);
});

test("a browser list is imported only into an empty register", async () => {
  const first = await (await call(PUT, "PUT", "gm", { importLocal: true, capas: [capa("c-1"), capa("c-2")] })).json();
  expect(first.capas.map((c: { id: string }) => c.id)).toEqual(["c-2", "c-1"]);
  const second = await (await call(PUT, "PUT", "gm", { importLocal: true, capas: [capa("c-3")] })).json();
  expect(second.capas.map((c: { id: string }) => c.id)).toEqual(["c-2", "c-1"]);
});

test("delete removes one CAPA and needs an id", async () => {
  await call(PUT, "PUT", "gm", { capa: capa("c-1") });
  await call(PUT, "PUT", "gm", { capa: capa("c-2") });
  expect((await call(DELETE, "DELETE", "operator")).status).toBe(400);
  const res = await (await call(DELETE, "DELETE", "operator", undefined, "?id=c-1")).json();
  expect(res.capas.map((c: { id: string }) => c.id)).toEqual(["c-2"]);
});
