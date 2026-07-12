import { emitStageDay, emitMany, type StageDayRecord } from "@/lib/ingest/emit";
import { DISPOSAFE_REGISTRY as REG } from "./fixtures/disposafe-registry";
import { checkRecord, checkSpike } from "@/lib/entry/validate-entry";
import { MemoryEventStore } from "@/lib/store/memory";

const SRC = { file: "ASSEMBLY REJECTION REPORT.xlsx", fileHash: "h1", sheet: "APRIL 25", tableId: "t1" };

function rec(over: Partial<StageDayRecord> = {}): StageDayRecord {
  return {
    occurredOn: { kind: "day", start: "2025-04-01", end: "2025-04-01" },
    stageId: "visual",
    source: SRC,
    checked: { value: 10982, cell: "B6", header: "VISUAL QTY" },
    acceptedGood: null,
    rework: null,
    rejected: { value: 1054, cell: "D6", header: "REJ QTY" },
    defects: [],
    statedPct: null,
    extractedBy: "direct-entry",
    ingestionId: "ing-1",
    ...over,
  };
}

describe("emit (rejection-only, real April-1 visual numbers)", () => {
  test("emits Production + Inspection(rejected) with provenance and exact confidence", () => {
    const events = emitStageDay(rec());
    const prod = events.find((e) => e.eventType === "production")!;
    const insp = events.find((e) => e.eventType === "inspection")!;
    expect(prod && "quantity" in prod && prod.quantity).toBe(10982);
    expect(insp && "quantity" in insp && insp.quantity).toBe(1054);
    expect(prod.provenance.cells).toEqual(["B6"]);
    expect(prod.confidence.basis).toBe("exact"); // direct entry
    expect(insp.eventType === "inspection" && insp.disposition).toBe("rejected");
  });

  test("per-defect rejections resolve aliases; unknown stays null (→ V-007)", () => {
    const events = emitStageDay(rec({
      defects: [
        { raw: "THIN SPOD", value: 600, cell: "G6" },
        { raw: "BALLOON BRUST", value: 300, cell: "H6" },
        { raw: "MYSTERY", value: 154, cell: "I6" },
      ],
    }), REG);
    const rej = events.filter((e) => e.eventType === "rejection");
    const codes = rej.map((e) => (e.eventType === "rejection" ? e.defectCode : null));
    expect(codes).toEqual(["THSP", "BLBR", null]);
  });

  test("stated % becomes an AggregateClaim, never an analytics input", () => {
    const events = emitStageDay(rec({
      statedPct: { value: 9.5975, cell: "E6", formula: "=D6/B6*100" },
    }));
    const claim = events.find((e) => e.eventType === "aggregate-claim")!;
    expect(claim.eventType === "aggregate-claim" && claim.claimKind).toBe("percentage");
    expect(claim.eventType === "aggregate-claim" && claim.statedValue).toBe(9.5975);
  });

  test("emitMany + store: identical records are idempotent", async () => {
    const records = [rec(), rec({ stageId: "balloon", checked: { value: 9627, cell: "F6", header: "BALLOON CHKD" }, rejected: { value: 15, cell: "H6", header: "REJ QTY" } })];
    const store = new MemoryEventStore();
    const first = await store.append(emitMany(records, REG));
    const second = await store.append(emitMany(records, REG)); // re-ingest same sheet
    expect(first.inserted).toBe(4); // 2 production + 2 inspection
    expect(second).toEqual({ inserted: 0, deduped: 4 });
  });
});

describe("live clarification checks", () => {
  test("clean record yields no issues", () => {
    expect(checkRecord(rec())).toHaveLength(0);
  });

  test("rejected > checked is critical (V-001)", () => {
    const issues = checkRecord(rec({ rejected: { value: 11000, cell: "D6", header: "REJ" } }));
    expect(issues.some((i) => i.code === "V-001" && i.severity === "critical")).toBe(true);
  });

  test("negative count flagged (V-013)", () => {
    const issues = checkRecord(rec({ rejected: { value: -2, cell: "D6", header: "REJ" } }));
    expect(issues.some((i) => i.code === "V-013")).toBe(true);
  });

  test("defect sum != stated reject — the real VISUAL Apr-30 case (1708 vs 1544)", () => {
    const issues = checkRecord(rec({
      rejected: { value: 1708, cell: "E34", header: "REJ. QTY" },
      defects: [
        { raw: "THIN SPOD", value: 1145, cell: "K34" },
        { raw: "RAISED WIRE", value: 225, cell: "R34" },
        { raw: "SURFACE DEFECT", value: 174, cell: "G34" },
      ],
    }));
    const v004 = issues.find((i) => i.code === "V-004")!;
    expect(v004).toBeTruthy();
    expect(v004.stated).toBe(1708);
    expect(v004.computed).toBe(1544); // 1145+225+174
  });

  test("stated % mismatch flagged (V-003)", () => {
    const issues = checkRecord(rec({ statedPct: { value: 5.0, cell: "E6", formula: null } }));
    // real rate 1054/10982*100 ≈ 9.5975, not 5.0
    expect(issues.some((i) => i.code === "V-003")).toBe(true);
  });

  test("spike vs running mean fires when 3x over (V-009)", () => {
    const spike = checkSpike(
      rec({ rejected: { value: 3700, cell: "D18", header: "REJ" } }), // ~33.7%
      { mean: 9.5, n: 17 }
    );
    expect(spike?.code).toBe("V-009");
  });

  test("spike check is silent without enough baseline", () => {
    expect(checkSpike(rec(), { mean: 9.5, n: 2 })).toBeNull();
  });
});
