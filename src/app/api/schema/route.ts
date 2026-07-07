// src/app/api/schema/route.ts
//
// registries.client_id is reused as the preset identity (see
// 20260708_registry_presets.sql) — each row is one independently reusable
// Data Entry preset, never merged/overwritten across presets. Callers pick
// a preset explicitly:
//   GET  /api/schema               -> list all presets (summary)
//   GET  /api/schema?presetId=X    -> one preset's full registry
//   POST /api/schema {name, registry}            -> create a new preset
//   POST /api/schema {presetId, registry}        -> extend an existing preset
//   PATCH  /api/schema?presetId=X  {name}        -> rename
//   DELETE /api/schema?presetId=X                -> delete
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

function toRegistry(data: any) {
  const enrichedStages = (data.stages || []).map((stage: any) => ({
    ...stage,
    fields: stage.fields || DEFAULT_FIELDS
  }));
  return {
    presetId: data.client_id,
    clientId: data.client_id,
    name: data.name || data.client_id,
    createdFromFilename: data.created_from_filename || null,
    registryVersion: data.registry_version,
    fiscalYearStartMonth: data.fiscal_year_start_month,
    stages: enrichedStages,
    defects: data.defects || [],
    sizes: data.sizes || DISPOSAFE_REGISTRY.sizes,
  };
}

export async function GET(req: NextRequest) {
  try {
    const db = createServerClient();
    const presetId = req.nextUrl.searchParams.get("presetId");
    const wantList = req.nextUrl.searchParams.get("list") === "true";

    if (wantList) {
      const { data, error } = await db.from("registries").select("client_id, name, stages, created_at").order("created_at", { ascending: true });
      if (error) throw error;
      return NextResponse.json({
        presets: (data || []).map((r: any) => ({
          presetId: r.client_id,
          name: r.name || r.client_id,
          stageCount: (r.stages || []).length,
        })),
      });
    }

    let query = db.from("registries").select("*");
    query = presetId ? query.eq("client_id", presetId) : query.order("created_at", { ascending: true }).limit(1);
    const { data, error } = await query.maybeSingle();
    if (error) throw error;

    if (data) {
      return NextResponse.json({ registry: toRegistry(data), configured: true });
    }

    const defaultEnrichedStages = DISPOSAFE_REGISTRY.stages.map((stage: any) => ({
      ...stage,
      fields: stage.fields || DEFAULT_FIELDS
    }));
    return NextResponse.json({
      registry: { ...DISPOSAFE_REGISTRY, presetId: null, stages: defaultEnrichedStages },
      configured: false,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? "Failed to load registry" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const payload = body.registry || body.schema;
    const requestedPresetId: string | undefined = body.presetId;
    const name: string | undefined = body.name;
    const createdFromFilename: string | undefined = body.createdFromFilename;

    if (!payload || !Array.isArray(payload.stages)) {
      return NextResponse.json({ error: "Invalid schema payload." }, { status: 400 });
    }
    if (!requestedPresetId && !name) {
      return NextResponse.json({ error: "A new preset requires a name." }, { status: 400 });
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

    // New preset: presetId is a fresh slug (never collides with/overwrites an
    // existing preset). Existing preset: presetId must already exist — this
    // route only ever extends that one row, never touches any other preset.
    const db = createServerClient();
    let clientId = requestedPresetId;
    if (!clientId) {
      const base = slugify(name!) || "preset";
      clientId = base;
      let suffix = 1;
      // Guarantee uniqueness rather than colliding with an existing preset.
      // eslint-disable-next-line no-constant-condition
      while (true) {
        const { data: existing } = await db.from("registries").select("client_id").eq("client_id", clientId).maybeSingle();
        if (!existing) break;
        clientId = `${base}-${++suffix}`;
      }
    }

    const row: Record<string, any> = {
      client_id: clientId,
      registry_version: "1.0.0",
      fiscal_year_start_month: 4,
      stages,
      defects,
      sizes,
    };
    if (name) row.name = name;
    if (createdFromFilename) row.created_from_filename = createdFromFilename;

    const { error } = await db.from("registries").upsert(row, { onConflict: "client_id" });
    if (error) throw error;

    return NextResponse.json({
      success: true,
      configured: true,
      registry: { presetId: clientId, clientId, name: name || clientId, registryVersion: "1.0.0", fiscalYearStartMonth: 4, stages, defects, sizes },
    });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? "Failed to save registry" }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const presetId = req.nextUrl.searchParams.get("presetId");
    if (!presetId) return NextResponse.json({ error: "presetId required" }, { status: 400 });
    const { name } = await req.json();
    if (!name) return NextResponse.json({ error: "name required" }, { status: 400 });

    const db = createServerClient();
    const { error } = await db.from("registries").update({ name }).eq("client_id", presetId);
    if (error) throw error;
    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? "Failed to rename preset" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const presetId = req.nextUrl.searchParams.get("presetId");
    if (!presetId) return NextResponse.json({ error: "presetId required" }, { status: 400 });

    const db = createServerClient();
    const { error } = await db.from("registries").delete().eq("client_id", presetId);
    if (error) throw error;
    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? "Failed to delete preset" }, { status: 500 });
  }
}
