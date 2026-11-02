// Calculation policy — the conventions behind every number, owned by the GM
// instead of buried in a code comment. See docs/CALCULATION-POLICY-PLAN.md.
//
// Not a rules engine: a fixed list of named decisions, each an enum or a
// number. Zod-validated, so no screen ever has to defend against a bad policy.
//
// Policy is a READ-TIME LENS. Changing it never touches the ledger — every
// screen just recomputes the same append-only events a different way.

import { z } from "zod";

/**
 * NOT configurable — the rejection formula itself is locked. See
 * `docs/CALCULATION-POLICY-PLAN.md`.
 *
 *   rate    = Σ over sections ( section rejected ÷ section checked )
 *   checked = Σ over sections ( that section's entry gate )
 *
 * Sections (Primary / Secondary / Assembly) are separate populations, so their
 * rates add. Gates INSIDE a section are sequential — what Visual accepts is what
 * Balloon checks — so the section is measured once at its entry gate, gate
 * rejects are summed, and gate rates are never added.
 *
 * This used to be two enum settings (`headlineRejection`, `checkedMeasuredAt`).
 * Between them, 8 of the 9 combinations were arithmetically incoherent — a
 * headline % whose denominator disagreed with the Checked KPI beside it — and
 * because policy is a read-time lens, flipping one silently rewrote every
 * historical report with nothing on the page saying which convention produced
 * it. Old stored policies still load: z.object drops the removed keys.
 *
 * Reconciling against the legacy YEARLY / REJECTION ANALYSIS sheet (which added
 * each gate's rate) belongs in the drill-down as a comparison line, not as a
 * global switch.
 */

/** Phase 1 rules only. Add a key here + a card in /settings/rules to ship more. */
export const CalculationPolicy = z.object({
  /** A3 — units pulled out at a gate for rework/hold. */
  reworkCountsAs: z.enum(["excluded", "checked"]),

  /** B1 — shop-floor sections in scope before the user narrows anything. */
  defaultSections: z.array(z.enum(["primary", "secondary", "assembly"])).min(1),

  /** D1 — plant target rejection %, as a percentage (10 = 10%). */
  targetRejectionPct: z.number().min(0).max(100),

  /** D2 — the "watch" line below target, as a percentage. */
  watchRejectionPct: z.number().min(0).max(100),

  /** E1 — cost of one finished unit, INR. */
  unitCostInr: z.number().min(0),

  /** E2 — share of unit cost already sunk by each gate. stageId → 0..1. */
  stageCostWeights: z.record(z.string(), z.number().min(0).max(1)),
});

export type CalculationPolicyT = z.infer<typeof CalculationPolicy>;

/**
 * Today's hardcoded behaviour, exactly. Seeding from this is what makes
 * shipping the feature a no-op until somebody deliberately changes a rule.
 */
export const DEFAULT_POLICY: CalculationPolicyT = {
  reworkCountsAs: "excluded",              // rejection.ts aggregate()
  defaultSections: ["assembly"],           // plant-catalog DEFAULT_STAGE_CATEGORIES
  targetRejectionPct: 10,                  // was localStorage rais_settings_target_rejection
  watchRejectionPct: 5,                    // was localStorage rais_settings_watch_rejection
  unitCostInr: 5,                          // ₹5 per piece (disposafe catheter plant piece price)
  stageCostWeights: {
    visual: 1.0,
    "eye-punching": 1.0,
    balloon: 1.0,
    "valve-integrity": 1.0,
    final: 1.0,
  },
};

/** One stored version. Latest version wins — revert = save the old values again. */
export interface PolicyVersion {
  version: number;
  policy: CalculationPolicyT;
  changedBy: string;
  changedAt: string;
  /** Why. Required on save so history is readable a year later. */
  note: string;
}

/** Never throw at a read: a malformed stored policy falls back to defaults. */
export function parsePolicy(raw: unknown): CalculationPolicyT {
  const r = CalculationPolicy.safeParse(raw);
  return r.success ? r.data : DEFAULT_POLICY;
}
