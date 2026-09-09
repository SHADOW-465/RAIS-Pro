import { eventEntryDate, partitionByEntryDate, REPORT_DATE_BASIS } from "../date-basis";
import { eventLotDate, scopeEvents } from "@/lib/analytics/scope";
import type { Event } from "@/lib/store/types";

function ev(partial: {
  eventId: string;
  recordedAt?: string | null;
  occurredOn?: string;
  batchNo?: string | null;
  qty?: number;
  eventType?: Event["eventType"];
  stageId?: string;
  disposition?: string;
}): Event {
  const day = partial.occurredOn ?? "2026-03-15";
  return {
    eventId: partial.eventId,
    schemaVersion: "1.0.0",
    ingestionId: "i",
    eventType: partial.eventType ?? "production",
    occurredOn: { kind: "day", start: day, end: day },
    provenance: {
      file: "ASSEMBLY.xlsx",
      fileHash: "h",
      sheet: "S",
      tableId: "t1",
      cells: ["A1"],
      headerPath: [],
      rowLabel: null,
      formulaText: null,
      cachedValue: null,
      externalRef: null,
    },
    confidence: { score: 1, basis: "exact" },
    extractedBy: "mod-extract",
    recordedAt: (partial.recordedAt !== undefined ? partial.recordedAt : `${day}T08:00:00.000Z`) as string,
    supersededBy: null,
    stageId: partial.stageId ?? "visual",
    size: "Fr14",
    quantity: partial.qty ?? 10,
    unit: "pcs",
    batchNo: partial.batchNo ?? null,
  } as unknown as Event;
}

describe("Date of Entry", () => {
  it("uses recordedAt, not lot calendar", () => {
    // 26C31-14 = 31 March 2026 lot; entered 2 April.
    const e = ev({
      eventId: "e1",
      batchNo: "26C31-14",
      occurredOn: "2026-03-31",
      recordedAt: "2026-04-02T11:00:00.000Z",
    });
    expect(eventEntryDate(e)).toBe("2026-04-02");
    expect(eventLotDate(e)).toBe("2026-03-31");
    expect(eventEntryDate(e)).not.toBe(eventLotDate(e));
  });

  it("includes boundary dates", () => {
    const a = ev({ eventId: "a", recordedAt: "2025-04-01T00:00:00.000Z" });
    const b = ev({ eventId: "b", recordedAt: "2026-03-31T23:59:59.000Z" });
    const part = partitionByEntryDate([a, b], "2025-04-01", "2026-03-31");
    expect(part.included.map((e) => e.eventId).sort()).toEqual(["a", "b"]);
  });

  it("surfaces missing and invalid entry dates instead of reassigning", () => {
    const missing = ev({ eventId: "m", recordedAt: null });
    const invalid = ev({ eventId: "i", recordedAt: "not-a-date" });
    const part = partitionByEntryDate([missing, invalid], "2025-04-01", "2026-03-31");
    expect(part.included).toHaveLength(0);
    expect(part.missingEntryDate.map((e) => e.eventId).sort()).toEqual(["i", "m"]);
    expect(eventEntryDate(missing)).toBeNull();
    expect(eventEntryDate(invalid)).toBeNull();
  });

  it("does not change existing lot-calendar scopeEvents behaviour", () => {
    const e = ev({
      eventId: "lot",
      batchNo: "26C31-14",
      occurredOn: "2026-03-31",
      recordedAt: "2026-04-02T11:00:00.000Z",
      qty: 100,
    });
    const fy = scopeEvents([e], { grain: "month", dateFrom: "2026-04-01", dateTo: "2027-03-31" });
    expect(fy).toHaveLength(0);
    const march = scopeEvents([e], { grain: "month", dateFrom: "2026-03-01", dateTo: "2026-03-31" });
    expect(march).toHaveLength(1);
  });

  it("only confirms entry-date as the report basis", () => {
    expect(REPORT_DATE_BASIS).toBe("entry-date");
  });
});
