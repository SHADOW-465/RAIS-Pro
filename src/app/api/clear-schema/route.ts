// src/app/api/clear-schema/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getStores, getActiveRegistryRow } from "@/lib/store";

export async function POST(req: NextRequest) {
  try {
    const { registries } = getStores();
    let presetId = req.nextUrl.searchParams.get("presetId");
    if (!presetId) {
      const active = await getActiveRegistryRow();
      presetId = active?.presetId ?? "default";
    }

    const existing = await registries.get(presetId);

    // Reset only the targeted preset's stages/defects/sizes to genuinely
    // empty — clearing schema must not repopulate DISPOSAFE_REGISTRY's
    // hardcoded stage list, or the dashboard can never actually go blank
    // for a fresh plant. Learned aliases are preserved (clearing the schema
    // shape isn't the same as forgetting what a company already taught us).
    await registries.upsert({
      presetId,
      name: existing?.name ?? presetId,
      createdFromFilename: existing?.createdFromFilename ?? null,
      registryVersion: existing?.registryVersion ?? "1.0.0",
      fiscalYearStartMonth: existing?.fiscalYearStartMonth ?? 4,
      stages: [],
      defects: [],
      sizes: [],
      stageAliases: existing?.stageAliases ?? {},
    });
    if (!existing) await registries.setActive(presetId);

    return NextResponse.json({
      success: true,
      cleared: true,
      registry: { presetId, stages: [], defects: [], sizes: [] },
    });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? "Failed to clear schema registry" }, { status: 500 });
  }
}
