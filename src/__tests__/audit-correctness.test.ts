// Regression tests for the 2026-06-20 correctness audit:
//  - Stage yield must equal 1 − rejRate even when partial `accepted` events
//    exist (the old `(a.good || checked-rejected)/checked` reported ~0% yield).
//  - Defect alias resolution must be separator-insensitive (90-10 == 90/10).
import { emitMany, type StageDayRecord } from "@/lib/ingest/emit";
import { DISPOSAFE_REGISTRY as REG } from "./fixtures/disposafe-registry";
import { byStage } from "@/lib/analytics/rejection";
import { resolveDefect } from "./fixtures/disposafe-registry";
import type { Scope } from "@/lib/analytics/scope";

const FY: Scope = { grain: "month", dateFrom: "2025-04-01", dateTo: "2026-03-31" };

function rec(partial: Partial<StageDayRecord> & { stageId: string }): StageDayRecord {
  return {
    occurredOn: { kind: "day", start: "2025-04-01", end: "2025-04-01" },
    size: null,
    source: { file: "t.xlsx", fileHash: "h", sheet: "S", tableId: "t1" },
    checked: null, acceptedGood: null, rework: null, rejected: null,
    defects: [], statedPct: null, extractedBy: "heuristic", ingestionId: "ing",
    ...partial,
  };
}
const sv = (value: number, header: string) => ({ value, cell: `S!${header}1`, header });

describe("audit — stage yield is the complement of rejection rate", () => {
  test("yield = 1 − rejRate even when accepted events are only PARTIALLY captured", () => {
    // 1000 checked, 50 rejected, but only 10 explicit 'accepted' (partial) —
    // the bug divided 10/1000 = 1% and reported a near-zero yield.
    const events = emitMany([rec({
      stageId: "visual",
      checked: sv(1000, "CHECKED"),
      rejected: sv(50, "REJ"),
      acceptedGood: sv(10, "ACCEPT"),
    })]);
    const visual = byStage(events, FY, REG).find((s) => s.stageId === "visual")!;
    expect(visual.rejRate).toBeCloseTo(0.05, 9);
    expect(visual.yield).toBeCloseTo(0.95, 9);          // NOT 0.01
    expect(visual.yield).toBeCloseTo(1 - visual.rejRate, 9);
  });

  test("yield falls back cleanly when no accepted events exist", () => {
    const events = emitMany([rec({ stageId: "balloon", checked: sv(2000, "CHECKED"), rejected: sv(10, "REJ") })]);
    const balloon = byStage(events, FY, REG).find((s) => s.stageId === "balloon")!;
    expect(balloon.yield).toBeCloseTo(1990 / 2000, 9);
  });
});

describe("audit — defect alias resolution is separator-insensitive", () => {
  test("90-10 / 90/10 / 90 10 all resolve to the same code", () => {
    expect(resolveDefect("90-10")).toBe("90/10");
    expect(resolveDefect("90/10")).toBe("90/10");
    expect(resolveDefect("90 10")).toBe("90/10");
  });
  test("known aliases still resolve; unknown codes return null (→ shown verbatim, not invented)", () => {
    expect(resolveDefect("STRUCK BALLOON")).toBe("STBL");
    expect(resolveDefect("thin spot")).toBe("THSP");
    expect(resolveDefect("ZZZ-NOPE")).toBeNull();
  });
});
