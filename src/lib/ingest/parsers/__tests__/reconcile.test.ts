// src/lib/ingest/parsers/__tests__/reconcile.test.ts
import { reconcileConflicts } from "../reconcile";

const mk = (stageId: string, day: string, rejected: number) => ({
  occurredOn: { kind: "day", start: day, end: day }, stageId, size: null,
  source: { file: "f", fileHash: "h", sheet: "s", tableId: "t" },
  checked: { value: 1000, cell: "A1", header: "C" }, acceptedGood: null, rework: null,
  rejected: { value: rejected, cell: "B1", header: "R" },
  defects: [], statedPct: null, extractedBy: "direct-entry", ingestionId: "i",
} as any);

describe("reconcileConflicts", () => {
  it("drops an identical duplicate (no conflict)", () => {
    const out = reconcileConflicts([mk("visual", "2025-04-01", 50)], [mk("visual", "2025-04-01", 50)]);
    expect(out.toWrite).toHaveLength(0);
    expect(out.conflicts).toHaveLength(0);
  });
  it("writes the incoming and flags a conflict when values differ", () => {
    const out = reconcileConflicts([mk("visual", "2025-04-01", 50)], [mk("visual", "2025-04-01", 80)]);
    expect(out.toWrite).toHaveLength(1);
    expect(out.conflicts).toHaveLength(1);
    expect(out.conflicts[0]).toMatchObject({ stageId: "visual", day: "2025-04-01", existing: 50, incoming: 80 });
  });
  it("writes a brand-new key with no conflict", () => {
    const out = reconcileConflicts([], [mk("balloon", "2025-04-02", 5)]);
    expect(out.toWrite).toHaveLength(1);
    expect(out.conflicts).toHaveLength(0);
  });
});
