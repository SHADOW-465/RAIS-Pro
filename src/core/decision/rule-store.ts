// src/core/decision/rule-store.ts
// Persistence for decision_rules (ADD §7.1). Memory seed covers demo/tests;
// Supabase adapter when env is configured.

import type { DecisionRuleT } from "@/shared/models/decision";
import { DecisionRule } from "@/shared/models/decision";
import { SEED_DECISION_RULES } from "./seed-rules";
import { shouldUseSupabase } from "@/lib/store";

export interface DecisionRuleStore {
  /** Active rules only (drafts never act — same discipline as rulebook). */
  listActive(): Promise<DecisionRuleT[]>;
  listAll(): Promise<DecisionRuleT[]>;
  get(ruleId: string, version?: number): Promise<DecisionRuleT | null>;
  /** Append a new version (draft). */
  saveDraft(rule: Omit<DecisionRuleT, "status" | "createdAt"> & { status?: "draft" }): Promise<DecisionRuleT>;
  activate(ruleId: string, version: number): Promise<DecisionRuleT>;
  retire(ruleId: string, version: number): Promise<DecisionRuleT>;
}

class MemoryDecisionRuleStore implements DecisionRuleStore {
  private rows: DecisionRuleT[];

  constructor(seed: DecisionRuleT[] = SEED_DECISION_RULES) {
    this.rows = seed.map((r) => DecisionRule.parse(r));
  }

  async listActive() {
    // Latest active version per ruleId
    const best = new Map<string, DecisionRuleT>();
    for (const r of this.rows) {
      if (r.status !== "active") continue;
      const cur = best.get(r.ruleId);
      if (!cur || r.version > cur.version) best.set(r.ruleId, r);
    }
    return [...best.values()].sort((a, b) => a.ruleId.localeCompare(b.ruleId));
  }

  async listAll() {
    return [...this.rows].sort(
      (a, b) => a.ruleId.localeCompare(b.ruleId) || b.version - a.version,
    );
  }

  async get(ruleId: string, version?: number) {
    const versions = this.rows.filter((r) => r.ruleId === ruleId);
    if (versions.length === 0) return null;
    if (version != null) return versions.find((r) => r.version === version) ?? null;
    return versions.reduce((a, b) => (b.version > a.version ? b : a));
  }

  async saveDraft(rule: Omit<DecisionRuleT, "status" | "createdAt"> & { status?: "draft" }) {
    const row: DecisionRuleT = DecisionRule.parse({
      ...rule,
      status: "draft",
      createdAt: new Date().toISOString(),
    });
    this.rows.push(row);
    return row;
  }

  async activate(ruleId: string, version: number) {
    const row = await this.get(ruleId, version);
    if (!row) throw new Error(`No rule ${ruleId} v${version}`);
    // Retire other active versions of the same id
    this.rows = this.rows.map((r) => {
      if (r.ruleId === ruleId && r.status === "active" && r.version !== version) {
        return { ...r, status: "retired" as const };
      }
      if (r.ruleId === ruleId && r.version === version) {
        return { ...r, status: "active" as const };
      }
      return r;
    });
    return (await this.get(ruleId, version))!;
  }

  async retire(ruleId: string, version: number) {
    const idx = this.rows.findIndex((r) => r.ruleId === ruleId && r.version === version);
    if (idx < 0) throw new Error(`No rule ${ruleId} v${version}`);
    this.rows[idx] = { ...this.rows[idx], status: "retired" };
    return this.rows[idx];
  }
}

class SupabaseDecisionRuleStore implements DecisionRuleStore {
  private async client() {
    const { createServerClient } = await import("@/lib/supabase");
    return createServerClient();
  }

  private rowToRule(row: Record<string, unknown>): DecisionRuleT {
    return DecisionRule.parse({
      ruleId: row.rule_id,
      version: row.version,
      status: row.status,
      definition: row.definition,
      createdAt: row.created_at,
    });
  }

  async listActive() {
    const sb = await this.client();
    const { data, error } = await sb
      .from("decision_rules")
      .select("*")
      .eq("status", "active")
      .order("rule_id")
      .order("version", { ascending: false });
    if (error) throw error;
    // Latest version per rule_id
    const best = new Map<string, DecisionRuleT>();
    for (const raw of data ?? []) {
      const r = this.rowToRule(raw);
      if (!best.has(r.ruleId)) best.set(r.ruleId, r);
    }
    // Fall back to seed when the table is empty (fresh deploy).
    if (best.size === 0) return SEED_DECISION_RULES.filter((r) => r.status === "active");
    return [...best.values()];
  }

  async listAll() {
    const sb = await this.client();
    const { data, error } = await sb.from("decision_rules").select("*").order("rule_id").order("version", { ascending: false });
    if (error) throw error;
    const rows = (data ?? []).map((r) => this.rowToRule(r));
    return rows.length > 0 ? rows : SEED_DECISION_RULES;
  }

  async get(ruleId: string, version?: number) {
    const sb = await this.client();
    let q = sb.from("decision_rules").select("*").eq("rule_id", ruleId);
    if (version != null) q = q.eq("version", version);
    else q = q.order("version", { ascending: false }).limit(1);
    const { data, error } = await q;
    if (error) throw error;
    if (!data?.length) {
      return SEED_DECISION_RULES.find((r) => r.ruleId === ruleId && (version == null || r.version === version)) ?? null;
    }
    return this.rowToRule(data[0]);
  }

  async saveDraft(rule: Omit<DecisionRuleT, "status" | "createdAt"> & { status?: "draft" }) {
    const sb = await this.client();
    const createdAt = new Date().toISOString();
    const { data, error } = await sb
      .from("decision_rules")
      .insert({
        rule_id: rule.ruleId,
        version: rule.version,
        status: "draft",
        definition: rule.definition,
        created_at: createdAt,
      })
      .select("*")
      .single();
    if (error) throw error;
    return this.rowToRule(data);
  }

  async activate(ruleId: string, version: number) {
    const sb = await this.client();
    await sb.from("decision_rules").update({ status: "retired" }).eq("rule_id", ruleId).eq("status", "active");
    const { data, error } = await sb
      .from("decision_rules")
      .update({ status: "active" })
      .eq("rule_id", ruleId)
      .eq("version", version)
      .select("*")
      .single();
    if (error) throw error;
    return this.rowToRule(data);
  }

  async retire(ruleId: string, version: number) {
    const sb = await this.client();
    const { data, error } = await sb
      .from("decision_rules")
      .update({ status: "retired" })
      .eq("rule_id", ruleId)
      .eq("version", version)
      .select("*")
      .single();
    if (error) throw error;
    return this.rowToRule(data);
  }
}

const g = globalThis as unknown as { __moidDecisionRules?: DecisionRuleStore };

export function getDecisionRuleStore(): DecisionRuleStore {
  if (g.__moidDecisionRules) return g.__moidDecisionRules;
  g.__moidDecisionRules = shouldUseSupabase()
    ? new SupabaseDecisionRuleStore()
    : new MemoryDecisionRuleStore();
  return g.__moidDecisionRules;
}

/** Test helper: reset to a fresh memory store with the given seed. */
export function resetDecisionRuleStoreForTests(seed?: DecisionRuleT[]): DecisionRuleStore {
  g.__moidDecisionRules = new MemoryDecisionRuleStore(seed ?? SEED_DECISION_RULES);
  return g.__moidDecisionRules;
}
