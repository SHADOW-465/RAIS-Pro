import { upstreamRemainder } from "../upstream-remainder";

function ev(over: {
  stageId: string;
  eventType: string;
  disposition?: string;
  quantity: number;
  date: string;
  batch?: string;
  size?: string;
}) {
  return {
    eventType: over.eventType,
    disposition: over.disposition,
    stageId: over.stageId,
    quantity: over.quantity,
    occurredOn: { start: over.date },
    batchNo: over.batch ?? "26H01-18",
    size: over.size ?? "Fr18",
    extractedBy: "direct-entry",
  };
}

const visual = (date: string, accepted: number, checked = accepted) => [
  ev({ stageId: "visual", eventType: "production", quantity: checked, date }),
  ev({ stageId: "visual", eventType: "inspection", disposition: "accepted", quantity: accepted, date }),
];

const balloon = (date: string, checked: number) => [
  ev({ stageId: "balloon", eventType: "production", quantity: checked, date }),
];

describe("upstreamRemainder", () => {
  it("prefills Balloon from Visual accepted even when Visual ran on an earlier day", () => {
    const r = upstreamRemainder({
      events: visual("2026-08-01", 900, 1000),
      lot: "26H01-18",
      previousStation: "visual",
      currentStation: "balloon",
      size: "Fr18",
      excludeDate: "2026-08-04",
    });
    expect(r).toEqual({ previousAccepted: 900, alreadyChecked: 0, remaining: 900 });
  });

  it("sums split Visual days before computing what Balloon has left to check", () => {
    const r = upstreamRemainder({
      events: [...visual("2026-08-01", 450, 500), ...visual("2026-08-02", 450, 500)],
      lot: "26H01-18",
      previousStation: "visual",
      currentStation: "balloon",
      size: "Fr18",
      excludeDate: "2026-08-03",
    });
    expect(r.previousAccepted).toBe(900);
    expect(r.remaining).toBe(900);
  });

  it("subtracts Balloon days already on the ledger, but not the day being typed", () => {
    const r = upstreamRemainder({
      events: [
        ...visual("2026-08-01", 1000, 1000),
        ...balloon("2026-08-02", 400),
        ...balloon("2026-08-03", 50), // the day being typed — ignored
      ],
      lot: "26H01-18",
      previousStation: "visual",
      currentStation: "balloon",
      size: "Fr18",
      excludeDate: "2026-08-03",
    });
    expect(r.alreadyChecked).toBe(400);
    expect(r.remaining).toBe(600);
  });

  it("does not mix lots or sizes", () => {
    const r = upstreamRemainder({
      events: [
        ...visual("2026-08-01", 900, 1000),
        ev({ stageId: "visual", eventType: "inspection", disposition: "accepted", quantity: 5000, date: "2026-08-01", batch: "26H02-18" }),
        ev({ stageId: "visual", eventType: "inspection", disposition: "accepted", quantity: 700, date: "2026-08-01", size: "Fr16" }),
      ],
      lot: "26H01-18",
      previousStation: "visual",
      currentStation: "balloon",
      size: "Fr18",
      excludeDate: "2026-08-04",
    });
    expect(r.previousAccepted).toBe(900);
  });
});
