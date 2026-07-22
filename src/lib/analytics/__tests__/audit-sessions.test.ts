import {
  groupAuditSessions,
  filterEventsByDatePreset,
  filterSessions,
  dateDaysAgo,
  buildEntryRows,
  groupByBatchThenStage,
  type AuditEventLike,
} from "../audit-sessions";

function ev(partial: Partial<AuditEventLike> & { eventId: string; eventType: string }): AuditEventLike {
  return {
    ingestionId: "ing-1",
    recordedAt: "2026-07-18T10:00:00.000Z",
    occurredOn: { start: "2026-07-18", end: "2026-07-18" },
    extractedBy: "direct-entry",
    provenance: { file: "Manual Entry", cells: ["ENTRY!A1"] },
    quantity: 0,
    ...partial,
  };
}

describe("groupAuditSessions", () => {
  it("collapses many events under one ingestion into one session", () => {
    const events: AuditEventLike[] = [
      ev({
        eventId: "p1",
        eventType: "production",
        stageId: "visual",
        quantity: 1000,
        customFields: { batch: "25A28" },
      }),
      ev({
        eventId: "i1",
        eventType: "inspection",
        stageId: "visual",
        disposition: "rejected",
        quantity: 40,
        customFields: { batch: "25A28" },
      }),
      ev({
        eventId: "r1",
        eventType: "rejection",
        stageId: "visual",
        quantity: 20,
        defectCodeRaw: "Thin Spod",
        customFields: { batch: "25A28" },
      }),
      ev({
        eventId: "r2",
        eventType: "rejection",
        stageId: "visual",
        quantity: 20,
        defectCodeRaw: "Bubble",
        customFields: { batch: "25A28" },
      }),
    ];
    const comments = new Map<string, string[]>([["i1", ["operator note"]]]);
    const sessions = groupAuditSessions(events, comments);
    expect(sessions).toHaveLength(1);
    expect(sessions[0].eventCount).toBe(4);
    expect(sessions[0].checkedQty).toBe(1000);
    expect(sessions[0].rejectedQty).toBe(40);
    expect(sessions[0].defectEventCount).toBe(2);
    expect(sessions[0].commentCount).toBe(1);
    expect(sessions[0].batches).toContain("25A28");
    expect(sessions[0].source).toBe("manual");
  });

  it("keeps separate ingestions as separate sessions", () => {
    const events = [
      ev({ eventId: "a", eventType: "production", ingestionId: "ing-a", quantity: 10 }),
      ev({ eventId: "b", eventType: "production", ingestionId: "ing-b", quantity: 20 }),
    ];
    const sessions = groupAuditSessions(events, new Map());
    expect(sessions).toHaveLength(2);
  });
});

describe("filterEventsByDatePreset", () => {
  it("keeps recent events for 30d window", () => {
    const now = new Date("2026-07-20T12:00:00.000Z");
    const events = [
      ev({
        eventId: "old",
        eventType: "production",
        occurredOn: { start: "2026-01-01", end: "2026-01-01" },
        recordedAt: "2026-01-01T00:00:00.000Z",
      }),
      ev({
        eventId: "new",
        eventType: "production",
        occurredOn: { start: "2026-07-15", end: "2026-07-15" },
        recordedAt: "2026-07-15T00:00:00.000Z",
      }),
    ];
    const kept = filterEventsByDatePreset(events, "30d", now);
    expect(kept.map((e) => e.eventId)).toEqual(["new"]);
    expect(dateDaysAgo(30, now)).toBe("2026-06-20");
  });
});

describe("filterSessions", () => {
  it("filters exceptions and batch search", () => {
    const sessions = groupAuditSessions(
      [
        ev({
          eventId: "p1",
          eventType: "production",
          ingestionId: "ing-1",
          customFields: { batch: "25A28" },
          quantity: 1,
        }),
        ev({
          eventId: "p2",
          eventType: "production",
          ingestionId: "ing-2",
          customFields: { batch: "99Z99" },
          quantity: 1,
        }),
      ],
      new Map([["p1", ["note"]]])
    );
    const withNote = filterSessions(sessions, { exceptionsOnly: true });
    expect(withNote).toHaveLength(1);
    expect(withNote[0].ingestionId).toBe("ing-1");

    const byBatch = filterSessions(sessions, { search: "99Z99" });
    expect(byBatch).toHaveLength(1);
    expect(byBatch[0].batches).toContain("99Z99");
  });
});

describe("buildEntryRows + groupByBatchThenStage", () => {
  it("collapses multi-event stage-day into one Excel-like row", () => {
    const events: AuditEventLike[] = [
      ev({
        eventId: "p1",
        eventType: "production",
        stageId: "visual",
        quantity: 1000,
        customFields: { batch: "25A28" },
        size: "Fr16",
      } as any),
      ev({
        eventId: "i1",
        eventType: "inspection",
        stageId: "visual",
        disposition: "rejected",
        quantity: 40,
        customFields: { batch: "25A28" },
        size: "Fr16",
      } as any),
      ev({
        eventId: "r1",
        eventType: "rejection",
        stageId: "visual",
        quantity: 25,
        defectCodeRaw: "Thin Spod",
        customFields: { batch: "25A28" },
        size: "Fr16",
      } as any),
      ev({
        eventId: "r2",
        eventType: "rejection",
        stageId: "visual",
        quantity: 15,
        defectCodeRaw: "Bubble",
        customFields: { batch: "25A28" },
        size: "Fr16",
      } as any),
      // different stage same batch → second row
      ev({
        eventId: "p2",
        eventType: "production",
        stageId: "balloon",
        quantity: 960,
        customFields: { batch: "25A28" },
        size: "Fr16",
      } as any),
    ];
    // size field on event-like - buildEntryRows uses sizeOf from (e as any).size
    for (const e of events) (e as any).size = "Fr16";

    const rows = buildEntryRows(events);
    expect(rows).toHaveLength(2);
    const visual = rows.find((r) => r.stageId === "visual")!;
    expect(visual.checked).toBe(1000);
    expect(visual.rejected).toBe(40);
    expect(visual.defects).toEqual(
      expect.arrayContaining([
        { code: "Thin Spod", qty: 25 },
        { code: "Bubble", qty: 15 },
      ])
    );

    const tree = groupByBatchThenStage(rows);
    expect(tree).toHaveLength(1);
    expect(tree[0].batch).toBe("25A28");
    expect(tree[0].stages.map((s) => s.stageId)).toEqual(["visual", "balloon"]);
  });
});
