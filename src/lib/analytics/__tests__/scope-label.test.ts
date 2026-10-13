import { kpiScopeLabel, lotScopeLabel, REPORT_SCOPE_LABEL } from "../scope-label";

test("assembly on the lot calendar, and the whole plant on entry date", () => {
  expect(kpiScopeLabel({ sections: ["assembly"], dateBasis: "lot-date" })).toBe("Assembly – lot date");
  expect(REPORT_SCOPE_LABEL).toBe("Whole plant – entry date");
  expect(lotScopeLabel({ stageCategories: ["assembly"], stageView: "cumulative" })).toBe("Assembly – lot date");
  expect(
    lotScopeLabel({ stageCategories: ["assembly"], stageView: "visual" }, { visual: "Visual Inspection" }),
  ).toBe("Visual Inspection – lot date");
});
