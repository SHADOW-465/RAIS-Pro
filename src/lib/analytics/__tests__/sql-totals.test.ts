// Parity between the SQL-contract reference and the JS selectors.
// Fixtures stay inside the region both sides share: one source file, one size
// tier, unique event ids. canonicalizeEvents is a no-op on that set, so a
// mismatch here is a real contract bug.

import type { Event } from "@/lib/store/types";
import { MemoryEventStore } from "@/lib/store/memory";
import { aggregate, byStage, stagesFor, DERIVED_REGISTRY, type Registry } from "../rejection";
import { byDefect } from "../defect";
import { DEFAULT_POLICY } from "@/core/policy/policy";
import { effectiveEvents, totalsDaily, totalsStage, totalsDefect, type SqlAlias } from "../sql-totals";

const REGISTRY: Registry = {
  stages: [
    { stageId: "visual", label: "Visual" },
    { stageId: "balloon", label: "Balloon" },
    { stageId: "final", label: "Final" },
  ],
  defects: [{ defectCode: "THSP", label: "Thin spot", aliases: ["thin spod"] }],
  sizes: [],
  fiscalYearStartMonth: 4,
};

const ALIASES: SqlAlias[] = [
  { key: "THSP", canonicalId: "THSP", label: "Thin spot" },
  { key: "thin spod", canonicalId: "DEFECT:THSP", label: "Thin spot" },
];

const SCOPE = { grain: "day" as const };

let n = 0;
function ev(partial: Record<string, unknown>): Event {
  n += 1;
  return {
    eventId: (partial.eventId as string) ?? `e${n}`,
    occurredOn: { kind: "day", start: "2026-07-04", end: "2026-07-04" },
    provenance: { file: "line.xlsx", sheet: "Day" },
    extractedBy: "excel",
    ...partial,
  } as unknown as Event;
}

function orderOf(events: Event[], registry: Registry = REGISTRY): string[] {
  return stagesFor(events, registry).map((s) => s.stageId);
}

test("effective set drops superseded rows and keeps the correction", async () => {
  const original = ev({ eventId: "p-old", eventType: "production", stageId: "visual", quantity: 50, batchNo: "L1" });
  const replacement = ev({ eventId: "p-new", eventType: "production", stageId: "visual", quantity: 80, batchNo: "L1" });
  const correction = ev({
    eventId: "c1",
    eventType: "correction",
    supersedesEventId: "p-old",
    occurredOn: { kind: "day", start: "2026-07-05", end: "2026-07-05" },
  });
  const all = [original, replacement, correction];
  const store = new MemoryEventStore();
  await store.append(all);
  const fromStore = (await store.effective()).map((e) => e.eventId).sort();
  const fromRef = effectiveEvents(all).map((e) => e.eventId).sort();
  expect(fromRef).toEqual(fromStore);
  expect(fromRef).toEqual(["c1", "p-new"]);

  const stage = totalsStage(all, { stageOrder: orderOf(effectiveEvents(all)) });
  const js = byStage(effectiveEvents(all), SCOPE, REGISTRY);
  expect(stage.find((r) => r.stageId === "visual")?.checked).toBe(80);
  expect(js.find((r) => r.stageId === "visual")?.checked).toBe(80);
});

test("daily sums match aggregate() per occurredOn.start, including the defect fallback and rework policy", () => {
  const events = [
    ev({ eventType: "production", stageId: "visual", quantity: 100, occurredOn: { kind: "day", start: "2026-07-04", end: "2026-07-04" } }),
    ev({ eventType: "inspection", stageId: "visual", disposition: "accepted", quantity: 90, occurredOn: { kind: "day", start: "2026-07-04", end: "2026-07-04" } }),
    ev({ eventType: "inspection", stageId: "visual", disposition: "rework", quantity: 5, occurredOn: { kind: "day", start: "2026-07-04", end: "2026-07-04" } }),
    ev({ eventType: "rejection", stageId: "visual", quantity: 4, defectCode: "THSP", occurredOn: { kind: "day", start: "2026-07-04", end: "2026-07-04" } }),
    ev({ eventType: "production", stageId: "balloon", quantity: 40, occurredOn: { kind: "day", start: "2026-07-05", end: "2026-07-05" } }),
    ev({ eventType: "inspection", stageId: "balloon", disposition: "rejected", quantity: 3, occurredOn: { kind: "day", start: "2026-07-05", end: "2026-07-05" } }),
    ev({ eventType: "rejection", stageId: "balloon", quantity: 9, defectCodeRaw: "ignored when inspection rejected exists", occurredOn: { kind: "day", start: "2026-07-05", end: "2026-07-05" } }),
    ev({ eventType: "production", stageId: "final", quantity: 7, occurredOn: { kind: "day", start: "2026-06-01", end: "2026-06-01" } }),
  ];

  const ref = totalsDaily(events, { from: "2026-07-01", to: "2026-07-31" });
  const inWindow = events.filter((e) => e.occurredOn.start >= "2026-07-01" && e.occurredOn.end <= "2026-07-31");
  const days = [...new Set(inWindow.map((e) => e.occurredOn.start))].sort();
  const js = days.map((day) => ({
    day,
    ...aggregate(inWindow.filter((e) => e.occurredOn.start === day), DEFAULT_POLICY),
  }));
  expect(ref).toEqual(js);

  const withRework = totalsDaily(events, { from: "2026-07-04", to: "2026-07-04", reworkCountsAs: "checked" });
  const day = events.filter((e) => e.occurredOn.start === "2026-07-04");
  expect(withRework[0]?.checked).toBe(aggregate(day, { ...DEFAULT_POLICY, reworkCountsAs: "checked" }).checked);
  expect(withRework[0]?.checked).toBe(105);
});

test("stage cascade matches byStage, and a null batchNo does not borrow customFields.batch", () => {
  const batched = [
    ev({ eventType: "production", stageId: "visual", quantity: 400, batchNo: "B1" }),
    ev({ eventType: "inspection", stageId: "visual", disposition: "accepted", quantity: 300, batchNo: "B1" }),
    ev({ eventType: "inspection", stageId: "visual", disposition: "rejected", quantity: 100, batchNo: "B1" }),
    ev({ eventType: "production", stageId: "balloon", quantity: 400, batchNo: "B1" }),
    ev({ eventType: "inspection", stageId: "balloon", disposition: "rejected", quantity: 20, batchNo: "B1" }),
    ev({ eventType: "inspection", stageId: "balloon", disposition: "rework", quantity: 10, batchNo: "B1" }),
  ];
  const unbatched = [
    ev({ eventType: "production", stageId: "visual", quantity: 50, batchNo: null, customFields: { batch: "SHOULD-NOT-CASCADE" } }),
    ev({ eventType: "inspection", stageId: "visual", disposition: "rejected", quantity: 5, batchNo: null, customFields: { batch: "SHOULD-NOT-CASCADE" } }),
    ev({ eventType: "production", stageId: "final", quantity: 12, customFields: { batch: "C9" } }),
    ev({ eventType: "inspection", stageId: "final", disposition: "accepted", quantity: 12, customFields: { batch: "C9" } }),
  ];
  const events = [...batched, ...unbatched];
  const stageOrder = orderOf(events);
  const ref = totalsStage(events, { stageOrder });
  const js = byStage(events, SCOPE, REGISTRY);

  expect(ref.map((r) => r.stageId)).toEqual(js.map((r) => r.stageId));
  for (const row of js) {
    const got = ref.find((r) => r.stageId === row.stageId);
    expect(got).toMatchObject({ checked: row.checked, good: row.good, rework: row.rework, rejected: row.rejected });
  }

  const visual = ref.find((r) => r.stageId === "visual")!;
  // Batched 400 plus the null-batchNo row's own 50. Not cascaded as SHOULD-NOT-CASCADE.
  expect(visual.checked).toBe(450);
  expect(visual.rejected).toBe(105);
  const balloon = ref.find((r) => r.stageId === "balloon")!;
  // Later gate restated the lot size, so checked becomes Visual's accepted 300.
  expect(balloon.checked).toBe(300);
  expect(balloon.rejected).toBe(20);
  expect(balloon.rework).toBe(10);

  const checkedPolicy = totalsStage(events, { stageOrder, reworkCountsAs: "checked" });
  const jsChecked = byStage(events, { ...SCOPE, policy: { ...DEFAULT_POLICY, reworkCountsAs: "checked" } }, REGISTRY);
  for (const row of jsChecked) {
    expect(checkedPolicy.find((r) => r.stageId === row.stageId)?.checked).toBe(row.checked);
  }
});

test("defect pareto matches byDefect for a stored code, an alias, an unresolved raw, and unclassified", () => {
  const events = [
    ev({ eventType: "rejection", stageId: "visual", quantity: 10, defectCode: "THSP" }),
    ev({ eventType: "rejection", stageId: "visual", quantity: 3, defectCodeRaw: "thin-spod" }),
    ev({ eventType: "rejection", stageId: "balloon", quantity: 7, defectCodeRaw: "mystery blob" }),
    ev({ eventType: "rejection", stageId: "final", quantity: 1 }),
    ev({ eventType: "production", stageId: "visual", quantity: 100 }),
  ];
  const ref = totalsDefect(events, { aliases: ALIASES });
  const js = byDefect(events, SCOPE, REGISTRY);
  expect(ref.map((r) => ({ defectCode: r.defectCode, label: r.label, rejected: r.rejected, unresolved: r.unresolved }))).toEqual(
    js.map((r) => ({ defectCode: r.defectCode, label: r.label, rejected: r.rejected, unresolved: r.unresolved })),
  );
  expect(ref[0]?.pct).toBeCloseTo(js[0]!.pct, 6);
  expect(ref[ref.length - 1]?.cumPct).toBeCloseTo(100, 6);
  expect(ref.find((r) => r.defectCode === "THSP")?.rejected).toBe(13);
  expect(ref.find((r) => r.label === "mystery blob · unresolved")?.rejected).toBe(7);
  expect(ref.find((r) => r.label === "Unclassified")?.rejected).toBe(1);
});

test("an empty stage filter does not drop rows, and a set stage filter does", () => {
  const events = [
    ev({ eventType: "production", stageId: "visual", quantity: 10 }),
    ev({ eventType: "production", stageId: "balloon", quantity: 4 }),
  ];
  expect(totalsDaily(events, { stageIds: [] }).reduce((a, r) => a + r.checked, 0)).toBe(14);
  expect(totalsDaily(events, { stageIds: ["balloon"] }).map((r) => r.checked)).toEqual([4]);
  expect(totalsStage(events, { stageIds: ["visual"], stageOrder: ["visual", "balloon"] }).map((r) => r.stageId)).toEqual(["visual"]);
});

test("derived registry order still matches byStage when the catalog is empty", () => {
  const events = [
    ev({ eventType: "production", stageId: "final", quantity: 8, batchNo: "Z" }),
    ev({ eventType: "production", stageId: "visual", quantity: 20, batchNo: "Z" }),
    ev({ eventType: "inspection", stageId: "visual", disposition: "accepted", quantity: 15, batchNo: "Z" }),
    ev({ eventType: "inspection", stageId: "visual", disposition: "rejected", quantity: 5, batchNo: "Z" }),
    ev({ eventType: "production", stageId: "final", quantity: 20, batchNo: "Z" }),
  ];
  const stageOrder = orderOf(events, DERIVED_REGISTRY);
  const ref = totalsStage(events, { stageOrder });
  const js = byStage(events, SCOPE, DERIVED_REGISTRY);
  expect(ref.map((r) => [r.stageId, r.checked, r.rejected])).toEqual(js.map((r) => [r.stageId, r.checked, r.rejected]));
});
