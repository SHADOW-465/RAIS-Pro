// Phase 2 proof (MOD-MIGRATION-PLAN §Phase 2): the resolver ladder proposes
// parser-equivalent mappings on corpus-shaped input WITHOUT the LLM rung —
// measures/defects/dates via global ontology + rules, stages via learned
// company knowledge, verbatim re-uploads via the exact index.
import type { ColumnProfile } from "@/core/profiler/types";
import { resolveWorkbook, type ExactIndex, type ResolverSheet } from "@/core/ontology/resolver/ladder";
import { getKnowledgeStore, normalizeKey } from "@/core/ontology/store/knowledge-store";
import { GLOBAL_ONTOLOGY_SEED } from "@/core/ontology/global-ontology";
import * as fs from "fs";
import * as path from "path";

const col = (name: string, role: ColumnProfile["role"], type: ColumnProfile["type"], index: number): ColumnProfile => ({
  name, index, colLetter: String.fromCharCode(65 + index), role, type, formula: null,
});

const VISUAL_SHEET: ResolverSheet = {
  fileName: "VISUAL INSPECTION REPORT 2025.xlsx",
  sheetName: "APRIL 25",
  columns: [
    col("DATE", "dimension-date", "date", 0),
    col("CHECKED QTY", "measure", "number", 1),
    col("REJ QTY", "measure", "number", 2),
    col("COAG", "defect", "number", 3),
    col("REJ %", "derived", "number", 4),
    col("REMARKS", "meta", "string", 5),
  ],
};

function ctx(overrides: { exact?: ExactIndex } = {}) {
  return {
    companyId: "test-co",
    exact: overrides.exact ?? new Map(),
    knowledge: getKnowledgeStore(),
    concepts: GLOBAL_ONTOLOGY_SEED,
  };
}

describe("resolver ladder (rungs 1–4, no LLM)", () => {
  it("resolves measures/defects/dates/derived via global ontology + rules on a corpus-shaped sheet", async () => {
    const proposals = await resolveWorkbook([VISUAL_SHEET], ctx());
    const byHeader = new Map(proposals.map((p) => [p.original.header, p]));

    expect(byHeader.get("DATE")?.canonical).toBe("DATE");
    expect(byHeader.get("CHECKED QTY")?.canonical).toBe("CHECKED_QTY");
    expect(byHeader.get("CHECKED QTY")?.resolvedBy).toBe("ontology");
    expect(byHeader.get("REJ QTY")?.canonical).toBe("REJECTED_QTY");
    expect(byHeader.get("COAG")?.canonical).toBe("DEFECT:COAG");
    expect(byHeader.get("COAG")?.resolvedBy).toBe("rule");
    // The derived-role guard: "REJ %" must be the claim, never REJECTED_QTY.
    expect(byHeader.get("REJ %")?.canonical).toBe("STATED_PCT");
    expect(byHeader.get("REMARKS")?.canonical).toBeNull();
    expect(byHeader.get("REMARKS")?.kind).toBe("meta");

    // Unseeded company: the stage is honestly unresolved, not guessed.
    const stage = proposals.find((p) => p.entityId === "stage:APRIL 25");
    expect(stage?.canonical).toBeNull();

    // Nothing omitted: every column + the sheet itself got a proposal.
    expect(proposals.length).toBe(VISUAL_SHEET.columns.length + 1);
  });

  it("resolves stages via learned company knowledge (rung 2), sheet name over file name", async () => {
    const knowledge = getKnowledgeStore();
    await knowledge.learn([
      { companyId: "test-co", kind: "stage-alias", key: normalizeKey("VISUAL INSPECTION REPORT 2025.xlsx"), canonicalId: "STAGE:visual", confidence: 1, learnedFrom: "m1" },
    ]);

    const proposals = await resolveWorkbook([VISUAL_SHEET], ctx());
    const stage = proposals.find((p) => p.entityId === "stage:APRIL 25");
    expect(stage?.canonical).toBe("STAGE:visual");
    expect(stage?.resolvedBy).toBe("knowledge");
  });

  it("recognizes size tabs and stamps their stage from the file (size-wise workbook shape)", async () => {
    const sizeSheet: ResolverSheet = { ...VISUAL_SHEET, sheetName: "16FR" };
    const proposals = await resolveWorkbook([sizeSheet], ctx());
    expect(proposals.find((p) => p.entityId === "sheet:16FR")?.canonical).toBe("SIZE:Fr16");
    // Stage alias for the FILE was learned in the previous test (same store singleton):
    expect(proposals.find((p) => p.entityId === "stage:16FR")?.canonical).toBe("STAGE:visual");
  });

  it("rung 1 (exact) outranks everything at confidence 1", async () => {
    const exact: ExactIndex = new Map([[`col|${normalizeKey("CHECKED QTY")}`, { canonical: "CHECKED_QTY", kind: "measure" as const }]]);
    const proposals = await resolveWorkbook([VISUAL_SHEET], ctx({ exact }));
    const checked = proposals.find((p) => p.original.header === "CHECKED QTY");
    expect(checked?.resolvedBy).toBe("exact");
    expect(checked?.confidence).toBe(1);
  });
});

const CORPUS = path.join(process.cwd(), "DATA", "VISUAL INSPECTION REPORT 2025.xlsx");
const maybe = fs.existsSync(CORPUS) ? describe : describe.skip;

maybe("resolver on the real corpus (no LLM)", () => {
  it("profiles + resolves the Visual workbook: sizes, stages (via alias), and quantity measures", async () => {
    const { buildProfilingTables } = await import("@/core/profiler/from-workbook");
    const { profileTable } = await import("@/core/profiler/profile");
    const buf = fs.readFileSync(CORPUS);
    const fileName = "VISUAL INSPECTION REPORT 2025.xlsx";

    const sheets: ResolverSheet[] = buildProfilingTables(buf, fileName).map((t) => ({
      fileName, sheetName: t.sheetName, columns: profileTable(t).columns,
    }));
    expect(sheets.length).toBeGreaterThan(0);

    const proposals = await resolveWorkbook(sheets, ctx());

    // Every sheet and every profiled column produced a proposal — nothing dropped.
    const columnCount = sheets.reduce((n, s) => n + s.columns.length, 0);
    expect(proposals.length).toBeGreaterThanOrEqual(columnCount);

    // The workbook's quantity columns resolve to canonical measures.
    const canonicals = new Set(proposals.map((p) => p.canonical));
    expect(canonicals.has("CHECKED_QTY") || canonicals.has("REJECTED_QTY")).toBe(true);

    // Stage comes from the learned file alias (seeded in the suite above) for
    // every sheet that carries one.
    const stageProps = proposals.filter((p) => p.kind === "stage");
    expect(stageProps.length).toBeGreaterThan(0);
    expect(stageProps.every((p) => p.canonical === "STAGE:visual")).toBe(true);
  });
});
