import { MemoryRegistryStore } from "@/lib/store/memory";
import type { RegistryRow } from "@/lib/store/types";

const baseRow: RegistryRow = {
  presetId: "acme",
  name: "Acme",
  createdFromFilename: null,
  registryVersion: "1.0.0",
  fiscalYearStartMonth: 4,
  stages: [],
  defects: [],
  sizes: [],
  stageAliases: {},
};

describe("RegistryRow.stageAliases persistence (memory adapter)", () => {
  it("round-trips a learned alias", async () => {
    const store = new MemoryRegistryStore();
    await store.upsert({
      ...baseRow,
      stageAliases: { "visual-qc": { stageId: "visual", confidence: 1, basis: "alias", learnedAt: "2026-07-10T00:00:00.000Z" } },
    });
    const row = await store.get("acme");
    expect(row?.stageAliases["visual-qc"]).toEqual({
      stageId: "visual", confidence: 1, basis: "alias", learnedAt: "2026-07-10T00:00:00.000Z",
    });
  });

  it("defaults to an empty object when a row predates the field", async () => {
    const store = new MemoryRegistryStore();
    const { stageAliases, ...legacyRow } = baseRow;
    await store.upsert(legacyRow as RegistryRow);
    const row = await store.get("acme");
    expect(row?.stageAliases).toEqual({});
  });
});
