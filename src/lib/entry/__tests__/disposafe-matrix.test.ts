import {
  defectDisplayLabel,
  defectsFor,
  MATRIX_STAGES,
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

