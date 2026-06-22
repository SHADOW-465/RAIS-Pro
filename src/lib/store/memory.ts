// In-memory, append-only store adapter (MOID-SPEC §11).
// Used by tests and local-first dev. The Supabase adapter implements the same
// interfaces; analytics/validation never see which one they're talking to.

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

function stageOf(e: Event): string | null {
  return "stageId" in e ? (e.stageId as string) : null;
}
function defectOf(e: Event): string | null {
  return "defectCode" in e ? ((e.defectCode as string | null) ?? null) : null;
}

export class MemoryEventStore implements EventStore {
  private byId = new Map<string, Event>();

  async append(events: Event[]): Promise<{ inserted: number; deduped: number }> {
    let inserted = 0;
    let deduped = 0;
    for (const e of events) {
      if (this.byId.has(e.eventId)) {
        deduped++; // identical content hash → idempotent re-ingest
        continue;
      }
      this.byId.set(e.eventId, e);
      inserted++;
    }
    return { inserted, deduped };
  }

  /** ids superseded by some Correction event's supersedesEventId. */
  private supersededIds(): Set<string> {
    const set = new Set<string>();
    for (const e of this.byId.values()) {
      if (e.eventType === "correction") set.add(e.supersedesEventId);
    }
    return set;
  }

  async effective(filter: EventFilter = {}): Promise<Event[]> {
    const superseded = this.supersededIds();
    const out: Event[] = [];
    for (const e of this.byId.values()) {
      if (superseded.has(e.eventId)) continue;
      if (filter.eventType && e.eventType !== filter.eventType) continue;
      if (filter.ingestionId && e.ingestionId !== filter.ingestionId) continue;
      if (filter.stageId && stageOf(e) !== filter.stageId) continue;
      if (filter.defectCode && defectOf(e) !== filter.defectCode) continue;
      if (filter.from && e.occurredOn.start < filter.from) continue;
      if (filter.to && e.occurredOn.end > filter.to) continue;
      out.push(e);
    }
    return out;
  }

  async byIds(ids: string[]): Promise<Event[]> {
    return ids.map((id) => this.byId.get(id)).filter((e): e is Event => !!e);
  }

  async clear(): Promise<{ deleted: number }> {
    const deleted = this.byId.size;
    this.byId.clear();
    return { deleted };
  }

  /** test/debug helper */
  get size(): number {
    return this.byId.size;
  }
}

export class MemoryRulebookStore implements RulebookStore {
  private _rules = new Map<string, RulebookRuleT>();
  private _apps: RuleApplicationT[] = [];

  async rules(status?: RulebookRuleStatusT): Promise<RulebookRuleT[]> {
    const all = [...this._rules.values()];
    return status ? all.filter((r) => r.status === status) : all;
  }
  async save(rule: RulebookRuleT): Promise<void> {
    this._rules.set(rule.rulebookRuleId, rule);
  }
  async recordApplication(app: RuleApplicationT): Promise<void> {
    this._apps.push(app);
  }
  async applicationsFor(findingId: string): Promise<RuleApplicationT[]> {
    return this._apps.filter((a) => a.findingId === findingId);
  }
}

export class MemoryFindingStore implements FindingStore {
  private byId = new Map<string, FindingT>();
  private adjudications = new Map<string, AdjudicationT[]>();

  constructor(private rulebook?: RulebookStore) {}

  async upsert(findings: FindingT[]): Promise<void> {
    for (const f of findings) {
      if (!this.byId.has(f.findingId)) this.byId.set(f.findingId, f); // re-attach, no duplicate
    }
  }

  async adjudicate(a: AdjudicationT): Promise<void> {
    const list = this.adjudications.get(a.findingId) ?? [];
    list.push(a);
    this.adjudications.set(a.findingId, list);
  }

  private async deriveState(findingId: string): Promise<FindingStateT> {
    // rule-compiled wins: an active rule auto-answered it.
    const apps = (await this.rulebook?.applicationsFor(findingId)) ?? [];
    if (apps.length > 0) return "rule-compiled";

    const adj = (this.adjudications.get(findingId) ?? []).filter((x) => !x.isRecommendation);
    if (adj.length === 0) return "open";
    // latest settling verdict
    const last = adj[adj.length - 1];
    if (last.verdict === "unsure") return "open"; // parked, still needs an answer
    return "adjudicated";
  }

  async get(findingId: string): Promise<FindingWithState | null> {
    const f = this.byId.get(findingId);
    if (!f) return null;
    return { ...f, state: await this.deriveState(findingId) };
  }

  async list(state?: FindingStateT): Promise<FindingWithState[]> {
    const out: FindingWithState[] = [];
    for (const f of this.byId.values()) {
      const s = await this.deriveState(f.findingId);
      if (!state || s === state) out.push({ ...f, state: s });
    }
    // critical first, then by magnitude desc
    const sev = { critical: 0, warning: 1, info: 2 } as const;
    return out.sort(
      (a, b) =>
        sev[a.severity] - sev[b.severity] ||
        (b.evidence.magnitude ?? 0) - (a.evidence.magnitude ?? 0)
    );
  }
}
