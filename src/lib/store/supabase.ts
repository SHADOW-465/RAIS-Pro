// src/lib/store/supabase.ts
// Supabase database client store adapter (MOID-SPEC §11).
//

import { createServerClient } from "../supabase";
import type {
  EventStore,
  FindingStore,
  RulebookStore,
  Event,
  EventFilter,
  FindingT,
  AdjudicationT,
  RulebookRuleT,
  RuleApplicationT,
  FindingStateT,
  FindingWithState,
  RulebookRuleStatusT,
} from "./types";
import { getPayload, mapRowToEvent, mapRowToFinding, mapRowToRule } from "./supabase-mappers";
import { chunk } from "./batch";

function stageOf(e: Event): string | null {
  return "stageId" in e ? (e.stageId as string) : null;
}

function defectOf(e: Event): string | null {
  return "defectCode" in e ? ((e.defectCode as string | null) ?? null) : null;
}

export class SupabaseEventStore implements EventStore {
  private get client() {
    return createServerClient();
  }

  async append(events: Event[]): Promise<{ inserted: number; deduped: number }> {
    if (events.length === 0) return { inserted: 0, deduped: 0 };

    // Idempotence: find which ids already exist. Chunk the .in() filter so the
    // query string stays under PostgREST's URL limit (large .in() → Bad Request).
    const SELECT_BATCH = 100;
    const eventIds = events.map((e) => e.eventId);
    const existingSet = new Set<string>();
    for (const idsBatch of chunk(eventIds, SELECT_BATCH)) {
      const { data: existing, error: fetchError } = await this.client
        .from("events")
        .select("event_id")
        .in("event_id", idsBatch);
      if (fetchError) throw fetchError;
      for (const x of existing || []) existingSet.add(x.event_id);
    }

    const toInsert = events.filter((e) => !existingSet.has(e.eventId));
    if (toInsert.length === 0) {
      return { inserted: 0, deduped: events.length };
    }

    const rows = toInsert.map((e) => ({
      event_id: e.eventId,
      schema_version: e.schemaVersion,
      ingestion_id: e.ingestionId,
      event_type: e.eventType,
      occurred_on: e.occurredOn,
      provenance: e.provenance,
      confidence: e.confidence,
      extracted_by: e.extractedBy,
      recorded_at: e.recordedAt,
      superseded_by: e.supersededBy,
      provenance_file: e.provenance.provenance_file ?? null,
      provenance_coordinate: e.provenance.provenance_coordinate ?? null,
      provenance_hash: e.provenance.provenance_hash ?? null,
      is_direct_entry: e.provenance.is_direct_entry ?? false,
      payload: getPayload(e),
    }));

    // Chunk inserts so the request body stays under the size limit
    // (one large insert → "fetch failed").
    const INSERT_BATCH = 500;
    for (const rowsBatch of chunk(rows, INSERT_BATCH)) {
      const { error: insertError } = await this.client.from("events").upsert(rowsBatch, { onConflict: "event_id" });
      if (insertError) throw insertError;
    }

    return { inserted: toInsert.length, deduped: events.length - toInsert.length };
  }

  async effective(filter: EventFilter = {}): Promise<Event[]> {
    const PAGE = 1000;

    // Page through ALL rows of a base query (PostgREST caps a single select at
    // 1000 rows; without ranging we'd silently truncate the ledger).
    const fetchAll = async (
      build: () => any,
    ): Promise<any[]> => {
      const all: any[] = [];
      for (let from = 0; ; from += PAGE) {
        const { data, error } = await build().range(from, from + PAGE - 1);
        if (error) throw error;
        const batch = data || [];
        all.push(...batch);
        if (batch.length < PAGE) break;
      }
      return all;
    };

    // Effective set = events not superseded by corrections.
    const corrections = await fetchAll(() =>
      this.client
        .from("events")
        .select("payload")
        .eq("event_type", "correction")
        .order("recorded_at", { ascending: true }),
    );
    const superseded = new Set<string>();
    for (const c of corrections) {
      const payload = c.payload as { supersedesEventId?: string };
      if (payload?.supersedesEventId) superseded.add(payload.supersedesEventId);
    }

    const rows = await fetchAll(() => {
      let q = this.client.from("events").select("*");
      if (filter.eventType) q = q.eq("event_type", filter.eventType);
      if (filter.ingestionId) q = q.eq("ingestion_id", filter.ingestionId);
      q = q.order("recorded_at", { ascending: true });
      return q;
    });

    const events: Event[] = rows.map(mapRowToEvent);

    return events.filter((e) => {
      if (superseded.has(e.eventId)) return false;
      if (filter.stageId && stageOf(e) !== filter.stageId) return false;
      if (filter.defectCode && defectOf(e) !== filter.defectCode) return false;
      if (filter.from && e.occurredOn.start < filter.from) return false;
      if (filter.to && e.occurredOn.end > filter.to) return false;
      return true;
    });
  }

  async byIds(ids: string[]): Promise<Event[]> {
    if (ids.length === 0) return [];
    const out: Event[] = [];
    for (const idsBatch of chunk(ids, 100)) {
      const { data: rows, error } = await this.client
        .from("events")
        .select("*")
        .in("event_id", idsBatch);
      if (error) throw error;
      out.push(...(rows || []).map(mapRowToEvent));
    }
    return out;
  }
}

export class SupabaseFindingStore implements FindingStore {
  constructor(private rulebook?: RulebookStore) {}

  private get client() {
    return createServerClient();
  }

  async upsert(findings: FindingT[]): Promise<void> {
    if (findings.length === 0) return;
    
    const findingIds = findings.map((f) => f.findingId);
    const existingSet = new Set<string>();
    for (const idsBatch of chunk(findingIds, 100)) {
      const { data: existing, error: fetchError } = await this.client
        .from("findings")
        .select("finding_id")
        .in("finding_id", idsBatch);
        
      if (fetchError) throw fetchError;
      for (const x of existing || []) existingSet.add(x.finding_id);
    }
    
    const toInsert = findings.filter((f) => !existingSet.has(f.findingId));
    
    if (toInsert.length === 0) return;
    
    const rows = toInsert.map((f) => ({
      finding_id: f.findingId,
      schema_version: f.schemaVersion,
      ingestion_id: f.ingestionId,
      rule_id: f.ruleId,
      subtype: f.subtype,
      severity: f.severity,
      question: f.question,
      detail: f.detail,
      evidence: f.evidence,
      hypotheses: f.hypotheses,
      requires_gm_authority: f.requiresGmAuthority,
      occurred_on: f.occurredOn,
      recorded_at: f.recordedAt,
    }));
    
    const INSERT_BATCH = 500;
    for (const rowsBatch of chunk(rows, INSERT_BATCH)) {
      const { error: insertError } = await this.client.from("findings").insert(rowsBatch);
      if (insertError) throw insertError;
    }
  }

  async adjudicate(a: AdjudicationT): Promise<void> {
    const row = {
      adjudication_id: a.adjudicationId,
      finding_id: a.findingId,
      verdict: a.verdict,
      why: a.why,
      author: a.author,
      is_recommendation: a.isRecommendation,
      correction_event_id: a.correctionEventId,
      recorded_at: a.recordedAt,
    };
    const { error } = await this.client.from("adjudications").insert(row);
    if (error) throw error;
  }

  private async deriveState(findingId: string): Promise<FindingStateT> {
    const apps = (await this.rulebook?.applicationsFor(findingId)) ?? [];
    if (apps.length > 0) return "rule-compiled";
    
    const { data: adjudications, error } = await this.client
      .from("adjudications")
      .select("*")
      .eq("finding_id", findingId)
      .eq("is_recommendation", false);
      
    if (error) throw error;
    
    if (!adjudications || adjudications.length === 0) return "open";
    
    const last = adjudications[adjudications.length - 1];
    if (last.verdict === "unsure") return "open";
    return "adjudicated";
  }

  async get(findingId: string): Promise<FindingWithState | null> {
    const { data: row, error } = await this.client
      .from("findings")
      .select("*")
      .eq("finding_id", findingId)
      .single();
      
    if (error) return null;
    
    const f = mapRowToFinding(row);
    const state = await this.deriveState(f.findingId);
    return { ...f, state };
  }

  async list(state?: FindingStateT): Promise<FindingWithState[]> {
    const { data: rows, error } = await this.client.from("findings").select("*");
    if (error) throw error;
    
    const out: FindingWithState[] = [];
    for (const r of rows || []) {
      const f = mapRowToFinding(r);
      const s = await this.deriveState(f.findingId);
      if (!state || s === state) {
        out.push({ ...f, state: s });
      }
    }
    
    const sev = { critical: 0, warning: 1, info: 2 } as const;
    return out.sort(
      (a, b) =>
        sev[a.severity] - sev[b.severity] ||
        (b.evidence.magnitude ?? 0) - (a.evidence.magnitude ?? 0)
    );
  }
}

export class SupabaseRulebookStore implements RulebookStore {
  private get client() {
    return createServerClient();
  }

  async rules(status?: RulebookRuleStatusT): Promise<RulebookRuleT[]> {
    let query = this.client.from("rulebook_rules").select("*");
    if (status) query = query.eq("status", status);
    
    const { data: rows, error } = await query;
    if (error) throw error;
    
    return (rows || []).map(mapRowToRule);
  }

  async save(rule: RulebookRuleT): Promise<void> {
    const row = {
      rulebook_rule_id: rule.rulebookRuleId,
      version: rule.version,
      status: rule.status,
      predicate: rule.predicate,
      action: rule.action,
      rationale: rule.rationale,
      born_from_adjudication_ids: rule.bornFromAdjudicationIds,
      drafted_by: rule.draftedBy,
      activated_by: rule.activatedBy,
      created_at: rule.createdAt,
      retired_at: rule.retiredAt,
    };
    
    const { error } = await this.client
      .from("rulebook_rules")
      .upsert(row, { onConflict: "rulebook_rule_id" });
      
    if (error) throw error;
  }

  async recordApplication(app: RuleApplicationT): Promise<void> {
    const row = {
      rulebook_rule_id: app.rulebookRuleId,
      rule_version: app.ruleVersion,
      finding_id: app.findingId,
      ingestion_id: app.ingestionId,
      applied_at: app.appliedAt,
    };
    const { error } = await this.client.from("rule_applications").insert(row);
    if (error) throw error;
  }

  async applicationsFor(findingId: string): Promise<RuleApplicationT[]> {
    const { data: rows, error } = await this.client
      .from("rule_applications")
      .select("*")
      .eq("finding_id", findingId);
      
    if (error) throw error;
    
    return (rows || []).map((r) => ({
      rulebookRuleId: r.rulebook_rule_id,
      ruleVersion: r.rule_version,
      findingId: r.finding_id,
      ingestionId: r.ingestion_id,
      appliedAt: r.applied_at,
    }));
  }
}
