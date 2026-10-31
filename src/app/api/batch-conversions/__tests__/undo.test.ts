// GM-only soft undo. The row is marked reversed; it is never deleted.
process.env.MOID_STORE = "memory";

import { NextRequest } from "next/server";
import { sessionCookie } from "@/__tests__/fixtures/auth";
import { __resetLineageStoreForTests, getLineageStore } from "@/lib/lineage/store";
import { LineageUnavailableError, REVERSAL_COLUMNS_MESSAGE } from "@/lib/lineage/types";
import { POST } from "../undo/route";

const input = {
  fromBatch: "26I21-14",
  toSize: "16Fr",
  changedQty: 120,
  stageId: "visual",
  convertedOn: "2026-09-23",
  reasonCategory: "rework",
  reasonNote: "size changed at visual",
  createdBy: "op",
};

async function undo(role: "gm" | "operator", body: unknown) {
  return POST(
    new NextRequest("http://localhost/api/batch-conversions/undo", {
      method: "POST",
      headers: { "content-type": "application/json", Cookie: await sessionCookie(role) },
      body: JSON.stringify(body),
    }),
  );
}

beforeEach(() => {
  __resetLineageStoreForTests();
});

test("an operator cannot undo, and a GM undo drops the edge from active reads", async () => {
  const row = await getLineageStore().create(input);
  const denied = await undo("operator", { id: row.id, reason: "wrong lot" });
  expect(denied.status).toBe(403);
  expect((await denied.json()).code).toBe("gm-only");
  expect(await getLineageStore().list()).toHaveLength(1);

  const res = await undo("gm", { id: row.id, reason: "wrong lot" });
  expect(res.status).toBe(200);
  const json = await res.json();
  expect(json.conversion.reversedAt).toBeTruthy();
  expect(json.conversion.reversedBy).toBe("gm");
  expect(json.conversion.reversalReason).toBe("wrong lot");
  expect(json.audit.action).toBe("reversed");
  expect(json.auditStored).toBe(true);
  expect(json.warning).toBeNull();
  expect(await getLineageStore().list()).toHaveLength(0);
  const chain = await getLineageStore().chainFor(row.toBatch);
  expect(chain).toHaveLength(1);
  expect(chain[0].via).toBeNull();
});

test("undo requires an id and a reason, and an unknown id is 404", async () => {
  const missing = await undo("gm", { id: "bc_nope", reason: "" });
  expect(missing.status).toBe(400);
  const row = await getLineageStore().create(input);
  const unknown = await undo("gm", { id: "bc_missing", reason: "not this one" });
  expect(unknown.status).toBe(404);
  expect((await unknown.json()).code).toBe("not-found");
  expect((await getLineageStore().list()).map((r) => r.id)).toEqual([row.id]);
});

test("missing reversal columns return 503 and do not pretend the undo happened", async () => {
  const g = globalThis as unknown as { __moidLineageStore?: unknown };
  g.__moidLineageStore = {
    list: async () => [],
    create: async () => {
      throw new Error("not used");
    },
    chainFor: async () => [],
    reverse: async () => {
      throw new LineageUnavailableError("42703", REVERSAL_COLUMNS_MESSAGE);
    },
  };
  try {
    const res = await undo("gm", { id: "bc_26I21-14_26I21-16", reason: "wrong lot" });
    expect(res.status).toBe(503);
    const json = await res.json();
    expect(json.code).toBe("storage-unavailable");
    expect(json.error).toMatch(/20261031120000_batch_conversion_reversal/);
    expect(json.error).toMatch(/Nothing was changed/);
  } finally {
    __resetLineageStoreForTests();
  }
});

test("a reversal that could not write the audit says so", async () => {
  const row = await getLineageStore().create(input);
  const reversed = { ...row, reversedAt: "2026-10-31T00:00:00.000Z", reversedBy: "gm", reversalReason: "wrong lot" };
  const g = globalThis as unknown as { __moidLineageStore?: unknown };
  g.__moidLineageStore = {
    list: async () => [],
    create: async () => row,
    chainFor: async () => [],
    reverse: async () => ({
      conversion: reversed,
      audit: {
        id: "bca_test",
        conversionId: row.id,
        action: "reversed" as const,
        actor: "gm",
        reason: "wrong lot",
        at: reversed.reversedAt,
        snapshot: reversed,
      },
      auditStored: false,
    }),
  };
  try {
    const res = await undo("gm", { id: row.id, reason: "wrong lot" });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.auditStored).toBe(false);
    expect(json.warning).toMatch(/audit row was not stored/);
    expect(json.conversion.reversedAt).toBeTruthy();
  } finally {
    __resetLineageStoreForTests();
  }
});
