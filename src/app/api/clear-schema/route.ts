// src/app/api/clear-schema/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getStores } from "@/lib/store";
import { DISPOSAFE_REGISTRY } from "@/lib/registry/disposafe";

export async function POST(req: NextRequest) {
  try {
    const { registries } = getStores();
    const presetId = req.nextUrl.searchParams.get("presetId") || "disposafe";

    // Reset only the targeted preset's stages/defects to defaults — other
    // presets are untouched.
    await registries.upsert({
      presetId,
      name: presetId,
      createdFromFilename: null,
      registryVersion: "1.0.0",
      fiscalYearStartMonth: 4,
      stages: DISPOSAFE_REGISTRY.stages,
      defects: DISPOSAFE_REGISTRY.defects,
      sizes: DISPOSAFE_REGISTRY.sizes,
    });

    return NextResponse.json({ success: true, cleared: true, registry: DISPOSAFE_REGISTRY });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? "Failed to clear schema registry" }, { status: 500 });
  }
}
