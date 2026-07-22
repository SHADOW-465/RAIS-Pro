import { buildEntitySets, scoreMatch, matchMetric, screenForMetric } from "../intent-vocab";
import type { Event } from "@/lib/store/types";

const ev = (over: Partial<Event>) => over as unknown as Event;

describe("buildEntitySets", () => {
  it("collects distinct stages, sizes, defects from events", () => {
    const sets = buildEntitySets([
      ev({ eventType: "rejection", stageId: "balloon", size: "24Fr", defectCode: "PINHOLE" }),
      ev({ eventType: "rejection", stageId: "visual", size: "24Fr", defectCode: "CRACK" }),
    ]);
    expect([...sets.stages].sort()).toEqual(["balloon", "visual"]);
    expect([...sets.sizes]).toEqual(["24Fr"]);
    expect([...sets.defects].sort()).toEqual(["CRACK", "PINHOLE"]);
  });
});

describe("matchMetric", () => {
  it.each([
    ["rejection spike", "defect"],
    ["what's our scrap", "defect"],
    ["copq this month", "copq"],
    ["cost of poor quality", "copq"],
    ["fpy trend", "fpy"],
    ["yield last quarter", "fpy"],
    ["rejection rate", "rate"],
    ["nothing here", null],
  ])("maps %s -> %s", (text, expected) => {
    expect(matchMetric(text)).toBe(expected);
  });
});

describe("screenForMetric", () => {
  it("routes metrics to nav keys", () => {
    expect(screenForMetric("defect")).toBe("defect");
    expect(screenForMetric("copq")).toBe("copq");
    expect(screenForMetric("fpy")).toBe("process-flow");
    expect(screenForMetric("size")).toBe("size");
    expect(screenForMetric("stage")).toBe("stage");
    expect(screenForMetric("rate")).toBe("stage");
  });
});

describe("scoreMatch", () => {
  it("scores exact > prefix > substring", () => {
    expect(scoreMatch("balloon", "balloon")).toBe(1);
    expect(scoreMatch("ball", "balloon")).toBeCloseTo(0.9);
    expect(scoreMatch("loon", "balloon")).toBeCloseTo(0.7);
  });
});
