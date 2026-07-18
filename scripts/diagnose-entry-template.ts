/**
 * Diagnose why data-entry may still show full defect catalogs.
 * Run: npx tsx --env-file=.env.local scripts/diagnose-entry-template.ts
 *   or: npx tsx scripts/diagnose-entry-template.ts   (memory store / no env)
 */
import { getModStore } from "../src/core/ontology/store/mod-store";

async function main() {
  const company = process.env.MOID_COMPANY_ID || "default";
  const store = getModStore();
  const rows = await store.verified(company);

  console.log("=== entry-template diagnosis ===");
  console.log("company:", company);
  console.log("store backend:", process.env.MOID_STORE || (process.env.NEXT_PUBLIC_SUPABASE_URL ? "supabase?" : "memory"));
  console.log("verified MOD count:", rows.length);

  if (rows.length === 0) {
    console.log("\nNo verified MODs. Data entry should show empty-state, not defects.");
    console.log("Action: Staging → upload workbook → verify mappings → publish.");
    return;
  }

  for (const r of rows) {
    const doc = r.document;
    const defectEntities = doc.entities.filter((e) => e.kind === "defect" && e.canonical?.startsWith("DEFECT:"));
    const migrated =
      doc.workbook.fileHash === "migrated"
      || doc.workbook.fileName.startsWith("disposafe-registry")
      || doc.workbook.fileName.startsWith("preset:");
    console.log("\n--- MOD", r.modId.slice(0, 12) + "…", "v" + r.version, "---");
    console.log("  file:", doc.workbook.fileName);
    console.log("  migrated/seed:", migrated);
    console.log("  catalog defects:", doc.defects?.length ?? 0);
    console.log("  defect entities (Excel columns):", defectEntities.length);
    console.log("  stages:", doc.stages.map((s) => s.stageId).join(", "));
    if (defectEntities.length > 0) {
      console.log(
        "  sample entities:",
        defectEntities.slice(0, 8).map((e) => `${e.original.header}→${e.canonical}`).join(" | "),
      );
    }
    if (migrated && (doc.defects?.length ?? 0) > 10) {
      console.log("  ⚠ This seed MOD used to force the full catalog into the entry grid.");
      console.log("    After fix: seed alone → captures only, ZERO invented defect columns.");
    }
  }

  // Hit the same builder the API uses
  const { GET } = await import("../src/app/api/entry-template/route");
  const { NextRequest } = await import("next/server");
  const res = await GET(new NextRequest("http://localhost/api/entry-template"));
  const body = await res.json();
  console.log("\n=== /api/entry-template response ===");
  console.log("status:", res.status);
  if (body.error) {
    console.log("error:", body.error);
    return;
  }
  for (const s of body.meta?.stages ?? body.template?.stages ?? []) {
    console.log(
      `  stage ${s.stageId}: ${s.defectCount ?? s.defects?.length ?? 0} defects`,
      (s.defectCodes ?? s.defects?.map((d: { defectCode: string }) => d.defectCode) ?? []).join(", ") || "(none)",
    );
  }
  console.log("\nIf every stage shows 0 defects but you expect sheet columns:");
  console.log("  → re-upload & verify a workbook so defect entities exist on the MOD.");
  console.log("If stages still list COAG,SD,TT… after this fix:");
  console.log("  → those codes are on the verified workbook as real columns, or deploy is stale.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
