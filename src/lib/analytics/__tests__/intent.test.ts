import { resolveIntentDeterministic, CONFIDENT, type IntentCtx } from "../intent";
import type { Event } from "@/lib/store/types";

const ev = (over: Partial<Event>) => over as unknown as Event;
const EVENTS: Event[] = [
  ev({ eventType: "rejection", stageId: "balloon", size: "24Fr", defectCode: "PINHOLE" }),
  ev({ eventType: "rejection", stageId: "visual", size: "22Fr", defectCode: "CRACK" }),
];
const baseCtx = (persona: IntentCtx["persona"] = "qe"): IntentCtx => ({
  events: EVENTS,
  currentScope: { grain: "month" },
  persona,
  dataMaxIso: "2025-08-15",
});

describe("resolveIntentDeterministic", () => {
  it("routes 'rejection in April' to defect analysis, scoped to April", () => {
    const r = resolveIntentDeterministic("rejection in April", baseCtx());
    expect(r.navKey).toBe("defect");
    expect(r.state).toMatchObject({ grain: "month", from: "2025-04-01", to: "2025-04-30", metric: "defect" });
    expect(r.confidence).toBeGreaterThanOrEqual(CONFIDENT);
    expect(r.highlights).toContain("defect");
  });

  it("routes a matched gate to stage analysis", () => {
    const r = resolveIntentDeterministic("balloon gate problems", baseCtx());
    expect(r.navKey).toBe("stage");
    expect(r.state.stage).toBe("balloon");
    expect(r.matched.stage).toBe("balloon");
  });

  it("routes a matched size to size analysis", () => {
    const r = resolveIntentDeterministic("24Fr issues", baseCtx());
    expect(r.navKey).toBe("size");
    expect(r.state.size).toBe("24Fr");
  });

  it("routes copq to the copq screen", () => {
    const r = resolveIntentDeterministic("copq this fy", baseCtx());
    expect(r.navKey).toBe("copq");
    expect(r.state).toMatchObject({ grain: "fy", metric: "copq" });
  });

  it("does not route an operator to a screen their role can't see", () => {
    const r = resolveIntentDeterministic("copq this fy", baseCtx("operator"));
    // operator navAllow = ["dashboard","data-entry"] → copq denied
    expect(["dashboard", "data-entry"]).toContain(r.navKey);
    expect(r.confidence).toBeLessThan(CONFIDENT);
  });

  it("returns alternatives when nothing confident matches", () => {
    const r = resolveIntentDeterministic("what should I look at", baseCtx());
    expect(r.confidence).toBeLessThan(CONFIDENT);
    expect(r.alternatives.length).toBeGreaterThan(0);
  });
});
