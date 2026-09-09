// Cost basis (unit cost, stage weights, target) used to live in localStorage,
// which meant the GM's laptop and the QM's laptop computed different COPQ from
// the same ledger, and any server-side render silently used the defaults
// because `window` was undefined. It is plant policy now: one value, versioned,
// shared, auditable. See core/policy/policy.ts.

import { type Scope, scopeEvents, periodsIn, periodBucket, periodLabel, policyOf } from "./scope";
import { byStage } from "./rejection";
import type { Event } from "@/lib/store/types";
import { DEFAULT_POLICY } from "@/core/policy/policy";

export interface COPQResult {
  value: number; // in INR
  byStage: Record<string, number>;
}

/** Fallback for a stage the policy has no weight for (a gate added by hand on
 *  Data Schema). Same 0.6 the old table used for Visual. */
const UNKNOWN_STAGE_WEIGHT = 0.6;

export function getFinishedCost(scope?: Scope): number {
  return (scope ? policyOf(scope) : DEFAULT_POLICY).unitCostInr;
}

export function getTargetRejectionRate(scope?: Scope): number {
  return (scope ? policyOf(scope) : DEFAULT_POLICY).targetRejectionPct / 100;
}

export function copq(events: Event[], scope: Scope): COPQResult | null {
  // No cost basis, no cost number. The policy arrives without a unit cost for a
  // role that may not see plant money (lib/access/scope.ts redacts it server
  // side), and a plant that genuinely has not set one is in the same position:
  // in both cases every stage would come out at exactly ₹0, which reads as a
  // measured result rather than an absent input. Returning null makes callers
  // show their empty state, which is the true statement.
  if (!(policyOf(scope).unitCostInr > 0)) return null;

  const ev = scopeEvents(events, scope);
  if (ev.length === 0) return { value: 0, byStage: {} };

  const stages = byStage(events, scope);
  const byStageCost: Record<string, number> = {};
  let totalCost = 0;

  const policy = policyOf(scope);
  const cost = policy.unitCostInr;

  for (const s of stages) {
    const weight = policy.stageCostWeights[s.stageId] ?? UNKNOWN_STAGE_WEIGHT;
    const stageCost = s.rejected * (cost * weight);
    byStageCost[s.stageId] = stageCost;
    totalCost += stageCost;
  }

  return {
    value: totalCost,
    byStage: byStageCost,
  };
}

/**
 * Annual savings opportunity (INR). Two components, whichever is larger:
 *  1. Target-gap: when the rejection rate exceeds the configured target, the cost
 *     of the excess rejections (the classic "get back to target" saving).
 *  2. Continuous-improvement: even within target, CAPA typically recovers a share
 *     of the current Cost of Poor Quality. We surface 25% of COPQ as the standing
 *     improvement opportunity so a healthy plant still sees a real (non-zero)
 *     target rather than ₹0. The fraction is a planning assumption, not source data.
 */
const IMPROVEMENT_RECOVERY_FRACTION = 0.25;

export function savingsOpportunity(events: Event[], scope: Scope): number | null {
  const ev = scopeEvents(events, scope);
  if (ev.length === 0) return 0;

  const stages = byStage(events, scope);
  let totalChecked = 0;
  let totalRejected = 0;

  for (const s of stages) {
    if (s.stageId === "visual") {
      totalChecked = s.checked;
    }
    totalRejected += s.rejected;
  }

  const currentRate = totalChecked > 0 ? totalRejected / totalChecked : 0;
  const targetLimit = getTargetRejectionRate(scope);

  const targetGapSavings =
    currentRate > targetLimit ? (currentRate - targetLimit) * totalChecked * getFinishedCost(scope) : 0;

  const copqValue = copq(events, scope)?.value ?? 0;
  const improvementSavings = copqValue * IMPROVEMENT_RECOVERY_FRACTION;

  return Math.max(targetGapSavings, improvementSavings);
}

export function copqTrend(events: Event[], scope: Scope): { period: string; label: string; value: number }[] {
  const ev = scopeEvents(events, scope);
  const periods = periodsIn(ev, scope.grain, { from: scope.dateFrom, to: scope.dateTo });
  return periods.map((p) => {
    const bucket = periodBucket(ev, scope.grain, p);
    const costResult = copq(bucket, { grain: scope.grain, policy: scope.policy });
    return {
      period: p,
      label: periodLabel(p),
      value: costResult?.value ?? 0,
    };
  });
}
