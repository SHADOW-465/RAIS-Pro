// src/core/ontology/store/mod-store.ts
// Persistence for Manufacturing Ontology Documents (mods table — ADD §7.1).
// A MOD is a versioned DB row: saveDraft appends version n+1; publish flips it
// to 'verified' and supersedes the prior verified version. Append-only like the
// event ledger: a bad interpretation is superseded, never edited.

import type { ModRowT, ModStatusT } from "@/shared/models/ontology";
import type { StageDef, DefectDef, SizeDef } from "@/lib/contract/d1";
import type { z } from "zod";
import { shouldUseSupabase } from "@/lib/store";
import { createServerClient } from "@/lib/supabase";

export interface ModCatalog {
  stages: z.infer<typeof StageDef>[];
  defects: z.infer<typeof DefectDef>[];
  sizes: z.infer<typeof SizeDef>[];
  fiscalYearStartMonth: number;
}

export interface ModSummary {
  modId: string;
  version: number;
  companyId: string;
  status: ModStatusT;
  fileName: string;
  createdAt: string;
}

export interface ModStore {
  list(companyId?: string): Promise<ModSummary[]>;
  /** Latest version when `version` omitted. */
  get(modId: string, version?: number): Promise<ModRowT | null>;
  /** The single verified version of a lineage, or null. */
  activeFor(modId: string): Promise<ModRowT | null>;
  /** Append the next version of a lineage as a draft. Returns the saved row. */
  saveDraft(row: Omit<ModRowT, "version" | "status" | "createdAt" | "verifiedBy" | "verifiedAt" | "supersedes">): Promise<ModRowT>;
  /** Verify a draft; the previously verified version (if any) becomes superseded. */
  publish(modId: string, version: number, verifiedBy: string): Promise<ModRowT>;
  /** Merged stage/defect/size catalog across a company's verified MODs —
   *  the successor of DISPOSAFE_REGISTRY lookups. First occurrence wins per id. */
  catalogFor(companyId: string): Promise<ModCatalog>;
}

function mergeCatalog(rows: ModRowT[]): ModCatalog {
  const stages = new Map<string, z.infer<typeof StageDef>>();
  const defects = new Map<string, z.infer<typeof DefectDef>>();
  const sizes = new Map<string, z.infer<typeof SizeDef>>();
  for (const row of rows) {
    for (const s of row.document.stages) if (!stages.has(s.stageId)) stages.set(s.stageId, s);
    for (const d of row.document.defects) if (!defects.has(d.defectCode)) defects.set(d.defectCode, d);
    for (const s of row.document.sizes) if (!sizes.has(s.sizeId)) sizes.set(s.sizeId, s);
  }
  return {
    stages: [...stages.values()],
    defects: [...defects.values()],
    sizes: [...sizes.values()],
    fiscalYearStartMonth: rows[0]?.document.fiscalYearStartMonth ?? 4,
  };
}

class MemoryModStore implements ModStore {
  private rows: ModRowT[] = [];

  async list(companyId?: string) {
    return this.rows
      .filter((r) => !companyId || r.companyId === companyId)
      .map((r) => ({ modId: r.modId, version: r.version, companyId: r.companyId, status: r.status, fileName: r.document.workbook.fileName, createdAt: r.createdAt }))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.version - a.version);
  }
  async get(modId: string, version?: number) {
    const versions = this.rows.filter((r) => r.modId === modId);
    if (versions.length === 0) return null;
    if (version != null) return versions.find((r) => r.version === version) ?? null;
    return versions.reduce((a, b) => (b.version > a.version ? b : a));
  }
  async activeFor(modId: string) {
    return this.rows.find((r) => r.modId === modId && r.status === "verified") ?? null;
  }
  async saveDraft(row: Omit<ModRowT, "version" | "status" | "createdAt" | "verifiedBy" | "verifiedAt" | "supersedes">) {
    const latest = await this.get(row.modId);
    const saved: ModRowT = {
      ...row,
      version: (latest?.version ?? 0) + 1,
      status: "draft",
      createdAt: new Date().toISOString(),
      verifiedBy: null,
      verifiedAt: null,
      supersedes: null,
    };
    this.rows.push(saved);
    return saved;
  }
  async publish(modId: string, version: number, verifiedBy: string) {
    const row = this.rows.find((r) => r.modId === modId && r.version === version);
    if (!row) throw new Error(`No MOD ${modId} v${version}`);
    const prior = await this.activeFor(modId);
    if (prior && prior.version !== version) prior.status = "superseded";
    row.status = "verified";
    row.verifiedBy = verifiedBy;
    row.verifiedAt = new Date().toISOString();
    row.supersedes = prior && prior.version !== version ? prior.version : null;
    return row;
  }
  async catalogFor(companyId: string) {
    return mergeCatalog(this.rows.filter((r) => r.companyId === companyId && r.status === "verified"));
  }
}

type ModDbRow = {
  mod_id: string; version: number; company_id: string; status: ModStatusT;
  snapshot_id: string; document: ModRowT["document"]; created_at: string;
  verified_by: string | null; verified_at: string | null; supersedes: number | null;
};
const fromDb = (r: ModDbRow): ModRowT => ({
  modId: r.mod_id, version: r.version, companyId: r.company_id, status: r.status,
  snapshotId: r.snapshot_id, document: r.document, createdAt: r.created_at,
  verifiedBy: r.verified_by, verifiedAt: r.verified_at, supersedes: r.supersedes,
});

class SupabaseModStore implements ModStore {
  private db() { return createServerClient(); }

  async list(companyId?: string) {
    let q = this.db().from("mods").select("mod_id, version, company_id, status, document, created_at");
    if (companyId) q = q.eq("company_id", companyId);
    const { data, error } = await q.order("created_at", { ascending: false });
    if (error) throw error;
    return (data ?? []).map((r) => ({
      modId: r.mod_id, version: r.version, companyId: r.company_id, status: r.status,
      fileName: r.document?.workbook?.fileName ?? "", createdAt: r.created_at,
    }));
  }
  async get(modId: string, version?: number) {
    let q = this.db().from("mods").select("*").eq("mod_id", modId);
    if (version != null) q = q.eq("version", version);
    const { data, error } = await q.order("version", { ascending: false }).limit(1).maybeSingle();
    if (error) throw error;
    return data ? fromDb(data) : null;
  }
  async activeFor(modId: string) {
    const { data, error } = await this.db().from("mods").select("*")
      .eq("mod_id", modId).eq("status", "verified").maybeSingle();
    if (error) throw error;
    return data ? fromDb(data) : null;
  }
  async saveDraft(row: Omit<ModRowT, "version" | "status" | "createdAt" | "verifiedBy" | "verifiedAt" | "supersedes">) {
    const latest = await this.get(row.modId);
    const version = (latest?.version ?? 0) + 1;
    const { data, error } = await this.db().from("mods").insert({
      mod_id: row.modId, version, company_id: row.companyId, status: "draft",
      snapshot_id: row.snapshotId, document: row.document,
    }).select("*").single();
    if (error) throw error;
    return fromDb(data);
  }
  async publish(modId: string, version: number, verifiedBy: string) {
    const prior = await this.activeFor(modId);
    if (prior && prior.version !== version) {
      const { error } = await this.db().from("mods").update({ status: "superseded" })
        .eq("mod_id", modId).eq("version", prior.version);
      if (error) throw error;
    }
    const { data, error } = await this.db().from("mods").update({
      status: "verified", verified_by: verifiedBy, verified_at: new Date().toISOString(),
      supersedes: prior && prior.version !== version ? prior.version : null,
    }).eq("mod_id", modId).eq("version", version).select("*").single();
    if (error) throw error;
    return fromDb(data);
  }
  async catalogFor(companyId: string) {
    const { data, error } = await this.db().from("mods").select("*")
      .eq("company_id", companyId).eq("status", "verified");
    if (error) throw error;
    return mergeCatalog((data ?? []).map(fromDb));
  }
}

const g = globalThis as unknown as { __modStore?: ModStore };
export function getModStore(): ModStore {
  if (!g.__modStore) {
    g.__modStore = shouldUseSupabase() ? new SupabaseModStore() : new MemoryModStore();
  }
  return g.__modStore;
}
