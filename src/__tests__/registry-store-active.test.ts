import { MemoryRegistryStore } from "@/lib/store/memory";
import type { RegistryRow } from "@/lib/store/types";

const row = (presetId: string): RegistryRow => ({
  presetId, name: presetId, createdFromFilename: null, registryVersion: "1.0.0",
  fiscalYearStartMonth: 4, stages: [], defects: [], sizes: [], stageAliases: {},
});

describe("RegistryStore.getActive/setActive (memory adapter)", () => {
  it("getActive returns null when nothing has been flagged", async () => {
    const store = new MemoryRegistryStore();
    await store.upsert(row("acme"));
    expect(await store.getActive()).toBeNull();
  });

  it("setActive flags a preset; getActive returns it", async () => {
    const store = new MemoryRegistryStore();
    await store.upsert(row("acme"));
    await store.setActive("acme");
    const active = await store.getActive();
    expect(active?.presetId).toBe("acme");
  });

  it("setActive on a second preset moves the flag, not adds to it", async () => {
    const store = new MemoryRegistryStore();
    await store.upsert(row("acme"));
    await store.upsert(row("beta"));
    await store.setActive("acme");
    await store.setActive("beta");
    const active = await store.getActive();
    expect(active?.presetId).toBe("beta");
  });
});
