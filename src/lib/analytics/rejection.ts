// Core rejection selectors (plan 02). Deterministic; the only place these
// numbers are computed. Screens import these — never recompute inline.

import type { Event } from "@/lib/store/types";
import {
  type Scope,
  scopeEvents,
  periodBucket,
  periodLabel,
  periodsIn,
  policyOf,
} from "./scope";
import { DEFAULT_POLICY, type CalculationPolicyT } from "@/core/policy/policy";
import { STAGE_CATEGORY, pickEntryGate, stageSortKey } from "@/core/ontology/plant-catalog";

/** Structural catalog type — the caller's MOD catalog (or a test fixture). */
export type Registry = { stages: any[]; defects: any[]; sizes: any[]; fiscalYearStartMonth: number };

/** No catalog given → derive the stage list from the events themselves
 *  (first-appearance order). Never a hardcoded company (MOD v2 Phase 5). */
export const DERIVED_REGISTRY: Registry = { stages: [], defects: [], sizes: [], fiscalYearStartMonth: 4 };

/**
 * Stage list for every metric: the catalog's stages UNION the stages that
 * actually appear in the ledger.
 *
 * The catalog only knows what a verified MOD taught it — i.e. the Excel
 * workbooks, which cover the assembly gates (Visual/Balloon/Valve/Final).
 * Direct entry also writes upstream stages ("production", "secondary") that no
 * workbook ever described. Dropping those made the dashboard disagree with the
 * report; counting them is the precise figure.
 *
 * ponytail: event-only stages are PREPENDED — anything Excel never described is
 * upstream of the gates at this plant. If a downstream stage ever arrives the
 * same way, give the catalog an explicit order instead of guessing here.
 *
 * Derived stages are sorted by AUTHORED PROCESS ORDER, never by the order they
 * happen to appear in the ledger. With no verified MOD the registry is empty, so
 * *every* stage is derived and this list becomes the only order downstream code
 * has — ledger order put Primary Pack Inspection ahead of Visual and every
 * headline divided by the wrong gate.
 */
const stagesForCache = new WeakMap<Event[], WeakMap<Registry, { stageId: string; label?: string }[]>>();

export function stagesFor(events: Event[], registry: Registry = DERIVED_REGISTRY): { stageId: string; label?: string }[] {
  let byRegistry = stagesForCache.get(events);
  const hit = byRegistry?.get(registry);
  if (hit) return hit;

  const known = new Set(registry.stages.map((s: any) => s.stageId));
  const seen = new Set<string>();
  const derived: { stageId: string; label: string }[] = [];
  for (const e of events) {
    const id = stageOf(e);
    if (id && !known.has(id) && !seen.has(id)) {
      seen.add(id);
      derived.push({ stageId: id, label: id.replace(/[-_]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()) });
    }
  }
  derived.sort(
    (a, b) => stageSortKey(a.stageId) - stageSortKey(b.stageId) || a.stageId.localeCompare(b.stageId),
  );

  const result = [...derived, ...registry.stages];
  if (!byRegistry) stagesForCache.set(events, (byRegistry = new WeakMap()));
  byRegistry.set(registry, result);
  return result;
}

function qty(e: Event): number {
  return "quantity" in e ? (e.quantity as number) : 0;
}
const isProd = (e: Event) => e.eventType === "production";
const isRej = (e: Event) => e.eventType === "inspection" && (e as any).disposition === "rejected";
const isAcc = (e: Event) => e.eventType === "inspection" && (e as any).disposition === "accepted";
const isRew = (e: Event) => e.eventType === "inspection" && (e as any).disposition === "rework";

export interface StageAgg {
  checked: number;
  good: number;
  rework: number;
  rejected: number;
}

/** Sum the four disposition quantities over an event set. `rejected` falls back
 *  to per-defect rejection events when no stated inspection(rejected) exists.
 *
 *  A3 (`reworkCountsAs`): held/reworked units are pulled OUT of the flow at a
 *  gate, so by default they are not units that entered it. A plant that
 *  re-inspects and returns them to the same gate can count them as checked. */
export function aggregate(events: Event[], policy: CalculationPolicyT = DEFAULT_POLICY): StageAgg {
  let checked = 0, good = 0, rework = 0, rejected = 0, defectRej = 0;
  for (const e of events) {
    if (isProd(e)) checked += qty(e);
    else if (isRej(e)) rejected += qty(e);
    else if (isAcc(e)) good += qty(e);
    else if (isRew(e)) rework += qty(e);
    else if (e.eventType === "rejection") defectRej += qty(e);
  }
  if (rejected === 0 && defectRej > 0) rejected = defectRej;
  if (policy.reworkCountsAs === "checked") checked += rework;
  return { checked, good, rework, rejected };
}

export interface MetricValue {
  value: number;
  sourceEventIds: string[];
}

function ids(events: Event[], pred: (e: Event) => boolean): string[] {
  return events.filter(pred).map((e) => e.eventId);
}

const stageOf = (e: Event) => ("stageId" in e ? ((e as any).stageId as string) : null);

/**
 * Batch-aware stage aggregator with dynamic multi-stage yield input cascading.
 * If a batch's raw Stage 2 production event states initial batch lot size (e.g. 400),
 * but Stage 1 only passed forward 120 units, Stage 2's input denominator is dynamically
 * evaluated as 120 for accurate stage rejection rates.
 */
/** Memoized: the dashboard reaches this through rejectionRate, totalChecked,
 *  fpy and byStage on the SAME scoped array, and again per period inside every
 *  trend. Keyed on event-array AND registry identity (both objects, so entries
 *  are collectable), then on the only policy field that changes the result. */
const cascadeCache = new WeakMap<Event[], WeakMap<Registry, Map<string, Map<string, StageAgg>>>>();

function batchCascadedAgg(
  events: Event[],
  registry: Registry = DERIVED_REGISTRY,
  policy: CalculationPolicyT = DEFAULT_POLICY,
): Map<string, StageAgg> {
  let byRegistry = cascadeCache.get(events);
  if (!byRegistry) cascadeCache.set(events, (byRegistry = new WeakMap()));
  let byPolicy = byRegistry.get(registry);
  if (!byPolicy) byRegistry.set(registry, (byPolicy = new Map()));
  const cacheKey = policy.reworkCountsAs;
  const hit = byPolicy.get(cacheKey);
  if (hit) return hit;

  const stageList = stagesFor(events, registry).map((s) => s.stageId);
  const byStageResult = new Map<string, StageAgg>();
  for (const s of stageList) {
    byStageResult.set(s, { checked: 0, good: 0, rework: 0, rejected: 0 });
  }

  // One pass: batch -> stage -> events (and the unbatched remainder by stage).
  // This used to filter the whole event list once per stage, per batch.
  const byBatch = new Map<string, Map<string, Event[]>>();
  const unbatched = new Map<string, Event[]>();
  for (const e of events) {
    const sid = stageOf(e);
    if (!sid) continue;
    const b = "batchNo" in e ? (e as any).batchNo : (e as any).customFields?.batch;
    let target: Map<string, Event[]>;
    if (typeof b === "string" && b.trim()) {
      const k = b.trim();
      target = byBatch.get(k) ?? byBatch.set(k, new Map()).get(k)!;
    } else {
      target = unbatched;
    }
    const list = target.get(sid);
    if (list) list.push(e);
    else target.set(sid, [e]);
  }

  // Handle unbatched events normally
  for (const [sid, list] of unbatched) {
    const cur = byStageResult.get(sid);
    if (!cur) continue;
    const a = aggregate(list, policy);
    cur.checked += a.checked;
    cur.good += a.good;
    cur.rework += a.rework;
    cur.rejected += a.rejected;
  }

  // Handle batched events with cascading yield
  for (const [, stageEvents] of byBatch) {
    const presentStages = stageList.filter((sid) => stageEvents.has(sid));
    let initialBatchChecked = 0;
    let prevAccepted: number | null = null;

    for (let i = 0; i < presentStages.length; i++) {
      const sid = presentStages[i];
      const a = aggregate(stageEvents.get(sid)!, policy);
      if (i === 0) {
        initialBatchChecked = a.checked;
      }

      let checked = a.checked;
      let good = a.good > 0 ? a.good : Math.max(0, checked - a.rejected);

      if (i > 0 && prevAccepted != null && prevAccepted > 0) {
        if (checked === initialBatchChecked || checked === 0) {
          checked = prevAccepted;
          good = Math.max(0, checked - a.rejected);
        }
      }

      prevAccepted = good;

      const cur = byStageResult.get(sid);
      if (cur) {
        cur.checked += checked;
        cur.good += good;
        cur.rework += a.rework;
        cur.rejected += a.rejected;
      }
    }
  }

  byPolicy.set(cacheKey, byStageResult);
  return byStageResult;
}

/** Per-stage {checked, rejected, rate} in registry order, over an event set.
 *  The funnel must NOT be summed across stages — a unit inspected at Visual,
 *  Balloon, Valve and Final is the *same* unit, so a naïve Σ-checked across
 *  stages inflates the denominator ~4×. Each stage is aggregated independently
 *  here; headline metrics are composed from these per-stage numbers. */
function perStageAgg(
  events: Event[],
  registry: Registry,
  policy: CalculationPolicyT = DEFAULT_POLICY,
): { stageId: string; checked: number; rejected: number; rate: number }[] {
  const aggregatedMap = batchCascadedAgg(events, registry, policy);
  return stagesFor(events, registry).map((s) => {
    const a = aggregatedMap.get(s.stageId) ?? { checked: 0, good: 0, rework: 0, rejected: 0 };
    return { stageId: s.stageId, checked: a.checked, rejected: a.rejected, rate: a.checked > 0 ? a.rejected / a.checked : 0 };
  });
}

/**
 * Per-SECTION aggregate — the plant's real unit of computation.
 *
 * Primary, Secondary and Assembly are separate populations, not one sequential
 * line. The ledger proves it: Production checked 77,504 in a window where
 * Visual checked 176,838, and a sequential line cannot inspect more than it
 * made. Each section therefore carries its own denominator.
 *
 * Within a section:
 *   checked  = the section's ENTRY gate, chosen by the shared `pickEntryGate`.
 *              Assembly's gates ARE sequential — Visual's accepted units are
 *              what Balloon checks — so the section is measured once, at Visual.
 *   rejected = every gate in the section, summed. A unit scrapped at Visual and
 *              another at Final are two different units.
 *
 * Across sections nothing is shared: rates are computed per section and added.
 */
export interface SectionAgg {
  section: string;
  entryStageId: string | null;
  checked: number;
  rejected: number;
  rate: number;
}

export function bySection(
  events: Event[],
  scope: Scope,
  registry: Registry = DERIVED_REGISTRY,
): SectionAgg[] {
  const ev = scopeEvents(events, scope);
  const policy = policyOf(scope);
  const stages = perStageAgg(ev, registry, policy);

  const order: string[] = [];
  const acc = new Map<string, SectionAgg>();
  // stageId -> checked, per section, so the entry gate is chosen from the whole
  // section rather than from whichever gate the iteration reached first. That
  // "first with checked > 0" rule silently trusted array order; when the catalog
  // was empty the order came from the ledger and Assembly's denominator became a
  // 2,550-unit gate instead of Visual's 681,945.
  const checkedByStage = new Map<string, [string, number][]>();

  for (const s of stages) {
    // A stage the catalog doesn't classify is its own section — never silently
    // folded into someone else's denominator.
    const section = STAGE_CATEGORY[s.stageId] ?? s.stageId;
    let cur = acc.get(section);
    if (!cur) {
      cur = { section, entryStageId: null, checked: 0, rejected: 0, rate: 0 };
      acc.set(section, cur);
      order.push(section);
      checkedByStage.set(section, []);
    }
    checkedByStage.get(section)!.push([s.stageId, s.checked]);
    cur.rejected += s.rejected;
  }

  return order.map((k) => {
    const a = acc.get(k)!;
    const gates = checkedByStage.get(k)!;
    const entry = pickEntryGate(gates);
    const checked = entry ? (gates.find(([id]) => id === entry)?.[1] ?? 0) : 0;
    return {
      ...a,
      entryStageId: entry,
      checked,
      rate: checked > 0 ? a.rejected / checked : 0,
    };
  });
}

/**
 * Headline "Total Rejection %" — the plant's locked rule: each section's own
 * rejected ÷ its own checked, then the section rates add.
 *
 *   Assembly alone:     14,962 / 176,838                     = 8.46%
 *   Primary + Assembly: (757/77,504) + (14,962/176,838)      = 9.44%
 *
 * Not configurable; see the note at the top of `core/policy/policy.ts`.
 */
export function rejectionRate(events: Event[], scope: Scope, registry: Registry = DERIVED_REGISTRY): MetricValue {
  const ev = scopeEvents(events, scope);
  const value = bySection(events, scope, registry).reduce((sum, s) => sum + s.rate, 0);
  return { value, sourceEventIds: ids(ev, (e) => isProd(e) || isRej(e)) };
}

/**
 * The same rate, computed the way the plant's legacy YEARLY / REJECTION
 * ANALYSIS sheet did it: every gate against its own denominator, added. Counts
 * the Assembly funnel once per gate, so it always reads high.
 *
 * Exists ONLY so the drill-down can show "the old sheet said X" beside the real
 * number. Never wire this to a KPI.
 */
export function legacySumOfGateRates(
  events: Event[],
  scope: Scope,
  registry: Registry = DERIVED_REGISTRY,
): number {
  const ev = scopeEvents(events, scope);
  return perStageAgg(ev, registry, policyOf(scope)).reduce((sum, s) => sum + s.rate, 0);
}

/** Total rejected units across every stage (a raw count, not a rate). */
export function totalRejected(events: Event[], scope: Scope): MetricValue {
  const ev = scopeEvents(events, scope);
  return { value: aggregate(ev, policyOf(scope)).rejected, sourceEventIds: ids(ev, (e) => isRej(e) || e.eventType === "rejection") };
}

/**
 * Units that entered.
 *
 * Sections are separate populations (see `bySection`), so their entry counts
 * ADD: Primary 77,504 + Assembly 176,838 = 254,342. Within a section the gates
 * are sequential, so the section is still measured once, at its entry gate —
 * never Visual + Balloon + Valve + Final.
 *
 * "Entry" means first in catalog order (production, …, visual, balloon,
 * valve-fixing, valve-integrity, final), not first to appear in the ledger —
 * the ledger emits a batch's gates in arbitrary order.
 *
 * Total Rejected is summed unconditionally: a unit scrapped at Visual and
 * another at Final are two different units.
 */
export function totalChecked(events: Event[], scope: Scope, registry: Registry = DERIVED_REGISTRY): MetricValue {
  const ev = scopeEvents(events, scope);
  // Each section measured once at its own entry gate, then added — the
  // denominator `rejectionRate` divides by, so the two can never disagree.
  const sections = bySection(events, scope, registry);
  const entryIds = new Set(sections.map((s) => s.entryStageId).filter(Boolean) as string[]);
  return {
    value: sections.reduce((sum, s) => sum + s.checked, 0),
    sourceEventIds: ids(ev, (e) => isProd(e) && entryIds.has(stageOf(e) ?? "")),
  };
}

/** First Pass Yield = rolled-throughput yield Π(1 − stageRate) across stages —
 *  the fraction of entering units that pass every stage without rejection. */
export function fpy(events: Event[], scope: Scope, registry: Registry = DERIVED_REGISTRY): MetricValue {
  const ev = scopeEvents(events, scope);
  const stages = perStageAgg(ev, registry, policyOf(scope)).filter((s) => s.checked > 0);
  if (stages.length === 0) return { value: 1, sourceEventIds: [] };
  const value = stages.reduce((y, s) => y * (1 - s.rate), 1);
  return { value, sourceEventIds: ids(ev, (e) => isProd(e) || isRej(e)) };
}

export interface StageRow extends StageAgg {
  stageId: string;
  label: string;
  rejRate: number;
  yield: number;
  contributionPct: number;
}

/** Per-stage breakdown, ordered by registry stage order. */
export function byStage(events: Event[], scope: Scope, registry: Registry = DERIVED_REGISTRY): StageRow[] {
  const ev = scopeEvents(events, scope);
  const policy = policyOf(scope);
  const total = aggregate(ev, policy).rejected;
  const aggregatedMap = batchCascadedAgg(ev, registry, policy);
  return stagesFor(ev, registry)
    .map((s: any) => {
      const a = aggregatedMap.get(s.stageId) ?? { checked: 0, good: 0, rework: 0, rejected: 0 };
      return {
        stageId: s.stageId,
        label: s.label,
        ...a,
        rejRate: a.checked > 0 ? a.rejected / a.checked : 0,
        // Stage pass-through yield = the exact complement of the stage's
        // rejection rate: (checked − rejected) / checked = 1 − rejRate.
        yield: a.checked > 0 ? (a.checked - a.rejected) / a.checked : 1,
        contributionPct: total > 0 ? (a.rejected / total) * 100 : 0,
      };
    })
    .filter((r) => r.checked > 0 || r.rejected > 0);
}

export type StageActivityStatus = "has-records" | "no-qualifying-records";

export interface StageAnalysisRow {
  stageId: string;
  label: string;
  checked: number;
  rejected: number;
  rejRate: number | null;
  yield: number | null;
  contributionPct: number | null;
  rank: number | null;
  sourceEventCount: number;
  status: StageActivityStatus;
  unmapped?: boolean;
}

export interface StageAnalysis {
  rows: StageAnalysisRow[];
  rejectedDenominator: number;
  rejectedDenominatorNote: "stage rejected quantity / cumulative rejected quantity × 100";
  unmappedRejected: number;
  unmappedEventCount: number;
}

/**
 * Stage-wise report rows in authored catalog order, plus an unmapped row when
 * rejection/production events have no stageId. Contribution uses total rejected
 * in the analysis population (same denominator as byStage).
 */
export function stageAnalysis(
  events: Event[],
  scope: Scope,
  registry: Registry = DERIVED_REGISTRY,
): StageAnalysis {
  const ev = scopeEvents(events, scope);
  const policy = policyOf(scope);
  const active = byStage(events, scope, registry);
  const byId = new Map(active.map((r) => [r.stageId, r]));
  const totalRejectedQty = aggregate(ev, policy).rejected;

  const countByStage = new Map<string, number>();
  let unmappedRejected = 0;
  let unmappedEventCount = 0;
  for (const e of ev) {
    const sid = stageOf(e);
    if (!sid) {
      if (e.eventType === "production" || e.eventType === "inspection" || e.eventType === "rejection") {
        unmappedEventCount += 1;
        if (isRej(e) || e.eventType === "rejection") unmappedRejected += qty(e);
      }
      continue;
    }
    countByStage.set(sid, (countByStage.get(sid) ?? 0) + 1);
  }

  const ordered = stagesFor(ev, registry);
  const rows: StageAnalysisRow[] = ordered.map((s) => {
    const r = byId.get(s.stageId);
    if (!r) {
      return {
        stageId: s.stageId,
        label: s.label ?? s.stageId,
        checked: 0,
        rejected: 0,
        rejRate: null,
        yield: null,
        contributionPct: null,
        rank: null,
        sourceEventCount: countByStage.get(s.stageId) ?? 0,
        status: "no-qualifying-records",
      };
    }
    return {
      stageId: r.stageId,
      label: r.label || r.stageId,
      checked: r.checked,
      rejected: r.rejected,
      rejRate: r.checked > 0 ? r.rejRate : r.rejected > 0 ? null : 0,
      yield: r.checked > 0 ? r.yield : null,
      contributionPct: totalRejectedQty > 0 ? r.contributionPct : totalRejectedQty === 0 && r.rejected === 0 ? 0 : null,
      rank: null,
      sourceEventCount: countByStage.get(r.stageId) ?? 0,
      status: "has-records",
    };
  });

  if (unmappedEventCount > 0) {
    rows.push({
      stageId: "unmapped",
      label: "Unmapped / unknown stage",
      checked: 0,
      rejected: unmappedRejected,
      rejRate: null,
      yield: null,
      contributionPct: totalRejectedQty > 0 ? (unmappedRejected / totalRejectedQty) * 100 : null,
      rank: null,
      sourceEventCount: unmappedEventCount,
      status: "has-records",
      unmapped: true,
    });
  }

  const ranked = [...rows]
    .filter((r) => r.status === "has-records")
    .sort((a, b) => b.rejected - a.rejected);
  ranked.forEach((r, i) => {
    r.rank = i + 1;
  });

  return {
    rows,
    rejectedDenominator: totalRejectedQty,
    rejectedDenominatorNote: "stage rejected quantity / cumulative rejected quantity × 100",
    unmappedRejected,
    unmappedEventCount,
  };
}

export interface SeriesPoint { period: string; label: string; value: number; rejected?: number; checked?: number }

type MetricFn = (events: Event[], scope: Scope, registry?: Registry) => MetricValue;
const METRICS: Record<string, MetricFn> = { rejectionRate, totalRejected, totalChecked, fpy };

/** A metric bucketed over time by scope.grain. */
export function trend(events: Event[], scope: Scope, metric: keyof typeof METRICS = "rejectionRate", registry: Registry = DERIVED_REGISTRY): SeriesPoint[] {
  const ev = scopeEvents(events, scope);
  const fn = METRICS[metric];
  const periods = periodsIn(ev, scope.grain, { from: scope.dateFrom, to: scope.dateTo });
  // run the metric on the bucket with an unfiltered scope (already scoped).
  // Policy must survive — without it every trend point silently reverts to
  // the shipped defaults while the KPI above it uses the plant's policy.
  const sub = { grain: scope.grain, policy: scope.policy };
  return periods.map((p) => {
    const bucket = periodBucket(ev, scope.grain, p);
    return {
      period: p,
      label: periodLabel(p),
      value: fn(bucket, sub, registry).value,
      rejected: totalRejected(bucket, sub).value,
      checked: totalChecked(bucket, sub, registry).value,
    };
  });
}

export interface StageTrendPoint { period: string; label: string; perStage: Record<string, number>; counts?: Record<string, { rejected: number; checked: number }> }

/** Per-stage rejection-rate series over time.
 *
 *  Memoized: `cumulativeStageTrend` wraps this, and the dashboard renders both,
 *  so the same series was built twice per render. */
const stageTrendCache = new WeakMap<Event[], WeakMap<Registry, Map<string, StageTrendPoint[]>>>();

export function stageTrend(events: Event[], scope: Scope, registry: Registry = DERIVED_REGISTRY): StageTrendPoint[] {
  const ev = scopeEvents(events, scope);
  const policy = policyOf(scope);
  const cacheKey = `${scope.grain}|${scope.dateFrom ?? ""}|${scope.dateTo ?? ""}|${policy.reworkCountsAs}`;
  let byRegistry = stageTrendCache.get(ev);
  if (!byRegistry) stageTrendCache.set(ev, (byRegistry = new WeakMap()));
  let byKey = byRegistry.get(registry);
  if (!byKey) byRegistry.set(registry, (byKey = new Map()));
  const hit = byKey.get(cacheKey);
  if (hit) return hit;

  const periods = periodsIn(ev, scope.grain, { from: scope.dateFrom, to: scope.dateTo });
  const result = periods.map((p) => {
    const bucket = periodBucket(ev, scope.grain, p);
    // Group the bucket by stage once instead of re-filtering it per stage.
    const byStageEvents = new Map<string, Event[]>();
    for (const e of bucket) {
      const sid = stageOf(e);
      if (!sid) continue;
      const list = byStageEvents.get(sid);
      if (list) list.push(e);
      else byStageEvents.set(sid, [e]);
    }
    const perStage: Record<string, number> = {};
    const counts: Record<string, { rejected: number; checked: number }> = {};
    for (const s of registry.stages) {
      const a = aggregate(byStageEvents.get(s.stageId) ?? [], policy);
      perStage[s.stageId] = a.checked > 0 ? a.rejected / a.checked : 0;
      counts[s.stageId] = { rejected: a.rejected, checked: a.checked };
    }
    return { period: p, label: periodLabel(p), perStage, counts };
  });

  byKey.set(cacheKey, result);
  return result;
}

/** Weekly rejection-rate trend within the scoped window (week-of-month). */
export function weeklyTrend(events: Event[], scope: Scope, registry: Registry = DERIVED_REGISTRY): SeriesPoint[] {
  return trend(events, { ...scope, grain: "week" }, "rejectionRate", registry);
}

/** Series key for the additive cumulative-total line in `cumulativeStageTrend`. */
export const CUM_TOTAL_KEY = "__total";

/**
 * The COMMULATIVE-sheet chart: per-stage rejection-rate lines PLUS an additive
 * "Total" line = the per-period SUM of the stage rates (each stage over its own
 * denominator), matching the operator's "Total Rejection %" column. Recomputed
 * from raw events — never read from the spreadsheet's % or total cells.
 */
export function cumulativeStageTrend(
  events: Event[],
  scope: Scope,
  registry: Registry = DERIVED_REGISTRY,
): StageTrendPoint[] {
  return stageTrend(events, scope, registry).map((pt) => {
    const total = registry.stages.reduce((sum, s) => sum + (pt.perStage[s.stageId] ?? 0), 0);
    const totRej = registry.stages.reduce((sum, s) => sum + (pt.counts?.[s.stageId]?.rejected ?? 0), 0);
    const totChk = registry.stages.reduce((sum, s) => sum + (pt.counts?.[s.stageId]?.checked ?? 0), 0);
    return {
      ...pt,
      perStage: { ...pt.perStage, [CUM_TOTAL_KEY]: total },
      counts: { ...(pt.counts ?? {}), [CUM_TOTAL_KEY]: { rejected: totRej, checked: totChk } },
    };
  });
}

export interface StageSizeCell { stageId: string; stageLabel: string; size: string; checked: number; rejected: number; rejRate: number }

/** Cross-tab of stage × size rejection rate ("where are problems concentrated").
 *  [] when no size-tagged events exist for a stage — callers should render an
 *  honest empty-state rather than fabricate cells. */
export function stageBySize(events: Event[], scope: Scope, registry: Registry = DERIVED_REGISTRY): StageSizeCell[] {
  const ev = scopeEvents(events, scope).filter((e) => "size" in e && (e as any).size);
  if (ev.length === 0) return [];
  const map = new Map<string, { stageId: string; size: string; checked: number; rejected: number }>();
  for (const e of ev) {
    const stageId = stageOf(e);
    const size = (e as any).size as string;
    if (!stageId) continue;
    const key = `${stageId}::${size}`;
    const cur = map.get(key) ?? { stageId, size, checked: 0, rejected: 0 };
    if (isProd(e)) cur.checked += qty(e);
    else if (isRej(e)) cur.rejected += qty(e);
    map.set(key, cur);
  }
  const labelOf = (stageId: string) => registry.stages.find((s) => s.stageId === stageId)?.label ?? stageId;
  const order = registry.stages.map((s) => s.stageId);
  return [...map.values()]
    .map((v) => ({
      stageId: v.stageId,
      stageLabel: labelOf(v.stageId),
      size: v.size,
      checked: v.checked,
      rejected: v.rejected,
      rejRate: v.checked > 0 ? v.rejected / v.checked : 0,
    }))
    .sort((a, b) => {
      const so = order.indexOf(a.stageId) - order.indexOf(b.stageId);
      return so !== 0 ? so : a.size.localeCompare(b.size);
    });
}
