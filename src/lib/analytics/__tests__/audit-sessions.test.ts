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

  it("lot CHECKED is production-dipping, not Assembly Visual", () => {
    const events: AuditEventLike[] = [
      ev({ eventId: "d1", eventType: "production", stageId: "production-dipping", quantity: 2000, customFields: { batch: "27A01-20" }, occurredOn: { start: "2026-08-31", end: "2026-08-31" } } as any),
      ev({ eventId: "d1a", eventType: "inspection", stageId: "production-dipping", disposition: "accepted", quantity: 1500, customFields: { batch: "27A01-20" }, occurredOn: { start: "2026-08-31", end: "2026-08-31" } } as any),
      ev({ eventId: "d1r", eventType: "inspection", stageId: "production-dipping", disposition: "rejected", quantity: 500, customFields: { batch: "27A01-20" }, occurredOn: { start: "2026-08-31", end: "2026-08-31" } } as any),
      ev({ eventId: "d2", eventType: "production", stageId: "production-dipping", quantity: 1650, customFields: { batch: "27A01-20" }, occurredOn: { start: "2026-09-01", end: "2026-09-01" } } as any),
      ev({ eventId: "d2a", eventType: "inspection", stageId: "production-dipping", disposition: "accepted", quantity: 1450, customFields: { batch: "27A01-20" }, occurredOn: { start: "2026-09-01", end: "2026-09-01" } } as any),
      ev({ eventId: "d2r", eventType: "inspection", stageId: "production-dipping", disposition: "rejected", quantity: 200, customFields: { batch: "27A01-20" }, occurredOn: { start: "2026-09-01", end: "2026-09-01" } } as any),
      ev({ eventId: "v1", eventType: "production", stageId: "visual", quantity: 1000, customFields: { batch: "27A01-20" }, occurredOn: { start: "2026-08-31", end: "2026-08-31" } } as any),
      ev({ eventId: "v1a", eventType: "inspection", stageId: "visual", disposition: "accepted", quantity: 800, customFields: { batch: "27A01-20" }, occurredOn: { start: "2026-08-31", end: "2026-08-31" } } as any),
      ev({ eventId: "v1h", eventType: "inspection", stageId: "visual", disposition: "rework", quantity: 100, customFields: { batch: "27A01-20" }, occurredOn: { start: "2026-08-31", end: "2026-08-31" } } as any),
      ev({ eventId: "v1r", eventType: "inspection", stageId: "visual", disposition: "rejected", quantity: 100, customFields: { batch: "27A01-20" }, occurredOn: { start: "2026-08-31", end: "2026-08-31" } } as any),
    ];
    const rows = buildEntryRows(events);
    const visual = rows.find((r) => r.stageId === "visual")!;
    expect(visual.checked).toBe(visual.accepted + visual.rework + visual.rejected);

    const tree = groupByBatchThenStage(rows);
    expect(tree).toHaveLength(1);
    expect(tree[0].stages.map((s) => s.stageId)).toEqual(["production-dipping", "visual"]);
    expect(tree[0].checkedQty).toBe(3650);
    expect(tree[0].checkedQty).not.toBe(1000);
    expect(tree[0].rejectedQty).toBe(800);
  });

  it("last-write-wins: re-save does not double checked qty", () => {
    const events: AuditEventLike[] = [
      ev({
        eventId: "p-old",
        eventType: "production",
        stageId: "visual",
        quantity: 1000,
        recordedAt: "2025-04-01T10:00:00.000Z",
        customFields: { batch: "25A28" },
      } as any),
      ev({
        eventId: "p-new",
        eventType: "production",
        stageId: "visual",
        quantity: 900,
        recordedAt: "2025-04-01T12:00:00.000Z",
        customFields: { batch: "25A28" },
      } as any),
    ];
    for (const e of events) (e as any).size = "Fr16";
    const rows = buildEntryRows(events);
    expect(rows).toHaveLength(1);
    expect(rows[0].checked).toBe(900);
    expect(rows[0].hasCorrection || rows[0].revisionCount > 1).toBe(true);
  });
});

describe("buildEntryRows — held/reworked units", () => {
  it("reads Hold back from the ledger instead of dropping it", () => {
    // Visual: 1326 checked, 1163 accepted, 124 held, 39 rejected — the row
    // used to report checked/accepted/rejected only, so 1163+39=1202 never
    // visibly summed to 1326 and the missing 124 looked like lost data even
    // though the ledger held it as an inspection·rework event.
    const events: AuditEventLike[] = [
      ev({ eventId: "p1", eventType: "production", stageId: "visual", quantity: 1326, customFields: { batch: "26H25-18" } } as any),
      ev({ eventId: "i1", eventType: "inspection", stageId: "visual", disposition: "accepted", quantity: 1163, customFields: { batch: "26H25-18" } } as any),
      ev({ eventId: "i2", eventType: "inspection", stageId: "visual", disposition: "rework", quantity: 124, customFields: { batch: "26H25-18" } } as any),
      ev({ eventId: "i3", eventType: "inspection", stageId: "visual", disposition: "rejected", quantity: 39, customFields: { batch: "26H25-18" } } as any),
    ];
    const rows = buildEntryRows(events);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ checked: 1326, accepted: 1163, rework: 124, rejected: 39 });
    expect(rows[0].checked).toBe(rows[0].accepted + rows[0].rework + rows[0].rejected);
  });

  it("a stage that never captures Hold reports zero, not undefined", () => {
    const events: AuditEventLike[] = [
      ev({ eventId: "p1", eventType: "production", stageId: "final", quantity: 500, customFields: { batch: "26H25-18" } } as any),
    ];
    expect(buildEntryRows(events)[0].rework).toBe(0);
  });
});
