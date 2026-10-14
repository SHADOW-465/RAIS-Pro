// src/core/decision/canonical-vars.ts
// Compute the flat map of canonical variables the decision engine evaluates.
// ALL numbers come from analytics/* — pure JS over the event ledger.
// Labels (stage/defect) are catalog lookups for template interpolation only.

import type { Event } from "@/lib/store/types";
import type { Scope } from "@/lib/analytics/scope";
import {
  rejectionRate,
  totalRejected,
  totalChecked,
  fpy,
  byStage,
  type Registry,
  DERIVED_REGISTRY,
} from "@/lib/analytics/rejection";
import { byDefect, bySize } from "@/lib/analytics/defect";
import { copq } from "@/lib/analytics/cost";
import { policyOf } from "@/lib/analytics/scope";
import { finiteNumber, formatPercentDigits } from "@/lib/analytics/finite";

export interface CanonicalContext {
  /** Numeric vars for predicates (and evidence). */
  vars: Record<string, number>;
  /** String tokens for template fill (never used in predicates). */
  labels: Record<string, string>;
  /** Union of sourceEventIds from the metrics that produced the vars. */
  eventIds: string[];
}

/**
 * Build the canonical variable map for a scope.
 * Keys used by seed rules (and free for company rules):
 *   rejection_rate, fpy, total_rejected, total_checked, copq,
 *   max_stage_rate, top_defect_share, max_size_rate, has_size_data,
 *   stage_rate.<id>, defect_share.<code>, size_rate.<size>
 */
export function computeCanonicalVars(
  events: Event[],
  scope: Scope,
  registry: Registry = DERIVED_REGISTRY,
  opts: { targetRate?: number; watchRate?: number } = {},
): CanonicalContext {
  const policy = policyOf(scope);
  const targetRate = opts.targetRate ?? policy.targetRejectionPct / 100;
  const watchRate = opts.watchRate ?? policy.watchRejectionPct / 100;
  const rate = rejectionRate(events, scope, registry);
  const rejected = totalRejected(events, scope);
  const checked = totalChecked(events, scope, registry);
  const yieldM = fpy(events, scope, registry);
  const stages = byStage(events, scope, registry);
  const defects = byDefect(events, scope, registry);
  const sizes = bySize(events, scope);
  const copqRes = copq(events, scope);

  const vars: Record<string, number> = {
    rejection_rate: rate.value,
    fpy: yieldM.value,
    total_rejected: rejected.value,
    total_checked: checked.value,
    copq: copqRes?.value ?? 0,
    target_rate: targetRate,
    watch_rate: watchRate,
    fpy_floor: Math.max(0, 1 - targetRate),
    has_size_data: sizes.length > 0 ? 1 : 0,
  };

  const labels: Record<string, string> = {
    target_rate_pct: formatPercentDigits(targetRate, 1) ?? "—",
    watch_rate_pct: formatPercentDigits(watchRate, 1) ?? "—",
    rejection_rate_pct: formatPercentDigits(rate.value, 2) ?? "—",
    fpy_pct: formatPercentDigits(yieldM.value, 1) ?? "—",
    copq: finiteNumber(vars.copq) == null ? "—" : Math.round(vars.copq).toLocaleString("en-IN"),
  };

  const eventIdSet = new Set<string>([
    ...rate.sourceEventIds,
    ...rejected.sourceEventIds,
    ...checked.sourceEventIds,
    ...yieldM.sourceEventIds,
  ]);

  let maxStageRate = 0;
  let maxStageId = "";
  let maxStageLabel = "";
  for (const s of stages) {
    vars[`stage_rate.${s.stageId}`] = s.rejRate;
    vars[`stage_rejected.${s.stageId}`] = s.rejected;
    if (s.rejRate > maxStageRate) {
      maxStageRate = s.rejRate;
      maxStageId = s.stageId;
      maxStageLabel = s.label || s.stageId;
    }
  }
  vars.max_stage_rate = maxStageRate;
  labels.max_stage_id = maxStageId;
  labels.max_stage_label = maxStageLabel || "—";
  labels.max_stage_rate_pct = formatPercentDigits(maxStageRate, 1) ?? "—";

  let topShare = 0;
  let topCode = "";
  let topLabel = "";
  for (const d of defects) {
    const share = d.pct / 100;
    if (d.defectCode) vars[`defect_share.${d.defectCode}`] = share;
    vars[`defect_qty.${d.defectCode ?? d.label}`] = d.rejected;
    if (share > topShare) {
      topShare = share;
      topCode = d.defectCode ?? "";
      topLabel = d.label;
    }
  }
  vars.top_defect_share = topShare;
  labels.top_defect_code = topCode;
  labels.top_defect_label = topLabel || "—";
  labels.top_defect_share_pct = formatPercentDigits(topShare, 1) ?? "—";

  let maxSizeRate = 0;
  let maxSize = "";
  for (const s of sizes) {
    vars[`size_rate.${s.size}`] = s.rejRate;
    if (s.rejRate > maxSizeRate) {
      maxSizeRate = s.rejRate;
      maxSize = s.size;
    }
  }
  vars.max_size_rate = maxSizeRate;
  labels.max_size = maxSize || "—";
  labels.max_size_rate_pct = formatPercentDigits(maxSizeRate, 1) ?? "—";

  return { vars, labels, eventIds: [...eventIdSet] };
}
