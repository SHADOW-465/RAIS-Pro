// src/core/decision/seed-rules.ts
// Built-in active decision rules. Operate on canonical variables only
// (ADD §14). Company-specific rules land in the decision_rules table later;
// these seed the memory store so CAPA/cockpit work out of the box.

import type { DecisionRuleT } from "@/shared/models/decision";

const NOW = "2026-07-01T00:00:00.000Z";

function rule(
  ruleId: string,
  version: number,
  when: DecisionRuleT["definition"]["when"],
  then: DecisionRuleT["definition"]["then"],
): DecisionRuleT {
  return {
    ruleId,
    version,
    status: "active",
    definition: { when, then },
    createdAt: NOW,
  };
}

/**
 * Default rule set. Thresholds mirror Settings defaults
 * (target rejection 10%, watch 5%) and the heuristic cockpit lines
 * Phase 5 already rendered — now with versioned lineage.
 */
export const SEED_DECISION_RULES: DecisionRuleT[] = [
  rule(
    "D-001",
    1,
    { all: [{ var: "rejection_rate", op: "gt", value: 0.1 }], any: null },
    {
      kind: "alert",
      severity: "critical",
      template:
        "Headline rejection rate {{rejection_rate_pct}}% exceeds the {{target_rate_pct}}% target — escalate quality review.",
      ownerRole: "qm",
    },
  ),
  rule(
    "D-002",
    1,
    {
      all: [
        { var: "max_stage_rate", op: "gt", value: 0.05 },
        { var: "total_checked", op: "gt", value: 0 },
      ],
      any: null,
    },
    {
      kind: "recommendation",
      severity: "warning",
      template:
        "Audit quality gates and operator logs at {{max_stage_label}} (rejection rate: {{max_stage_rate_pct}}%).",
      ownerRole: "steward",
    },
  ),
  rule(
    "D-003",
    1,
    {
      all: [
        { var: "top_defect_share", op: "gt", value: 0.15 },
        { var: "total_rejected", op: "gt", value: 0 },
      ],
      any: null,
    },
    {
      kind: "capa-draft",
      severity: "warning",
      template:
        "Investigate root cause for {{top_defect_label}} defects ({{top_defect_share_pct}}% of all rejections).",
      ownerRole: "qm",
    },
  ),
  rule(
    "D-004",
    1,
    {
      all: [
        { var: "max_size_rate", op: "gt", value: 0.05 },
        { var: "has_size_data", op: "eq", value: 1 },
      ],
      any: null,
    },
    {
      kind: "recommendation",
      severity: "warning",
      template:
        "Review material batch consistency for size {{max_size}} (rejection rate: {{max_size_rate_pct}}%).",
      ownerRole: "steward",
    },
  ),
  rule(
    "D-005",
    1,
    {
      all: [
        { var: "fpy", op: "lt", value: 0.9 },
        { var: "total_checked", op: "gt", value: 0 },
      ],
      any: null,
    },
    {
      kind: "recommendation",
      severity: "critical",
      template:
        "First-pass yield is {{fpy_pct}}% — review process capability across stages.",
      ownerRole: "gm",
    },
  ),
  rule(
    "D-006",
    1,
    {
      all: [
        { var: "copq", op: "gt", value: 0 },
        { var: "rejection_rate", op: "gt", value: 0.05 },
      ],
      any: null,
    },
    {
      kind: "recommendation",
      severity: "info",
      template:
        "Estimated cost of poor quality is ₹{{copq}} for this scope — prioritise CAPA on the top defect and worst stage.",
      ownerRole: "qm",
    },
  ),
  // Fallback when there is data but no threshold breach: still surface hygiene actions.
  rule(
    "D-007",
    1,
    {
      all: [
        { var: "total_checked", op: "gt", value: 0 },
        { var: "rejection_rate", op: "lte", value: 0.05 },
      ],
      any: null,
    },
    {
      kind: "recommendation",
      severity: "info",
      template:
        "Quality is within the watch band (rejection {{rejection_rate_pct}}%). Confirm monthly SOP training and machine maintenance logs are current.",
      ownerRole: "steward",
    },
  ),
  // Empty ledger
  rule(
    "D-008",
    1,
    { all: [{ var: "total_checked", op: "eq", value: 0 }], any: null },
    {
      kind: "recommendation",
      severity: "info",
      template:
        "Upload quality records and verify a MOD to generate action items.",
      ownerRole: null,
    },
  ),
];
