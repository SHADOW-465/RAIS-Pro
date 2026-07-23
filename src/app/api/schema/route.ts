// src/app/api/schema/route.ts
// Master plant schema — the system brain:
//   · catalog: stages / defects / sizes (company_catalog)
//   · mappings: learned Excel labels → canonical (company_knowledge)
//
// GET    → full brain snapshot
// POST   → upsert/delete catalog entities or knowledge mappings
// DELETE → remove one catalog entity (?kind=stage|defect|size&id=…)
//
// Workbook delete never touches this. Only Data Schema mutations do.

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { StageDef, DefectDef, SizeDef } from "@/lib/contract/d1";
import { EMPTY_REGISTRY } from "@/core/ontology/empty-registry";
import { getCatalogStore, type CompanyCatalog } from "@/core/ontology/store/catalog-store";
import { getModStore } from "@/core/ontology/store/mod-store";
import {
  getKnowledgeStore,
  normalizeKey,
  type KnowledgeEntry,
  type KnowledgeKind,
} from "@/core/ontology/store/knowledge-store";

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

/** Verified MOD entities promoted into knowledge-shaped rows for the brain UI. */
async function mappingsFromVerifiedMods(company: string): Promise<
  Array<KnowledgeEntry & { source: "mod" }>
> {
  const verified = await getModStore().verified(company);
  const map = new Map<string, KnowledgeEntry & { source: "mod" }>();
  for (const mod of verified) {
    for (const e of mod.document.entities ?? []) {
      if (!e.verified || !e.canonical) continue;
      const header = (e.original?.header ?? "").trim();
      if (!header) continue;
      let kind: KnowledgeKind = "column-mapping";
      if (e.kind === "stage") kind = "stage-alias";
      else if (e.kind === "defect") kind = "defect-alias";
      const key = normalizeKey(header);
      const id = `${kind}|${key}`;
      if (map.has(id)) continue;
      map.set(id, {
        companyId: company,
        kind,
        key,
        canonicalId: e.canonical,
        confidence: e.confidence ?? 1,
        learnedFrom: mod.modId,
        learnedAt: mod.verifiedAt ?? mod.createdAt ?? new Date().toISOString(),
        useCount: 0,
        source: "mod",
      });
    }
  }
  return [...map.values()];
}

async function loadMappings(company: string): Promise<
  Array<KnowledgeEntry & { source: "knowledge" | "mod" }>
> {
  let knowledge: KnowledgeEntry[] = [];
  try {
    knowledge = await getKnowledgeStore().list(company);
  } catch {
    knowledge = [];
  }
  const fromKnowledge = knowledge.map((e) => ({ ...e, source: "knowledge" as const }));
  const seen = new Set(fromKnowledge.map((e) => `${e.kind}|${e.key}`));

  let fromMods: Array<KnowledgeEntry & { source: "mod" }> = [];
  try {
    fromMods = await mappingsFromVerifiedMods(company);
  } catch {
    fromMods = [];
  }

  const extras = fromMods.filter((e) => !seen.has(`${e.kind}|${e.key}`));
  return [...fromKnowledge, ...extras].sort((a, b) => {
    if (a.kind !== b.kind) return a.kind.localeCompare(b.kind);
    return a.key.localeCompare(b.key);
  });
}

export async function GET() {
  try {
    const company = companyId();
    const [catalog, mappings] = await Promise.all([
      loadCatalog(company),
      loadMappings(company),
    ]);

    const configured =
      catalog.stages.length > 0 ||
      catalog.defects.length > 0 ||
      catalog.sizes.length > 0 ||
      mappings.length > 0;

    return NextResponse.json({
      registry: configured ? toRegistry(catalog, company) : EMPTY_REGISTRY,
      catalog,
      mappings,
      configured,
      brain: {
        stageCount: catalog.stages.length,
        defectCount: catalog.defects.length,
        sizeCount: catalog.sizes.length,
        mappingCount: mappings.length,
        knowledgeCount: mappings.filter((m) => m.source === "knowledge").length,
        modDerivedCount: mappings.filter((m) => m.source === "mod").length,
      },
    });
  } catch (err: unknown) {
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
      mappings: [],
      configured: false,
      error: err instanceof Error ? err.message : "Failed to load catalog",
    });
  }
}

const KnowledgeKindSchema = z.enum([
  "stage-alias",
  "defect-alias",
  "column-mapping",
  "header-pattern",
]);

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
const UpsertMappingBody = z.object({
  action: z.literal("upsert-mapping"),
  mapping: z.object({
    kind: KnowledgeKindSchema,
    key: z.string().min(1),
    canonicalId: z.string().min(1),
    confidence: z.number().min(0).max(1).optional(),
  }),
});
const DeleteMappingBody = z.object({
  action: z.literal("delete-mapping"),
  kind: KnowledgeKindSchema,
  key: z.string().min(1),
});

const BodySchema = z.discriminatedUnion("action", [
  UpsertStageBody,
  UpsertDefectBody,
  UpsertSizeBody,
  DeleteBody,
  FiscalBody,
  UpsertMappingBody,
  DeleteMappingBody,
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
    const knowledge = getKnowledgeStore();
    await loadCatalog(company);

    let catalog: CompanyCatalog = await store.get(company);
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
      case "upsert-mapping": {
        await knowledge.learn([
          {
            companyId: company,
            kind: body.mapping.kind,
            key: normalizeKey(body.mapping.key),
            canonicalId: body.mapping.canonicalId.trim(),
            confidence: body.mapping.confidence ?? 1,
            learnedFrom: "master-schema",
          },
        ]);
        catalog = await store.get(company);
        break;
      }
      case "delete-mapping": {
        await knowledge.remove(company, body.kind, body.key);
        catalog = await store.get(company);
        break;
      }
    }

    const mappings = await loadMappings(company);

    return NextResponse.json({
      ok: true,
      registry: toRegistry(catalog, company),
      catalog,
      mappings,
      configured:
        catalog.stages.length > 0 ||
        catalog.defects.length > 0 ||
        catalog.sizes.length > 0 ||
        mappings.length > 0,
    });
  } catch (err: unknown) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to update catalog" },
      { status: 500 },
    );
  }
}

/** DELETE /api/schema?kind=stage|defect|size|mapping&id=… [&mappingKind=…] */
export async function DELETE(req: NextRequest) {
  try {
    const kind = req.nextUrl.searchParams.get("kind");
    const id = req.nextUrl.searchParams.get("id");
    if (!kind || !id) {
      return NextResponse.json(
        { error: "kind and id are required" },
        { status: 400 },
      );
    }

    const company = companyId();
    const store = getCatalogStore();
    await loadCatalog(company);

    let catalog: CompanyCatalog;
    if (kind === "mapping") {
      const mappingKind = req.nextUrl.searchParams.get("mappingKind") as KnowledgeKind | null;
      if (!mappingKind) {
        return NextResponse.json(
          { error: "mappingKind is required when kind=mapping" },
          { status: 400 },
        );
      }
      await getKnowledgeStore().remove(company, mappingKind, id);
      catalog = await store.get(company);
    } else if (kind === "stage") {
      catalog = await store.deleteStage(company, id);
    } else if (kind === "defect") {
      catalog = await store.deleteDefect(company, id);
    } else if (kind === "size") {
      catalog = await store.deleteSize(company, id);
    } else {
      return NextResponse.json(
        { error: "kind must be stage|defect|size|mapping" },
        { status: 400 },
      );
    }

    const mappings = await loadMappings(company);
    return NextResponse.json({
      ok: true,
      registry: toRegistry(catalog, company),
      catalog,
      mappings,
      configured:
        catalog.stages.length > 0 ||
        catalog.defects.length > 0 ||
        catalog.sizes.length > 0 ||
        mappings.length > 0,
    });
  } catch (err: unknown) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to delete catalog entity" },
      { status: 500 },
    );
  }
}
