// src/app/api/schema/route.ts
// The active-catalog endpoint (MOD v2 Phase 5): GET returns the company's
// merged verified-MOD catalog in the registry shape pages consume. Preset
// CRUD (POST/PATCH/DELETE) is gone — schema changes happen by verifying a new
// MOD version in staging. Returns configured:false with an EMPTY catalog when
// no MOD has been verified yet (never a hardcoded company).

import { NextResponse } from "next/server";
import { getModStore } from "@/core/ontology/store/mod-store";
import { EMPTY_REGISTRY } from "@/core/ontology/empty-registry";

export async function GET() {
  try {
    const company = process.env.MOID_COMPANY_ID || "default";
    const catalog = await getModStore().catalogFor(company);
    if (catalog.stages.length === 0) {
      return NextResponse.json({ registry: EMPTY_REGISTRY, configured: false });
    }

    const stages = catalog.stages.map((stage) => ({
      ...stage,
      fields: (stage.captures ?? []).map((c) => ({
        name: c === "checked" ? "Checked Qty" : c === "accepted" ? "Good Qty" : c === "hold" ? "Rework Qty" : "Rejected Qty",
        type: "number", required: c === "checked" || c === "rejected", addAs: "column", appliesTo: "all", unit: "",
      })),
    }));

    return NextResponse.json({
      registry: {
        presetId: "mod-catalog",
        clientId: company,
        name: "Verified ontology (MOD)",
        createdFromFilename: null,
        registryVersion: "mod",
        fiscalYearStartMonth: catalog.fiscalYearStartMonth,
        stages,
        defects: catalog.defects,
        sizes: catalog.sizes,
        stageAliases: {},
      },
      configured: true,
    });
  } catch (err: unknown) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Failed to load catalog" }, { status: 500 });
  }
}
