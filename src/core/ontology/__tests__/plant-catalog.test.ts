// The catalog is data, so the check is that the data is internally consistent —
// the cascade closes, defect codes are scoped to stages that exist, and the two
// stage-specific target sets that caused the Excel's false "OK" verdicts stay
// distinguishable from "no target".

import { STAGES, STAGE_CATEGORIES, DEFECTS, SIZES, DEFECT_TARGETS, plantCatalog, mergePlantCatalog, canonicalDefectCode, resolveStageId, sortStageIds, stageSortKey } from "../plant-catalog";
import { StageDef, DefectDef, SizeDef } from "@/lib/contract/d1";
import type { CompanyCatalog } from "@/core/ontology/store/catalog-store";

test("every stage/defect/size satisfies the persisted contract", () => {
  for (const s of STAGES) expect(() => StageDef.parse(s)).not.toThrow();
  for (const d of DEFECTS) expect(() => DefectDef.parse(d)).not.toThrow();
  for (const s of SIZES) expect(() => SizeDef.parse(s)).not.toThrow();
});

test("the upstream cascade resolves and is acyclic", () => {
  const ids = new Set(STAGES.map((s) => s.stageId));
  const index = new Map(STAGES.map((s, i) => [s.stageId, i]));
  for (const s of STAGES)
    for (const up of s.upstream) {
      expect(ids.has(up)).toBe(true);
      // upstream must appear EARLIER in the list — that ordering is what the
      // RTY/cascade maths walks, so a backwards edge would silently invert it.
      expect(index.get(up)!).toBeLessThan(index.get(s.stageId)!);
    }
});

test("only quality gates record a disposition breakdown", () => {
  for (const s of STAGES) {
    const caps = s.captures ?? [];
    expect(caps).toContain("checked");
    if (s.isQualityGate) expect(caps).toEqual(expect.arrayContaining(["accepted", "rejected"]));
  }
  expect(STAGES.filter((s) => s.isQualityGate).map((s) => s.stageId))
    .toEqual(["visual", "balloon", "valve-integrity", "final"]);
});

test("HOLD is captured at Visual only", () => {
  // The plant dispositions held material at Visual; downstream gates pass or
  // reject. Historical sheets DO carry HOLD at balloon/valve/final and the sheet
  // reader still reads it — this governs the Data Entry form, not ingest.
  expect(STAGES.filter((s) => (s.captures ?? []).includes("hold")).map((s) => s.stageId))
    .toEqual(["visual"]);
});

test("every stage belongs to a shop-floor section", () => {
  for (const s of STAGES) expect(["primary", "secondary", "assembly"]).toContain(s.category);
  const cat = (c: string) => STAGES.filter((s) => s.category === c).map((s) => s.stageId);
  expect(cat("assembly")).toEqual([
    "visual", "balloon", "valve-fixing", "valve-integrity", "final", "primary-pack-inspection",
  ]);
  // Eye punching and hanging are secondary-line work, not dipping.
  expect(cat("secondary")).toEqual(["eye-punching", "hanging", "secondary"]);
  expect(cat("primary")).toContain("production");
  expect(cat("primary")).not.toContain("eye-punching");
});

test("the authored shop-floor sections seed the catalog", () => {
  expect(STAGE_CATEGORIES.map((c) => c.id)).toEqual(["primary", "secondary", "assembly"]);
  expect(STAGE_CATEGORIES.find((c) => c.id === "primary")!.label).toBe("Production Dipping");
  expect(STAGES.find((s) => s.stageId === "production")!.label).toBe("Dipping");
});

test("defects are scoped to stages that exist, and the four vocabularies stay separate", () => {
  const ids = new Set(STAGES.map((s) => s.stageId));
  for (const d of DEFECTS) {
    expect(d.stages.length).toBeGreaterThan(0);
    for (const s of d.stages) expect(ids.has(s)).toBe(true);
    expect(d.aliases).toContain(d.defectCode);
  }
  const at = (stage: string) => DEFECTS.filter((d) => d.stages.includes(stage)).length;
  expect(at("visual")).toBe(21);
  expect(at("final")).toBe(21);
  expect(at("balloon")).toBe(4);
  expect(at("valve-integrity")).toBe(5);
  expect(at("production")).toBe(8);
});

test("a target of 0 is never conflated with no target", () => {
  // The Excel wrote 0 for both, which is why its RESULTS column printed "OK"
  // for defects with real counts. Absent entry = no target; any present target
  // is a real positive threshold.
  for (const targets of Object.values(DEFECT_TARGETS))
    for (const t of targets) expect(t.pct).toBeGreaterThan(0);

  // Same code, different threshold per stage — the case that proves targets
  // cannot live on the defect alone.
  expect(DEFECT_TARGETS["BM"]).toEqual([
    { stageId: "visual", pct: 1.0 },
    { stageId: "final", pct: 0.1 },
  ]);
  // TT has a visual target but explicitly none at final.
  expect(DEFECT_TARGETS["TT"]).toEqual([{ stageId: "visual", pct: 0.1 }]);
});

test("plantCatalog() is shaped like a CompanyCatalog", () => {
  const c = plantCatalog();
  expect(c.fiscalYearStartMonth).toBe(4);
  expect(c.stages).toHaveLength(15);
  expect(c.sizes.map((s) => s.sizeId)).toContain("Fr16"); // ledger-compatible id
});

describe("mergePlantCatalog — upgrading a catalog that was inferred from workbooks", () => {
  // The shape actually in production: 5 stages, no cascade, no production stage,
  // and a hand-renamed defect label.
  const stored: CompanyCatalog = {
    stages: [
      { stageId: "visual", label: "Visual (renamed by plant)", effectiveFrom: null, effectiveTo: null,
        upstream: [], captures: ["checked", "rejected"], isQualityGate: true },
      { stageId: "custom-dip-line", label: "Custom Dip Line", effectiveFrom: null, effectiveTo: null,
        upstream: [], captures: ["checked"] },
    ],
    defects: [
      { defectCode: "COAG", label: "Coagulant", aliases: ["COAG", "COAGULANT"], stages: ["visual"] },
      { defectCode: "XYZ", label: "Plant-specific code", aliases: ["XYZ"], stages: ["visual"] },
    ],
    sizes: [{ sizeId: "Fr16", label: "16 FR (renamed)" }],
    fiscalYearStartMonth: 4,
    updatedAt: "2026-07-29T00:00:00.000Z",
    lastMergedFrom: "some-mod",
  };
  const merged = mergePlantCatalog(stored);

  test("labels the plant edited survive", () => {
    expect(merged.stages.find((s) => s.stageId === "visual")!.label).toBe("Visual (renamed by plant)");
    expect(merged.defects.find((d) => d.defectCode === "COAG")!.label).toBe("Coagulant");
    expect(merged.sizes.find((s) => s.sizeId === "Fr16")!.label).toBe("16 FR (renamed)");
  });

  test("structure is re-asserted from the authored catalog", () => {
    // The stored visual stage had no cascade and no hold column. Both restored.
    const visual = merged.stages.find((s) => s.stageId === "visual")!;
    expect(visual.upstream).toEqual(["secondary"]);
    expect(visual.captures).toContain("hold");   // Visual keeps its Hold column
  });

  test("nothing the plant added is dropped", () => {
    expect(merged.stages.map((s) => s.stageId)).toContain("custom-dip-line");
    expect(merged.defects.map((d) => d.defectCode)).toContain("XYZ");
    // …and the aliases they taught it are kept alongside the authored ones.
    expect(merged.defects.find((d) => d.defectCode === "COAG")!.aliases).toEqual(
      expect.arrayContaining(["COAG", "COAGULANT", "Coagulum"]),
    );
  });

  test("the missing stages arrive, in process order", () => {
    const ids = merged.stages.map((s) => s.stageId);
    expect(ids).toContain("production");
    expect(ids.indexOf("production")).toBeLessThan(ids.indexOf("visual"));
    expect(merged.stages).toHaveLength(16); // 15 authored + 1 plant-specific
  });

  test("merging twice is a no-op", () => {
    const twice = mergePlantCatalog(merged);
    expect(twice.stages).toEqual(merged.stages);
    expect(twice.defects).toEqual(merged.defects);
    expect(twice.sizes).toEqual(merged.sizes);
  });
});

test("a legacy code folds into its authored twin instead of duplicating it", () => {
  // The old resolver minted PINH for what the sheet header calls PH. Merging a
  // previously-inferred catalog must not leave two pin-hole columns.
  const merged = mergePlantCatalog({
    stages: [], sizes: [], fiscalYearStartMonth: 4, updatedAt: null, lastMergedFrom: null,
    defects: [{ defectCode: "PINH", label: "Ph", aliases: ["PINH", "PIN HOLE"], stages: ["visual", "final"] }],
  });
  const pinhole = merged.defects.filter((d) => /pin ?hole/i.test(d.label) || d.defectCode === "PINH");
  expect(pinhole).toHaveLength(1);
  expect(pinhole[0].defectCode).toBe("PH");
  // The placeholder label "Ph" must not win over the real one.
  expect(pinhole[0].label).toBe("Pin Hole");
  // Ledger rows recorded as "PINH" still resolve — review.ts matches on aliases.
  expect(pinhole[0].aliases).toContain("PINH");
});

test("canonicalDefectCode resolves the spellings seen in the workbooks", () => {
  expect(canonicalDefectCode("PINH")).toBe("PH");
  expect(canonicalDefectCode("pin hole")).toBe("PH");
  expect(canonicalDefectCode("BP")).toBe("BMP");
  expect(canonicalDefectCode("Overlaping")).toBe("OL");
  expect(canonicalDefectCode("THIN SPOD")).toBe("THSP");
  expect(canonicalDefectCode("BALLOOM BRUST")).toBe("BLBR");
  expect(canonicalDefectCode("nonsense")).toBeNull();
});

test("production-dipping is production on the plant line, and sorts before Visual", () => {
  expect(resolveStageId("production-dipping")).toBe("production");
  expect(resolveStageId("PRODUCTION DIPPING")).toBe("production");
  expect(stageSortKey("production-dipping")).toBeLessThan(stageSortKey("visual"));
  expect(sortStageIds(["visual", "balloon", "hanging", "production-dipping", "eye-punching"])).toEqual([
    "production-dipping",
    "eye-punching",
    "hanging",
    "visual",
    "balloon",
  ]);
});
