import { getModStore } from "../src/core/ontology/store/mod-store";
import { getSnapshotStore } from "../src/core/workbook/snapshot-store";
import { DISPOSAFE_REGISTRY } from "./disposafe-registry-data";
import { ModDocument } from "../src/shared/models/ontology";
import { GET } from "../src/app/api/entry-template/route";
import { NextRequest } from "next/server";

async function main() {
  const store = getModStore();
  const snap = getSnapshotStore();
  const company = "default";

  const doc = ModDocument.parse({
    companyId: company,
    workbook: { fileName: "disposafe-registry", fileHash: "migrated", sheetNames: ["Visual Inspection"] },
    entities: DISPOSAFE_REGISTRY.stages.map((s) => ({
      entityId: `stage:${s.stageId}`,
      kind: "stage" as const,
      original: { sheet: s.label, tableId: "t1", colLetter: null, header: s.label },
      canonical: `STAGE:${s.stageId}`,
      subcategory: null,
      confidence: 1,
      resolvedBy: "user" as const,
      reason: "seed",
      verified: true,
    })),
    stages: DISPOSAFE_REGISTRY.stages.map((s) => ({
      ...s,
      upstream: s.upstream || [],
      effectiveFrom: s.effectiveFrom ?? null,
      effectiveTo: s.effectiveTo ?? null,
    })),
    defects: DISPOSAFE_REGISTRY.defects,
    sizes: DISPOSAFE_REGISTRY.sizes,
    fiscalYearStartMonth: 4,
    relationships: [],
    formulas: [],
    layout: [],
    validation: [],
  });

  await snap.put({ snapshotId: "seed1", fileName: "disposafe-registry", sheets: [] });
  const draft = await store.saveDraft({ modId: "seed1", companyId: company, snapshotId: "seed1", document: doc });
  await store.publish("seed1", draft.version, "test");

  const catalogVisual = DISPOSAFE_REGISTRY.defects.filter((d) => d.stages.includes("visual")).length;
  console.log("catalog visual defect count (old behavior would show this):", catalogVisual);

  const res = await GET(new NextRequest("http://localhost/api/entry-template"));
  const body = await res.json();
  const visual = body.meta.stages.find((s: { stageId: string }) => s.stageId === "visual");
  console.log("entry-template visual defects:", visual?.defectCount, visual?.defectCodes);
  if (visual?.defectCount === 0) {
    console.log("PASS: seed MOD no longer pads the data-entry grid with hardcoded defects");
  } else {
    console.error("FAIL: still padding");
    process.exit(1);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
