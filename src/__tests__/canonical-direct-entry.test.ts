import { canonicalizeEvents } from "@/lib/analytics/canonical";
import type { Event } from "@/lib/store/types";

function inspectionEvent(overrides: Partial<any>): Event {
  return {
    eventId: overrides.eventId,
    schemaVersion: "1.0.0",
    ingestionId: "test",
    eventType: "inspection",
    disposition: "rejected",
    stageId: "visual",
    quantity: overrides.quantity,
    unit: "pcs",
    batchNo: null,
    size: overrides.size ?? null,
    occurredOn: { kind: "day", start: "2026-05-02", end: "2026-05-02" },
    provenance: { file: overrides.file, fileHash: "x", sheet: "s", tableId: "t1", cells: ["A1"], headerPath: [], rowLabel: null, formulaText: null, cachedValue: null, externalRef: null },
    confidence: { score: 1, basis: overrides.extractedBy === "direct-entry" ? "exact" : "heuristic" },
    extractedBy: overrides.extractedBy ?? "heuristic",
    recordedAt: "2026-05-02T00:00:00.000Z",
    supersededBy: null,
  } as unknown as Event;
}

test("a direct-entry record is never shadowed by an uploaded file for the same stage+day", () => {
  const uploaded = inspectionEvent({ eventId: "e1", file: "2 MAY 25.xlsx", quantity: 100 });
  const manual = inspectionEvent({ eventId: "e2", file: "Manual Entry", extractedBy: "direct-entry", quantity: 7 });

  const kept = canonicalizeEvents([uploaded, manual]);

  expect(kept.map((e) => e.eventId)).toEqual(["e2"]);
});

test("without a competing direct entry, the highest-precedence uploaded file still wins", () => {
  const cumulative = inspectionEvent({ eventId: "e1", file: "COMMULATIVE 2025-26.xlsx", quantity: 100 });
  const sizeWise = inspectionEvent({ eventId: "e2", file: "2 MAY 25.xlsx", size: "Fr8", quantity: 50 });

  const kept = canonicalizeEvents([cumulative, sizeWise]);

  expect(kept.map((e) => e.eventId)).toEqual(["e2"]);
});
