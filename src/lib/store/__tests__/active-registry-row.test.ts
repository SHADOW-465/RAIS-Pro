process.env.MOID_STORE = "memory";

import { getActiveRegistryRow, getStores } from "../index";
import type { RegistryRow } from "../types";

const row = (presetId: string): RegistryRow => ({
  presetId, name: presetId, createdFromFilename: null, registryVersion: "1.0.0",
  fiscalYearStartMonth: 4, stages: [], defects: [], sizes: [], stageAliases: {},
});

describe("getActiveRegistryRow", () => {
  beforeEach(() => {
    delete (globalThis as any).__moidStores;
  });

  it("returns null when zero presets exist", async () => {
    expect(await getActiveRegistryRow()).toBeNull();
  });

  it("falls back to the oldest preset when none is explicitly active", async () => {
    const { registries } = getStores();
    await registries.upsert(row("first"));
    await registries.upsert(row("second"));
    const active = await getActiveRegistryRow();
    expect(active?.presetId).toBe("first");
  });

  it("prefers the explicitly-flagged active preset over the oldest one", async () => {
    const { registries } = getStores();
    await registries.upsert(row("first"));
    await registries.upsert(row("second"));
    await registries.setActive("second");
    const active = await getActiveRegistryRow();
    expect(active?.presetId).toBe("second");
  });
});
