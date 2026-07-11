// src/app/api/schema/route.ts
//
// A "preset" is one independently reusable Data Entry registry, never merged/
// overwritten across presets. Callers pick a preset explicitly:
//   GET  /api/schema               -> list all presets (summary)
//   GET  /api/schema?presetId=X    -> one preset's full registry
//   GET  /api/schema?list=true     -> preset list (same as no-presetId list mode)
//   POST /api/schema {name, registry}            -> create a new preset
//   POST /api/schema {presetId, registry}        -> extend an existing preset
//   PATCH  /api/schema?presetId=X  {name}        -> rename
//   DELETE /api/schema?presetId=X                -> delete
//
// Goes through the shared getStores().registries abstraction (same pattern as
// events/findings/rulebook) so this works against the in-memory store when
// Supabase isn't configured, instead of hard-failing — a workbook's extracted
// schema was previously unsaveable without Supabase, silently forcing every
// page back onto the hardcoded DISPOSAFE_REGISTRY fallback below regardless
// of what was actually uploaded.
import { NextRequest, NextResponse } from "next/server";
import { getStores, getActiveRegistryRow } from "@/lib/store";
import { DISPOSAFE_REGISTRY } from "@/lib/registry/disposafe";
import type { RegistryRow } from "@/lib/store/types";

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

/** RegistryRow (persistence shape) -> the client-facing registry contract:
 *  fills in DEFAULT_FIELDS per stage and falls back sizes to the hardcoded
 *  list only when the preset itself didn't specify any. */
function toClientRegistry(row: RegistryRow) {
  const enrichedStages = (row.stages || []).map((stage: any) => ({
    ...stage,
    fields: stage.fields || DEFAULT_FIELDS,
  }));
  return {
    presetId: row.presetId,
    clientId: row.presetId,
    name: row.name,
    createdFromFilename: row.createdFromFilename,
    registryVersion: row.registryVersion,
    fiscalYearStartMonth: row.fiscalYearStartMonth,
    stages: enrichedStages,
    defects: row.defects || [],
    sizes: (row.sizes && row.sizes.length ? row.sizes : DISPOSAFE_REGISTRY.sizes),
    // Company-learned sheet/file-name -> stage aliases (src/lib/dataset/recognize.ts's
    // recognizeStageScored). Exposed here so the client can thread it into
    // groupIntoDatasets/datasetsWithRowsFromWorkbooks at Staging-upload time —
    // closing the loop between a confirmed alias (POST /api/registry-alias)
    // and the next recognition pass.
    stageAliases: row.stageAliases || {},
  };
}

export async function GET(req: NextRequest) {
  try {
    const { registries } = getStores();
    const presetId = req.nextUrl.searchParams.get("presetId");
    const wantList = req.nextUrl.searchParams.get("list") === "true";

    if (wantList) {
      return NextResponse.json({ presets: await registries.list() });
    }

    const matchedRow = presetId ? await registries.get(presetId) : await getActiveRegistryRow();

    if (matchedRow) {
      return NextResponse.json({ registry: toClientRegistry(matchedRow), configured: true });
    }

    // Genuinely nothing saved yet (no preset ever created, in either backend)
    // — the intentional v1 bootstrap default, not a failure mode.
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
    const { registries } = getStores();
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

    let presetId = requestedPresetId;
    if (!presetId) {
      const base = slugify(name!) || "preset";
      presetId = base;
      let suffix = 1;
      // Guarantee uniqueness rather than colliding with an existing preset.
      while (await registries.get(presetId)) {
        presetId = `${base}-${++suffix}`;
      }
    }

    const existing = await registries.get(presetId);

    await registries.upsert({
      presetId,
      name: name || existing?.name || presetId,
      createdFromFilename: createdFromFilename || existing?.createdFromFilename || null,
      registryVersion: "1.0.0",
      fiscalYearStartMonth: existing?.fiscalYearStartMonth ?? 4,
      stages,
      defects,
      sizes,
      // Preserve previously-learned aliases — this upsert only replaces the
      // schema shape (stages/defects/sizes), never the company's learned
      // sheet-name -> stage mappings.
      stageAliases: existing?.stageAliases ?? {},
    });

    return NextResponse.json({
      success: true,
      configured: true,
      registry: { presetId, clientId: presetId, name: name || presetId, registryVersion: "1.0.0", fiscalYearStartMonth: existing?.fiscalYearStartMonth ?? 4, stages, defects, sizes, stageAliases: existing?.stageAliases ?? {} },
    });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? "Failed to save registry" }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const { registries } = getStores();
    const presetId = req.nextUrl.searchParams.get("presetId");
    if (!presetId) return NextResponse.json({ error: "presetId required" }, { status: 400 });
    const { name } = await req.json();
    if (!name) return NextResponse.json({ error: "name required" }, { status: 400 });

    await registries.rename(presetId, name);
    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? "Failed to rename preset" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { registries } = getStores();
    const presetId = req.nextUrl.searchParams.get("presetId");
    if (!presetId) return NextResponse.json({ error: "presetId required" }, { status: 400 });

    await registries.delete(presetId);
    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? "Failed to delete preset" }, { status: 500 });
  }
}
