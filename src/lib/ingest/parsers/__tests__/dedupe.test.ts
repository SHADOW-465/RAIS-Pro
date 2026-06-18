import { dedupeByPrecedence } from "../dedupe";
import type { PrecededRecord } from "../types";

function rec(family: any, stageId: string, size: string | null, day: string, rejected: number): PrecededRecord {
  return {
    family,
    record: {
      occurredOn: { kind: "day", start: day, end: day },
      stageId, size,
      source: { file: family, fileHash: "h", sheet: "s", tableId: "t" },
      checked: null, acceptedGood: null, rework: null,
      rejected: { value: rejected, cell: "X1", header: "REJ" },
      defects: [], statedPct: null, extractedBy: "heuristic", ingestionId: "i",
    } as any,
  };
}

describe("dedupeByPrecedence", () => {
  it("keeps size-wise over rejection-analysis for the same key", () => {
    const out = dedupeByPrecedence([
      rec("rejection-analysis", "visual", null, "2025-04-01", 100),
      rec("size-wise", "visual", null, "2025-04-01", 90),
    ]);
    expect(out.kept).toHaveLength(1);
    expect(out.kept[0].family).toBe("size-wise");
    expect(out.shadowed).toHaveLength(1);
  });
  it("keeps different keys independently", () => {
    const out = dedupeByPrecedence([
      rec("assembly-daily", "visual", null, "2025-04-01", 10),
      rec("assembly-daily", "balloon", null, "2025-04-01", 5),
    ]);
    expect(out.kept).toHaveLength(2);
  });
  it("routes cumulative records to claims, never kept", () => {
    const out = dedupeByPrecedence([rec("cumulative", "visual", null, "2025-04-01", 100)]);
    expect(out.kept).toHaveLength(0);
    expect(out.claims).toHaveLength(1);
  });
});
