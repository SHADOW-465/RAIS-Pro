// src/lib/store/supabase-mappers.ts
// Pure row<->domain mappers shared by the Supabase adapter. No client, no I/O —
// so they are unit-testable. The DB stores the canonical envelope as columns and
// all domain-specific fields inside the JSONB `payload`.

import type { Event, FindingT, RulebookRuleT } from "./types";

/** Strip the canonical envelope, leaving only the event-type-specific fields. */
export function getPayload(e: Event): Record<string, unknown> {
  const {
    eventId, schemaVersion, ingestionId, occurredOn, provenance, confidence,
    extractedBy, recordedAt, supersededBy, eventType, ...rest
  } = e as Record<string, unknown> & Event;
  void eventId; void schemaVersion; void ingestionId; void occurredOn;
  void provenance; void confidence; void extractedBy; void recordedAt;
  void supersededBy; void eventType;
  return rest;
}

export function mapRowToEvent(r: any): Event {
  return {
    eventId: r.event_id,
    schemaVersion: r.schema_version,
    ingestionId: r.ingestion_id,
    eventType: r.event_type as any,
    occurredOn: r.occurred_on,
    provenance: r.provenance,
    confidence: r.confidence,
    extractedBy: r.extracted_by,
    recordedAt: r.recorded_at,
    supersededBy: r.superseded_by,
    ...r.payload,
  } as any;
}

export function mapRowToFinding(r: any): FindingT {
  return {
    findingId: r.finding_id,
    schemaVersion: r.schema_version,
    ingestionId: r.ingestion_id,
    ruleId: r.rule_id as any,
    subtype: r.subtype,
    severity: r.severity as any,
    question: r.question,
    detail: r.detail,
    evidence: r.evidence,
    hypotheses: r.hypotheses,
    requiresGmAuthority: r.requires_gm_authority,
    occurredOn: r.occurred_on,
    recordedAt: r.recorded_at,
  };
}

export function mapRowToRule(r: any): RulebookRuleT {
  return {
    rulebookRuleId: r.rulebook_rule_id,
    version: r.version,
    status: r.status as any,
    predicate: r.predicate,
    action: r.action,
    rationale: r.rationale,
    bornFromAdjudicationIds: r.born_from_adjudication_ids,
    draftedBy: r.drafted_by,
    activatedBy: r.activated_by as any,
    createdAt: r.created_at,
    retiredAt: r.retired_at,
  };
}
