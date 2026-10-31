import { eligibleQtyFromEvents, findLotGroup, lotExistsInEvents, stationQtyFromGroup } from "../eligible";
import { buildEntryRows, groupByBatchThenStage } from "@/lib/analytics/audit-sessions";
import { hydrateFromBatchGroup } from "@/lib/entry/hydrate-entry";
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

test("lotExistsInEvents is true only for lots with ledger rows", () => {
  expect(lotExistsInEvents(lot, "26I21-14")).toBe(true);
  expect(lotExistsInEvents(lot, "26I21-16")).toBe(false);
  expect(lotExistsInEvents([], "26I21-14")).toBe(false);
});

// The 26H06-20 case: the lot-level headline (first station in, last station
// out) and one row of a station used to disagree with the cap.
test("banner, original-lot panel and server cap read one station figure", () => {
  const at = (stageId: string, date: string, eventType: string, quantity: number, disposition?: string) =>
    ev({ stageId, occurredOn: { start: date, end: date }, eventType, quantity, ...(disposition ? { disposition } : {}) } as never);
  const events = [
    at("visual", "2026-09-20", "production", 1000),
    at("visual", "2026-09-20", "inspection", 800, "accepted"),
    at("visual", "2026-09-20", "inspection", 200, "rejected"),
    at("visual", "2026-09-22", "production", 700),
    at("visual", "2026-09-22", "inspection", 461, "accepted"),
    at("visual", "2026-09-22", "inspection", 239, "rejected"),
    at("balloon", "2026-09-23", "production", 1200),
    at("balloon", "2026-09-23", "inspection", 1146, "accepted"),
    at("balloon", "2026-09-23", "inspection", 54, "rejected"),
  ];
  const group = findLotGroup(groupByBatchThenStage(buildEntryRows(events)), "26I21-14");
  const figs = stationQtyFromGroup(group, "visual");
  expect(figs).toMatchObject({ checked: 1700, accepted: 1261, hold: 0, rejected: 439, available: 1261, rowCount: 2 });
  expect(eligibleQtyFromEvents(events, "26I21-14", "visual")).toBe(figs!.available);
  const panel = hydrateFromBatchGroup(group, { stageId: "visual" })!;
  expect([panel.checked, panel.accepted, panel.hold, panel.rejected]).toEqual([
    figs!.checked, figs!.accepted, figs!.hold, figs!.rejected,
  ]);
  expect(stationQtyFromGroup(group, "balloon")?.available).toBe(1146);
  expect(stationQtyFromGroup(group, "assembly")).toBeNull();
});
