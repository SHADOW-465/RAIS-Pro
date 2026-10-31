// Real handlers, memory stores: what the API says for each rejected request.
process.env.MOID_STORE = "memory";

import { NextRequest } from "next/server";
import { sessionCookie } from "@/__tests__/fixtures/auth";
import { __resetLineageStoreForTests } from "@/lib/lineage/store";
import { LineageUnavailableError } from "@/lib/lineage/types";
import { getStores } from "@/lib/store";
import { GET, POST } from "../route";

let n = 0;
function ledgerEvent(p: Record<string, unknown>) {
  n += 1;
  return {
    eventId: `route-e${n}`,
    ingestionId: "ing-route",
    recordedAt: "2026-09-20T10:00:00.000Z",
    occurredOn: { start: "2026-09-20", end: "2026-09-20" },
    extractedBy: "direct-entry",
    provenance: { file: "Manual Entry", cells: ["ENTRY!A1"], sheet: "A" },
    quantity: 0,
    stageId: "visual",
    customFields: { batch: "26I21-14" },
    ...p,
  };
}

const body = {
  fromBatch: "26I21-14",
  toSize: "16Fr",
  changedQty: 100,
  stageId: "visual",
  convertedOn: "2026-09-23",
  reason: "customer",
};

async function post(b: unknown) {
  return POST(
    new NextRequest("http://localhost/api/batch-conversions", {
      method: "POST",
      headers: { "content-type": "application/json", Cookie: await sessionCookie("operator") },
      body: JSON.stringify(b),
    }),
  );
}

beforeEach(() => {
  __resetLineageStoreForTests();
  // 1000 checked, 700 accepted, 100 rejected at Visual for 26I21-14
  jest.spyOn(getStores().events, "effective").mockResolvedValue([
    ledgerEvent({ eventType: "production", quantity: 1000 }),
    ledgerEvent({ eventType: "inspection", disposition: "accepted", quantity: 700 }),
    ledgerEvent({ eventType: "inspection", disposition: "rejected", quantity: 100 }),
  ] as never);
});

afterEach(() => jest.restoreAllMocks());

test("records a conversion within the eligible quantity", async () => {
  const res = await post({ ...body, changedQty: 700 });
  expect(res.status).toBe(201);
  expect((await res.json()).conversion.changedQty).toBe(700);
});

test("rejects more than the ledger says is eligible (the body cannot raise the limit)", async () => {
  const res = await post({ ...body, changedQty: 701, eligibleQty: 99999 });
  expect(res.status).toBe(400);
  const json = await res.json();
  expect(json.code).toBe("qty-exceeds-eligible");
  expect(json.error).toMatch(/Only 700/);
});

test("rejects an original lot that has no ledger entries", async () => {
  const res = await post({ ...body, fromBatch: "26I21-16", toSize: "18Fr" });
  expect(res.status).toBe(400);
  const json = await res.json();
  expect(json.code).toBe("unknown-lot");
  expect(json.error).toMatch(/no entries in the ledger/);
});

test("rejects a station the lot never reached", async () => {
  const res = await post({ ...body, stageId: "balloon" });
  expect(res.status).toBe(400);
  expect((await res.json()).code).toBe("qty-exceeds-eligible");
});

test("rejects zero, negative, fractional and non-numeric quantities", async () => {
  for (const changedQty of [0, -3, 2.5, "50", true, null]) {
    const res = await post({ ...body, changedQty });
    expect(res.status).toBe(400);
    expect((await res.json()).code).toBe("qty-invalid");
  }
});

test("rejects an impossible or future date", async () => {
  for (const convertedOn of ["2026-02-31", "2999-01-01"]) {
    const res = await post({ ...body, convertedOn });
    expect(res.status).toBe(400);
    expect((await res.json()).code).toBe("invalid-date");
  }
});

test("a missing batch_conversions table answers 503 with the reason, on read and on write", async () => {
  const g = globalThis as unknown as { __moidLineageStore?: unknown };
  const down = () => Promise.reject(new LineageUnavailableError("42P01"));
  g.__moidLineageStore = { list: down, create: down, chainFor: down };
  try {
    const res = await post(body);
    expect(res.status).toBe(503);
    const json = await res.json();
    expect(json.code).toBe("storage-unavailable");
    expect(json.error).toMatch(/Nothing was saved/);
    const read = await GET(new NextRequest("http://localhost/api/batch-conversions", { headers: { Cookie: await sessionCookie("operator") } }));
    expect(read.status).toBe(503);
  } finally {
    __resetLineageStoreForTests();
  }
});

test("a repeat with another quantity is refused; the identical repeat is fine", async () => {
  expect((await post(body)).status).toBe(201);
  expect((await post(body)).status).toBe(201);
  const res = await post({ ...body, changedQty: 50 });
  expect(res.status).toBe(400);
  const json = await res.json();
  expect(json.code).toBe("already-converted");
  expect(json.error).toMatch(/only be converted once/);
  const list = await (await GET(new NextRequest("http://localhost/api/batch-conversions", { headers: { Cookie: await sessionCookie("operator") } }))).json();
  expect(list.conversions).toHaveLength(1);
  expect(list.conversions[0].changedQty).toBe(100);
});
