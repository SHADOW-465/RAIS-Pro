// Quality Status — metric health + integrity gate (UX philosophy F5 / DS-1).
//
// Order of evaluation:
// 1. Integrity gate — open critical issues in scope → always `blocked` (never ok)
// 2. Primary threshold — rejection rate vs client target / watch
// 3. Secondary frame — prior period of the same grain (reason text only)

import { type Scope, scopeEvents, periodKey, periodsIn } from "./scope";
import { rejectionRate } from "./rejection";
import {
  scopeIntegrityIssues,
  type IntegrityIssue,
  type IntegrityScanOptions,
} from "./integrity";
import type { Event } from "@/lib/store/types";

export type QualityState = "ok" | "watch" | "at-risk" | "blocked";

export interface QualityStatusT {
  state: QualityState;
  reason: string;
  /** Open integrity issues that forced or informed the state (may be empty). */
  integrityIssues: IntegrityIssue[];
  /** Headline rejection rate used for metric thresholds (0–1). */
  rate: number;
  /** Prior-period rate of the same grain when computable (0–1). */
  priorRate: number | null;
  /** Client target / watch as fractions 0–1. */
  targetLimit: number;
  watchLimit: number;
}

export interface QualityStatusOptions extends IntegrityScanOptions {
  /** Override target rejection (0–1). Default: settings or 0.10. */
  targetLimit?: number;
  /** Override watch line (0–1). Default: settings or 0.05. */
  watchLimit?: number;
}

function getTargetLimit(): number {
  if (typeof window !== "undefined") {
    const val = localStorage.getItem("rais_settings_target_rejection");
    if (val) {
      const num = parseFloat(val);
      if (!isNaN(num)) return num / 100;
    }
  }
  return 0.10;
}

function getWatchLimit(): number {
  if (typeof window !== "undefined") {
    const val = localStorage.getItem("rais_settings_watch_rejection");
    if (val) {
      const num = parseFloat(val);
      if (!isNaN(num)) return num / 100;
    }
  }
  return 0.05;
}

/** Prior period of the same grain that immediately precedes the scoped window. */
export function priorPeriodScope(events: Event[], scope: Scope): Scope | null {
  const ev = scopeEvents(events, { grain: scope.grain });
  if (ev.length === 0) return null;

  const keys = periodsIn(ev, scope.grain);
  if (keys.length < 2) return null;

  // Active window: prefer explicit dateTo, else latest period with data in full set.
  let activeKey: string | null = null;
  if (scope.dateTo) {
    activeKey = periodKey(scope.dateTo, scope.grain);
  } else if (scope.dateFrom) {
    activeKey = periodKey(scope.dateFrom, scope.grain);
  } else {
    activeKey = keys[keys.length - 1];
  }

  const idx = keys.indexOf(activeKey);
  const priorKey = idx > 0 ? keys[idx - 1] : keys.length >= 2 ? keys[keys.length - 2] : null;
  if (!priorKey) return null;

  // Bound prior period using events that fall in that bucket.
  const inPrior = ev.filter((e) => periodKey(e.occurredOn.start, scope.grain) === priorKey);
  if (inPrior.length === 0) return null;
  const starts = inPrior.map((e) => e.occurredOn.start).sort();
  const ends = inPrior.map((e) => e.occurredOn.end).sort();
  return {
    ...scope,
    dateFrom: starts[0],
    dateTo: ends[ends.length - 1],
  };
}

/**
 * Quality Status for a scope.
 * Integrity-critical open issues always win over metric "ok".
 */
export function qualityStatus(
  events: Event[],
  scope: Scope,
  opts: QualityStatusOptions = {}
): QualityStatusT {
  const targetLimit = opts.targetLimit ?? getTargetLimit();
  const watchLimit = opts.watchLimit ?? getWatchLimit();
  const rate = rejectionRate(events, scope).value;
  const pct = (rate * 100).toFixed(2);

  const integrityIssues = scopeIntegrityIssues(events, scope, opts);
  const critical = integrityIssues.filter((i) => i.severity === "critical");

  const priorScope = priorPeriodScope(events, scope);
  const priorRate = priorScope ? rejectionRate(events, priorScope).value : null;

  if (critical.length > 0) {
    const head = critical[0].message;
    const more = critical.length > 1 ? ` (+${critical.length - 1} more)` : "";
    return {
      state: "blocked",
      reason: `Data integrity blocked — ${head}${more}`,
      integrityIssues,
      rate,
      priorRate,
      targetLimit,
      watchLimit,
    };
  }

  let priorClause = "";
  if (priorRate != null) {
    const deltaPp = (rate - priorRate) * 100;
    const dir = deltaPp > 0.005 ? "up" : deltaPp < -0.005 ? "down" : "flat";
    priorClause =
      dir === "flat"
        ? ` Unchanged vs prior period (${(priorRate * 100).toFixed(2)}%).`
        : ` ${dir === "up" ? "Up" : "Down"} ${Math.abs(deltaPp).toFixed(2)} pp vs prior period (${(priorRate * 100).toFixed(2)}%).`;
  }

  if (rate > targetLimit) {
    return {
      state: "at-risk",
      reason:
        `Rejection rate ${pct}% exceeds the ${(targetLimit * 100).toFixed(1)}% target — needs immediate attention.` +
        priorClause,
      integrityIssues,
      rate,
      priorRate,
      targetLimit,
      watchLimit,
    };
  }

  if (rate > watchLimit) {
    return {
      state: "watch",
      reason:
        `Rejection rate ${pct}% is above the ${(watchLimit * 100).toFixed(1)}% watch threshold — monitor closely.` +
        priorClause,
      integrityIssues,
      rate,
      priorRate,
      targetLimit,
      watchLimit,
    };
  }

  return {
    state: "ok",
    reason: `Rejection rate ${pct}% is within target.` + priorClause,
    integrityIssues,
    rate,
    priorRate,
    targetLimit,
    watchLimit,
  };
}
