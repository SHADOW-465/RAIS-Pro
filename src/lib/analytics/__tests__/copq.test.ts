// COPQ = rejected pieces × piece price. Nothing else.
//
// A stored plant policy carried fractional "cost sunk at each gate" weights
// (Visual 0.6, Eye Punching 0.7 …), so 18,223 rejected × ₹5 showed ₹0.66 L
// instead of ₹0.91 L. The weights must never shrink the figure again.

import { copq } from "../cost";
import { totalRejected } from "../rejection";
import { DEFAULT_POLICY, type CalculationPolicyT } from "@/core/policy/policy";
import type { Scope } from "../scope";
import type { Event } from "@/lib/store/types";

let n = 0;
const ev = (stageId: string, eventType: string, quantity: number, disposition?: string): Event =>
  ({
    eventId: `c${n++}`,
    eventType,
    ...(disposition ? { disposition } : {}),
    stageId,
    quantity,
    batchNo: "26J01-14",
    size: "Fr14",
    occurredOn: { kind: "day", start: "2026-10-01", end: "2026-10-01" },
    provenance: { file: "Manual Entry" },
    extractedBy: "direct-entry",
  }) as unknown as Event;

const LEDGER = [
  ev("visual", "production", 5000),
  ev("visual", "inspection", 300, "rejected"),
  ev("balloon", "production", 4700),
  ev("balloon", "inspection", 40, "rejected"),
  ev("valve-integrity", "production", 4660),
  ev("valve-integrity", "inspection", 12, "rejected"),
];

const scope = (policy: CalculationPolicyT): Scope => ({ grain: "day", policy });

test("COPQ is exactly rejected × ₹5 per piece", () => {
  const s = scope({ ...DEFAULT_POLICY, unitCostInr: 5 });
  const rejected = totalRejected(LEDGER, s).value;
  expect(rejected).toBe(352);
  expect(copq(LEDGER, s)?.value).toBe(352 * 5);
});

test("fractional gate weights in a saved policy do not discount COPQ", () => {
  const s = scope({
    ...DEFAULT_POLICY,
    unitCostInr: 5,
    stageCostWeights: { visual: 0.6, balloon: 0.8, "valve-integrity": 0.9 },
  });
  expect(copq(LEDGER, s)?.value).toBe(352 * 5);
  expect(copq(LEDGER, s)?.byStage.visual).toBe(300 * 5);
});

test("no unit cost → no COPQ (empty state, not ₹0)", () => {
  expect(copq(LEDGER, scope({ ...DEFAULT_POLICY, unitCostInr: 0 }))).toBeNull();
});
