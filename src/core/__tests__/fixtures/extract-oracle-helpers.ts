// Shared helpers for the Phase 3 oracle: the two extraction paths under
// comparison. Not a test file.
import { readWorkbookSnapshot } from "@/core/workbook/reader";
import { buildProfilingTables } from "@/core/profiler/from-workbook";
import { profileTable } from "@/core/profiler/profile";
import { resolveWorkbook, type ResolverSheet } from "@/core/ontology/resolver/ladder";
import { buildModDocument, proposalToEntity, deriveCatalogs, type ProfiledSheet } from "@/core/ontology/builder/build-mod";
import { extractFromMod } from "@/core/ingest/extract-from-mod";
import { getKnowledgeStore } from "@/core/ontology/store/knowledge-store";
import { GLOBAL_ONTOLOGY_SEED } from "@/core/ontology/global-ontology";
import { recordsFromBuffer, dedupeByPrecedence } from "@/lib/ingest/parsers";
import type { StageDayRecord } from "@/lib/ingest/emit";

/** The legacy record set staging actually produces for a file: family parsers
 *  first, generic classifier fallback (same preference as handleUpload). */
export function legacyRecords(buf: Buffer, fileName: string): StageDayRecord[] {
  const preceded = recordsFromBuffer(buf, fileName);
  if (preceded.length > 0) return dedupeByPrecedence(preceded).kept.map((p: { record: StageDayRecord }) => p.record);
  const { extractSchemaFromWorkbook, classifyWithSchema } =
    require("@/lib/ingest/schema-extractor") as typeof import("@/lib/ingest/schema-extractor");
  const XLSX = require("xlsx") as typeof import("xlsx");
  const { parseWorkbookBuffer } = require("@/lib/parser") as typeof import("@/lib/parser");
  const wb = XLSX.read(buf, { cellFormula: true });
  const schema = extractSchemaFromWorkbook(wb, fileName);
  const { rawSheets } = parseWorkbookBuffer(buf, fileName);
  return classifyWithSchema(rawSheets, schema, "oracle");
}

/** MOD path: snapshot → profile → resolve → verify (stage identity injected
 *  from the legacy parse — extraction parity, not recognition; columnOverrides
 *  emulate rung-6 user decisions for company-specific columns the heuristics
 *  can't name, e.g. the valve book's "STRUCK BALLOON" defect) → extract. */
export async function modPathRecords(
  fileName: string,
  buf: Buffer,
  stageOfSheet: Map<string, string>,
  columnOverrides: Map<string, string> = new Map(), // normalized header -> canonical
): Promise<StageDayRecord[]> {
  const snapshot = await readWorkbookSnapshot(buf, fileName);
  const sheets: ProfiledSheet[] = buildProfilingTables(buf, fileName).map((table) => ({
    table, columns: profileTable(table).columns,
  }));
  const resolverSheets: ResolverSheet[] = sheets.map((s) => ({
    fileName, sheetName: s.table.sheetName, tableId: s.table.tableId, regionLabel: s.table.regionLabel, columns: s.columns,
  }));
  const proposals = await resolveWorkbook(resolverSheets, {
    companyId: "oracle-co", exact: new Map(), knowledge: getKnowledgeStore(), concepts: GLOBAL_ONTOLOGY_SEED,
  });

  const entities = proposals.map((p) => {
    if (p.kind === "stage") {
      // Region-aware override key "<sheet>::<tableId>" first, then plain sheet.
      const stageId = stageOfSheet.get(`${p.original.sheet}::${p.original.tableId ?? "t1"}`)
        ?? stageOfSheet.get(p.original.sheet);
      return {
        ...proposalToEntity(p, true),
        canonical: stageId ? `STAGE:${stageId}` : null,
        resolvedBy: "user" as const,
        confidence: 1,
      };
    }
    if (p.original.colLetter !== null) {
      const override = columnOverrides.get(p.original.header.trim().toLowerCase());
      if (override) {
        return {
          ...proposalToEntity(p, true),
          canonical: override,
          kind: override.startsWith("DEFECT:") ? ("defect" as const) : p.kind,
          resolvedBy: "user" as const,
          confidence: 1,
        };
      }
    }
    return proposalToEntity(p, true);
  });

  const doc = buildModDocument({ companyId: "oracle-co", snapshot, sheets, proposals });
  const verified = { ...doc, entities, ...deriveCatalogs(entities) };
  return extractFromMod(verified, snapshot, "oracle", { modId: snapshot.snapshotId, modVersion: 1 });
}
