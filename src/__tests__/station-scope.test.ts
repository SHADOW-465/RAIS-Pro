// Regression: heterogeneous stage date coverage must not zero-out a station.
//
// Real data: the VISUAL stage spans the whole year (from the visual-inspection
// report) while BALLOON / VALVE / FINAL exist only for the month(s) that a
// REJECTION ANALYSIS workbook was uploaded (e.g. December). The dashboard's
// "latest period" snapshot is therefore March, which has NO balloon data — so a
// balloon view scoped to the GLOBAL snapshot reads zero even though balloon data
// exists. A station view MUST scope to that station's own latest period.

import { emitMany, type StageDayRecord } from "@/lib/ingest/emit";
import { deriveScopes } from "@/lib/analytics/scope";
import { rejectionRate, byStage } from "@/lib/analytics/rejection";

function rec(stageId: string, date: string, checked: number, rejected: number): StageDayRecord {
  return {
    occurredOn: { kind: "day", start: date, end: date },
    stageId,
    source: { file: "t.xlsx", fileHash: "h", sheet: stageId, tableId: "t1" },
    checked: { value: checked, cell: `${stageId}!C1`, header: "QTY CHECKED" },
    acceptedGood: null,
    rework: null,
    rejected: { value: rejected, cell: `${stageId}!D1`, header: "REJECTION" },
    defects: [],
    statedPct: null,
    extractedBy: "direct-entry",
    ingestionId: "test",
  };
}

describe("per-stage snapshot scoping", () => {
  // visual: Jan–Mar 2026; balloon: Dec 2025 only.
  const events = emitMany([
    rec("visual", "2026-01-15", 1000, 50),
    rec("visual", "2026-02-15", 1000, 40),
    rec("visual", "2026-03-15", 1000, 30),
    rec("balloon", "2025-12-10", 800, 16),
    rec("balloon", "2025-12-20", 700, 14),
  ]);

  it("global latest period is March 2026 (driven by visual)", () => {
    expect(deriveScopes(events, "month").latestPeriod).toBe("2026-03");
  });

  it("BUG shape: balloon scoped to the GLOBAL snapshot reads zero", () => {
    const globalSnap = deriveScopes(events, "month").snapshotScope;
    expect(rejectionRate(events, { ...globalSnap, stageIds: ["balloon"] }).value).toBe(0);
  });

  it("FIX: balloon scoped to its OWN latest period is non-zero", () => {
    const balloonEvents = events.filter((e) => "stageId" in e && (e as { stageId?: string }).stageId === "balloon");
    const stationSnap = deriveScopes(balloonEvents, "month").snapshotScope;
    expect(deriveScopes(balloonEvents, "month").latestPeriod).toBe("2025-12");
    expect(rejectionRate(events, { ...stationSnap, stageIds: ["balloon"] }).value).toBeGreaterThan(0);
  });

  it("full-span byStage surfaces every station (drives YTD cards + tabs)", () => {
    const full = deriveScopes(events, "month").trendScope;
    const stages = byStage(events, full).map((s) => s.stageId);
    expect(stages).toContain("visual");
    expect(stages).toContain("balloon");
  });
});
