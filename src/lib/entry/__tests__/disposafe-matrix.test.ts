import {
  defectDisplayLabel,
  defectsFor,
  MATRIX_STAGES,
  previousAssemblyStageId,
} from "@/lib/entry/disposafe-matrix";

describe("Primary Production matrix UX helpers", () => {
  test("primary defects expose a single clean title (no dual labels)", () => {
    const defs = defectsFor("primary", "");
    expect(defs.length).toBe(8);
    for (const d of defs) {
      const title = defectDisplayLabel(d);
      expect(title.length).toBeGreaterThan(0);
      // Must not look like "Name (CODE)" dual display
      expect(title).not.toMatch(/\([A-Z0-9 /-]+\)$/);
    }
    expect(defectDisplayLabel(defs.find((d) => d.key === "COAG")!)).toBe("COAG");
    expect(defectDisplayLabel(defs.find((d) => d.key === "Overlaping")!)).toBe("Overlapping");
  });

  test("assembly balloon/valve titles are single-line without parenthetical codes", () => {
    for (const d of defectsFor("assembly", "p16-balloon")) {
      expect(defectDisplayLabel(d)).not.toMatch(/\([A-Z0-9 /-]+\)$/);
    }
    for (const d of defectsFor("assembly", "p17-valve")) {
      expect(defectDisplayLabel(d)).not.toMatch(/\([A-Z0-9 /-]+\)$/);
    }
  });

  test("primary still has defects; secondary hides them", () => {
    expect(MATRIX_STAGES.primary.hideDefects).toBe(false);
    expect(MATRIX_STAGES.secondary.hideDefects).toBe(true);
    expect(defectsFor("secondary", "")).toEqual([]);
  });

  test("secondary workflow is qty+bin only (no defect schema)", () => {
    expect(MATRIX_STAGES.secondary.defects).toEqual([]);
    expect(MATRIX_STAGES.secondary.processes.length).toBeGreaterThan(0);
  });
});

describe("previousAssemblyStageId — chain order (Visual → Balloon → Valve → Final)", () => {
  test("first stage (Visual) has no predecessor", () => {
    expect(previousAssemblyStageId("p15-visual")).toBeNull();
  });

  test("Balloon's predecessor is Visual", () => {
    expect(previousAssemblyStageId("p16-balloon")).toBe("visual");
  });

  test("Valve's predecessor is Balloon", () => {
    expect(previousAssemblyStageId("p17-valve")).toBe("balloon");
  });

  test("Final's predecessor is Valve", () => {
    expect(previousAssemblyStageId("p18-final")).toBe("valve-integrity");
  });

  test("unknown micro id has no predecessor", () => {
    expect(previousAssemblyStageId("not-a-stage")).toBeNull();
  });

  test("chain matches the declared process order exactly", () => {
    const ids = MATRIX_STAGES.assembly.processes.map((p) => p.id);
    for (let i = 1; i < ids.length; i++) {
      const expected = MATRIX_STAGES.assembly.processes[i - 1].stageId;
      expect(previousAssemblyStageId(ids[i])).toBe(expected);
    }
  });
});

