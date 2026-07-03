// Timeline completeness: charts must show every calendar period in range,
// not just the periods that happen to have records.
import { calendarPeriods, periodsIn } from "@/lib/analytics/scope";
import { trend } from "@/lib/analytics/rejection";
import type { Event } from "@/lib/store/types";

const ev = (date: string, qty: number, disposition?: string): Event =>
  ({
    eventId: `e-${date}-${qty}-${disposition ?? "prod"}`,
    eventType: disposition ? "inspection" : "production",
    disposition,
    stageId: "visual",
    quantity: qty,
    occurredOn: { kind: "day", start: date, end: date },
  } as unknown as Event);

describe("calendarPeriods", () => {
  it("enumerates every month between bounds", () => {
    expect(calendarPeriods("2025-04-10", "2025-12-05", "month")).toEqual([
      "2025-04", "2025-05", "2025-06", "2025-07", "2025-08",
      "2025-09", "2025-10", "2025-11", "2025-12",
    ]);
  });

  it("enumerates every day inclusive", () => {
    expect(calendarPeriods("2025-01-30", "2025-02-02", "day")).toEqual([
      "2025-01-30", "2025-01-31", "2025-02-01", "2025-02-02",
    ]);
  });
});

describe("periodsIn gap fill", () => {
  const events = [ev("2025-04-15", 100), ev("2025-07-01", 50), ev("2025-12-20", 10)];

  it("keeps months without records on the axis", () => {
    expect(periodsIn(events, "month")).toHaveLength(9); // Apr..Dec, no compression
  });

  it("honors an explicit selected range beyond the data", () => {
    expect(periodsIn(events, "month", { from: "2025-01-01", to: "2025-12-31" })).toHaveLength(12);
  });

  it("returns [] with no events and no range", () => {
    expect(periodsIn([], "month")).toEqual([]);
  });
});

describe("trend over sparse data", () => {
  it("emits a zero-valued point for empty periods instead of dropping them", () => {
    const events = [
      ev("2025-04-10", 100), ev("2025-04-10", 5, "rejected"),
      ev("2025-06-10", 200), ev("2025-06-10", 8, "rejected"),
    ];
    const pts = trend(events, { grain: "month" }, "rejectionRate");
    expect(pts.map((p) => p.period)).toEqual(["2025-04", "2025-05", "2025-06"]);
    expect(pts[1].value).toBe(0); // May exists, empty
  });
});
