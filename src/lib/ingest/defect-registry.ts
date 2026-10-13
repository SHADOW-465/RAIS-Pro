// Registry used when a new entry is saved.
//
// Direct entry used to emit with no catalog, so every defect code was written
// null. This loads the plant schema (no write) and learned defect aliases, and
// hands that to emit. Existing ledger rows are not read or updated.

import { getCatalogStore } from "@/core/ontology/store/catalog-store";
import { getKnowledgeStore } from "@/core/ontology/store/knowledge-store";
import type { z } from "zod";
import type { ClientRegistry } from "@/lib/contract/d1";
import { mergeDefectAliases, type DefectAliasRef } from "@/lib/analytics/defect-alias";

type CatalogRegistry = z.infer<typeof ClientRegistry>;

type EmitRegistry = CatalogRegistry;

function companyId(): string {
  return process.env.MOID_COMPANY_ID || "default";
}

export async function registryForNewEntries(
  existing?: EmitRegistry | null,
  company = companyId(),
): Promise<EmitRegistry | undefined> {
  try {
    const base = existing ?? (await getCatalogStore().get(company));
    let aliases: DefectAliasRef[] = [];
    try {
      const rows = await getKnowledgeStore().list(company);
      aliases = rows
        .filter((r) => r.kind === "defect-alias")
        .map((r) => ({ key: r.key, canonicalId: r.canonicalId }));
    } catch {
      aliases = [];
    }
    const defects = mergeDefectAliases(base.defects ?? [], aliases);
    if (defects.length === 0) return existing ?? undefined;
    return {
      clientId: "clientId" in base && base.clientId ? base.clientId : company,
      registryVersion: "registryVersion" in base && base.registryVersion ? base.registryVersion : "plant-schema",
      fiscalYearStartMonth: base.fiscalYearStartMonth || 4,
      stages: (base.stages ?? []) as CatalogRegistry["stages"],
      defects: defects.map((d) => ({
        defectCode: d.defectCode,
        label: (d.label ?? "").trim() || d.defectCode,
        aliases: d.aliases?.length ? d.aliases : [d.defectCode],
        stages: d.stages ?? [],
      })),
      sizes: (base.sizes ?? []) as CatalogRegistry["sizes"],
      costConfig: null,
    };
  } catch {
    return existing ?? undefined;
  }
}
