// src/app/api/clear-schema/route.ts
import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import { DISPOSAFE_REGISTRY } from "@/lib/registry/disposafe";

export async function POST(req: NextRequest) {
  try {
    const db = createServerClient();
    const presetId = req.nextUrl.searchParams.get("presetId") || "disposafe";

    // Reset only the targeted preset's stages/defects to defaults — other
    // presets are untouched.
    const { error } = await db.from("registries").upsert({
      client_id: presetId,
      registry_version: "1.0.0",
      fiscal_year_start_month: 4,
      stages: DISPOSAFE_REGISTRY.stages,
      defects: DISPOSAFE_REGISTRY.defects,
    }, { onConflict: "client_id" });

    if (error) throw error;

    return NextResponse.json({ success: true, cleared: true, registry: DISPOSAFE_REGISTRY });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? "Failed to clear schema registry" }, { status: 500 });
  }
}
