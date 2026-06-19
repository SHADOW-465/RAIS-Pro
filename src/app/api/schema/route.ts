// src/app/api/schema/route.ts
import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import { DISPOSAFE_REGISTRY } from "@/lib/registry/disposafe";

function slugify(s: string): string {
  return s.toLowerCase().trim()
    .replace(/\s+/g, '-')
    .replace(/[^\w\-]+/g, '')
    .replace(/\-\-+/g, '-')
    .replace(/^-+/, '')
    .replace(/-+$/, '');
}

export async function GET(req: NextRequest) {
  try {
    const db = createServerClient();
    const { data, error } = await db
      .from("registries")
      .select("*")
      .eq("client_id", "disposafe")
      .maybeSingle();

    if (error) throw error;

    if (data) {
      return NextResponse.json({
        registry: {
          clientId: data.client_id,
          registryVersion: data.registry_version,
          fiscalYearStartMonth: data.fiscal_year_start_month,
          stages: data.stages,
          defects: data.defects,
        },
        configured: true
      });
    }

    return NextResponse.json({ registry: DISPOSAFE_REGISTRY, configured: false });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? "Failed to load registry" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { schema } = body as { schema: any };

    if (!schema || !Array.isArray(schema.stages)) {
      return NextResponse.json({ error: "Invalid schema payload." }, { status: 400 });
    }

    // Translate dynamic ExtractedSchema into ClientRegistry structure
    const stages = schema.stages.map((stage: any, sIdx: number) => {
      const stageId = stage.stageId || slugify(stage.label);
      // Automatically link stage flow upstream relationships
      const upstream = sIdx > 0 ? [schema.stages[sIdx - 1].stageId || slugify(schema.stages[sIdx - 1].label)] : [];
      return {
        stageId,
        label: stage.label,
        effectiveFrom: null,
        effectiveTo: null,
        upstream,
      };
    });

    // Map defect columns across all stages
    const defectsMap = new Map<string, { defectCode: string; label: string; aliases: string[]; stages: string[] }>();
    schema.stages.forEach((stage: any) => {
      const stageId = stage.stageId || slugify(stage.label);
      stage.fields.forEach((field: any) => {
        if (field.role === "defect") {
          const code = field.name.trim().toUpperCase().replace(/[^A-Z0-9]+/g, "_");
          const existing = defectsMap.get(code);
          if (existing) {
            if (!existing.stages.includes(stageId)) {
              existing.stages.push(stageId);
            }
          } else {
            defectsMap.set(code, {
              defectCode: code,
              label: field.name,
              aliases: [field.name, code],
              stages: [stageId],
            });
          }
        }
      });
    });

    const defects = Array.from(defectsMap.values());

    const db = createServerClient();
    const { error } = await db.from("registries").upsert({
      client_id: "disposafe",
      registry_version: "1.0.0",
      fiscal_year_start_month: 4,
      stages,
      defects,
    }, { onConflict: "client_id" });

    if (error) throw error;

    return NextResponse.json({
      success: true,
      configured: true,
      registry: {
        clientId: "disposafe",
        registryVersion: "1.0.0",
        fiscalYearStartMonth: 4,
        stages,
        defects,
      }
    });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? "Failed to save registry" }, { status: 500 });
  }
}
