import { defectsFromAuditRow, hydrateFromAuditRow, hydrateFromBatchGroup } from "../hydrate-entry";
import type { AuditEntryRow } from "@/lib/analytics/audit-sessions";

function row(over: Partial<AuditEntryRow> = {}): AuditEntryRow {
  return {
    id: "2026-08-17|26H17-14|visual|Fr14",
    date: "2026-08-17",
    batch: "26H17-14",
    stageId: "visual",
    size: "Fr14",
    checked: 500,
    accepted: 470,
    rejected: 20,
    rework: 10,
    defects: [
      { code: "AIR", qty: 12 },
      { code: "PH", qty: 8 },
      { code: "ZERO", qty: 0 },
    ],
    source: "manual",
    fileLabel: "Data Entry",
    recordedAt: "2026-08-17T10:00:00.000Z",
    eventIds: ["e1"],
    commentCount: 0,
    hasCorrection: false,
    revisionCount: 1,
    shifts: ["Day Shift"],
    productType: "2 way",
    ...over,
  };
}

test("hydrateFromAuditRow for edit carries the recorded quantities", () => {
  const h = hydrateFromAuditRow(row(), "edit");
  expect(h.mode).toBe("edit");
  expect(h.batchId).toBe("26H17-14");
  expect(h.date).toBe("2026-08-17");
  expect(h.stageId).toBe("visual");
  expect(h.size).toBe("14Fr");
  expect(h.checked).toBe(500);
  expect(h.accepted).toBe(470);
  expect(h.hold).toBe(10);
  expect(h.rejected).toBe(20);
  expect(h.defects).toEqual({ AIR: 12, PH: 8 });
  expect(h.shift).toBe("Day Shift");
  expect(h.editingId).toBe("ledger:2026-08-17|26H17-14|visual|Fr14");
});

test("reuse-lot still keeps the row figures so the caller can ignore them", () => {
  const h = hydrateFromAuditRow(row(), "reuse-lot");
  expect(h.mode).toBe("reuse-lot");
  expect(h.batchId).toBe("26H17-14");
  expect(h.checked).toBe(500);
});

test("defectsFromAuditRow drops zero quantities", () => {
  expect(defectsFromAuditRow({ defects: [{ code: "AIR", qty: 0 }] })).toEqual({});
});

test("hydrateFromBatchGroup prefers the requested station and keeps recorded quantities", () => {
  const visual = row({ stageId: "visual", checked: 500, accepted: 470 });
  const balloon = row({
    id: "2026-08-17|26H17-14|balloon|Fr14",
    stageId: "balloon",
    checked: 400,
    accepted: 380,
    rejected: 10,
    rework: 10,
  });
  const h = hydrateFromBatchGroup(
    {
      batch: "26H17-14",
      stages: [
        { stageId: "visual", rows: [visual], checkedQty: 500, acceptedQty: 470, rejectedQty: 20, holdQty: 10, rowCount: 1 },
        { stageId: "balloon", rows: [balloon], checkedQty: 400, acceptedQty: 380, rejectedQty: 10, holdQty: 10, rowCount: 1 },
      ],
      checkedQty: 500,
      acceptedQty: 380,
      rejectedQty: 30,
      rowCount: 2,
      eventCount: 2,
      dateFrom: "2026-08-17",
      dateTo: "2026-08-17",
      sources: ["manual"],
    },
    { stageId: "balloon" },
  );
  expect(h?.batchId).toBe("26H17-14");
  expect(h?.stageId).toBe("balloon");
  expect(h?.checked).toBe(400);
  expect(h?.mode).toBe("edit");
});

test("hydrateFromBatchGroup without ledger rows still locks the lot identity", () => {
  const h = hydrateFromBatchGroup(null, { batchId: "26I17-30", date: "2026-09-17", size: "30Fr" });
  expect(h?.mode).toBe("reuse-lot");
  expect(h?.batchId).toBe("26I17-30");
  expect(h?.checked).toBe(0);
});

test("a station the lot never reached is not swapped for its first station", () => {
  const visual = row({ stageId: "visual" });
  const h = hydrateFromBatchGroup(
    {
      batch: "26H17-14",
      stages: [{ stageId: "visual", rows: [visual], checkedQty: 500, acceptedQty: 470, rejectedQty: 20, holdQty: 10, rowCount: 1 }],
      checkedQty: 500, acceptedQty: 470, rejectedQty: 20, rowCount: 1, eventCount: 1,
      dateFrom: "2026-08-17", dateTo: "2026-08-17", sources: ["manual"],
    },
    { stageId: "balloon" },
  );
  expect(h?.checked).toBe(0);
  expect(h?.mode).toBe("reuse-lot");
});

test("several rows at the station open as the station totals, not the newest row", () => {
  const a = row({ id: "a", date: "2026-08-18", checked: 1000, accepted: 800, rejected: 200, rework: 0, defects: [{ code: "AIR", qty: 5 }] });
  const b = row({ id: "b", date: "2026-08-17", checked: 700, accepted: 461, rejected: 239, rework: 0, defects: [{ code: "AIR", qty: 7 }] });
  const h = hydrateFromBatchGroup(
    {
      batch: "26H17-14",
      stages: [{ stageId: "visual", rows: [a, b], checkedQty: 1700, acceptedQty: 1261, rejectedQty: 439, holdQty: 0, rowCount: 2 }],
      checkedQty: 1700, acceptedQty: 1261, rejectedQty: 439, rowCount: 2, eventCount: 2,
      dateFrom: "2026-08-17", dateTo: "2026-08-18", sources: ["manual"],
    },
    { stageId: "visual" },
  );
  expect(h).toMatchObject({ mode: "reuse-lot", checked: 1700, accepted: 1261, hold: 0, rejected: 439, defects: { AIR: 12 } });
});
