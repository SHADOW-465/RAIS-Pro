// src/shared/models/decision.ts
// Decision-engine contracts (ADD §14, Phase 6).
// Rules operate ONLY on canonical variables computed by analytics/* —
// never workbook headers, company names, or raw Excel. LLM may explain a
// hit; it never originates numbers.

import { z } from "zod";

export const DecisionSeverity = z.enum(["critical", "warning", "info"]);

export const PredicateOp = z.enum(["gt", "gte", "lt", "lte", "eq", "neq"]);

/** One comparison against a canonical variable (e.g. rejection_rate > 0.10). */
export const RulePredicate = z.object({
  var: z.string().min(1),
  op: PredicateOp,
  value: z.number(),
});

export const RuleWhen = z.object({
  /** All must match (AND). Empty/null → true. */
  all: z.array(RulePredicate).nullable(),
  /** At least one must match (OR). Empty/null → true. */
  any: z.array(RulePredicate).nullable(),
});

export const RuleActionKind = z.enum(["recommendation", "capa-draft", "alert"]);

export const RuleThen = z.object({
  kind: RuleActionKind,
  severity: DecisionSeverity,
  /**
   * Human-facing template. Interpolation tokens (filled at eval time from
   * canonical vars / labels — never invented by the LLM):
   *   {{rejection_rate_pct}} {{fpy_pct}} {{copq}}
   *   {{max_stage_id}} {{max_stage_label}} {{max_stage_rate_pct}}
   *   {{top_defect_code}} {{top_defect_label}} {{top_defect_share_pct}}
   *   {{max_size}} {{max_size_rate_pct}} {{target_rate_pct}}
   */
  template: z.string().min(1),
  ownerRole: z.string().nullable(),
});

export const DecisionRuleDefinition = z.object({
  when: RuleWhen,
  then: RuleThen,
});

export const DecisionRuleStatus = z.enum(["draft", "active", "retired"]);

export const DecisionRule = z.object({
  ruleId: z.string().min(1),
  version: z.number().int().positive(),
  status: DecisionRuleStatus,
  definition: DecisionRuleDefinition,
  createdAt: z.string().datetime(),
});

export const Recommendation = z.object({
  ruleId: z.string().min(1),
  ruleVersion: z.number().int().positive(),
  kind: RuleActionKind,
  severity: DecisionSeverity,
  text: z.string().min(1),
  ownerRole: z.string().nullable(),
  /** Canonical variables that matched (name → value). */
  vars: z.record(z.string(), z.number()),
  /** Event ids that contributed to the matched metrics. */
  eventIds: z.array(z.string()),
  /** Optional LLM prose explaining the hit — never a number source. */
  explanation: z.string().nullable(),
});

export const DecideRequest = z.object({
  scope: z.object({
    grain: z.enum(["day", "week", "month", "fy"]),
    dateFrom: z.string().nullable(),
    dateTo: z.string().nullable(),
    stageIds: z.array(z.string()).nullable(),
    sizes: z.array(z.string()).nullable(),
  }),
  /** When true, tryModels drafts an explanation per hit (best-effort). */
  explain: z.boolean().nullable(),
  companyId: z.string().nullable(),
});

export const DecideResponse = z.object({
  recommendations: z.array(Recommendation),
  vars: z.record(z.string(), z.number()),
});

export type DecisionRuleT = z.infer<typeof DecisionRule>;
export type DecisionRuleDefinitionT = z.infer<typeof DecisionRuleDefinition>;
export type RulePredicateT = z.infer<typeof RulePredicate>;
export type RecommendationT = z.infer<typeof Recommendation>;
export type DecideRequestT = z.infer<typeof DecideRequest>;
export type DecideResponseT = z.infer<typeof DecideResponse>;
