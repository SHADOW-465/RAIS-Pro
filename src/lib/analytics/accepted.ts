// Accepted quantity — one definition, shared by the dashboard, the funnel,
// and reports. See gateAccepted / passedForward.

import type { Event } from "@/lib/store/types";
import type { Scope } from "./scope";
import type { Registry } from "./rejection";
import { acceptedBreakdown, totalAccepted, DERIVED_REGISTRY } from "./rejection";
import { ACCEPTED_QUANTITY_LABEL } from "@/lib/entry/passed-forward";

export { ACCEPTED_QUANTITY_LABEL };

export type AcceptedQuantity = {
  status: "defined";
  display: typeof ACCEPTED_QUANTITY_LABEL;
  value: number;
  hold: number;
  notYetAtNext: number;
  sourceEventIds: string[];
};

export function plantAcceptedQuantity(
  events: Event[],
  scope: Scope,
  registry: Registry = DERIVED_REGISTRY,
): AcceptedQuantity {
  const parts = acceptedBreakdown(events, scope, registry);
  const metric = totalAccepted(events, scope, registry);
  return {
    status: "defined",
    display: ACCEPTED_QUANTITY_LABEL,
    value: parts.accepted,
    hold: parts.hold,
    notYetAtNext: parts.notYetAtNext,
    sourceEventIds: metric.sourceEventIds,
  };
}
