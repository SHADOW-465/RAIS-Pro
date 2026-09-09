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
import { requireCapability } from "@/lib/auth/guard";
import { z } from "zod";
import { StageDef, DefectDef, SizeDef } from "@/lib/contract/d1";
import { EMPTY_REGISTRY } from "@/core/ontology/empty-registry";
import { getCatalogStore, type CompanyCatalog } from "@/core/ontology/store/catalog-store";
import { getPolicyStore } from "@/core/policy/policy-store";
import { requireSession } from "@/lib/auth/guard";
import { resolveRole } from "@/lib/auth/roles";
import { policyForRole, roleSeesCost } from "@/lib/access/scope";
import { DEFAULT_POLICY } from "@/core/policy/policy";
import { mergePlantCatalog } from "@/core/ontology/plant-catalog";
import { loadCatalog, SEED_TAG } from "@/core/ontology/load-catalog";
import { aliasesForDefect } from "@/lib/schema/defect-payload";
import { resolveSections, sectionMarkerStage, slugSectionId } from "@/lib/schema/sections";
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

/**
 * Load master catalog; if empty, seed once from the AUTHORED plant catalog.
 *
 * This used to seed from a merge of verified MODs — i.e. from whatever the
 * resolver had guessed each workbook's columns meant. That is what produced a
 * 5-stage catalog with no upstream cascade and no production stage. The plant's
 * process is written down in its SOPs; it is authored, not inferred.
 */
// loadCatalog lives in core/ontology/load-catalog.ts so that this route and
// /api/entry-template can never seed differently.

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

export async function GET(req: NextRequest) {
  // The policy rides along on this response, and it carries the unit cost —
  // so the same redaction /api/policy does has to happen here too, or the
  // figure withheld from one endpoint arrives on the other. This route is the
  // reason to enforce that in lib/access/scope.ts rather than inline.
  const auth = await requireSession(req);
  if (!auth.ok) return auth.response;
  const role = await resolveRole(auth.actor.role);
  const nav = role?.navAllow ?? [];

  try {
    const company = companyId();
    // Policy rides along so the client gets all plant config in one round trip
    // (RegistryProvider already fetches this). Writes go to /api/policy.
    const [catalogRaw, mappings, policyVersion] = await Promise.all([
      loadCatalog(company),
      loadMappings(company),
      getPolicyStore().current(company),
    ]);
    const catalog = {
      ...catalogRaw,
      sections: resolveSections(catalogRaw),
    };

    const configured =
      catalog.stages.length > 0 ||
      catalog.defects.length > 0 ||
      catalog.sizes.length > 0 ||
      mappings.length > 0;

    return NextResponse.json(
      {
        registry: configured ? toRegistry(catalog, company) : EMPTY_REGISTRY,
        catalog,
        mappings,
        configured,
        policy: policyForRole(policyVersion.policy, nav),
        policyVersion: policyVersion.version,
        costRedacted: roleSeesCost(nav) ? undefined : true,
        brain: {
          stageCount: catalog.stages.length,
          defectCount: catalog.defects.length,
          sizeCount: catalog.sizes.length,
          mappingCount: mappings.length,
          knowledgeCount: mappings.filter((m) => m.source === "knowledge").length,
          modDerivedCount: mappings.filter((m) => m.source === "mod").length,
        },
      },
      { headers: { "Cache-Control": "no-store, no-cache, must-revalidate" } },
    );
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
      // Shipped defaults, never undefined — a failed schema load must not make
      // every screen fall back to a *different* set of conventions.
      policy: policyForRole(DEFAULT_POLICY, nav),
      policyVersion: 0,
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
  // aliases.min(1) on DefectDef is what made the tree "Add defect" look
  // like a no-op — the editor sent []. Accept empty and fill the code in.
  defect: DefectDef.extend({ aliases: z.array(z.string()).default([]) }),
});
const UpsertSizeBody = z.object({
  action: z.literal("upsert-size"),
  size: SizeDef,
});
const DeleteBody = z.object({
  action: z.enum(["delete-stage", "delete-defect", "delete-size", "delete-section"]),
  id: z.string().min(1),
});
const UpsertSectionBody = z.object({
  action: z.literal("upsert-section"),
  section: z.object({
    id: z.string().min(1).optional(),
    label: z.string().min(1),
  }),
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
/** Bring the stored catalog up to the authored plant catalog. Additive and
 *  label-preserving (see mergePlantCatalog) — never destructive, so it is safe
 *  to run against a catalog someone has already edited by hand. */
const LoadPlantCatalogBody = z.object({
  action: z.literal("load-plant-catalog"),
});

const BodySchema = z.discriminatedUnion("action", [
  LoadPlantCatalogBody,
  UpsertStageBody,
  UpsertDefectBody,
  UpsertSizeBody,
  UpsertSectionBody,
  DeleteBody,
  FiscalBody,
  UpsertMappingBody,
  DeleteMappingBody,
]);

export async function POST(req: NextRequest) {
  const auth = await requireCapability(req, "configure");
  if (!auth.ok) return auth.response;

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
      case "load-plant-catalog":
        catalog = await store.put(company, mergePlantCatalog(await store.get(company)));
        break;
      case "upsert-stage":
        catalog = await store.upsertStage(company, body.stage);
        break;
      case "upsert-defect":
        catalog = await store.upsertDefect(company, {
          ...body.defect,
          aliases: aliasesForDefect(body.defect.defectCode, body.defect.aliases),
        });
        break;
      case "upsert-size":
        catalog = await store.upsertSize(company, body.size);
        break;
      case "upsert-section": {
        const current = resolveSections(await store.get(company));
        const label = body.section.label.trim();
        const id =
          (body.section.id ?? "").trim() ||
          slugSectionId(label, new Set(current.map((s) => s.id)));
        catalog = await store.upsertSection(company, { id, label });
        // Stamp the title onto stages so a rename survives even if the
        // `sections` column is not on this database yet. An empty new
        // section gets a marker stage (no captures → hidden from Data Entry).
        let stages = catalog.stages.map((s) =>
          s.category === id ? { ...s, sectionLabel: label } : s,
        );
        if (!stages.some((s) => s.category === id)) {
          stages = [...stages, { ...sectionMarkerStage(id, label), sectionLabel: label }];
        }
        catalog = await store.put(company, {
          ...catalog,
          stages,
          sections: resolveSections({ ...catalog, stages }),
        });
        break;
      }
      case "delete-stage":
        catalog = await store.deleteStage(company, body.id);
        break;
      case "delete-defect":
        catalog = await store.deleteDefect(company, body.id);
        break;
      case "delete-size":
        catalog = await store.deleteSize(company, body.id);
        break;
      case "delete-section":
        catalog = await store.deleteSection(company, body.id);
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

    // Human edits via Data Schema are the authored floor. Stamp SEED_TAG so
    // the next GET cannot re-insert a stage the operator just deleted
    // (backfill only inserts when lastMergedFrom is an older/unknown tag).
    if (catalog.lastMergedFrom !== SEED_TAG) {
      catalog = await store.put(company, { ...catalog, lastMergedFrom: SEED_TAG });
    }

    const mappings = await loadMappings(company);

    return NextResponse.json(
      {
        ok: true,
        registry: toRegistry(catalog, company),
        catalog,
        mappings,
        configured:
          catalog.stages.length > 0 ||
          catalog.defects.length > 0 ||
          catalog.sizes.length > 0 ||
          mappings.length > 0,
      },
      { headers: { "Cache-Control": "no-store, no-cache, must-revalidate" } },
    );
  } catch (err: unknown) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to update catalog" },
      { status: 500 },
    );
  }
}

/** DELETE /api/schema?kind=stage|defect|size|mapping&id=… [&mappingKind=…] */
export async function DELETE(req: NextRequest) {
  const auth = await requireCapability(req, "configure");
  if (!auth.ok) return auth.response;

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

    if (catalog.lastMergedFrom !== SEED_TAG) {
      catalog = await store.put(company, { ...catalog, lastMergedFrom: SEED_TAG });
    }

    const mappings = await loadMappings(company);
    return NextResponse.json(
      {
        ok: true,
        registry: toRegistry(catalog, company),
        catalog,
        mappings,
        configured:
          catalog.stages.length > 0 ||
          catalog.defects.length > 0 ||
          catalog.sizes.length > 0 ||
          mappings.length > 0,
      },
      { headers: { "Cache-Control": "no-store, no-cache, must-revalidate" } },
    );
  } catch (err: unknown) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to delete catalog entity" },
      { status: 500 },
    );
  }
}
