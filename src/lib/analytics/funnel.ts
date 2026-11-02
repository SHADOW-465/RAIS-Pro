// Production funnel reconciliation.
//
// Accepted at a gate is checked − rejected (hold stays inside accepted — owner
// decision, commit 838704c). Between two gates of the same section, what one
// gate passed forward and the next gate checked differ by units that are still
// in process, or by a next gate that checked more than it was given (V-014).
// Telescoping the gates gives, per section:
//   entry checked − Σ rejected  =  last gate accepted  +  Σ (passed − next checked)
// so the headline Overall Accepted reconciles to Final good plus what sits
// between gates.

import { stageCategoryOf } from "@/core/ontology/plant-catalog";

export interface FunnelGateIn {
  stageId: string;
  checked: number;
  rejected: number;
}

export interface FunnelGate {
  stageId: string;
  passed: number;
  /** Passed here, not yet checked at the next gate. Null when there is no next gate in this section. */
  notYetAtNext: number | null;
  /** Next gate checked more than this gate passed (a V-014 mass-balance gap). */
  overAtNext: number;
}

export interface FunnelReconciliation {
  gates: FunnelGate[];
  /** Last gate's checked − rejected. */
  finalGood: number;
  /** Σ notYetAtNext − Σ overAtNext, same-section pairs only. */
  betweenGates: number;
}

export function funnelReconciliation(rows: readonly FunnelGateIn[]): FunnelReconciliation {
  const gates = rows.map((r, i): FunnelGate => {
    const passed = Math.max(r.checked - r.rejected, 0);
    const next = rows[i + 1];
    const sameSection = next && stageCategoryOf(next.stageId) === stageCategoryOf(r.stageId);
    if (!sameSection) return { stageId: r.stageId, passed, notYetAtNext: null, overAtNext: 0 };
    const gap = passed - next.checked;
    return { stageId: r.stageId, passed, notYetAtNext: Math.max(gap, 0), overAtNext: Math.max(-gap, 0) };
  });
  const finalGood = gates.length ? gates[gates.length - 1].passed : 0;
  const betweenGates = gates.reduce((s, g) => s + (g.notYetAtNext ?? 0) - g.overAtNext, 0);
  return { gates, finalGood, betweenGates };
}
