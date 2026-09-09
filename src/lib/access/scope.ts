// Data scope — the difference between not being SHOWN something and not being
// able to READ it.
//
// Screens and cards (catalog.ts) decide what a role is offered. They are
// presentation: every screen computes from `/api/events`, which hands the
// browser the whole ledger, so a supervisor with the Cost screen hidden still
// had the numbers behind it sitting in memory, one network-tab away. That is
// tidiness, and tidiness is the right answer for most of it — a supervisor does
// not need the SPC screen, and nobody is harmed if they could have seen it.
//
// This file is for the cases where that is not good enough:
//
//   · a line supervisor should see their line, and totals that mean their line
//   · plant cost figures should not leave the server for a role without them
//
// Both are enforced where the data is served, not where it is drawn, and both
// are pure functions so the rule is testable rather than living in a route.

import type { Event } from "@/lib/store/types";
import type { CalculationPolicyT } from "@/core/policy/policy";
import { screenGrantId } from "./catalog";

/** A role's data scope. Empty stages means unscoped — the whole plant. */
export interface RoleScope {
  stages: string[];
}

export const EMPTY_SCOPE: RoleScope = { stages: [] };

export function parseScope(raw: unknown): RoleScope {
  if (!raw || typeof raw !== "object") return { stages: [] };
  const stages = (raw as { stages?: unknown }).stages;
  return {
    stages: Array.isArray(stages) ? stages.filter((s): s is string => typeof s === "string") : [],
  };
}

export const isScoped = (scope: RoleScope | null | undefined): boolean =>
  !!scope && scope.stages.length > 0;

/** The stage an event belongs to, or null when it is not a stage-level fact.
 *  Mirrors `stageOf` in the event stores. */
function stageOf(e: Event): string | null {
  return "stageId" in e ? ((e as { stageId?: string | null }).stageId ?? null) : null;
}

/**
 * The events a stage-scoped role may receive.
 *
 * Events with NO stage pass through. They are not attributable to a line, so
 * dropping them would quietly remove plant-wide facts from a supervisor's view
 * and leave totals that are wrong in a way nobody on the screen could detect —
 * worse than showing them, because a number that is silently short still looks
 * like a number. Withholding those needs its own rule, not this one.
 *
 * An unscoped role gets everything, which is what every role does today.
 */
export function scopeEventsForRole(events: Event[], scope: RoleScope | null | undefined): Event[] {
  if (!isScoped(scope)) return events;
  const allowed = new Set(scope!.stages);
  return events.filter((e) => {
    const stage = stageOf(e);
    return stage === null || allowed.has(stage);
  });
}

// ── Cost ────────────────────────────────────────────────────────────────────

/**
 * May this role receive plant cost figures?
 *
 * Tied to the Cost of Rejection screen rather than to a grant of its own: a
 * role that may open the screen whose entire subject is money plainly may know
 * the unit cost, and a second control that could disagree with the first is a
 * way to be confusing rather than careful.
 */
export function roleSeesCost(navAllowOrGrants: readonly string[]): boolean {
  return (
    navAllowOrGrants.includes("copq") || navAllowOrGrants.includes(screenGrantId("copq"))
  );
}

/**
 * The policy with the money taken out.
 *
 * `unitCostInr` becomes 0 rather than being deleted, so the payload still
 * satisfies `CalculationPolicy` and no client has to learn a second shape. What
 * stops that reading as a genuine "₹0 of rejection" is `copq()`, which returns
 * null when there is no unit cost — no cost basis, no cost number, rather than
 * a confident zero. Stage weights are ratios, not money, and are useless on
 * their own, so they stay.
 */
export function redactCost(policy: CalculationPolicyT): CalculationPolicyT {
  return { ...policy, unitCostInr: 0 };
}

export function policyForRole(
  policy: CalculationPolicyT,
  navAllowOrGrants: readonly string[],
): CalculationPolicyT {
  return roleSeesCost(navAllowOrGrants) ? policy : redactCost(policy);
}
