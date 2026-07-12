// Core rejection selectors (plan 02). Deterministic; the only place these
// numbers are computed. Screens import these — never recompute inline.

import type { Event } from "@/lib/store/types";
import { type Scope, scopeEvents, periodKey, periodLabel, periodsIn } from "./scope";

/** Structural catalog type — the caller's MOD catalog (or a test fixture). */
export type Registry = { stages: any[]; defects: any[]; sizes: any[]; fiscalYearStartMonth: number };

/** No catalog given → derive the stage list from the events themselves
 *  (first-appearance order). Never a hardcoded company (MOD v2 Phase 5). */
export const DERIVED_REGISTRY: Registry = { stages: [], defects: [], sizes: [], fiscalYearStartMonth: 4 };

function stagesFor(events: Event[], registry: Registry = DERIVED_REGISTRY): { stageId: string; label?: string }[] {
  if (registry.stages.length > 0) return registry.stages;
  const seen = new Set<string>();
  const out: { stageId: string }[] = [];
  for (const e of events) {
    const id = stageOf(e);
    if (id && !seen.has(id)) { seen.add(id); out.push({ stageId: id }); }
  }
  return out;
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
 *  to per-defect rejection events when no stated inspection(rejected) exists. */
export function aggregate(events: Event[]): StageAgg {
  let checked = 0, good = 0, rework = 0, rejected = 0, defectRej = 0;
  for (const e of events) {
    if (isProd(e)) checked += qty(e);
    else if (isRej(e)) rejected += qty(e);
    else if (isAcc(e)) good += qty(e);
    else if (isRew(e)) rework += qty(e);
    else if (e.eventType === "rejection") defectRej += qty(e);
  }
  if (rejected === 0 && defectRej > 0) rejected = defectRej;
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

/** Per-stage {checked, rejected, rate} in registry order, over an event set.
 *  The funnel must NOT be summed across stages — a unit inspected at Visual,
 *  Balloon, Valve and Final is the *same* unit, so a naïve Σ-checked across
 *  stages inflates the denominator ~4×. Each stage is aggregated independently
 *  here; headline metrics are composed from these per-stage numbers. */
function perStageAgg(
  events: Event[],
  registry: Registry
): { stageId: string; checked: number; rejected: number; rate: number }[] {
  return stagesFor(events, registry).map((s) => {
    const a = aggregate(events.filter((e) => stageOf(e) === s.stageId));
    return { stageId: s.stageId, checked: a.checked, rejected: a.rejected, rate: a.checked > 0 ? a.rejected / a.checked : 0 };
  });
}

/** Headline "Total Rejection %" — the client convention: the SUM of each
 *  stage's own rejection rate (Visual% + Balloon% + Valve% + Final%), matching
 *  the totals on their REJECTION ANALYSIS / YEARLY sheets. This is a funnel-loss
 *  figure, NOT overall rejected÷checked. */
export function rejectionRate(events: Event[], scope: Scope, registry: Registry = DERIVED_REGISTRY): MetricValue {
  const ev = scopeEvents(events, scope);
  const stages = perStageAgg(ev, registry);
  const value = stages.reduce((sum, s) => sum + s.rate, 0);
  return { value, sourceEventIds: ids(ev, (e) => isProd(e) || isRej(e)) };
}

/** Total rejected units across every stage (a raw count, not a rate). */
export function totalRejected(events: Event[], scope: Scope): MetricValue {
  const ev = scopeEvents(events, scope);
  return { value: aggregate(ev).rejected, sourceEventIds: ids(ev, (e) => isRej(e) || e.eventType === "rejection") };
}

/** Units that entered the line = the ENTRY stage's checked qty (first registry
 *  stage with data — Visual). NOT Σ-checked across stages (that quadruple-counts
 *  the same physical units). */
export function totalChecked(events: Event[], scope: Scope, registry: Registry = DERIVED_REGISTRY): MetricValue {
  const ev = scopeEvents(events, scope);
  const stages = perStageAgg(ev, registry);
  const entry = stages.find((s) => s.checked > 0);
  return {
    value: entry?.checked ?? 0,
    sourceEventIds: ids(ev, (e) => isProd(e) && stageOf(e) === (entry?.stageId ?? null)),
  };
}

/** First Pass Yield = rolled-throughput yield Π(1 − stageRate) across stages —
 *  the fraction of entering units that pass every stage without rejection. */
export function fpy(events: Event[], scope: Scope, registry: Registry = DERIVED_REGISTRY): MetricValue {
  const ev = scopeEvents(events, scope);
  const stages = perStageAgg(ev, registry).filter((s) => s.checked > 0);
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
  const total = aggregate(ev).rejected;
  return stagesFor(ev, registry)
    .map((s: any) => {
      const a = aggregate(ev.filter((e) => "stageId" in e && (e as any).stageId === s.stageId));
      return {
        stageId: s.stageId,
        label: s.label,
        ...a,
        rejRate: a.checked > 0 ? a.rejected / a.checked : 0,
        // Stage pass-through yield = the exact complement of the stage's
        // rejection rate: (checked − rejected) / checked = 1 − rejRate. Do NOT
        // use `a.good` here — accepted events are only partially captured by the
        // parsers (most rows carry checked + rejected but no explicit accepted),
        // so `(a.good || …)` would divide a tiny partial good-count by full
        // checked and report ~0% yield for a stage that actually passed ~94%.
        yield: a.checked > 0 ? (a.checked - a.rejected) / a.checked : 1,
        contributionPct: total > 0 ? (a.rejected / total) * 100 : 0,
      };
    })
    .filter((r) => r.checked > 0 || r.rejected > 0);
}

export interface SeriesPoint { period: string; label: string; value: number; rejected?: number; checked?: number }

type MetricFn = (events: Event[], scope: Scope, registry?: Registry) => MetricValue;
const METRICS: Record<string, MetricFn> = { rejectionRate, totalRejected, totalChecked, fpy };

/** A metric bucketed over time by scope.grain. */
export function trend(events: Event[], scope: Scope, metric: keyof typeof METRICS = "rejectionRate", registry: Registry = DERIVED_REGISTRY): SeriesPoint[] {
  const ev = scopeEvents(events, scope);
  const fn = METRICS[metric];
  const periods = periodsIn(ev, scope.grain, { from: scope.dateFrom, to: scope.dateTo });
  return periods.map((p) => {
    const bucket = ev.filter((e) => periodKey(e.occurredOn.start, scope.grain) === p);
    // run the metric on the bucket with an unfiltered scope (already scoped)
    const sub = { grain: scope.grain };
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

/** Per-stage rejection-rate series over time. */
export function stageTrend(events: Event[], scope: Scope, registry: Registry = DERIVED_REGISTRY): StageTrendPoint[] {
  const ev = scopeEvents(events, scope);
  const periods = periodsIn(ev, scope.grain, { from: scope.dateFrom, to: scope.dateTo });
  return periods.map((p) => {
    const bucket = ev.filter((e) => periodKey(e.occurredOn.start, scope.grain) === p);
    const perStage: Record<string, number> = {};
    const counts: Record<string, { rejected: number; checked: number }> = {};
    for (const s of registry.stages) {
      const a = aggregate(bucket.filter((e) => "stageId" in e && (e as any).stageId === s.stageId));
      perStage[s.stageId] = a.checked > 0 ? a.rejected / a.checked : 0;
      counts[s.stageId] = { rejected: a.rejected, checked: a.checked };
    }
    return { period: p, label: periodLabel(p), perStage, counts };
  });
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
