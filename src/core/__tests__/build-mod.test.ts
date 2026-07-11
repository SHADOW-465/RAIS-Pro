// Phase 2 proof: catalog derivation from verified entities, validator gating,
// and the learn step's size-tab guard.
import { deriveCatalogs, proposalToEntity } from "@/core/ontology/builder/build-mod";
import { validateModDocument } from "@/core/ontology/validate/mod-validator";
import { knowledgeFromMod } from "@/core/ontology/builder/learn";
import type { ModEntityT, ModRowT } from "@/shared/models/ontology";
import type { MappingProposalT } from "@/shared/models/entities";

const proposal = (entityId: string, kind: MappingProposalT["kind"], sheet: string, header: string, canonical: string | null, colLetter: string | null = "A"): MappingProposalT => ({
  entityId, kind, original: { sheet, colLetter, header }, canonical, subcategory: null,
  confidence: 0.9, resolvedBy: "ontology", reason: "test", alternatives: [],
});

const entities: ModEntityT[] = [
  proposalToEntity(proposal("stage:16FR", "stage", "16FR", "16FR", "STAGE:visual", null), true),
  proposalToEntity(proposal("sheet:16FR", "size", "16FR", "16FR", "SIZE:Fr16", null), true),
  proposalToEntity(proposal("col:16FR:B", "measure", "16FR", "REC. QTY", "CHECKED_QTY", "B"), true),
  proposalToEntity(proposal("col:16FR:C", "measure", "16FR", "REJ QTY", "REJECTED_QTY", "C"), true),
  proposalToEntity(proposal("col:16FR:D", "defect", "16FR", "PIN HOLE", "DEFECT:PINHOLE", "D"), true),
];

describe("deriveCatalogs", () => {
  it("derives stages (captures, quality gate, size-wise), defects (with stage), sizes, relationships", () => {
    const cat = deriveCatalogs(entities);

    expect(cat.stages).toHaveLength(1);
    const visual = cat.stages[0];
    expect(visual.stageId).toBe("visual");
    expect(visual.sizeWise).toBe(true);
    expect(visual.captures).toEqual(expect.arrayContaining(["checked", "rejected"]));
    expect(visual.isQualityGate).toBe(true);
    expect(visual.label).toBe("Visual"); // size-tab header never becomes the label

    expect(cat.defects).toEqual([
      expect.objectContaining({ defectCode: "PINHOLE", aliases: ["PIN HOLE"], stages: ["visual"] }),
    ]);
    expect(cat.sizes).toEqual([{ sizeId: "Fr16", label: "16 FR" }]);
    expect(cat.relationships).toEqual(expect.arrayContaining([
      { kind: "sheet-represents-stage", from: "16FR", to: "STAGE:visual" },
      { kind: "defect-of-stage", from: "col:16FR:D", to: "STAGE:visual" },
    ]));
  });
});

function modRow(ents: ModEntityT[]): ModRowT {
  const cat = deriveCatalogs(ents);
  return {
    modId: "m1", version: 1, companyId: "test-co", status: "verified",
    snapshotId: "a".repeat(64),
    document: {
      companyId: "test-co",
      workbook: { fileName: "VISUAL INSPECTION REPORT 2025.xlsx", fileHash: "a".repeat(64), sheetNames: ["16FR"] },
      entities: ents, ...cat, fiscalYearStartMonth: 4, formulas: [], layout: [], validation: [],
    },
    createdAt: new Date().toISOString(), verifiedBy: "qm", verifiedAt: new Date().toISOString(), supersedes: null,
  };
}

describe("validateModDocument", () => {
  it("passes an internally consistent document", () => {
    expect(validateModDocument(modRow(entities).document).ok).toBe(true);
  });

  it("rejects entities referencing sheets that are not in the workbook", () => {
    const bad = [...entities, proposalToEntity(proposal("col:GHOST:A", "measure", "GHOST", "X", null), false)];
    const res = validateModDocument(modRow(bad).document);
    expect(res.ok).toBe(false);
    expect(res.errors.join(" ")).toMatch(/GHOST/);
  });
});

describe("knowledgeFromMod", () => {
  it("learns column mappings, and keys a size-tab stage by FILE name (never the size tab)", () => {
    const learned = knowledgeFromMod(modRow(entities));
    const stageEntry = learned.find((e) => e.kind === "stage-alias");
    expect(stageEntry?.key).toBe("visual inspection report 2025.xlsx"); // NOT "16fr"
    expect(stageEntry?.canonicalId).toBe("STAGE:visual");

    const colKeys = learned.filter((e) => e.kind === "column-mapping").map((e) => e.key);
    expect(colKeys).toEqual(expect.arrayContaining(["rec. qty", "rej qty", "pin hole"]));
  });

  it("learns nothing from unverified entities", () => {
    const unverified = entities.map((e) => ({ ...e, verified: false }));
    expect(knowledgeFromMod(modRow(unverified))).toHaveLength(0);
  });
});
