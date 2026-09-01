// Plant-wide accepted quantity.
//
// Inspection events with disposition "accepted" exist, and per-stage `good` is
// used internally to cascade sequential-gate denominators. That is not a
// confirmed plant-wide accepted-output formula: hold, rework, downgrade, and
// sequential gates mean accepted ≠ checked − rejected.
//
// Until the company confirms an exit-gate / terminal-accepted rule, the
// headline accepted metric is unavailable.

import type { Event } from "@/lib/store/types";
import { type Scope, scopeEvents, policyOf } from "./scope";
import { aggregate, type MetricValue } from "./rejection";

export const ACCEPTED_POLICY_GAP =
  "Needs company confirmation: no confirmed plant-wide accepted-quantity formula. Sequential gates, hold, rework, and downgrade mean accepted is not checked minus rejected. An exit-gate or terminal-accepted rule has not been confirmed.";

export type AcceptedQuantity = {
  status: "needs-company-confirmation";
  display: "Needs company confirmation";
  policyGap: typeof ACCEPTED_POLICY_GAP;
  /**
   * Sum of inspection(accepted) quantities in scope. Supporting ledger fact
   * only — not a plant-wide accepted KPI.
   */
  explicitAcceptedInspectionQuantity: MetricValue;
};

export function plantAcceptedQuantity(events: Event[], scope: Scope): AcceptedQuantity {
  const ev = scopeEvents(events, scope);
  const good = aggregate(ev, policyOf(scope)).good;
  const ids = ev
    .filter((e) => e.eventType === "inspection" && (e as { disposition?: string }).disposition === "accepted")
    .map((e) => e.eventId);
  return {
    status: "needs-company-confirmation",
    display: "Needs company confirmation",
    policyGap: ACCEPTED_POLICY_GAP,
    explicitAcceptedInspectionQuantity: { value: good, sourceEventIds: ids },
  };
}
