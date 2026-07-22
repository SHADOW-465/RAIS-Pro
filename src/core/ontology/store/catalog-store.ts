// Company master catalog — the durable plant schema (stages / defects / sizes).
//
// Ownership rule (hard):
//   · Workbooks may *contribute* schema when a MOD is verified/published.
//   · Workbooks must NEVER delete or replace this catalog (deleting an upload
//     only removes the file snapshot + MOD lineage).
//   · Edit / delete / reset of master schema happens only via Data Schema
//     (/api/schema) or an explicit admin reset (/api/clear-schema).
//
// catalogFor() used to recompute from verified MOD rows; that made schema
// vanish when every workbook was deleted. This store materialises the merge
// at publish time so the catalog outlives the files that taught it.

import type { z } from "zod";
import type { StageDef, DefectDef, SizeDef } from "@/lib/contract/d1";
import type { ModRowT } from "@/shared/models/ontology";
import { shouldUseSupabase } from "@/lib/store";
import { createServerClient } from "@/lib/supabase";

export interface CompanyCatalog {
  stages: z.infer<typeof StageDef>[];
  defects: z.infer<typeof DefectDef>[];
  sizes: z.infer<typeof SizeDef>[];
  fiscalYearStartMonth: number;
  /** ISO timestamp of last write (merge / edit / delete). */
  updatedAt: string | null;
  /** Last MOD lineage that contributed a merge (audit, not ownership). */
  lastMergedFrom: string | null;
}

export const EMPTY_CATALOG: CompanyCatalog = {
  stages: [],
  defects: [],
  sizes: [],
  fiscalYearStartMonth: 4,
  updatedAt: null,
  lastMergedFrom: null,
};

export interface CatalogStore {
  get(companyId: string): Promise<CompanyCatalog>;
  /** Replace entire catalog (admin edit / reset). */
  put(companyId: string, catalog: Omit<CompanyCatalog, "updatedAt"> & { updatedAt?: string | null }): Promise<CompanyCatalog>;
  /** Merge stages/defects/sizes from a verified MOD — first occurrence wins per id. */
  mergeFromMod(mod: ModRowT): Promise<CompanyCatalog>;
  upsertStage(companyId: string, stage: z.infer<typeof StageDef>): Promise<CompanyCatalog>;
  upsertDefect(companyId: string, defect: z.infer<typeof DefectDef>): Promise<CompanyCatalog>;
  upsertSize(companyId: string, size: z.infer<typeof SizeDef>): Promise<CompanyCatalog>;
  deleteStage(companyId: string, stageId: string): Promise<CompanyCatalog>;
  deleteDefect(companyId: string, defectCode: string): Promise<CompanyCatalog>;
  deleteSize(companyId: string, sizeId: string): Promise<CompanyCatalog>;
  clear(companyId: string): Promise<void>;
}

function nowIso() {
  return new Date().toISOString();
}

function mergeInto(
  base: CompanyCatalog,
  incoming: {
    stages: z.infer<typeof StageDef>[];
    defects: z.infer<typeof DefectDef>[];
    sizes: z.infer<typeof SizeDef>[];
    fiscalYearStartMonth?: number;
  },
  lastMergedFrom: string | null,
): CompanyCatalog {
  const stages = new Map(base.stages.map((s) => [s.stageId, s]));
  const defects = new Map(base.defects.map((d) => [d.defectCode, d]));
  const sizes = new Map(base.sizes.map((s) => [s.sizeId, s]));
  for (const s of incoming.stages) if (!stages.has(s.stageId)) stages.set(s.stageId, s);
  for (const d of incoming.defects) {
    if (!defects.has(d.defectCode)) {
      defects.set(d.defectCode, d);
    } else {
      // Union stages so later workbooks can attach a code to more gates without
      // inventing a second defect code.
      const prior = defects.get(d.defectCode)!;
      const stageSet = new Set([...(prior.stages ?? []), ...(d.stages ?? [])]);
      const aliasSet = new Set([...(prior.aliases ?? []), ...(d.aliases ?? [])]);
      defects.set(d.defectCode, {
        ...prior,
        stages: [...stageSet],
        aliases: [...aliasSet].length ? [...aliasSet] : prior.aliases,
      });
    }
  }
  for (const s of incoming.sizes) if (!sizes.has(s.sizeId)) sizes.set(s.sizeId, s);
  return {
    stages: [...stages.values()],
    defects: [...defects.values()],
    sizes: [...sizes.values()],
    fiscalYearStartMonth: base.stages.length
      ? base.fiscalYearStartMonth
      : (incoming.fiscalYearStartMonth ?? base.fiscalYearStartMonth),
    updatedAt: nowIso(),
    lastMergedFrom,
  };
}

class MemoryCatalogStore implements CatalogStore {
  private byCompany = new Map<string, CompanyCatalog>();

  async get(companyId: string) {
    return this.byCompany.get(companyId) ?? { ...EMPTY_CATALOG, stages: [], defects: [], sizes: [] };
  }
  async put(companyId: string, catalog: Omit<CompanyCatalog, "updatedAt"> & { updatedAt?: string | null }) {
    const saved: CompanyCatalog = {
      stages: catalog.stages,
      defects: catalog.defects,
      sizes: catalog.sizes,
      fiscalYearStartMonth: catalog.fiscalYearStartMonth,
      updatedAt: catalog.updatedAt ?? nowIso(),
      lastMergedFrom: catalog.lastMergedFrom ?? null,
    };
    this.byCompany.set(companyId, saved);
    return saved;
  }
  async mergeFromMod(mod: ModRowT) {
    const base = await this.get(mod.companyId);
    const next = mergeInto(
      base,
      {
        stages: mod.document.stages ?? [],
        defects: mod.document.defects ?? [],
        sizes: mod.document.sizes ?? [],
        fiscalYearStartMonth: mod.document.fiscalYearStartMonth,
      },
      mod.modId,
    );
    this.byCompany.set(mod.companyId, next);
    return next;
  }
  async upsertStage(companyId: string, stage: z.infer<typeof StageDef>) {
    const cur = await this.get(companyId);
    const stages = cur.stages.filter((s) => s.stageId !== stage.stageId);
    stages.push(stage);
    return this.put(companyId, { ...cur, stages, lastMergedFrom: cur.lastMergedFrom });
  }
  async upsertDefect(companyId: string, defect: z.infer<typeof DefectDef>) {
    const cur = await this.get(companyId);
    const defects = cur.defects.filter((d) => d.defectCode !== defect.defectCode);
    defects.push(defect);
    return this.put(companyId, { ...cur, defects, lastMergedFrom: cur.lastMergedFrom });
  }
  async upsertSize(companyId: string, size: z.infer<typeof SizeDef>) {
    const cur = await this.get(companyId);
    const sizes = cur.sizes.filter((s) => s.sizeId !== size.sizeId);
    sizes.push(size);
    return this.put(companyId, { ...cur, sizes, lastMergedFrom: cur.lastMergedFrom });
  }
  async deleteStage(companyId: string, stageId: string) {
    const cur = await this.get(companyId);
    return this.put(companyId, {
      ...cur,
      stages: cur.stages.filter((s) => s.stageId !== stageId),
      // Drop stage refs from defects so the catalog stays consistent.
      defects: cur.defects.map((d) => ({
        ...d,
        stages: (d.stages ?? []).filter((s) => s !== stageId),
      })),
      lastMergedFrom: cur.lastMergedFrom,
    });
  }
  async deleteDefect(companyId: string, defectCode: string) {
    const cur = await this.get(companyId);
    return this.put(companyId, {
      ...cur,
      defects: cur.defects.filter((d) => d.defectCode !== defectCode),
      lastMergedFrom: cur.lastMergedFrom,
    });
  }
  async deleteSize(companyId: string, sizeId: string) {
    const cur = await this.get(companyId);
    return this.put(companyId, {
      ...cur,
      sizes: cur.sizes.filter((s) => s.sizeId !== sizeId),
      lastMergedFrom: cur.lastMergedFrom,
    });
  }
  async clear(companyId: string) {
    this.byCompany.delete(companyId);
  }
}

type CatalogDbRow = {
  company_id: string;
  stages: CompanyCatalog["stages"];
  defects: CompanyCatalog["defects"];
  sizes: CompanyCatalog["sizes"];
  fiscal_year_start_month: number;
  updated_at: string | null;
  last_merged_from: string | null;
};

function fromDb(r: CatalogDbRow): CompanyCatalog {
  return {
    stages: r.stages ?? [],
    defects: r.defects ?? [],
    sizes: r.sizes ?? [],
    fiscalYearStartMonth: r.fiscal_year_start_month ?? 4,
    updatedAt: r.updated_at,
    lastMergedFrom: r.last_merged_from,
  };
}

class SupabaseCatalogStore implements CatalogStore {
  private db() {
    return createServerClient();
  }

  async get(companyId: string) {
    const { data, error } = await this.db()
      .from("company_catalog")
      .select("*")
      .eq("company_id", companyId)
      .maybeSingle();
    if (error) throw error;
    if (!data) return { ...EMPTY_CATALOG, stages: [], defects: [], sizes: [] };
    return fromDb(data as CatalogDbRow);
  }

  async put(companyId: string, catalog: Omit<CompanyCatalog, "updatedAt"> & { updatedAt?: string | null }) {
    const updatedAt = catalog.updatedAt ?? nowIso();
    const { data, error } = await this.db()
      .from("company_catalog")
      .upsert(
        {
          company_id: companyId,
          stages: catalog.stages,
          defects: catalog.defects,
          sizes: catalog.sizes,
          fiscal_year_start_month: catalog.fiscalYearStartMonth,
          updated_at: updatedAt,
          last_merged_from: catalog.lastMergedFrom ?? null,
        },
        { onConflict: "company_id" },
      )
      .select("*")
      .single();
    if (error) throw error;
    return fromDb(data as CatalogDbRow);
  }

  async mergeFromMod(mod: ModRowT) {
    const base = await this.get(mod.companyId);
    const next = mergeInto(
      base,
      {
        stages: mod.document.stages ?? [],
        defects: mod.document.defects ?? [],
        sizes: mod.document.sizes ?? [],
        fiscalYearStartMonth: mod.document.fiscalYearStartMonth,
      },
      mod.modId,
    );
    return this.put(mod.companyId, next);
  }

  async upsertStage(companyId: string, stage: z.infer<typeof StageDef>) {
    const cur = await this.get(companyId);
    const stages = cur.stages.filter((s) => s.stageId !== stage.stageId);
    stages.push(stage);
    return this.put(companyId, { ...cur, stages, lastMergedFrom: cur.lastMergedFrom });
  }
  async upsertDefect(companyId: string, defect: z.infer<typeof DefectDef>) {
    const cur = await this.get(companyId);
    const defects = cur.defects.filter((d) => d.defectCode !== defect.defectCode);
    defects.push(defect);
    return this.put(companyId, { ...cur, defects, lastMergedFrom: cur.lastMergedFrom });
  }
  async upsertSize(companyId: string, size: z.infer<typeof SizeDef>) {
    const cur = await this.get(companyId);
    const sizes = cur.sizes.filter((s) => s.sizeId !== size.sizeId);
    sizes.push(size);
    return this.put(companyId, { ...cur, sizes, lastMergedFrom: cur.lastMergedFrom });
  }
  async deleteStage(companyId: string, stageId: string) {
    const cur = await this.get(companyId);
    return this.put(companyId, {
      ...cur,
      stages: cur.stages.filter((s) => s.stageId !== stageId),
      defects: cur.defects.map((d) => ({
        ...d,
        stages: (d.stages ?? []).filter((s) => s !== stageId),
      })),
      lastMergedFrom: cur.lastMergedFrom,
    });
  }
  async deleteDefect(companyId: string, defectCode: string) {
    const cur = await this.get(companyId);
    return this.put(companyId, {
      ...cur,
      defects: cur.defects.filter((d) => d.defectCode !== defectCode),
      lastMergedFrom: cur.lastMergedFrom,
    });
  }
  async deleteSize(companyId: string, sizeId: string) {
    const cur = await this.get(companyId);
    return this.put(companyId, {
      ...cur,
      sizes: cur.sizes.filter((s) => s.sizeId !== sizeId),
      lastMergedFrom: cur.lastMergedFrom,
    });
  }
  async clear(companyId: string) {
    const { error } = await this.db().from("company_catalog").delete().eq("company_id", companyId);
    if (error) throw error;
  }
}

const g = globalThis as unknown as { __companyCatalogStore?: CatalogStore };
export function getCatalogStore(): CatalogStore {
  if (!g.__companyCatalogStore) {
    g.__companyCatalogStore = shouldUseSupabase() ? new SupabaseCatalogStore() : new MemoryCatalogStore();
  }
  return g.__companyCatalogStore;
}

/** Test helper — wipe singleton between suites. */
export function __resetCatalogStoreForTests() {
  g.__companyCatalogStore = undefined;
}
