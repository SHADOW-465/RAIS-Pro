import type { Event } from "@/lib/store/types";
import { DERIVED_REGISTRY } from "../rejection";
import { plantTotalsFromEvents, rpcMatchesSelectors, selectTotalsEvents } from "../plant-totals";
import { rpcMissing } from "../server-totals";

const day = { kind: "day" as const, start: "2026-07-04", end: "2026-07-04" };

function ev(partial: Record<string, unknown>): Event {
  return {
    occurredOn: day,
    provenance: { file: "line.xlsx", sheet: "Day" },
    extractedBy: "excel",
    recordedAt: "2026-07-04T08:00:00.000Z",
    ...partial,
  } as unknown as Event;
}

const events = [
  ev({ eventId: "p", eventType: "production", stageId: "visual", quantity: 10, batchNo: "L1" }),
  ev({ eventId: "r", eventType: "inspection", stageId: "visual", disposition: "rejected", quantity: 2, batchNo: "L1" }),
];

const scope = { grain: "day" as const };

test("rpcMatchesSelectors accepts the same sums and rejects a different rejected qty", () => {
  const totals = plantTotalsFromEvents(events, scope, DERIVED_REGISTRY);
  const rpc = {
    daily: totals.daily,
    stages: [{ stageId: "visual", checked: 10, good: 8, rework: 0, rejected: 2 }],
    defects: [],
  };
  expect(rpcMatchesSelectors(totals, rpc, events, scope, DERIVED_REGISTRY)).toBe(true);
  expect(rpcMatchesSelectors(totals, { ...rpc, stages: [{ ...rpc.stages[0]!, rejected: 9 }] }, events, scope, DERIVED_REGISTRY)).toBe(false);
});

test("entry basis keeps the entry window and does not reapply a lot-date window", () => {
  const rows = [
    ev({ eventId: "in", eventType: "production", stageId: "visual", quantity: 4, recordedAt: "2026-08-01T00:00:00.000Z" }),
    ev({ eventId: "out", eventType: "production", stageId: "visual", quantity: 9, recordedAt: "2026-09-01T00:00:00.000Z" }),
  ];
  const selected = selectTotalsEvents(rows, {
    basis: "entry",
    scope: { grain: "month", dateFrom: "2026-07-01", dateTo: "2026-07-31" },
    entryFrom: "2026-08-01",
    entryTo: "2026-08-31",
  });
  expect(selected.scope.dateFrom).toBeUndefined();
  expect(selected.events.map((e) => e.eventId)).toEqual(["in"]);
  const totals = plantTotalsFromEvents(selected.events, selected.scope, DERIVED_REGISTRY);
  expect(totals.headlines.totalChecked).toBe(4);
});

test("rpcMissing recognises a function the database has not installed", () => {
  expect(rpcMissing({ code: "PGRST202", message: "Could not find the function public.totals_daily" })).toBe(true);
  expect(rpcMissing({ code: "42883", message: "function totals_daily does not exist" })).toBe(true);
  expect(rpcMissing({ code: "42P01", message: 'relation "effective_events" does not exist' })).toBe(true);
  expect(rpcMissing({ message: "schema cache miss" })).toBe(true);
  expect(rpcMissing({ code: "57014", message: "canceling statement due to statement timeout" })).toBe(false);
});
