// src/core/ontology/store/knowledge-store.ts
// Company knowledge (learned mappings — the registry successor, ADD §13) plus
// read access to the seeded global ontology. Written ONLY by the learn step
// (verified mappings); read by resolver rung 2.

import { shouldUseSupabase } from "@/lib/store";
import { createServerClient } from "@/lib/supabase";
import { GLOBAL_ONTOLOGY_SEED, type OntologyConcept } from "@/core/ontology/global-ontology";

export type KnowledgeKind = "stage-alias" | "defect-alias" | "column-mapping" | "header-pattern";

export interface KnowledgeEntry {
  companyId: string;
  kind: KnowledgeKind;
  key: string;            // normalized raw label (see normalizeKey)
  canonicalId: string;
  confidence: number;
  learnedFrom: string | null; // modId
  learnedAt: string;
  useCount: number;
}

/** Case/whitespace-insensitive key — same discipline recognize.ts pioneered. */
export function normalizeKey(raw: string): string {
  return raw.trim().toLowerCase().replace(/\s+/g, " ");
}

export interface KnowledgeStore {
  lookup(companyId: string, kind: KnowledgeKind, rawLabel: string): Promise<KnowledgeEntry | null>;
  /** Upsert learned mappings; an existing (company, kind, key) is overwritten
   *  (the newest verification wins) with useCount preserved. */
  learn(entries: Omit<KnowledgeEntry, "learnedAt" | "useCount">[]): Promise<void>;
  /** Record that a lookup hit was actually used in a verified MOD. */
  recordUse(companyId: string, kind: KnowledgeKind, key: string): Promise<void>;
  list(companyId: string): Promise<KnowledgeEntry[]>;
  /** Remove one mapping (Master Schema brain editor). */
  remove(companyId: string, kind: KnowledgeKind, key: string): Promise<void>;
  /** Wipe all knowledge for a company (admin reset of the system brain). */
  clear(companyId: string): Promise<void>;
  concepts(): Promise<OntologyConcept[]>;
}

const entryKey = (companyId: string, kind: string, key: string) => `${companyId}|${kind}|${key}`;

class MemoryKnowledgeStore implements KnowledgeStore {
  private entries = new Map<string, KnowledgeEntry>();

  async lookup(companyId: string, kind: KnowledgeKind, rawLabel: string) {
    return this.entries.get(entryKey(companyId, kind, normalizeKey(rawLabel))) ?? null;
  }
  async learn(entries: Omit<KnowledgeEntry, "learnedAt" | "useCount">[]) {
    for (const e of entries) {
      const key = entryKey(e.companyId, e.kind, e.key);
      const prior = this.entries.get(key);
      this.entries.set(key, { ...e, learnedAt: new Date().toISOString(), useCount: prior?.useCount ?? 0 });
    }
  }
  async recordUse(companyId: string, kind: KnowledgeKind, key: string) {
    const e = this.entries.get(entryKey(companyId, kind, key));
    if (e) e.useCount += 1;
  }
  async list(companyId: string) {
    return [...this.entries.values()].filter((e) => e.companyId === companyId);
  }
  async remove(companyId: string, kind: KnowledgeKind, key: string) {
    this.entries.delete(entryKey(companyId, kind, normalizeKey(key)));
  }
  async clear(companyId: string) {
    for (const k of [...this.entries.keys()]) {
      if (k.startsWith(`${companyId}|`)) this.entries.delete(k);
    }
  }
  async concepts() {
    return GLOBAL_ONTOLOGY_SEED;
  }
}

class SupabaseKnowledgeStore implements KnowledgeStore {
  private db() { return createServerClient(); }

  async lookup(companyId: string, kind: KnowledgeKind, rawLabel: string) {
    const { data, error } = await this.db().from("company_knowledge").select("*")
      .eq("company_id", companyId).eq("kind", kind).eq("key", normalizeKey(rawLabel)).maybeSingle();
    if (error) throw error;
    if (!data) return null;
    return {
      companyId: data.company_id, kind: data.kind, key: data.key, canonicalId: data.canonical_id,
      confidence: Number(data.confidence), learnedFrom: data.learned_from,
      learnedAt: data.learned_at, useCount: data.use_count,
    };
  }
  async learn(entries: Omit<KnowledgeEntry, "learnedAt" | "useCount">[]) {
    if (entries.length === 0) return;
    const { error } = await this.db().from("company_knowledge").upsert(
      entries.map((e) => ({
        company_id: e.companyId, kind: e.kind, key: e.key,
        canonical_id: e.canonicalId, confidence: e.confidence, learned_from: e.learnedFrom,
      })),
      { onConflict: "company_id,kind,key" },
    );
    if (error) throw error;
  }
  async recordUse(companyId: string, kind: KnowledgeKind, key: string) {
    // Read-then-write is fine here: use_count is advisory telemetry, not a
    // correctness counter. ponytail: swap for an RPC increment if it ever matters.
    const existing = await this.lookup(companyId, kind, key);
    if (!existing) return;
    const { error } = await this.db().from("company_knowledge")
      .update({ use_count: existing.useCount + 1 })
      .eq("company_id", companyId).eq("kind", kind).eq("key", key);
    if (error) throw error;
  }
  async list(companyId: string) {
    const { data, error } = await this.db().from("company_knowledge").select("*").eq("company_id", companyId);
    if (error) throw error;
    return (data ?? []).map((d) => ({
      companyId: d.company_id, kind: d.kind, key: d.key, canonicalId: d.canonical_id,
      confidence: Number(d.confidence), learnedFrom: d.learned_from,
      learnedAt: d.learned_at, useCount: d.use_count,
    }));
  }
  async remove(companyId: string, kind: KnowledgeKind, key: string) {
    const { error } = await this.db().from("company_knowledge")
      .delete()
      .eq("company_id", companyId)
      .eq("kind", kind)
      .eq("key", normalizeKey(key));
    if (error) throw error;
  }
  async clear(companyId: string) {
    const { error } = await this.db().from("company_knowledge")
      .delete()
      .eq("company_id", companyId);
    if (error) throw error;
  }
  async concepts() {
    const { data, error } = await this.db().from("global_ontology").select("*");
    if (error) throw error;
    if (!data || data.length === 0) return GLOBAL_ONTOLOGY_SEED;
    return data.map((d) => ({
      conceptId: d.concept_id, kind: d.kind, matchTerms: d.match_terms, description: d.description,
    }));
  }
}

const g = globalThis as unknown as { __modKnowledgeStore?: KnowledgeStore };
export function getKnowledgeStore(): KnowledgeStore {
  if (!g.__modKnowledgeStore) {
    g.__modKnowledgeStore = shouldUseSupabase() ? new SupabaseKnowledgeStore() : new MemoryKnowledgeStore();
  }
  return g.__modKnowledgeStore;
}
