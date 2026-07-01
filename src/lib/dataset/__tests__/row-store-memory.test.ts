import { MemoryRowStore } from "../row-store-memory";
import type { DatasetRow } from "../types";

const row = (datasetId: string, rowIndex: number, values: Record<string, number> = { qty: 1 }): DatasetRow => ({
  datasetId, fileName: "a.xlsx", sheetName: "S", rowIndex, values,
});

describe("MemoryRowStore", () => {
  it("upserts and lists rows for a dataset, sorted by (fileName, sheetName, rowIndex)", async () => {
    const store = new MemoryRowStore();
    await store.upsert([row("d1", 1), row("d1", 0), row("d2", 0)]);
    const rows = await store.forDataset("d1");
    expect(rows.map((r) => r.rowIndex)).toEqual([0, 1]);
  });

  it("replaces a row in place on the same key rather than duplicating", async () => {
    const store = new MemoryRowStore();
    await store.upsert([row("d1", 0, { qty: 1 })]);
    await store.upsert([row("d1", 0, { qty: 99 })]);
    const rows = await store.forDataset("d1");
    expect(rows).toHaveLength(1);
    expect(rows[0].values.qty).toBe(99);
  });

  it("clear() empties the store", async () => {
    const store = new MemoryRowStore();
    await store.upsert([row("d1", 0)]);
    await store.clear();
    expect(await store.forDataset("d1")).toEqual([]);
  });
});
