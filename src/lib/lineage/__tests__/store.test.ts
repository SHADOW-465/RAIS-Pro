import { getLineageStore, __resetLineageStoreForTests } from "../store";
import { ConversionError } from "../types";

beforeEach(() => {
  __resetLineageStoreForTests();
});

test("create then list returns the lineage edge", async () => {
  const store = getLineageStore();
  const row = await store.create({
    fromBatch: "26I21-14",
    toSize: "16Fr",
    changedQty: 120,
    stageId: "visual",
    convertedOn: "2026-09-23",
    reasonCategory: "regrade",
    reasonNote: "Customer asked 16Fr",
    createdBy: "gm",
  });
  expect(row.toBatch).toBe("26I21-16");
  const list = await store.list();
  expect(list).toHaveLength(1);
  expect(list[0].fromBatch).toBe("26I21-14");
});

test("repeat POST of the same conversion is a no-op", async () => {
  const store = getLineageStore();
  const a = await store.create({
    fromBatch: "26I21-14",
    toSize: "16Fr",
    changedQty: 120,
    stageId: "visual",
    convertedOn: "2026-09-23",
    reasonCategory: "size-reclassification",
    reasonNote: "size",
    createdBy: "gm",
  });
  const b = await store.create({
    fromBatch: "26I21-14",
    toSize: "16Fr",
    changedQty: 120,
    stageId: "visual",
    convertedOn: "2026-09-23",
    reasonCategory: "size-reclassification",
    reasonNote: "size",
    createdBy: "gm",
  });
  expect(b.id).toBe(a.id);
  expect(await store.list()).toHaveLength(1);
});

test("chainFor walks origin to latest", async () => {
  const store = getLineageStore();
  await store.create({
    fromBatch: "26I21-14",
    toSize: "16Fr",
    changedQty: 40,
    stageId: "visual",
    convertedOn: "2026-09-21",
    reasonCategory: "rework",
    reasonNote: "first",
    createdBy: "op",
  });
  await store.create({
    fromBatch: "26I21-16",
    toSize: "18Fr",
    changedQty: 15,
    stageId: "balloon",
    convertedOn: "2026-09-23",
    reasonCategory: "rework",
    reasonNote: "second",
    createdBy: "op",
  });
  const chain = await store.chainFor("26I21-16");
  expect(chain.map((n) => n.batch)).toEqual(["26I21-14", "26I21-16", "26I21-18"]);
});

test("does not write through EventStore — a rejected create leaves the list empty", async () => {
  const store = getLineageStore();
  await expect(
    store.create({
      fromBatch: "26I21-14",
      toSize: "14Fr",
      changedQty: 10,
      stageId: "visual",
      convertedOn: "2026-09-23",
      reasonCategory: "rework",
      reasonNote: "nope",
      createdBy: "gm",
    }),
  ).rejects.toBeInstanceOf(ConversionError);
  expect(await store.list()).toHaveLength(0);
});

const base = {
  fromBatch: "26I21-14",
  toSize: "16Fr",
  changedQty: 120,
  stageId: "visual",
  convertedOn: "2026-09-23",
  reasonCategory: "size-reclassification",
  reasonNote: "Customer asked 16Fr",
  createdBy: "gm",
};

test("undo is a soft reversal: the row stays, active reads omit it, and a later save gets a new id", async () => {
  const store = getLineageStore();
  const row = await store.create(base);
  const undone = await store.reverse({ id: row.id, actor: "gm", reason: "wrong lot" });
  expect(undone.auditStored).toBe(true);
  expect(undone.audit.action).toBe("reversed");
  expect(undone.audit.snapshot.reversedAt).toBeTruthy();
  expect(undone.conversion.reversedBy).toBe("gm");
  expect(undone.conversion.reversalReason).toBe("wrong lot");
  expect(await store.list()).toHaveLength(0);
  const chain = await store.chainFor(row.toBatch);
  expect(chain).toHaveLength(1);
  expect(chain[0].via).toBeNull();
  const again = await store.create(base);
  expect(again.id).toBe(`${row.id}__2`);
  expect(await store.list()).toEqual([again]);
});

test("undo without a reason is refused and leaves the conversion active", async () => {
  const store = getLineageStore();
  const row = await store.create(base);
  await expect(store.reverse({ id: row.id, actor: "gm", reason: "  " })).rejects.toMatchObject({
    code: "reason-required",
  });
  expect(await store.list()).toHaveLength(1);
});

test("an identical repeat does not rewrite the stored reason", async () => {
  const store = getLineageStore();
  const row = await store.create(base);
  const again = await store.create({ ...base, reasonCategory: "regrade", reasonNote: "a different story" });
  expect(again.id).toBe(row.id);
  expect(again.reasonCategory).toBe("size-reclassification");
  expect(again.reasonNote).toBe("Customer asked 16Fr");
});
