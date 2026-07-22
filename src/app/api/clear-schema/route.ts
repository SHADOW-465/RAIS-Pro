// Explicit admin reset of the *master plant catalog* only.
// Does not touch the event ledger, workbook snapshots, or company knowledge.
// Settings → "Reset registry" posts here (typed confirmation on the client).

import { NextResponse } from "next/server";
import { getCatalogStore } from "@/core/ontology/store/catalog-store";

export async function POST() {
  try {
    const company = process.env.MOID_COMPANY_ID || "default";
    await getCatalogStore().clear(company);
    return NextResponse.json({ success: true, cleared: "master-catalog" });
  } catch (err: unknown) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to clear schema" },
      { status: 500 },
    );
  }
}
