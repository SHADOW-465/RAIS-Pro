// Funnel reconciliation and the one accepted number across dashboard tiles.
import { funnelReconciliation } from "../funnel";
import { byStage, rejectionRate, totalAccepted, totalChecked, totalRejected } from "../rejection";
import { emitMany, type StageDayRecord } from "@/lib/ingest/emit";
import { DISPOSAFE_REGISTRY as REG } from "@/__tests__/fixtures/disposafe-registry";
import type { Scope } from "../scope";

function rec(stageId: string, checked: number, rejected: number, rework = 0): StageDayRecord {
  return {
    occurredOn: { kind: "day", start: "2025-04-01", end: "2025-04-01" },
    stageId,
    size: null,
    source: { file: "t.xlsx", fileHash: "local", sheet: stageId, tableId: "t1" },
    checked: { value: checked, cell: "B1", header: "CHECKED" },
    acceptedGood: null,
    rework: rework ? { value: rework, cell: "D1", header: "HOLD" } : null,
    rejected: { value: rejected, cell: "C1", header: "REJECTION" },
    defects: [],
    statedPct: null,
    extractedBy: "heuristic",
    ingestionId: "ing-funnel",
  } as StageDayRecord;
}

const SCOPE: Scope = { grain: "month" };

test("each arrow is checked − rejected, and the gap to the next gate is what has not arrived", () => {
  const r = funnelReconciliation([
    { stageId: "visual", checked: 1000, rejected: 50 },
    { stageId: "balloon", checked: 900, rejected: 20 },
    { stageId: "final", checked: 900, rejected: 10 },
  ]);
  expect(r.gates.map((g) => g.passed)).toEqual([950, 880, 890]);
  expect(r.gates.map((g) => g.notYetAtNext)).toEqual([50, 0, null]);
  // Final checked 900 but Balloon only passed 880: a V-014 over-check.
  expect(r.gates[1].overAtNext).toBe(20);
  expect(r.finalGood).toBe(890);
  // 1000 − (50+20+10) = 920 = 890 + 50 − 20
  expect(r.finalGood + r.betweenGates).toBe(920);
});

test("no gap is drawn across a section boundary", () => {
  const r = funnelReconciliation([
    { stageId: "production-dipping", checked: 5000, rejected: 100 },
    { stageId: "visual", checked: 1000, rejected: 50 },
  ]);
  expect(r.gates[0].notYetAtNext).toBeNull();
  expect(r.betweenGates).toBe(0);
});

test("Overall Accepted = checked − rejected = Final good + between gates, with hold inside accepted", () => {
  const events = emitMany([
    rec("visual", 1000, 50, 30),
    rec("balloon", 900, 20),
    rec("final", 860, 10),
  ]);
  const checked = totalChecked(events, SCOPE, REG).value;
  const rejected = totalRejected(events, SCOPE).value;
  const accepted = totalAccepted(events, SCOPE, REG).value;
  expect(checked).toBe(1000);
  expect(rejected).toBe(80);
  // Hold (30) is not subtracted — owner decision, commit 838704c.
  expect(accepted).toBe(920);
  expect(accepted / checked).toBeCloseTo(1 - rejectionRate(events, SCOPE, REG).value, 12);

  const rows = byStage(events, SCOPE, REG);
  const r = funnelReconciliation(rows);
  expect(r.finalGood).toBe(850);
  expect(r.finalGood + r.betweenGates).toBe(accepted);
});
