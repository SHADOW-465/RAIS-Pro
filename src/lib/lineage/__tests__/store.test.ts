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
    reason: "Customer asked 16Fr",
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
    reason: "size",
    createdBy: "gm",
  });
  const b = await store.create({
    fromBatch: "26I21-14",
    toSize: "16Fr",
    changedQty: 120,
    stageId: "visual",
    convertedOn: "2026-09-23",
    reason: "size",
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
    reason: "first",
    createdBy: "op",
  });
  await store.create({
    fromBatch: "26I21-16",
    toSize: "18Fr",
    changedQty: 15,
    stageId: "balloon",
    convertedOn: "2026-09-23",
    reason: "second",
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
      reason: "nope",
      createdBy: "gm",
    }),
  ).rejects.toBeInstanceOf(ConversionError);
  expect(await store.list()).toHaveLength(0);
});
