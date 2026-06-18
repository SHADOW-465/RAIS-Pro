import { getPayload, mapRowToEvent } from "../supabase-mappers";
import type { Event } from "../types";

describe("supabase-mappers", () => {
  const event = {
    eventId: "evt-1",
    schemaVersion: "1.0.0",
    ingestionId: "ing-1",
    eventType: "production",
    occurredOn: { kind: "day", start: "2025-04-01", end: "2025-04-01" },
    provenance: { file: "f.xlsx", sheet: "APRIL 25", cells: ["B6"] },
    confidence: { score: 0.9, basis: "heuristic" },
    extractedBy: "heuristic",
    recordedAt: "2026-06-18T00:00:00.000Z",
    supersededBy: null,
    stageId: "visual",
    quantity: 10982,
    unit: "pcs",
    batchNo: null,
    size: null,
  } as unknown as Event;

  it("getPayload strips the envelope, keeping only domain fields", () => {
    const payload = getPayload(event);
    expect(payload).toEqual({
      stageId: "visual",
      quantity: 10982,
      unit: "pcs",
      batchNo: null,
      size: null,
    });
    expect(payload).not.toHaveProperty("eventId");
    expect(payload).not.toHaveProperty("eventType");
  });

  it("round-trips an event through a DB row and back", () => {
    const row = {
      event_id: event.eventId,
      schema_version: event.schemaVersion,
      ingestion_id: event.ingestionId,
      event_type: event.eventType,
      occurred_on: event.occurredOn,
      provenance: event.provenance,
      confidence: event.confidence,
      extracted_by: event.extractedBy,
      recorded_at: event.recordedAt,
      superseded_by: event.supersededBy,
      payload: getPayload(event),
    };
    const back = mapRowToEvent(row);
    expect(back).toEqual(event);
  });
});
