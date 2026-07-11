// src/app/api/clear-schema/__tests__/route.test.ts
process.env.MOID_STORE = "memory";

import { POST as clearSchema } from "../route";
import { NextRequest } from "next/server";
import { getStores } from "@/lib/store";

function post(qs = "") {
  return new NextRequest(`http://localhost/api/clear-schema${qs}`, { method: "POST" });
}

describe("POST /api/clear-schema", () => {
  beforeEach(() => {
    delete (globalThis as any).__moidStores;
  });

  it("resets the targeted preset's stages/defects/sizes to empty, not DISPOSAFE_REGISTRY's values", async () => {
    const { registries } = getStores();
    await registries.upsert({
      presetId: "acme", name: "Acme", createdFromFilename: null, registryVersion: "1.0.0",
      fiscalYearStartMonth: 4,
      stages: [{ stageId: "visual", label: "Visual", fields: [] }],
      defects: [{ defectCode: "COAG", label: "Coagulum" }],
      sizes: [{ sizeId: "Fr8", label: "8 FR" }],
      stageAliases: {},
    });
    const res = await clearSchema(post("?presetId=acme"));
    expect(res.status).toBe(200);
    const row = await registries.get("acme");
    expect(row?.stages).toEqual([]);
    expect(row?.defects).toEqual([]);
    expect(row?.sizes).toEqual([]);
  });

  it("preserves learned stageAliases when clearing", async () => {
    const { registries } = getStores();
    await registries.upsert({
      presetId: "acme", name: "Acme", createdFromFilename: null, registryVersion: "1.0.0",
      fiscalYearStartMonth: 4, stages: [], defects: [], sizes: [],
      stageAliases: { "visual qc": { stageId: "visual", confidence: 1, basis: "alias", learnedAt: "2026-07-10T00:00:00.000Z" } },
    });
    await clearSchema(post("?presetId=acme"));
    const row = await registries.get("acme");
    expect(row?.stageAliases["visual qc"]).toBeDefined();
  });

  it("with no presetId given, clears the active preset (not a hardcoded 'disposafe')", async () => {
    const { registries } = getStores();
    await registries.upsert({
      presetId: "realplant", name: "Real Plant", createdFromFilename: null, registryVersion: "1.0.0",
      fiscalYearStartMonth: 4, stages: [{ stageId: "x", label: "X", fields: [] }], defects: [], sizes: [],
      stageAliases: {},
    });
    await registries.setActive("realplant");
    const res = await clearSchema(post());
    expect(res.status).toBe(200);
    const row = await registries.get("realplant");
    expect(row?.stages).toEqual([]);
  });

  it("with no presetId and no active preset flagged yet, bootstraps a new empty 'default' preset", async () => {
    const res = await clearSchema(post());
    expect(res.status).toBe(200);
    const { registries } = getStores();
    const row = await registries.get("default");
    expect(row?.stages).toEqual([]);
    const active = await registries.getActive();
    expect(active?.presetId).toBe("default");
  });
});
