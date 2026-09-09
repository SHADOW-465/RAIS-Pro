// Data scope — the two rules that are about confidentiality rather than tidiness.
//
// Everything else in lib/access decides what a role is OFFERED. These two decide
// what leaves the server, so getting them wrong is not a cosmetic bug: too loose
// and a limit a plant asked for is decorative, too tight and someone's totals
// are silently short while still looking like totals.

import {
  EMPTY_SCOPE,
  isScoped,
  parseScope,
  policyForRole,
  redactCost,
  roleSeesCost,
  scopeEventsForRole,
} from "@/lib/access/scope";
import { screenGrantId } from "@/lib/access/catalog";
import { DEFAULT_POLICY } from "@/core/policy/policy";
import { copq } from "@/lib/analytics";
import type { Event } from "@/lib/store/types";

/** Minimal ledger rows — only the fields scoping reads. */
const ev = (eventId: string, stageId?: string | null): Event =>
  ({ eventId, eventType: "production", ...(stageId === undefined ? {} : { stageId }) }) as unknown as Event;

const LEDGER = [
  ev("a", "visual"),
  ev("b", "balloon"),
  ev("c", "final"),
  ev("d", null),
  ev("e"),
];

describe("parsing a stored scope", () => {
  test("absent, empty and malformed all mean unscoped", () => {
    for (const raw of [undefined, null, {}, { stages: null }, { stages: "visual" }, 42]) {
      expect(parseScope(raw)).toEqual(EMPTY_SCOPE);
      expect(isScoped(parseScope(raw))).toBe(false);
    }
  });

  test("non-string entries are dropped rather than carried through", () => {
    expect(parseScope({ stages: ["visual", 7, null, "final"] }).stages).toEqual(["visual", "final"]);
  });
});

describe("scoping the ledger", () => {
  // Every role today. Nothing about this feature may narrow an existing one.
  test("an unscoped role receives the whole ledger", () => {
    expect(scopeEventsForRole(LEDGER, null)).toHaveLength(5);
    expect(scopeEventsForRole(LEDGER, EMPTY_SCOPE)).toHaveLength(5);
  });

  test("a scoped role receives only its stages", () => {
    const got = scopeEventsForRole(LEDGER, { stages: ["visual"] }).map((e) => e.eventId);
    expect(got).toContain("a");
    expect(got).not.toContain("b");
    expect(got).not.toContain("c");
  });

  // The judgment call, stated out loud: a row with no stage is not attributable
  // to a line, so dropping it would quietly remove plant-wide facts and leave
  // totals that are short in a way nobody on the screen could detect. A number
  // that is silently missing rows still looks like a number.
  test("rows with no stage of their own always come through", () => {
    const got = scopeEventsForRole(LEDGER, { stages: ["visual"] }).map((e) => e.eventId);
    expect(got).toEqual(["a", "d", "e"]);
  });

  test("scoping to several stages keeps all of them", () => {
    const got = scopeEventsForRole(LEDGER, { stages: ["visual", "final"] }).map((e) => e.eventId);
    expect(got).toEqual(["a", "c", "d", "e"]);
  });

  test("a stage nobody has records for yields only the unattributed rows", () => {
    expect(scopeEventsForRole(LEDGER, { stages: ["nope"] }).map((e) => e.eventId)).toEqual(["d", "e"]);
  });
});

describe("who may see plant money", () => {
  test("the Cost of Rejection screen is what grants it, by nav key or by grant id", () => {
    expect(roleSeesCost(["dashboard", "copq"])).toBe(true);
    expect(roleSeesCost([screenGrantId("copq")])).toBe(true);
    expect(roleSeesCost(["dashboard", "hold"])).toBe(false);
    expect(roleSeesCost([])).toBe(false);
  });

  test("redaction removes the unit cost and leaves the ratios", () => {
    const red = redactCost(DEFAULT_POLICY);
    expect(red.unitCostInr).toBe(0);
    // Weights are shares, not money, and say nothing without a unit cost.
    expect(red.stageCostWeights).toEqual(DEFAULT_POLICY.stageCostWeights);
    expect(red.targetRejectionPct).toBe(DEFAULT_POLICY.targetRejectionPct);
  });

  test("policyForRole redacts for a role without the screen and not for one with it", () => {
    expect(policyForRole(DEFAULT_POLICY, ["copq"]).unitCostInr).toBe(DEFAULT_POLICY.unitCostInr);
    expect(policyForRole(DEFAULT_POLICY, ["hold"]).unitCostInr).toBe(0);
  });
});

// Redaction would be worse than useless if the client then rendered ₹0 as a
// measured result — a report saying "cost of rejection: ₹0" is a wrong number,
// not a withheld one. `copq` returns null without a cost basis so callers show
// their empty state instead.
describe("no cost basis, no cost number", () => {
  const scope = { grain: "month", policy: redactCost(DEFAULT_POLICY) } as never;

  test("copq returns null when the unit cost has been redacted", () => {
    expect(copq([], scope)).toBeNull();
  });

  test("and still computes when it has not", () => {
    const real = { grain: "month", policy: DEFAULT_POLICY } as never;
    expect(copq([], real)).not.toBeNull();
  });
});
