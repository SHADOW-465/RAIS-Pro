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

const DEFAULT_FIELDS = [
  { name: "Checked Qty", type: "number", required: true, addAs: "column", appliesTo: "all", unit: "" },
  { name: "Good Qty", type: "number", required: false, addAs: "column", appliesTo: "all", unit: "" },
  { name: "Rework Qty", type: "number", required: false, addAs: "column", appliesTo: "all", unit: "" },
  { name: "Rejected Qty", type: "number", required: true, addAs: "column", appliesTo: "all", unit: "" }
];

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
      const enrichedStages = (data.stages || []).map((stage: any) => ({
        ...stage,
        fields: stage.fields || DEFAULT_FIELDS
      }));
      return NextResponse.json({
        registry: {
          clientId: data.client_id,
          registryVersion: data.registry_version,
          fiscalYearStartMonth: data.fiscal_year_start_month,
          stages: enrichedStages,
          defects: data.defects || [],
          sizes: data.sizes || DISPOSAFE_REGISTRY.sizes,
        },
        configured: true
      });
    }

    const defaultEnrichedStages = DISPOSAFE_REGISTRY.stages.map((stage: any) => ({
      ...stage,
      fields: stage.fields || DEFAULT_FIELDS
    }));

    return NextResponse.json({
      registry: {
        ...DISPOSAFE_REGISTRY,
        stages: defaultEnrichedStages
      },
      configured: false
    });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? "Failed to load registry" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const payload = body.registry || body.schema;

    if (!payload || !Array.isArray(payload.stages)) {
      return NextResponse.json({ error: "Invalid schema payload." }, { status: 400 });
    }

    const stages = payload.stages.map((stage: any, sIdx: number) => {
      const stageId = stage.stageId || slugify(stage.label || stage.name);
      const upstream = stage.upstream || (sIdx > 0 ? [payload.stages[sIdx - 1].stageId || slugify(payload.stages[sIdx - 1].label || payload.stages[sIdx - 1].name)] : []);
      const fields = stage.fields || DEFAULT_FIELDS;

      return {
        stageId,
        label: stage.label || stage.name,
        fields,
        upstream,
        effectiveFrom: stage.effectiveFrom || null,
        effectiveTo: stage.effectiveTo || null,
      };
    });

    const defects = payload.defects || DISPOSAFE_REGISTRY.defects;
    const sizes = payload.sizes || DISPOSAFE_REGISTRY.sizes;

    const db = createServerClient();
    const { error } = await db.from("registries").upsert({
      client_id: "disposafe",
      registry_version: "1.0.0",
      fiscal_year_start_month: 4,
      stages,
      defects,
      sizes,
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
        sizes,
      }
    });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? "Failed to save registry" }, { status: 500 });
  }
}
