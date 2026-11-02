process.env.MOID_STORE = "memory";

import { NextRequest } from "next/server";
import { sessionCookie } from "@/__tests__/fixtures/auth";
import type { PersonaId } from "@/lib/persona";
import { __resetRemedyStoreForTests } from "@/lib/remedies/store";
import { GET, PUT } from "../route";

async function call(
  handler: typeof GET | typeof PUT,
  {
    method,
    role,
    body,
  }: { method: string; role: PersonaId | null; body?: unknown },
) {
  const headers: Record<string, string> = {};
  if (body !== undefined) headers["content-type"] = "application/json";
  if (role) headers.Cookie = await sessionCookie(role);
  return handler(
    new NextRequest("http://localhost/api/remedies", {
      method,
      headers,
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    }),
  );
}

beforeEach(() => {
  __resetRemedyStoreForTests();
});

test("GET is 401 without a session", async () => {
  expect((await call(GET, { method: "GET", role: null })).status).toBe(401);
});

test("owner may read the plant book", async () => {
  const res = await call(GET, { method: "GET", role: "owner" });
  expect(res.status).toBe(200);
  const data = await res.json();
  expect(data.source).toBe("db");
});

test("operator may not write remedies", async () => {
  const res = await call(PUT, {
    method: "PUT",
    role: "operator",
    body: { code: "BIC", description: "Bent", remedy: "Align" },
  });
  expect(res.status).toBe(403);
});

test("GM save stamps the session actor, not a body created_by", async () => {
  const res = await call(PUT, {
    method: "PUT",
    role: "gm",
    body: {
      code: "BIC",
      description: "Catheter bent at forming.",
      remedy: "Check mandrel alignment.",
      createdBy: "impersonated",
      updatedBy: "impersonated",
    },
  });
  expect(res.status).toBe(200);
  const data = await res.json();
  expect(data.source).toBe("db");
  expect(data.book.defects.BIC.updatedBy).toBe("gm");
  expect(data.book.defects.BIC.createdBy).toBe("gm");
  expect(data.book.defects.BIC.code).toBe("BIC");
});

test("a second Save Feed updates the same row", async () => {
  await call(PUT, {
    method: "PUT",
    role: "gm",
    body: { code: "Bend In Catheter", description: "First.", remedy: "First action." },
  });
  const res = await call(PUT, {
    method: "PUT",
    role: "gm",
    body: { code: "BIC", description: "Second.", remedy: "Second action.", version: 1 },
  });
  const data = await res.json();
  expect(Object.keys(data.book.defects)).toEqual(["BIC"]);
  expect(data.book.defects.BIC.description).toBe("Second.");
  expect(data.book.defects.BIC.version).toBe(2);
});

test("stale version returns 409 and the current book", async () => {
  await call(PUT, {
    method: "PUT",
    role: "gm",
    body: { code: "BIC", description: "First.", remedy: "First action." },
  });
  await call(PUT, {
    method: "PUT",
    role: "gm",
    body: { code: "BIC", description: "Latest.", remedy: "Latest action.", version: 1 },
  });
  const res = await call(PUT, {
    method: "PUT",
    role: "gm",
    body: { code: "BIC", description: "Stale.", remedy: "Stale action.", version: 1 },
  });
  expect(res.status).toBe(409);
  const data = await res.json();
  expect(data.conflict).toBe(true);
  expect(data.book.defects.BIC.description).toBe("Latest.");
});

test("empty description is 400 and does not create a row", async () => {
  const res = await call(PUT, {
    method: "PUT",
    role: "gm",
    body: { code: "BIC", description: "  ", remedy: "Align" },
  });
  expect(res.status).toBe(400);
  const read = await (await call(GET, { method: "GET", role: "gm" })).json();
  expect(read.book.defects.BIC).toBeUndefined();
});
