import { kpiScopeLabel, lotScopeLabel, REPORT_SCOPE_LABEL } from "../scope-label";
import { resolveScope } from "../scope";
import { DEFAULT_STAGE_CATEGORIES, stageCategoryOf } from "@/core/ontology/plant-catalog";

test("assembly on the lot calendar, and the whole plant on entry date", () => {
  expect(kpiScopeLabel({ sections: ["assembly"], dateBasis: "lot-date" })).toBe("Assembly – lot date");
  expect(REPORT_SCOPE_LABEL).toBe("Whole plant – entry date");
  expect(lotScopeLabel({ stageCategories: ["assembly"], stageView: "cumulative" })).toBe("Assembly – lot date");
  expect(
    lotScopeLabel({ stageCategories: ["assembly"], stageView: "visual" }, { visual: "Visual Inspection" }),
  ).toBe("Visual Inspection – lot date");
});

test("the integrity banner's label names the population its scan ran on", () => {
  // Schema's banner and the dashboard both scan resolveScope(events, tweaks);
  // the label printed beside the count must describe that same scope.
  const tweaks = { stageCategories: [...DEFAULT_STAGE_CATEGORIES], stageView: "cumulative" };
  expect(lotScopeLabel(tweaks)).toBe("Assembly – lot date");
  const scope = resolveScope([], { ...tweaks, grain: "month", datePreset: "all", dateFrom: "", dateTo: "" });
  expect(scope.stageIds?.length).toBeGreaterThan(0);
  expect(new Set(scope.stageIds!.map((id) => stageCategoryOf(id)))).toEqual(new Set(["assembly"]));
});
