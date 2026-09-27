// History groups lots by calendar period so the topbar Day / Month / FY
// selector actually does something on the Data Entry screen.

import { groupByPeriod, type AuditBatchGroup } from "../audit-sessions";

const group = (batch: string, dateFrom: string, dateTo: string, rowCount = 1): AuditBatchGroup =>
  ({
    batch,
    stages: [],
    checkedQty: 0,
    acceptedQty: 0,
    rejectedQty: 0,
    rowCount,
    eventCount: rowCount,
    dateFrom,
    dateTo,
    sources: ["manual"],
  }) as AuditBatchGroup;

describe("groupByPeriod", () => {
  const lots = [
    group("26H19-14", "2026-08-19", "2026-08-19", 3),
    group("26H19-16", "2026-08-19", "2026-08-19", 2),
    group("26H18-14", "2026-08-18", "2026-08-18", 4),
    group("26G02-12", "2026-07-02", "2026-07-02", 1),
  ];

  it("buckets by day", () => {
    const out = groupByPeriod(lots, "day");
    expect(out.map((p) => p.period)).toEqual(["2026-08-19", "2026-08-18", "2026-07-02"]);
    expect(out[0].batchCount).toBe(2);
    expect(out[0].rowCount).toBe(5);
  });

  it("buckets by month", () => {
    const out = groupByPeriod(lots, "month");
    expect(out.map((p) => p.period)).toEqual(["2026-08", "2026-07"]);
    expect(out[0].batchCount).toBe(3);
    expect(out[0].rowCount).toBe(9);
  });

  it("buckets by fiscal year — Apr–Mar, so Jul and Aug 2026 are one year", () => {
    const out = groupByPeriod(lots, "fy");
    expect(out).toHaveLength(1);
    expect(out[0].batchCount).toBe(4);
  });

  it("is newest first — what you just entered is at the top", () => {
    const out = groupByPeriod(lots, "day");
    expect(out[0].period).toBe("2026-08-19");
    expect(out[out.length - 1].period).toBe("2026-07-02");
  });

  it("keeps a multi-day lot whole, filed under its production date", () => {
    // A lot spans days on the floor (started 17 Aug, last logged 19 Aug), but
    // the batch id is the one spelling of "when this lot was made" — splitting
    // its stages across two headers would break the one thing this screen
    // exists for, so it files under the id, not the last stage touched.
    const spanning = [group("26H17-14", "2026-08-17", "2026-08-19", 5)];
    const out = groupByPeriod(spanning, "day");
    expect(out).toHaveLength(1);
    expect(out[0].period).toBe("2026-08-17");
    expect(out[0].groups[0].batch).toBe("26H17-14");
  });

  it("labels each bucket for a header", () => {
    expect(groupByPeriod(lots, "month")[0].label).toBe("Aug-26");
    expect(groupByPeriod(lots, "day")[0].label).toMatch(/19/);
  });

  it("does not lose a lot with no date and no parseable batch id", () => {
    const out = groupByPeriod([group("(no batch)", "", "")], "day");
    expect(out).toHaveLength(1);
    expect(out[0].label).toBe("No date recorded");
  });

  it("falls back to dateTo/dateFrom when the batch id can't be parsed", () => {
    const out = groupByPeriod([group("hand-typed-oddity", "2026-08-19", "2026-08-19")], "day");
    expect(out).toHaveLength(1);
    expect(out[0].period).toBe("2026-08-19");
  });

  it("returns nothing for nothing", () => {
    expect(groupByPeriod([], "month")).toEqual([]);
  });

  it("accounts for every lot exactly once, whatever the grain", () => {
    for (const grain of ["day", "week", "month", "fy"] as const) {
      const out = groupByPeriod(lots, grain);
      const seen = out.flatMap((p) => p.groups.map((g) => g.batch));
      expect(seen.sort()).toEqual(lots.map((l) => l.batch).sort());
    }
  });
});
