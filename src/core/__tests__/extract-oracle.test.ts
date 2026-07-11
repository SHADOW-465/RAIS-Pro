// Phase 3 ORACLE (MOD-MIGRATION-PLAN §Phase 3 — "the heart of the migration"):
// on the real corpus, extract-from-mod over a verified MOD must yield the SAME
// canonical analytics totals as the golden-tested legacy extraction. EventIds
// may differ (provenance gained mod fields); totals must not.
//
// Stage identity is given to the MOD path by decision-overrides derived from
// the legacy parse (stage RECOGNITION parity is Phase 2's proof; this test
// isolates EXTRACTION parity). Each corpus file is compared against the legacy
// path that ACTUALLY consumes it in staging:
//   - 09 REJECTION ANALYSIS…  → family parser (recordsFromBuffer)
//   - VISUAL INSPECTION…      → generic classifier (extractSchemaFromWorkbook +
//     classifyWithSchema) — month tabs, not FR tabs, so no family matches it.
// Known gap: the side-by-side two-table sheets of the BALLOON & VALVE workbook
// need multi-table profiling — tracked for a Phase 3 follow-up.
import * as fs from "fs";
import * as path from "path";
import { legacyRecords, modPathRecords } from "./fixtures/extract-oracle-helpers";
import { emitMany, type StageDayRecord } from "@/lib/ingest/emit";
import { canonicalizeEvents } from "@/lib/analytics/canonical";
import { DISPOSAFE_REGISTRY } from "@/lib/registry/disposafe";

const DATA = path.join(process.cwd(), "DATA");
const FILES = ["VISUAL INSPECTION REPORT 2025.xlsx", "09 REJECTION ANALYSIS-DECEMBER 2025.xlsx"];
const available = FILES.filter((f) => fs.existsSync(path.join(DATA, f)));
const maybe = available.length === FILES.length ? describe : describe.skip;

/** Canonical per-stage totals after the read-side dedupe — the numbers the
 *  dashboard actually shows. */
function totals(records: StageDayRecord[]) {
  const events = canonicalizeEvents(emitMany(records, DISPOSAFE_REGISTRY));
  const byStage = new Map<string, { checked: number; rejected: number; defects: number }>();
  for (const e of events as any[]) {
    if (!["production", "inspection", "rejection"].includes(e.eventType)) continue;
    const s = byStage.get(e.stageId) ?? { checked: 0, rejected: 0, defects: 0 };
    if (e.eventType === "production") s.checked += e.quantity;
    else if (e.eventType === "inspection" && e.disposition === "rejected") s.rejected += e.quantity;
    else if (e.eventType === "rejection") s.defects += e.quantity;
    byStage.set(e.stageId, s);
  }
  return byStage;
}

maybe("extract-from-mod ≡ legacy extraction (canonical totals, real corpus)", () => {
  jest.setTimeout(60000);

  for (const fileName of FILES) {
    it(`reproduces ${fileName}`, async () => {
      const buf = fs.readFileSync(path.join(DATA, fileName));

      const legacyRecs = legacyRecords(buf, fileName);
      expect(legacyRecs.length).toBeGreaterThan(0);
      const legacy = totals(legacyRecs);

      // Sheet → stage identity, taken from what the legacy path consumed.
      const stageOfSheet = new Map<string, string>();
      for (const r of legacyRecs) stageOfSheet.set(r.source.sheet, r.stageId);

      const mod = totals(await modPathRecords(fileName, buf, stageOfSheet));

      const stages = [...legacy.keys()].sort();
      expect([...mod.keys()].sort()).toEqual(stages);
      for (const stage of stages) {
        expect({ stage, ...mod.get(stage) }).toEqual({ stage, ...legacy.get(stage) });
      }
    });
  }
});
