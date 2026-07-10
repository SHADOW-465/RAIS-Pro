import * as fs from "fs";
import * as path from "path";
import { recognizeSheetStage, recognizeStage, knownStage } from "../recognize";
import { datasetsWithRowsFromWorkbooks } from "../from-workbooks";
import { DISPOSAFE_REGISTRY } from "@/lib/registry/disposafe";
import type { Dataset } from "../types";
import { recognizeStageScored, normalizeAliasKey } from "../recognize";
import type { StageAlias } from "@/lib/store/types";

const baseDataset = (overrides: Partial<Dataset>): Dataset => ({
  id: "ds1",
  signatureHash: "ds1",
  title: "Test Dataset",
  columns: [
    { role: "dimension-date", name: "date" },
    { role: "measure", name: "checked" },
    { role: "measure", name: "rejected" },
  ],
  sources: [{ fileName: "01 REJECTION ANALYSIS-APRIL 2025.xlsx", sheetName: "VISUAL", rowCount: 10 }],
  totalRows: 10,
  recognizedStageId: null,
  ...overrides,
});

describe("recognizeSheetStage", () => {
  it("matches the sheet name before the file name (two-pass, like resolveStageId)", () => {
    // Sheet says FINAL; the file mentions VISUAL — the sheet must win.
    expect(recognizeSheetStage("VISUAL INSPECTION REPORT 2025.xlsx", "FINAL")).toBe("final");
    // Month-named sheet inside a stage-named file resolves via the file.
    expect(recognizeSheetStage("VISUAL INSPECTION REPORT 2025.xlsx", "APRIL 25")).toBe("visual");
  });

  it("returns null when neither sheet nor file matches any stage pattern", () => {
    expect(recognizeSheetStage("3 JUNE 26.xlsx", "16FR")).toBeNull();
  });
});

describe("recognizeStage", () => {
  it("does not false-positive on a bare size sheet with no stage keyword", () => {
    const ds = baseDataset({
      sources: [{ fileName: "3 JUNE 26.xlsx", sheetName: "16FR", rowCount: 5 }],
    });
    expect(recognizeStage(ds)).toBeNull();
  });

  it("recognizes a VISUAL sheet from the real corpus naming convention", () => {
    const ds = baseDataset({
      sources: [{ fileName: "01 REJECTION ANALYSIS-APRIL 2025.xlsx", sheetName: "VISUAL", rowCount: 30 }],
    });
    expect(recognizeStage(ds)).toBe("visual");
  });

  it("returns null when the dataset has no measure column, regardless of names", () => {
    const ds = baseDataset({
      columns: [
        { role: "dimension-date", name: "date" },
        { role: "derived", name: "rej %" },
      ],
      sources: [{ fileName: "01 REJECTION ANALYSIS-APRIL 2025.xlsx", sheetName: "VISUAL", rowCount: 30 }],
    });
    expect(recognizeStage(ds)).toBeNull();
  });

  it("recognizes balloon, valve-integrity, final, and eye-punching sheet names", () => {
    const cases: { sheetName: string; expected: string }[] = [
      { sheetName: "BALLOON", expected: "balloon" },
      { sheetName: "VALVE INTEGRITY", expected: "valve-integrity" },
      { sheetName: "FINAL", expected: "final" },
      { sheetName: "EYE PUNCHING", expected: "eye-punching" },
    ];
    for (const { sheetName, expected } of cases) {
      const ds = baseDataset({ sources: [{ fileName: "x.xlsx", sheetName, rowCount: 10 }] });
      expect(recognizeStage(ds)).toBe(expected);
    }
  });

  it("requires a clear majority of sources to agree, not a stray match", () => {
    const ds = baseDataset({
      sources: [
        { fileName: "a.xlsx", sheetName: "16FR", rowCount: 5 },
        { fileName: "b.xlsx", sheetName: "18FR", rowCount: 5 },
        { fileName: "c.xlsx", sheetName: "VISUAL", rowCount: 5 },
      ],
    });
    // Only 1 of 3 sources matches "visual" — below the 0.5 majority threshold.
    expect(recognizeStage(ds)).toBeNull();
  });
});

describe("normalizeAliasKey", () => {
  it("collapses case and whitespace so 'Visual QC' and 'visual qc' match", () => {
    expect(normalizeAliasKey("Visual QC")).toBe(normalizeAliasKey("visual qc"));
  });
});

describe("recognizeStageScored", () => {
  it("returns high confidence exact-pattern match with basis heuristic when no alias exists", () => {
    const ds = baseDataset({
      sources: [{ fileName: "01 REJECTION ANALYSIS-APRIL 2025.xlsx", sheetName: "VISUAL", rowCount: 30 }],
    });
    const result = recognizeStageScored(ds, {});
    expect(result).toEqual({ stageId: "visual", confidence: 0.9, basis: "heuristic" });
  });

  it("prefers a learned alias over the regex pattern, with basis alias", () => {
    const ds = baseDataset({
      sources: [{ fileName: "x.xlsx", sheetName: "Visual QC", rowCount: 10 }],
    });
    const aliases: Record<string, StageAlias> = {
      [normalizeAliasKey("Visual QC")]: { stageId: "visual", confidence: 0.99, basis: "alias", learnedAt: "2026-07-10T00:00:00.000Z" },
    };
    const result = recognizeStageScored(ds, aliases);
    expect(result).toEqual({ stageId: "visual", confidence: 0.99, basis: "alias" });
  });

  it("returns null (not a low-confidence guess) when nothing matches and no alias exists", () => {
    const ds = baseDataset({
      sources: [{ fileName: "3 JUNE 26.xlsx", sheetName: "16FR", rowCount: 5 }],
    });
    expect(recognizeStageScored(ds, {})).toBeNull();
  });

  it("still requires a measure column, same defensive gate as recognizeStage", () => {
    const ds = baseDataset({
      columns: [{ role: "dimension-date", name: "date" }, { role: "derived", name: "rej %" }],
      sources: [{ fileName: "x.xlsx", sheetName: "VISUAL", rowCount: 10 }],
    });
    expect(recognizeStageScored(ds, {})).toBeNull();
  });
});

describe("knownStage with an explicit registry", () => {
  it("recognizes a stage defined only in the passed-in registry, not DISPOSAFE_REGISTRY", () => {
    const customRegistry = { ...DISPOSAFE_REGISTRY, stages: [{ ...DISPOSAFE_REGISTRY.stages[0], stageId: "custom-stage" }] };
    const ds = baseDataset({ sources: [{ fileName: "x.xlsx", sheetName: "CUSTOM STAGE FILE", rowCount: 5 }] });
    // recognizeSheetStage only knows the 5 hardcoded STAGE_PATTERNS regexes, so this
    // test targets knownStage directly rather than going through recognizeStage —
    // confirming the registry parameter is actually consulted.
    expect(knownStage("custom-stage", customRegistry)).toBe(true);
    expect(knownStage("custom-stage")).toBe(false); // default (DISPOSAFE_REGISTRY) still doesn't know it
  });
});

describe("recognizeStage (regression — unscored callers unaffected)", () => {
  it("keeps returning a bare stageId string, not the scored shape", () => {
    const ds = baseDataset({
      sources: [{ fileName: "01 REJECTION ANALYSIS-APRIL 2025.xlsx", sheetName: "VISUAL", rowCount: 30 }],
    });
    expect(recognizeStage(ds)).toBe("visual");
  });
});

const DIR = path.join(process.cwd(), "ANALYTICAL DATA", "REJECTION ANALYSIS 2025-26");
const maybe = fs.existsSync(DIR) ? describe : describe.skip;

maybe("stage-aware grouping (real corpus)", () => {
  it("splits the shared-signature stage sheets into per-stage recognized datasets", () => {
    const files = fs
      .readdirSync(DIR)
      .filter((f) => /REJECTION ANALYSIS.*\.xlsx$/i.test(f) && !f.startsWith("~$"))
      .map((f) => ({ fileName: f, data: fs.readFileSync(path.join(DIR, f)) as unknown as ArrayBuffer }));
    const { datasets } = datasetsWithRowsFromWorkbooks(files);
    const recognized = datasets
      .map((d) => d.recognizedStageId)
      .filter((id): id is string => id !== null);

    // The old signature-only grouping merged VISUAL/BALLOON/VALVE/FINAL into
    // one 48-source dataset; stage-aware grouping yields one dataset per stage.
    expect(recognized.length).toBeGreaterThanOrEqual(3);

    // Every recognized id is a real registry stage.
    const known = new Set(DISPOSAFE_REGISTRY.stages.map((s) => s.stageId));
    for (const id of recognized) expect(known.has(id)).toBe(true);

    expect(recognized).toEqual(expect.arrayContaining(["visual", "final"]));

    // The persisted field agrees with the dataset-level recognizer.
    for (const d of datasets) {
      if (d.recognizedStageId) expect(recognizeStage(d)).toBe(d.recognizedStageId);
    }
  });
});
