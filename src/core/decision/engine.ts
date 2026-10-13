// src/core/decision/engine.ts
// Decision engine: scope → canonical vars → predicate match → recommendations
// with rule version + event-id lineage (ADD §14, Phase 6).
// Numbers never come from the LLM.

import type { Event } from "@/lib/store/types";
import type { Scope } from "@/lib/analytics/scope";
import type { Registry } from "@/lib/analytics/rejection";
import type {
  DecisionRuleT,
  RecommendationT,
  RulePredicateT,
} from "@/shared/models/decision";
import { computeCanonicalVars, type CanonicalContext } from "./canonical-vars";
import { getDecisionRuleStore } from "./rule-store";
import { policyOf } from "@/lib/analytics/scope";

function thresholdOf(
  pred: { var: string; op: string; value: number; valueRef?: string | null },
  vars: Record<string, number>,
): number | undefined {
  if (pred.valueRef) {
    const ref = vars[pred.valueRef];
    if (ref === undefined || Number.isNaN(ref)) return undefined;
    return ref;
  }
  return pred.value;
}

function evalPredicate(
  pred: { var: string; op: string; value: number; valueRef?: string | null },
  vars: Record<string, number>,
): boolean {
  const left = vars[pred.var];
  const right = thresholdOf(pred, vars);
  if (left === undefined || Number.isNaN(left) || right === undefined) return false;
  switch (pred.op) {
    case "gt": return left > right;
    case "gte": return left >= right;
    case "lt": return left < right;
    case "lte": return left <= right;
    case "eq": return left === right;
    case "neq": return left !== right;
    default: return false;
  }
}

/** Stored copies of the seed rules still carry a numeric threshold. Bind those
 *  to the saved policy so a 12% rate cannot be described as exceeding 15%. */
function bindPolicyThresholds(rule: DecisionRuleT, targetRate: number, watchRate: number): DecisionRuleT {
  const bind = (p: RulePredicateT): RulePredicateT => {
    if (p.valueRef) return p;
    if (rule.ruleId === "D-001" && p.var === "rejection_rate") {
      return { ...p, value: targetRate, valueRef: "target_rate" };
    }
    if (
      (rule.ruleId === "D-002" && p.var === "max_stage_rate") ||
      (rule.ruleId === "D-004" && p.var === "max_size_rate")
    ) {
      return { ...p, value: watchRate, valueRef: "watch_rate" };
    }
    if (rule.ruleId === "D-003" && p.var === "top_defect_share") {
      return { ...p, value: targetRate, valueRef: "target_rate" };
    }
    if (rule.ruleId === "D-005" && p.var === "fpy") {
      return { ...p, value: Math.max(0, 1 - targetRate), valueRef: "fpy_floor" };
    }
    if ((rule.ruleId === "D-006" || rule.ruleId === "D-007") && p.var === "rejection_rate") {
      return { ...p, value: watchRate, valueRef: "watch_rate" };
    }
    return p;
  };
  return {
    ...rule,
    definition: {
      ...rule.definition,
      when: {
        all: rule.definition.when.all?.map(bind) ?? null,
        any: rule.definition.when.any?.map(bind) ?? null,
      },
    },
  };
}

function whenMatches(rule: DecisionRuleT, vars: Record<string, number>): boolean {
  const { all, any } = rule.definition.when;
  if (all && all.length > 0) {
    if (!all.every((p) => evalPredicate(p, vars))) return false;
  }
  if (any && any.length > 0) {
    if (!any.some((p) => evalPredicate(p, vars))) return false;
  }
  // No predicates at all → always match (not used by seed; kept for flexibility).
  if ((!all || all.length === 0) && (!any || any.length === 0)) return true;
  return true;
}

/** Fill {{token}} from labels first, then numeric vars. Unknown tokens stay. */
export function fillTemplate(template: string, ctx: CanonicalContext): string {
  return template.replace(/\{\{\s*([a-zA-Z0-9_.]+)\s*\}\}/g, (_, key: string) => {
    if (key in ctx.labels) return ctx.labels[key];
    if (key in ctx.vars) {
      const n = ctx.vars[key];
      if (typeof n !== "number" || !Number.isFinite(n)) return "—";
      // rates as pct if key ends with _rate; otherwise raw
      if (key.endsWith("_rate") || key === "fpy") return (n * 100).toFixed(1);
      if (Number.isInteger(n)) return String(n);
      return n.toFixed(2);
    }
    return `{{${key}}}`;
  });
}

/** Evidence vars: only those referenced by the rule's predicates. */
function matchedVars(rule: DecisionRuleT, vars: Record<string, number>): Record<string, number> {
  const out: Record<string, number> = {};
  const preds: RulePredicateT[] = [
    ...(rule.definition.when.all ?? []),
    ...(rule.definition.when.any ?? []),
  ];
  for (const p of preds) {
    if (p.var in vars) out[p.var] = vars[p.var];
  }
  return out;
}

const SEVERITY_RANK: Record<string, number> = { critical: 0, warning: 1, info: 2 };

/**
 * Evaluate active decision rules against the ledger for a scope.
 * Pure over (events, scope, rules) — store fetch is the only I/O.
 */
export async function decide(
  events: Event[],
  scope: Scope,
  opts: {
    registry?: Registry;
    rules?: DecisionRuleT[];
    targetRate?: number;
    watchRate?: number;
    /** Cap how many recommendations to return (default 8). */
    limit?: number;
  } = {},
): Promise<{ recommendations: RecommendationT[]; vars: Record<string, number>; labels: Record<string, string> }> {
  const policy = policyOf(scope);
  const targetRate = opts.targetRate ?? policy.targetRejectionPct / 100;
  const watchRate = opts.watchRate ?? policy.watchRejectionPct / 100;
  const loaded = opts.rules ?? (await getDecisionRuleStore().listActive());
  const rules = loaded.map((r) => bindPolicyThresholds(r, targetRate, watchRate));
  const ctx = computeCanonicalVars(events, scope, opts.registry, { targetRate, watchRate });

  const hits: RecommendationT[] = [];
  for (const rule of rules) {
    if (rule.status !== "active") continue;
    if (!whenMatches(rule, ctx.vars)) continue;
    const { then } = rule.definition;
    hits.push({
      ruleId: rule.ruleId,
      ruleVersion: rule.version,
      kind: then.kind,
      severity: then.severity,
      text: fillTemplate(then.template, ctx),
      ownerRole: then.ownerRole,
      vars: matchedVars(rule, ctx.vars),
      eventIds: ctx.eventIds,
      explanation: null,
    });
  }

  hits.sort((a, b) => {
    const sr = (SEVERITY_RANK[a.severity] ?? 9) - (SEVERITY_RANK[b.severity] ?? 9);
    if (sr !== 0) return sr;
    return a.ruleId.localeCompare(b.ruleId);
  });

  const limit = opts.limit ?? 8;
  return {
    recommendations: hits.slice(0, limit),
    vars: ctx.vars,
    labels: ctx.labels,
  };
}
