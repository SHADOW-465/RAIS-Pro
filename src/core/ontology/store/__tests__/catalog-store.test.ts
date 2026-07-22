/**
 * Master catalog ownership:
 *  - publish merges stages/defects into company catalog
 *  - deleting a MOD lineage does NOT clear the catalog
 *  - only explicit catalog delete / clear removes schema
 */
process.env.MOID_STORE = "memory";
process.env.MOID_COMPANY_ID = "catalog-test-co";

import {
  getCatalogStore,
  __resetCatalogStoreForTests,
  EMPTY_CATALOG,
} from "../catalog-store";
import { getModStore } from "../mod-store";
import type { ModRowT } from "@/shared/models/ontology";

function fakeMod(partial: Partial<ModRowT> & { modId: string }): ModRowT {
  return {
    modId: partial.modId,
    version: partial.version ?? 1,
    companyId: partial.companyId ?? "catalog-test-co",
    status: partial.status ?? "verified",
    snapshotId: partial.snapshotId ?? partial.modId,
    createdAt: partial.createdAt ?? new Date().toISOString(),
    verifiedBy: partial.verifiedBy ?? "qm",
    verifiedAt: partial.verifiedAt ?? new Date().toISOString(),
    supersedes: partial.supersedes ?? null,
    document: partial.document ?? {
      companyId: partial.companyId ?? "catalog-test-co",
      workbook: { fileName: "t.xlsx", fileHash: partial.modId, sheetNames: ["Sheet1"] },
      entities: [],
      relationships: [],
      formulas: [],
      layout: [],
      validation: [],
      stages: [
        {
          stageId: "visual",
          label: "Visual",
          effectiveFrom: null,
          effectiveTo: null,
          upstream: [],
          captures: ["checked", "rejected"] as ("checked" | "rejected")[],
        },
      ],
      defects: [
        {
          defectCode: "PINH",
          label: "Pinhole",
          aliases: ["pinhole"],
          stages: ["visual"],
        },
      ],
      sizes: [{ sizeId: "Fr16", label: "16 FR" }],
      fiscalYearStartMonth: 4,
    },
  };
}

beforeEach(() => {
  __resetCatalogStoreForTests();
  // Reset mod store singleton by wiping via delete if present
  const g = globalThis as unknown as { __modStore?: undefined };
  g.__modStore = undefined;
});

describe("company catalog store", () => {
  it("starts empty", async () => {
    const cat = await getCatalogStore().get("catalog-test-co");
    expect(cat.stages).toEqual([]);
    expect(cat.defects).toEqual([]);
    expect(cat.sizes).toEqual([]);
  });

  it("merges from a verified MOD and keeps schema after lineage delete", async () => {
    const store = getCatalogStore();
    const mod = fakeMod({ modId: "snap-aaa" });
    const merged = await store.mergeFromMod(mod);
    expect(merged.stages.map((s) => s.stageId)).toContain("visual");
    expect(merged.defects.map((d) => d.defectCode)).toContain("PINH");
    expect(merged.sizes.map((s) => s.sizeId)).toContain("Fr16");
    expect(merged.lastMergedFrom).toBe("snap-aaa");

    // Simulate workbook delete: drop MOD lineage only.
    const modStore = getModStore();
    await modStore.saveDraft({
      modId: "snap-aaa",
      companyId: "catalog-test-co",
      snapshotId: "snap-aaa",
      document: mod.document,
    });
    await modStore.publish("snap-aaa", 1, "qm");
    await modStore.deleteLineage("snap-aaa");

    // Catalog must still hold the plant schema.
    const after = await store.get("catalog-test-co");
    expect(after.stages).toHaveLength(1);
    expect(after.defects).toHaveLength(1);
    expect(after.sizes).toHaveLength(1);

    // Verified list is empty — old catalogFor would have returned empty.
    const verified = await modStore.verified("catalog-test-co");
    expect(verified).toHaveLength(0);
  });

  it("only explicit delete removes a stage", async () => {
    const store = getCatalogStore();
    await store.mergeFromMod(fakeMod({ modId: "snap-b" }));
    await store.deleteStage("catalog-test-co", "visual");
    const cat = await store.get("catalog-test-co");
    expect(cat.stages).toHaveLength(0);
    // Defect stage refs cleaned
    expect(cat.defects[0]?.stages).not.toContain("visual");
  });

  it("clear wipes catalog", async () => {
    const store = getCatalogStore();
    await store.mergeFromMod(fakeMod({ modId: "snap-c" }));
    await store.clear("catalog-test-co");
    const cat = await store.get("catalog-test-co");
    expect(cat.stages).toEqual(EMPTY_CATALOG.stages);
  });

  it("second MOD unions defect stages without duplicating codes", async () => {
    const store = getCatalogStore();
    await store.mergeFromMod(fakeMod({ modId: "snap-1" }));
    const baseDoc = fakeMod({ modId: "x" }).document;
    const mod2 = fakeMod({
      modId: "snap-2",
      document: {
        ...baseDoc,
        companyId: "catalog-test-co",
        workbook: { ...baseDoc.workbook, fileHash: "snap-2" },
        stages: [
          {
            stageId: "final",
            label: "Final",
            effectiveFrom: null,
            effectiveTo: null,
            upstream: ["visual"],
            captures: ["checked", "rejected"],
          },
        ],
        defects: [
          {
            defectCode: "PINH",
            label: "Pinhole",
            aliases: ["pin hole"],
            stages: ["final"],
          },
        ],
        sizes: [],
      },
    });
    const cat = await store.mergeFromMod(mod2);
    expect(cat.stages.map((s) => s.stageId).sort()).toEqual(["final", "visual"]);
    expect(cat.defects).toHaveLength(1);
    expect(cat.defects[0].stages.sort()).toEqual(["final", "visual"]);
    expect(cat.defects[0].aliases).toEqual(expect.arrayContaining(["pinhole", "pin hole"]));
  });
});
