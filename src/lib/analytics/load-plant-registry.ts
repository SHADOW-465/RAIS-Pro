// The same catalog, defect aliases, and role-redacted policy /api/schema returns.
// Totals must not trust a registry posted by the browser: stage order changes the cascade.

import { DEFAULT_POLICY, type CalculationPolicyT } from "@/core/policy/policy";
import { loadCatalog } from "@/core/ontology/load-catalog";
import { getModStore } from "@/core/ontology/store/mod-store";
import { getKnowledgeStore } from "@/core/ontology/store/knowledge-store";
import { getPolicyStore } from "@/core/policy/policy-store";
import { policyForRole } from "@/lib/access/scope";
import type { DefectAliasRef } from "./defect-alias";
import type { Registry } from "./rejection";

function companyId(): string {
  return process.env.MOID_COMPANY_ID || "default";
}

async function learnedDefectAliases(company: string): Promise<DefectAliasRef[]> {
  const out: DefectAliasRef[] = [];
  try {
    const knowledge = await getKnowledgeStore().list(company);
    for (const e of knowledge) {
      if (e.kind === "defect-alias" && e.key && e.canonicalId) out.push({ key: e.key, canonicalId: e.canonicalId });
    }
  } catch (err) {
    console.warn("[totals] defect-alias knowledge could not be loaded; catalog aliases still apply", err);
  }
  try {
    const verified = await getModStore().verified(company);
    for (const mod of verified) {
      for (const e of mod.document.entities ?? []) {
        if (!e.verified || e.kind !== "defect" || !e.canonical) continue;
        const header = (e.original?.header ?? "").trim();
        if (header) out.push({ key: header, canonicalId: e.canonical });
      }
    }
  } catch (err) {
    console.warn("[totals] verified-MOD defect aliases could not be loaded", err);
  }
  return out;
}

export async function loadPlantRegistry(nav: readonly string[]): Promise<{ registry: Registry; policy: CalculationPolicyT }> {
  const company = companyId();
  try {
    const [catalog, policyVersion, defectAliases] = await Promise.all([
      loadCatalog(company),
      getPolicyStore().current(company),
      learnedDefectAliases(company),
    ]);
    const registry: Registry = {
      stages: catalog.stages,
      defects: catalog.defects,
      sizes: catalog.sizes,
      fiscalYearStartMonth: catalog.fiscalYearStartMonth,
      defectAliases,
    };
    return { registry, policy: policyForRole(policyVersion.policy, nav) };
  } catch (err) {
    console.warn("[totals] catalog or policy could not be loaded; using the empty registry and shipped policy", err);
    return {
      registry: { stages: [], defects: [], sizes: [], fiscalYearStartMonth: 4 },
      policy: policyForRole(DEFAULT_POLICY, nav),
    };
  }
}
