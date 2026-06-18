import { reviewRow, buildReviewRows, reviewSummary, applyEdit } from "@/lib/ingest/review";
import type { StageDayRecord } from "@/lib/ingest/emit";

function rec(opts: { checked?: number | null; rejected?: number | null; statedPct?: number | null; stageId?: string } = {}): StageDayRecord {
  const { checked = 10982, rejected = 1054, statedPct = 9.5975, stageId = "visual" } = opts;
  return {
    occurredOn: { kind: "day", start: "2025-04-01", end: "2025-04-01" },
    stageId,
    source: { file: "f.xlsx", fileHash: "h", sheet: "VISUAL", tableId: "t1" },
    checked: checked == null ? null : { value: checked, cell: "VISUAL!B2", header: "QTY" },
    rejected: rejected == null ? null : { value: rejected, cell: "VISUAL!C2", header: "REJ" },
    defects: [],
    statedPct: statedPct == null ? null : { value: statedPct, cell: "VISUAL!D2", formula: "=C2/B2*100" },
    extractedBy: "heuristic",
    ingestionId: "ing-1",
  };
}

describe("review — recompute from scratch", () => {
  test("matching stated % → ok, corrected % recomputed from raw", () => {
    const r = reviewRow(rec(), 0);
    expect(r.status).toBe("ok");
    expect(r.correctedPct).toBeCloseTo((1054 / 10982) * 100, 6);
  });

  test("wrong sheet % → corrected (does not trust the formula)", () => {
    const r = reviewRow(rec({ statedPct: 5.0 }), 0); // real is ~9.60%
    expect(r.status).toBe("corrected");
    expect(r.flags[0]).toMatch(/recomputed 9\.60%/);
  });

  test("rejected > checked → invalid", () => {
    const r = reviewRow(rec({ checked: 100, rejected: 5000, statedPct: null }), 0);
    expect(r.status).toBe("invalid");
    expect(r.flags.join(" ")).toMatch(/exceeds/);
  });

  test("summary counts and applyEdit fixes an invalid row", () => {
    let records = [rec(), rec({ checked: 100, rejected: 5000, statedPct: null })];
    expect(reviewSummary(buildReviewRows(records)).invalid).toBe(1);
    records = applyEdit(records, 1, "rejected", 40); // correct the typo
    const s = reviewSummary(buildReviewRows(records));
    expect(s.invalid).toBe(0);
    expect(records[1].extractedBy).toBe("direct-entry"); // edit marks human correction
  });
});
