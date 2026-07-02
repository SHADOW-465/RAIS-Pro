import { MemoryDatasetStore } from "../store-memory";
import type { Dataset } from "../types";

const ds = (id: string, totalRows = 5): Dataset => ({
  id, signatureHash: id, title: `Dataset ${id}`, columns: [], sources: [], totalRows, recognizedStageId: null,
});

describe("MemoryDatasetStore", () => {
  it("upserts new datasets and lists them", async () => {
    const store = new MemoryDatasetStore();
    await store.upsert([ds("a"), ds("b")]);
    const all = await store.list();
    expect(all.map((d) => d.id).sort()).toEqual(["a", "b"]);
  });

  it("replaces an existing id in place rather than duplicating", async () => {
    const store = new MemoryDatasetStore();
    await store.upsert([ds("a", 5)]);
    await store.upsert([ds("a", 99)]);
    const all = await store.list();
    expect(all).toHaveLength(1);
    expect(all[0].totalRows).toBe(99);
  });

  it("clear() empties the store", async () => {
    const store = new MemoryDatasetStore();
    await store.upsert([ds("a")]);
    await store.clear();
    expect(await store.list()).toEqual([]);
  });
});
