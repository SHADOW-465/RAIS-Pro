// Explicit admin reset of the *master plant schema brain*:
// company_catalog (stages/defects/sizes) + company_knowledge (mappings).
// Does not touch the event ledger or workbook snapshots.
// Settings / Data Schema "Advanced · reset" posts here (typed confirmation).

import { NextResponse, type NextRequest } from "next/server";
import { requireAdmin } from "@/lib/auth/guard";
import { getCatalogStore } from "@/core/ontology/store/catalog-store";
import { getKnowledgeStore } from "@/core/ontology/store/knowledge-store";

export async function POST(req: NextRequest) {
  const auth = await requireAdmin(req, "configure");
  if (!auth.ok) return auth.response;

  try {
    const company = process.env.MOID_COMPANY_ID || "default";
    await getCatalogStore().clear(company);
    try {
      await getKnowledgeStore().clear(company);
    } catch {
      // Knowledge table may be missing in older deploys; catalog wipe still succeeds.
    }
    return NextResponse.json({
      success: true,
      cleared: "master-schema-brain",
    });
  } catch (err: unknown) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to clear schema" },
      { status: 500 },
    );
  }
}
