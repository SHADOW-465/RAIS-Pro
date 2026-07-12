// Phase 3/5 ORACLE, frozen (MOD-MIGRATION-PLAN §Phase 5): the golden totals
// below were computed by the legacy extraction paths (family parser for the
// Rejection Analysis book; generic classifier for the Visual book) BEFORE
// their deletion, and proven identical to extract-from-mod's output. The MOD
// path must keep reproducing them on the real corpus.
import * as fs from "fs";
import * as path from "path";
import { modPathRecords } from "./fixtures/extract-oracle-helpers";
import { emitMany, type StageDayRecord } from "@/lib/ingest/emit";
import { canonicalizeEvents } from "@/lib/analytics/canonical";

const DATA = path.join(process.cwd(), "DATA");

/** Golden canonical totals, frozen from the legacy paths at commit a6bea02. */
const GOLDEN: Record<string, { stageOfSheet: [string, string][]; totals: Record<string, { checked: number; rejected: number; defects: number }> }> = {
  "VISUAL INSPECTION REPORT 2025.xlsx": {
    // every month tab (and the legacy-consumed extras) → visual
    stageOfSheet: [], // filled at runtime: ALL sheets → visual (what the generic classifier did)
    totals: { visual: { checked: 2726381, rejected: 160683, defects: 150311 } },
  },
  "09 REJECTION ANALYSIS-DECEMBER 2025.xlsx": {
    stageOfSheet: [
      ["VISUAL", "visual"], ["BALLOON INSPECTION", "balloon"],
      ["VALVE INTEGRITY", "valve-integrity"], ["FINAL INSPECTION", "final"],
    ],
    totals: {
      visual: { checked: 327157, rejected: 15604, defects: 0 },
      balloon: { checked: 284748, rejected: 981, defects: 0 },
      "valve-integrity": { checked: 279255, rejected: 30518, defects: 0 },
      final: { checked: 273003, rejected: 5490, defects: 0 },
    },
  },
};

const available = Object.keys(GOLDEN).filter((f) => fs.existsSync(path.join(DATA, f)));
const maybe = available.length === Object.keys(GOLDEN).length ? describe : describe.skip;

function totals(records: StageDayRecord[]) {
  const events = canonicalizeEvents(emitMany(records));
  const byStage: Record<string, { checked: number; rejected: number; defects: number }> = {};
  for (const e of events as any[]) {
    if (!["production", "inspection", "rejection"].includes(e.eventType)) continue;
    const s = (byStage[e.stageId] ??= { checked: 0, rejected: 0, defects: 0 });
    if (e.eventType === "production") s.checked += e.quantity;
    else if (e.eventType === "inspection" && e.disposition === "rejected") s.rejected += e.quantity;
    else if (e.eventType === "rejection") s.defects += e.quantity;
  }
  return byStage;
}

maybe("extract-from-mod reproduces the frozen legacy golden totals", () => {
  jest.setTimeout(60000);

  for (const [fileName, golden] of Object.entries(GOLDEN)) {
    it(`reproduces ${fileName}`, async () => {
      const buf = fs.readFileSync(path.join(DATA, fileName));
      const stageOfSheet = new Map(golden.stageOfSheet);
      if (stageOfSheet.size === 0) {
        // Visual book: the legacy generic classifier mapped every sheet to
        // visual via the file name. Reproduce that verification decision.
        const { buildProfilingTables } = await import("@/core/profiler/from-workbook");
        for (const t of buildProfilingTables(buf, fileName)) stageOfSheet.set(t.sheetName, "visual");
      }
      const mod = totals(await modPathRecords(fileName, buf, stageOfSheet));
      expect(mod).toEqual(golden.totals);
    });
  }
});
