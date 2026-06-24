// src/app/api/clear-schema/route.ts
import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import { DISPOSAFE_REGISTRY } from "@/lib/registry/disposafe";

export async function POST(req: NextRequest) {
  try {
    const db = createServerClient();

    // Reset registries stages and defects to default DISPOSAFE_REGISTRY
    const { error } = await db.from("registries").upsert({
      client_id: "disposafe",
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
