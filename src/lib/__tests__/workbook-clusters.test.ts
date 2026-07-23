import { clusterStem, clusterWorkbooks, fileBasename } from "../workbook-clusters";

describe("workbook-clusters", () => {
  it("stems monthly rejection analysis files together", () => {
    const a = clusterStem("01 REJECTION ANALYSIS-APRIL 2025.xlsx");
    const b = clusterStem("12 REJECTION ANALYSIS-MARCH 2026.xlsx");
    expect(a).toBe(b);
    expect(a).toMatch(/REJECTION/);
  });

  it("clusters like plant folders", () => {
    const files = [
      { snapshotId: "1", fileName: "01 REJECTION ANALYSIS-APRIL 2025.xlsx", uploadedAt: "2025-04-01" },
      { snapshotId: "2", fileName: "02 REJECTION ANALYSIS-MAY 2025.xlsx", uploadedAt: "2025-05-01" },
      { snapshotId: "3", fileName: "VISUAL INSPECTION REPORT 2025.xlsx", uploadedAt: "2025-06-01" },
      { snapshotId: "4", fileName: "YEARLY ANALYSIS.xlsx", uploadedAt: "2025-07-01" },
    ];
    const clusters = clusterWorkbooks(files);
    const rej = clusters.find((c) => /rejection/i.test(c.label));
    expect(rej?.files).toHaveLength(2);
    expect(clusters.some((c) => /visual/i.test(c.label))).toBe(true);
  });

  it("fileBasename strips paths", () => {
    expect(fileBasename("ANALYTICAL DATA/REJECTION/01 foo.xlsx")).toBe("01 foo.xlsx");
  });
});
