// Persistence interfaces (MOID-SPEC §11). Append-only. A memory adapter and a
// Supabase adapter both implement these; analytics/validation depend only on
// the interface, never the adapter.

import type { z } from "zod";
import type { CanonicalEvent } from "@/lib/contract/d1";
import type {
  Finding,
  Adjudication,
  RulebookRule,
  RuleApplication,
  FindingState,
  RulebookRuleStatus,
} from "@/lib/contract/d3";

export type Event = z.infer<typeof CanonicalEvent>;
export type FindingT = z.infer<typeof Finding>;
export type AdjudicationT = z.infer<typeof Adjudication>;
export type RulebookRuleT = z.infer<typeof RulebookRule>;
export type RuleApplicationT = z.infer<typeof RuleApplication>;
export type FindingStateT = z.infer<typeof FindingState>;
export type RulebookRuleStatusT = z.infer<typeof RulebookRuleStatus>;

export interface EventFilter {
  eventType?: Event["eventType"];
  stageId?: string;
  defectCode?: string;
  ingestionId?: string;
  /** occurredOn.start >= from (ISO date) */
  from?: string;
  /** occurredOn.end <= to (ISO date) */
  to?: string;
}

export interface EventStore {
  /** Idempotent: events whose eventId already exists are skipped, not duplicated. */
  append(events: Event[]): Promise<{ inserted: number; deduped: number }>;
  /** Effective set = all events minus those superseded by a Correction. */
  effective(filter?: EventFilter): Promise<Event[]>;
  byIds(ids: string[]): Promise<Event[]>;
  /** Wipe the entire ledger (operator "Clear Data" — destructive, full reset). */
  clear(): Promise<{ deleted: number }>;
}

export type FindingWithState = FindingT & { state: FindingStateT };

export interface FindingStore {
  /** Same findingId = no-op re-attach (no duplicate question on re-ingest). */
  upsert(findings: FindingT[]): Promise<void>;
  list(state?: FindingStateT): Promise<FindingWithState[]>;
  get(findingId: string): Promise<FindingWithState | null>;
  adjudicate(a: AdjudicationT): Promise<void>;
}

export interface RulebookStore {
  rules(status?: RulebookRuleStatusT): Promise<RulebookRuleT[]>;
  save(rule: RulebookRuleT): Promise<void>;
  recordApplication(app: RuleApplicationT): Promise<void>;
  applicationsFor(findingId: string): Promise<RuleApplicationT[]>;
}
