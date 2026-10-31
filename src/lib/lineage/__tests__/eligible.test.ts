import { eligibleQtyFromEvents } from "../eligible";
import type { AuditEventLike } from "@/lib/analytics/audit-sessions";

let n = 0;
function ev(p: Partial<AuditEventLike>): AuditEventLike {
  n += 1;
  return {
    eventId: `e${n}`,
    ingestionId: "ing-1",
    recordedAt: "2026-09-20T10:00:00.000Z",
    occurredOn: { start: "2026-09-20", end: "2026-09-20" },
    extractedBy: "direct-entry",
    provenance: { file: "Manual Entry", cells: ["ENTRY!A1"], sheet: "A" },
    quantity: 0,
    stageId: "visual",
    customFields: { batch: "26I21-14" },
    ...p,
  };
}

const lot = [
  ev({ eventType: "production", quantity: 1000 }),
  ev({ eventType: "inspection", disposition: "accepted", quantity: 700 }),
  ev({ eventType: "inspection", disposition: "rejected", quantity: 100 }),
];

test("eligible is what the station accepted, read from the ledger", () => {
  expect(eligibleQtyFromEvents(lot, "26I21-14", "visual")).toBe(700);
});

test("a station that rejected everything has nothing eligible", () => {
  const allRejected = [
    ev({ eventType: "production", quantity: 500 }),
    ev({ eventType: "inspection", disposition: "rejected", quantity: 500 }),
  ];
  expect(eligibleQtyFromEvents(allRejected, "26I21-14", "visual")).toBe(0);
});

test("a station the lot never reached, or an unknown lot, is 0", () => {
  expect(eligibleQtyFromEvents(lot, "26I21-14", "balloon")).toBe(0);
  expect(eligibleQtyFromEvents(lot, "26I22-14", "visual")).toBe(0);
  expect(eligibleQtyFromEvents([], "26I21-14", "visual")).toBe(0);
});

test("other lots' events do not leak into the figure", () => {
  const mixed = [...lot, ev({ eventType: "inspection", disposition: "accepted", quantity: 9999, customFields: { batch: "26I21-16" } })];
  expect(eligibleQtyFromEvents(mixed, "26I21-14", "visual")).toBe(700);
});
