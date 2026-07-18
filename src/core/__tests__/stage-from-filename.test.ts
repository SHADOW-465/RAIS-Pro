import { stageFromFileName } from "@/core/ontology/resolver/ladder";
import { readFileSync } from "fs";
import { buildProfilingTables } from "@/core/profiler/from-workbook";
import { profileTable } from "@/core/profiler/profile";
import { resolveWorkbook } from "@/core/ontology/resolver/ladder";
import { buildModDocument } from "@/core/ontology/builder/build-mod";
import { extractFromMod } from "@/core/ingest/extract-from-mod";
import { readWorkbookSnapshot } from "@/core/workbook/reader";

describe("stageFromFileName", () => {
  test("maps common Disposafe book names to STAGE:*", () => {
    expect(stageFromFileName("VISUAL INSPECTION REPORT 2025.xlsx")?.canonical).toBe("STAGE:visual");
    expect(stageFromFileName("01 VISUAL INSPECTION WEEKLY.xlsx")?.canonical).toBe("STAGE:visual");
    expect(stageFromFileName("BALLOON & VALVE INTEGRITY INSPECTION REPORT FILE 2025.xlsx")?.canonical).toBe(
      "STAGE:valve-integrity",
    );
    expect(stageFromFileName("05 FINAL INSPECTION WEEKLY.xlsx")?.canonical).toBe("STAGE:final");
    expect(stageFromFileName("09 REJECTION ANALYSIS-DECEMBER 2025.xlsx")?.canonical).toBe("STAGE:final");
    expect(stageFromFileName("random-workbook.xlsx")).toBeNull();
  });
});

describe("cold resolve + extract for month-tab visual book", () => {
  const path = "DATA/VISUAL INSPECTION REPORT 2025.xlsx";
  const maybe = (() => {
    try {
      readFileSync(path);
      return it;
    } catch {
      return it.skip;
    }
  })();

  maybe("filename stage fallback yields extractable records with no prior knowledge", async () => {
    const buf = readFileSync(path);
    const fileName = "VISUAL INSPECTION REPORT 2025.xlsx";
    const snapshot = await readWorkbookSnapshot(buf, fileName);
    const sheets = buildProfilingTables(buf, fileName).map((table) => ({
      table,
      columns: profileTable(table).columns,
    }));
    const resolverSheets = sheets.map((s) => ({
      fileName,
      sheetName: s.table.sheetName,
      tableId: s.table.tableId,
      regionLabel: s.table.regionLabel,
      columns: s.columns,
    }));
    const proposals = await resolveWorkbook(resolverSheets, {
      companyId: "default",
      exact: new Map(),
      knowledge: { lookup: async () => null } as any,
      concepts: [],
    });
    const stages = proposals.filter((p) => p.kind === "stage");
    expect(stages.some((s) => s.canonical === "STAGE:visual")).toBe(true);
    expect(stages.every((s) => s.canonical == null)).toBe(false);

    const doc = buildModDocument({ companyId: "default", snapshot, sheets, proposals });
    doc.entities = doc.entities.map((e) => ({ ...e, verified: true }));
    const records = extractFromMod(doc, snapshot, "test");
    // Without filename fallback this is 0 (month tabs have no STAGE:*).
    expect(records.length).toBeGreaterThan(0);
  }, 60_000);
});
