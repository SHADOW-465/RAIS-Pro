import { serializeInvestigationState, parseInvestigationState } from "../investigation-state";

it("round-trips the highlight field", () => {
  const q = serializeInvestigationState({ grain: "month", metric: "defect", highlight: "defect" });
  expect(q.get("highlight")).toBe("defect");
  expect(parseInvestigationState(q).highlight).toBe("defect");
});

it("omits highlight when absent", () => {
  const q = serializeInvestigationState({ grain: "month" });
  expect(q.has("highlight")).toBe(false);
});
