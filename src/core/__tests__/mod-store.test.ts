// Phase 1 proof: MOD versioning (draft → verified → superseded, one verified
// per lineage) and company-knowledge learn/lookup, on the memory adapters.
import { getModStore } from "@/core/ontology/store/mod-store";
import { getKnowledgeStore, normalizeKey } from "@/core/ontology/store/knowledge-store";
import type { ModDocumentT } from "@/shared/models/ontology";
import { ModDocument } from "@/shared/models/ontology";

function doc(overrides: Partial<ModDocumentT> = {}): ModDocumentT {
  return ModDocument.parse({
    companyId: "disposafe",
    workbook: { fileName: "VISUAL.xlsx", fileHash: "a".repeat(64), sheetNames: ["APRIL 25"] },
    entities: [{
      entityId: "e1", kind: "measure",
      original: { sheet: "APRIL 25", colLetter: "C", header: "CHECKED QTY" },
      canonical: "CHECKED_QTY", subcategory: null, confidence: 1,
      resolvedBy: "user", reason: "verified in staging", verified: true,
    }],
    stages: [{ stageId: "visual", label: "Visual Inspection", effectiveFrom: null, effectiveTo: null, upstream: [] }],
    defects: [{ defectCode: "PINH", label: "Pinhole", aliases: ["PINH", "PIN HOLE"], stages: ["visual"] }],
    sizes: [{ sizeId: "Fr16", label: "16 FR" }],
    fiscalYearStartMonth: 4,
    relationships: [], formulas: [], layout: [], validation: [],
    ...overrides,
  });
}

describe("ModStore (memory)", () => {
  const store = getModStore();

  it("versions drafts and enforces one verified per lineage on publish", async () => {
    const v1 = await store.saveDraft({ modId: "m1", companyId: "disposafe", snapshotId: "a".repeat(64), document: doc() });
    expect(v1.version).toBe(1);
    expect(v1.status).toBe("draft");

    await store.publish("m1", 1, "qm");
    expect((await store.activeFor("m1"))?.version).toBe(1);

    const v2 = await store.saveDraft({ modId: "m1", companyId: "disposafe", snapshotId: "a".repeat(64), document: doc() });
    expect(v2.version).toBe(2);

    const published = await store.publish("m1", 2, "qm");
    expect(published.supersedes).toBe(1);
    expect((await store.activeFor("m1"))?.version).toBe(2);
    expect((await store.get("m1", 1))?.status).toBe("superseded");
  });

  it("catalogFor merges only verified MODs across the company", async () => {
    const other = doc({
      stages: [{ stageId: "balloon", label: "Balloon Testing", effectiveFrom: null, effectiveTo: null, upstream: ["visual"] }],
      defects: [{ defectCode: "BLBR", label: "Balloon Burst", aliases: ["BLBR"], stages: ["balloon"] }],
    });
    const d = await store.saveDraft({ modId: "m2", companyId: "disposafe", snapshotId: "b".repeat(64), document: other });
    // Draft not yet in the catalog:
    let cat = await store.catalogFor("disposafe");
    expect(cat.stages.map((s) => s.stageId)).toEqual(["visual"]);

    await store.publish("m2", d.version, "qm");
    cat = await store.catalogFor("disposafe");
    expect(cat.stages.map((s) => s.stageId).sort()).toEqual(["balloon", "visual"]);
    expect(cat.defects.map((x) => x.defectCode).sort()).toEqual(["BLBR", "PINH"]);
    expect(cat.fiscalYearStartMonth).toBe(4);
  });
});

describe("KnowledgeStore (memory)", () => {
  const store = getKnowledgeStore();

  it("learns and looks up with normalized keys; newest verification wins, useCount survives", async () => {
    await store.learn([{ companyId: "disposafe", kind: "stage-alias", key: normalizeKey("  Visual   QC "), canonicalId: "STAGE:visual", confidence: 1, learnedFrom: "m1" }]);
    const hit = await store.lookup("disposafe", "stage-alias", "visual qc");
    expect(hit?.canonicalId).toBe("STAGE:visual");

    await store.recordUse("disposafe", "stage-alias", "visual qc");
    await store.learn([{ companyId: "disposafe", kind: "stage-alias", key: "visual qc", canonicalId: "STAGE:final", confidence: 0.9, learnedFrom: "m2" }]);
    const relearned = await store.lookup("disposafe", "stage-alias", "Visual QC");
    expect(relearned?.canonicalId).toBe("STAGE:final");
    expect(relearned?.useCount).toBe(1);
  });

  it("serves the seeded global ontology", async () => {
    const concepts = await store.concepts();
    expect(concepts.find((c) => c.conceptId === "REJECTED_QTY")).toBeTruthy();
  });
});
