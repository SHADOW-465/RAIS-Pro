import { resolveConfirmPresetId, isNewStageLabel } from "../confirm-stage";

describe("resolveConfirmPresetId", () => {
  it("uses the active registry's presetId", () => {
    expect(resolveConfirmPresetId({ presetId: "acme" })).toBe("acme");
  });

  it("falls back to clientId when presetId is absent", () => {
    expect(resolveConfirmPresetId({ clientId: "acme" })).toBe("acme");
  });

  it("falls back to 'default' when the registry is null (nothing configured yet)", () => {
    expect(resolveConfirmPresetId(null)).toBe("default");
  });
});

describe("isNewStageLabel", () => {
  const knownStages = [{ stageId: "visual" }, { stageId: "final" }];

  it("is false for an existing stageId", () => {
    expect(isNewStageLabel("visual", knownStages)).toBe(false);
  });

  it("is true for a label that matches no known stageId", () => {
    expect(isNewStageLabel("Cutting", knownStages)).toBe(true);
  });
});
