/**
 * One-shot: cold resolve (no knowledge) → verify-all → extract counts.
 * Usage: npx tsx scripts/diagnose-extract-once.ts [path-to-xlsx]
 */
import { readFileSync } from "fs";
import { basename } from "path";
import { readWorkbookSnapshot } from "../src/core/workbook/reader";
import { buildProfilingTables } from "../src/core/profiler/from-workbook";
import { profileTable } from "../src/core/profiler/profile";
import { resolveWorkbook } from "../src/core/ontology/resolver/ladder";
import { buildModDocument } from "../src/core/ontology/builder/build-mod";
import { extractFromMod } from "../src/core/ingest/extract-from-mod";

async function main() {
  const f = process.argv[2] || "DATA/VISUAL INSPECTION REPORT 2025.xlsx";
  const buf = readFileSync(f);
  const fileName = basename(f);
  const snapshot = await readWorkbookSnapshot(buf, fileName);

  console.log("=== SNAPSHOT ===");
  for (const s of snapshot.sheets.slice(0, 8)) {
    const minR = s.cells.length ? Math.min(...s.cells.map((c) => c.r)) : -1;
    const minC = s.cells.length ? Math.min(...s.cells.map((c) => c.c)) : -1;
    console.log(`  ${s.name} ref=${s.ref} cells=${s.cells.length} minR=${minR} minC=${minC}`);
  }

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

  // Cold knowledge — no exact index, no learned aliases (matches first upload on empty company).
  const proposals = await resolveWorkbook(resolverSheets, {
    companyId: "default",
    exact: new Map(),
    knowledge: {
      lookup: async () => null,
      concepts: async () => [],
      learn: async () => 0,
    } as any,
    concepts: [],
  });

  const stages = proposals.filter((p) => p.kind === "stage");
  const dates = proposals.filter((p) => p.canonical === "DATE" || p.kind === "date");
  const measures = proposals.filter((p) => p.kind === "measure" && p.canonical);
  const nullCanon = proposals.filter((p) => !p.canonical);

  console.log("\n=== PROPOSALS (cold resolve) ===");
  console.log(`  total=${proposals.length} withCanon=${proposals.length - nullCanon.length} nullCanon=${nullCanon.length}`);
  console.log("  stages:");
  for (const s of stages.slice(0, 12)) {
    console.log(`    ${s.original.sheet} → ${s.canonical ?? "NULL"} conf=${s.confidence} by=${s.resolvedBy} (${s.reason.slice(0, 80)})`);
  }
  console.log("  dates:");
  for (const d of dates.slice(0, 8)) {
    console.log(`    ${d.original.sheet}!${d.original.colLetter} → ${d.canonical} conf=${d.confidence}`);
  }
  console.log("  measures:", measures.map((m) => m.canonical).slice(0, 12).join(", "));

  const doc = buildModDocument({ companyId: "default", snapshot, sheets, proposals });
  // Simulate "accept all" verify
  doc.entities = doc.entities.map((e) => ({ ...e, verified: true }));

  const withStage = doc.entities.filter((e) => e.kind === "stage" && e.canonical?.startsWith("STAGE:"));
  const withDate = doc.entities.filter((e) => e.canonical === "DATE" && e.verified);
  console.log("\n=== AFTER VERIFY-ALL ===");
  console.log(`  stage entities with STAGE:*=${withStage.length}`);
  console.log(`  DATE entities=${withDate.length}`);
  console.log(`  layout regions=${doc.layout.length}`);

  const records = extractFromMod(doc, snapshot, "diag");
  const withChecked = records.filter((r) => r.checked && r.checked.value > 0);
  const withRejected = records.filter((r) => r.rejected && r.rejected.value > 0);
  console.log("\n=== EXTRACT ===");
  console.log(`  records=${records.length} withChecked=${withChecked.length} withRejected=${withRejected.length}`);
  if (records[0]) {
    console.log("  sample:", {
      stageId: records[0].stageId,
      date: records[0].occurredOn.start,
      size: records[0].size,
      checked: records[0].checked?.value,
      rejected: records[0].rejected?.value,
    });
  }

  // How many layout regions skipped?
  let noPlan = 0, noDate = 0, ok = 0;
  for (const layout of doc.layout) {
    const tableId = layout.tableId ?? "t1";
    const here = doc.entities.filter(
      (e) => e.original.sheet === layout.sheet && (e.original.tableId ?? "t1") === tableId && e.verified && e.canonical,
    );
    const stage = here.find((e) => e.kind === "stage" && e.canonical!.startsWith("STAGE:"));
    const dateCol = here.find((e) => e.original.colLetter !== null && e.canonical === "DATE");
    if (!stage) noPlan++;
    else if (!dateCol) noDate++;
    else ok++;
  }
  console.log(`  layout skip: noStage=${noPlan} noDate=${noDate} extractable=${ok}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
