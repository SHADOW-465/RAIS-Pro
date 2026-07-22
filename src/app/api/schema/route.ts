// src/app/api/schema/route.ts
// Master plant catalog endpoint.
//
// GET    → company master schema (stages / defects / sizes)
// POST   → upsert or delete individual entities (Data Schema page only)
// DELETE → remove one entity (?kind=stage|defect|size&id=…)
//
// Catalog is company-owned. Workbook delete does not touch it. When the
// durable catalog is empty we lazily backfill once from any remaining
// verified MODs (migration path for pre-catalog deployments).

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { StageDef, DefectDef, SizeDef } from "@/lib/contract/d1";
import { EMPTY_REGISTRY } from "@/core/ontology/empty-registry";
import { getCatalogStore, type CompanyCatalog } from "@/core/ontology/store/catalog-store";
import { getModStore } from "@/core/ontology/store/mod-store";

function companyId(): string {
  return process.env.MOID_COMPANY_ID || "default";
}

function toRegistry(catalog: CompanyCatalog, company: string) {
  const stages = catalog.stages.map((stage) => ({
    ...stage,
    fields: (stage.captures ?? []).map((c) => ({
      name:
        c === "checked"
          ? "Checked Qty"
          : c === "accepted"
            ? "Good Qty"
            : c === "hold"
              ? "Rework Qty"
              : "Rejected Qty",
      type: "number",
      required: c === "checked" || c === "rejected",
      addAs: "column",
      appliesTo: "all",
      unit: "",
    })),
  }));

  return {
    presetId: "master-catalog",
    clientId: company,
    name: "Master plant schema",
    createdFromFilename: null,
    registryVersion: "master",
    fiscalYearStartMonth: catalog.fiscalYearStartMonth,
    stages,
    defects: catalog.defects,
    sizes: catalog.sizes,
    stageAliases: {},
  };
}

/** Load master catalog; if empty, seed once from verified MOD merge (lazy migrate). */
async function loadCatalog(company: string): Promise<CompanyCatalog> {
  const store = getCatalogStore();
  let catalog = await store.get(company);
  if (catalog.stages.length > 0 || catalog.defects.length > 0 || catalog.sizes.length > 0) {
    return catalog;
  }

  const verified = await getModStore().verified(company);
  if (verified.length === 0) return catalog;

  // Prefer durable write; if company_catalog table is still missing in prod,
  // merge in-memory from verified MODs so /api/schema never 500s the shell.
  try {
    for (const mod of verified) {
      catalog = await store.mergeFromMod(mod);
    }
    return catalog;
  } catch {
    const stages = new Map<string, CompanyCatalog["stages"][number]>();
    const defects = new Map<string, CompanyCatalog["defects"][number]>();
    const sizes = new Map<string, CompanyCatalog["sizes"][number]>();
    let fiscal = 4;
    let last: string | null = null;
    for (const mod of verified) {
      for (const s of mod.document.stages ?? []) if (!stages.has(s.stageId)) stages.set(s.stageId, s);
      for (const d of mod.document.defects ?? []) if (!defects.has(d.defectCode)) defects.set(d.defectCode, d);
      for (const s of mod.document.sizes ?? []) if (!sizes.has(s.sizeId)) sizes.set(s.sizeId, s);
      fiscal = mod.document.fiscalYearStartMonth ?? fiscal;
      last = mod.modId;
    }
    return {
      stages: [...stages.values()],
      defects: [...defects.values()],
      sizes: [...sizes.values()],
      fiscalYearStartMonth: fiscal,
      updatedAt: new Date().toISOString(),
      lastMergedFrom: last,
    };
  }
}

export async function GET() {
  try {
    const company = companyId();
    const catalog = await loadCatalog(company);
    if (catalog.stages.length === 0 && catalog.defects.length === 0) {
      return NextResponse.json({
        registry: EMPTY_REGISTRY,
        catalog,
        configured: false,
      });
    }

    return NextResponse.json({
      registry: toRegistry(catalog, company),
      catalog,
      configured: true,
    });
  } catch (err: unknown) {
    // Last resort: never blank the app shell — return empty registry.
    console.error("[api/schema] GET failed:", err);
    return NextResponse.json({
      registry: EMPTY_REGISTRY,
      catalog: {
        stages: [],
        defects: [],
        sizes: [],
        fiscalYearStartMonth: 4,
        updatedAt: null,
        lastMergedFrom: null,
      },
      configured: false,
      error: err instanceof Error ? err.message : "Failed to load catalog",
    });
  }
}

const UpsertStageBody = z.object({
  action: z.literal("upsert-stage"),
  stage: StageDef,
});
const UpsertDefectBody = z.object({
  action: z.literal("upsert-defect"),
  defect: DefectDef,
});
const UpsertSizeBody = z.object({
  action: z.literal("upsert-size"),
  size: SizeDef,
});
const DeleteBody = z.object({
  action: z.enum(["delete-stage", "delete-defect", "delete-size"]),
  id: z.string().min(1),
});
const FiscalBody = z.object({
  action: z.literal("set-fiscal-year-start"),
  month: z.number().int().min(1).max(12),
});

const BodySchema = z.discriminatedUnion("action", [
  UpsertStageBody,
  UpsertDefectBody,
  UpsertSizeBody,
  DeleteBody,
  FiscalBody,
]);

export async function POST(req: NextRequest) {
  try {
    const company = companyId();
    const raw = await req.json();
    const parsed = BodySchema.safeParse(raw);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid body", details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const store = getCatalogStore();
    // Ensure lazy backfill before mutation so we don't overwrite a migrated set.
    await loadCatalog(company);

    let catalog: CompanyCatalog;
    const body = parsed.data;
    switch (body.action) {
      case "upsert-stage":
        catalog = await store.upsertStage(company, body.stage);
        break;
      case "upsert-defect":
        catalog = await store.upsertDefect(company, body.defect);
        break;
      case "upsert-size":
        catalog = await store.upsertSize(company, body.size);
        break;
      case "delete-stage":
        catalog = await store.deleteStage(company, body.id);
        break;
      case "delete-defect":
        catalog = await store.deleteDefect(company, body.id);
        break;
      case "delete-size":
        catalog = await store.deleteSize(company, body.id);
        break;
      case "set-fiscal-year-start": {
        const cur = await store.get(company);
        catalog = await store.put(company, {
          ...cur,
          fiscalYearStartMonth: body.month,
          lastMergedFrom: cur.lastMergedFrom,
        });
        break;
      }
    }

    return NextResponse.json({
      ok: true,
      registry: toRegistry(catalog, company),
      catalog,
      configured: catalog.stages.length > 0 || catalog.defects.length > 0,
    });
  } catch (err: unknown) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to update catalog" },
      { status: 500 },
    );
  }
}

/** DELETE /api/schema?kind=stage|defect|size&id=… */
export async function DELETE(req: NextRequest) {
  try {
    const kind = req.nextUrl.searchParams.get("kind");
    const id = req.nextUrl.searchParams.get("id");
    if (!kind || !id || !["stage", "defect", "size"].includes(kind)) {
      return NextResponse.json(
        { error: "kind (stage|defect|size) and id are required" },
        { status: 400 },
      );
    }

    const company = companyId();
    const store = getCatalogStore();
    await loadCatalog(company);

    let catalog: CompanyCatalog;
    if (kind === "stage") catalog = await store.deleteStage(company, id);
    else if (kind === "defect") catalog = await store.deleteDefect(company, id);
    else catalog = await store.deleteSize(company, id);

    return NextResponse.json({
      ok: true,
      registry: toRegistry(catalog, company),
      catalog,
      configured: catalog.stages.length > 0 || catalog.defects.length > 0,
    });
  } catch (err: unknown) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to delete catalog entity" },
      { status: 500 },
    );
  }
}
