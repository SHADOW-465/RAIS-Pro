// Core rejection selectors (plan 02). Deterministic; the only place these
// numbers are computed. Screens import these — never recompute inline.

import type { Event } from "@/lib/store/types";
import { DISPOSAFE_REGISTRY } from "@/lib/registry/disposafe";
import { type Scope, type Grain, scopeEvents, periodKey, periodLabel, periodsIn } from "./scope";

type Registry = typeof DISPOSAFE_REGISTRY;

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

export function rejectionRate(events: Event[], scope: Scope): MetricValue {
  const ev = scopeEvents(events, scope);
  const a = aggregate(ev);
  return {
    value: a.checked > 0 ? a.rejected / a.checked : 0,
    sourceEventIds: ids(ev, (e) => isProd(e) || isRej(e) || e.eventType === "rejection"),
  };
}

export function totalRejected(events: Event[], scope: Scope): MetricValue {
  const ev = scopeEvents(events, scope);
  return { value: aggregate(ev).rejected, sourceEventIds: ids(ev, (e) => isRej(e) || e.eventType === "rejection") };
}

export function totalChecked(events: Event[], scope: Scope): MetricValue {
  const ev = scopeEvents(events, scope);
  return { value: aggregate(ev).checked, sourceEventIds: ids(ev, isProd) };
}

/** First Pass Yield. Uses accepted-good events when present; else 1 − rejection rate. */
export function fpy(events: Event[], scope: Scope): MetricValue {
  const ev = scopeEvents(events, scope);
  const a = aggregate(ev);
  if (a.checked === 0) return { value: 1, sourceEventIds: [] };
  const goodExists = ev.some(isAcc);
  const value = goodExists ? a.good / a.checked : (a.checked - a.rejected) / a.checked;
  return { value, sourceEventIds: ids(ev, (e) => isProd(e) || isAcc(e) || isRej(e)) };
}

export interface StageRow extends StageAgg {
  stageId: string;
  label: string;
  rejRate: number;
  yield: number;
  contributionPct: number;
}

/** Per-stage breakdown, ordered by registry stage order. */
export function byStage(events: Event[], scope: Scope, registry: Registry = DISPOSAFE_REGISTRY): StageRow[] {
  const ev = scopeEvents(events, scope);
  const total = aggregate(ev).rejected;
  return registry.stages
    .map((s) => {
      const a = aggregate(ev.filter((e) => "stageId" in e && (e as any).stageId === s.stageId));
      return {
        stageId: s.stageId,
        label: s.label,
        ...a,
        rejRate: a.checked > 0 ? a.rejected / a.checked : 0,
        yield: a.checked > 0 ? (a.good || a.checked - a.rejected) / a.checked : 1,
        contributionPct: total > 0 ? (a.rejected / total) * 100 : 0,
      };
    })
    .filter((r) => r.checked > 0 || r.rejected > 0);
}

export interface SeriesPoint { period: string; label: string; value: number }

type MetricFn = (events: Event[], scope: Scope) => MetricValue;
const METRICS: Record<string, MetricFn> = { rejectionRate, totalRejected, totalChecked, fpy };

/** A metric bucketed over time by scope.grain. */
export function trend(events: Event[], scope: Scope, metric: keyof typeof METRICS = "rejectionRate"): SeriesPoint[] {
  const ev = scopeEvents(events, scope);
  const fn = METRICS[metric];
  const periods = periodsIn(ev, scope.grain);
  return periods.map((p) => {
    const bucket = ev.filter((e) => periodKey(e.occurredOn.start, scope.grain) === p);
    // run the metric on the bucket with an unfiltered scope (already scoped)
    return { period: p, label: periodLabel(p), value: fn(bucket, { grain: scope.grain }).value };
  });
}

export interface StageTrendPoint { period: string; label: string; perStage: Record<string, number> }

/** Per-stage rejection-rate series over time. */
export function stageTrend(events: Event[], scope: Scope, registry: Registry = DISPOSAFE_REGISTRY): StageTrendPoint[] {
  const ev = scopeEvents(events, scope);
  const periods = periodsIn(ev, scope.grain);
  return periods.map((p) => {
    const bucket = ev.filter((e) => periodKey(e.occurredOn.start, scope.grain) === p);
    const perStage: Record<string, number> = {};
    for (const s of registry.stages) {
      const a = aggregate(bucket.filter((e) => "stageId" in e && (e as any).stageId === s.stageId));
      perStage[s.stageId] = a.checked > 0 ? a.rejected / a.checked : 0;
    }
    return { period: p, label: periodLabel(p), perStage };
  });
}

/** Weekly rejection-rate trend within the scoped window (week-of-month). */
export function weeklyTrend(events: Event[], scope: Scope): SeriesPoint[] {
  return trend(events, { ...scope, grain: "week" }, "rejectionRate");
}
