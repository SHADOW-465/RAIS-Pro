import { type Scope, scopeEvents, periodsIn, periodKey, periodLabel } from "./scope";
import { byStage } from "./rejection";
import type { Event } from "@/lib/store/types";

export interface COPQResult {
  value: number; // in INR
  byStage: Record<string, number>;
}

// Progressive weights for the stages (MOID-SPEC §5.A)
const STAGE_WEIGHTS: Record<string, number> = {
  "visual": 0.6,
  "eye-punching": 0.7,
  "balloon": 0.8,
  "valve-integrity": 0.9,
  "final": 1.0,
};

export function getFinishedCost(): number {
  if (typeof window !== "undefined") {
    const val = localStorage.getItem("rais_settings_finished_cost");
    if (val) {
      const num = parseFloat(val);
      if (!isNaN(num)) return num;
    }
  }
  return 20.0;
}

export function getTargetRejectionRate(): number {
  if (typeof window !== "undefined") {
    const val = localStorage.getItem("rais_settings_target_rejection");
    if (val) {
      const num = parseFloat(val);
      if (!isNaN(num)) return num / 100;
    }
  }
  return 0.10;
}

function getStageWeight(stageId: string, defaultWeight: number): number {
  if (typeof window !== "undefined") {
    const val = localStorage.getItem(`rais_settings_weight_${stageId}`);
    if (val) {
      const num = parseFloat(val);
      if (!isNaN(num)) return num;
    }
  }
  return defaultWeight;
}

export function copq(events: Event[], scope: Scope): COPQResult | null {
  const ev = scopeEvents(events, scope);
  if (ev.length === 0) return { value: 0, byStage: {} };

  const stages = byStage(events, scope);
  const byStageCost: Record<string, number> = {};
  let totalCost = 0;

  const cost = getFinishedCost();

  for (const s of stages) {
    const defaultWeight = STAGE_WEIGHTS[s.stageId] ?? 0.6;
    const weight = getStageWeight(s.stageId, defaultWeight);
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
  const targetLimit = getTargetRejectionRate();

  const targetGapSavings =
    currentRate > targetLimit ? (currentRate - targetLimit) * totalChecked * getFinishedCost() : 0;

  const copqValue = copq(events, scope)?.value ?? 0;
  const improvementSavings = copqValue * IMPROVEMENT_RECOVERY_FRACTION;

  return Math.max(targetGapSavings, improvementSavings);
}

export function copqTrend(events: Event[], scope: Scope): { period: string; label: string; value: number }[] {
  const ev = scopeEvents(events, scope);
  const periods = periodsIn(ev, scope.grain);
  return periods.map((p) => {
    const bucket = ev.filter((e) => periodKey(e.occurredOn.start, scope.grain) === p);
    const costResult = copq(bucket, { grain: scope.grain });
    return {
      period: p,
      label: periodLabel(p),
      value: costResult?.value ?? 0,
    };
  });
}
