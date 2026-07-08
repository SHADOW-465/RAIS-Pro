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
  const rawStages = typeof data.stages === "string" ? JSON.parse(data.stages) : data.stages;
  const enrichedStages = (rawStages || []).map((stage: any) => ({
    ...stage,
    fields: stage.fields || DEFAULT_FIELDS
  }));
  const rawDefects = typeof data.defects === "string" ? JSON.parse(data.defects) : data.defects;
  const rawSizes = typeof data.sizes === "string" ? JSON.parse(data.sizes) : data.sizes;
  return {
    presetId: data.client_id,
    clientId: data.client_id,
    name: data.name || data.client_id,
    createdFromFilename: data.created_from_filename || null,
    registryVersion: data.registry_version,
    fiscalYearStartMonth: data.fiscal_year_start_month,
    stages: enrichedStages,
    defects: rawDefects || [],
    sizes: rawSizes || DISPOSAFE_REGISTRY.sizes,
  };
}

export async function GET(req: NextRequest) {
  try {
    const db = createServerClient();
    const presetId = req.nextUrl.searchParams.get("presetId");
    const wantList = req.nextUrl.searchParams.get("list") === "true";

    // Select * to be resilient to missing columns (like name/created_at) on older schemas
    const { data, error } = await db.from("registries").select("*");
    if (error) throw error;

    const rows = data || [];

    // Sort in memory: if created_at is present, order by it; otherwise fallback to client_id
    const sortedRows = [...rows].sort((a: any, b: any) => {
      if (a.created_at && b.created_at) {
        return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
      }
      return (a.client_id || "").localeCompare(b.client_id || "");
    });

    if (wantList) {
      return NextResponse.json({
        presets: sortedRows.map((r: any) => ({
          presetId: r.client_id,
          name: r.name || r.client_id,
          stageCount: (r.stages || []).length,
        })),
      });
    }

    const matchedRow = presetId
      ? rows.find((r: any) => r.client_id === presetId)
      : sortedRows[0];

    if (matchedRow) {
      return NextResponse.json({ registry: toRegistry(matchedRow), configured: true });
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
        canonicalStageId: stage.canonicalStageId || null,
        size: stage.size || null,
        label: stage.label || stage.name,
        fields,
        upstream,
        effectiveFrom: stage.effectiveFrom || null,
        effectiveTo: stage.effectiveTo || null,
        headerRows: stage.headerRows || null,
        merges: stage.merges || null,
        columns: stage.columns || null,
      };
    });

    const defects = payload.defects || DISPOSAFE_REGISTRY.defects;
    const sizes = payload.sizes || DISPOSAFE_REGISTRY.sizes;

    const db = createServerClient();
    let clientId = requestedPresetId;
    if (!clientId) {
      const base = slugify(name!) || "preset";
      clientId = base;
      let suffix = 1;
      // Guarantee uniqueness rather than colliding with an existing preset.
      while (true) {
        const { data: existing, error: existingError } = await db.from("registries").select("client_id").eq("client_id", clientId).maybeSingle();
        if (existingError) throw existingError;
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

    let { error } = await db.from("registries").upsert(row, { onConflict: "client_id" });
    if (error) {
      // Fallback: If migration was not pushed to remote DB, the registries table
      // may lack name or created_from_filename columns. Catch and retry stripping them.
      const isColErr = error.message.includes("column") && error.message.includes("does not exist");
      if (isColErr) {
        const fallbackRow = {
          client_id: clientId,
          registry_version: "1.0.0",
          fiscal_year_start_month: 4,
          stages,
          defects,
          sizes,
        };
        const { error: fallbackError } = await db.from("registries").upsert(fallbackRow, { onConflict: "client_id" });
        if (fallbackError) throw fallbackError;
      } else {
        throw error;
      }
    }

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
