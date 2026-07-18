/** @jest-environment node */
// Phase 4 proofs (MOD-MIGRATION-PLAN §Phase 4):
//   - migrate-presets-to-mods: presets + DISPOSAFE constants → verified MODs +
//     company knowledge, idempotent on re-run,
//   - /api/entry-template: generated grid definition straight from the MOD,
//   - /api/schema compat shim: with the flag on, the "active registry" is the
//     MOD catalog in the exact shape legacy pages consume (A/B parity).

import { migrate } from "../../../scripts/migrate-presets-to-mods";
import { getStores } from "@/lib/store";
import { getModStore } from "@/core/ontology/store/mod-store";
import { getKnowledgeStore } from "@/core/ontology/store/knowledge-store";
import { DISPOSAFE_REGISTRY } from "@/__tests__/fixtures/disposafe-registry";
import { NextRequest } from "next/server";

function req(url: string): NextRequest {
  return new NextRequest(`http://localhost${url}`);
}

describe("Phase 4: preset → MOD migration + generated entry + schema shim", () => {
  jest.setTimeout(30000);

  it("migrates presets and the Disposafe registry into verified MODs + knowledge, idempotently", async () => {
    const { registries } = getStores();
    await registries.upsert({
      presetId: "april-book",
      name: "April Book",
      createdFromFilename: "APRIL.xlsx",
      registryVersion: "1.0.0",
      fiscalYearStartMonth: 4,
      stages: [{
        stageId: "visual", label: "Visual Inspection", upstream: [], effectiveFrom: null, effectiveTo: null,
        fields: [{ name: "Checked Qty" }, { name: "Rejected Qty" }],
        headerRows: [["DATE", "CHECKED", "REJ"]], merges: [{ s: { r: 0, c: 0 }, e: { r: 0, c: 1 } }],
      }],
      defects: [{ defectCode: "PINH", label: "Pinhole", aliases: ["PIN HOLE", "PINH"], stages: ["visual"] }],
      sizes: [{ sizeId: "Fr16", label: "16 FR" }],
      stageAliases: { "visual qc": { stageId: "visual", confidence: 1, basis: "alias", learnedAt: "2026-07-01T00:00:00Z" } },
    });

    const first = await migrate();
    expect(first.mods).toBe(2); // the preset + the Disposafe registry seed
    expect(first.knowledge).toBeGreaterThan(0);

    const again = await migrate();
    expect(again.mods).toBe(0);
    expect(again.skipped).toBe(2);

    // Catalog now serves the preset's world without any registry code.
    const catalog = await getModStore().catalogFor("default");
    expect(catalog.stages.some((s) => s.stageId === "visual")).toBe(true);
    expect(catalog.stages.some((s) => s.stageId === "valve-integrity")).toBe(true); // from DISPOSAFE seed
    const visual = catalog.stages.find((s) => s.stageId === "visual")!;
    expect(visual.captures).toEqual(expect.arrayContaining(["checked", "rejected"]));

    // Learned + demoted knowledge is queryable (the resolver's rung 2).
    const knowledge = getKnowledgeStore();
    expect((await knowledge.lookup("default", "stage-alias", "Visual QC"))?.canonicalId).toBe("STAGE:visual");
    expect((await knowledge.lookup("default", "column-mapping", "pin hole"))?.canonicalId).toBe("DEFECT:PINH");
    expect((await knowledge.lookup("default", "column-mapping", "struck balloon"))?.canonicalId).toBe("DEFECT:STBL");
  });

  it("generates the data-entry template from the verified ontology", async () => {
    const { GET } = await import("@/app/api/entry-template/route");
    const res = await GET(req("/api/entry-template"));
    expect(res.status).toBe(200);
    const { template } = await res.json();

    const visual = template.stages.find((s: any) => s.stageId === "visual");
    expect(visual).toBeTruthy();
    expect(visual.columns.map((c: any) => c.key)).toEqual(expect.arrayContaining(["checked", "rejected"]));
    // Preset migration materializes defect entities; Disposafe seed alone does not.
    expect(visual.defects.map((d: any) => d.defectCode)).toContain("PINH");
    // Must NOT dump the entire seed visual catalog (COAG/SD/TT/…) onto the grid.
    expect(visual.defects.length).toBeLessThanOrEqual(3);
    // The migrated preset's own sheet layout survives into the generated grid.
    expect(visual.layout?.headerRows?.[0]).toEqual(["DATE", "CHECKED", "REJ"]);
    expect(template.sizes.some((s: any) => s.sizeId === "Fr16")).toBe(true);
    expect(template.generatedFrom.length).toBeGreaterThan(0);
  });

  it("serves the MOD catalog through the /api/schema compat shim in legacy registry shape", async () => {
    const { GET } = await import("@/app/api/schema/route");
    const res = await GET();
    expect(res.status).toBe(200);
    const data = await res.json();

    expect(data.configured).toBe(true);
    expect(data.registry.presetId).toBe("mod-catalog");
    const visual = data.registry.stages.find((s: any) => s.stageId === "visual");
    expect(visual).toBeTruthy();
    // The exact field shape legacy data-entry consumes.
    expect(visual.fields.map((f: any) => f.name)).toEqual(expect.arrayContaining(["Checked Qty", "Rejected Qty"]));
    expect(data.registry.defects.some((d: any) => d.defectCode === "PINH")).toBe(true);
    // Disposafe seed rides along in the same catalog.
    expect(data.registry.defects.some((d: any) => d.defectCode === DISPOSAFE_REGISTRY.defects[0].defectCode)).toBe(true);
  });
});
