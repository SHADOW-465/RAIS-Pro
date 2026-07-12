import { reviewRow, buildReviewRows, reviewSummary, applyEdit, defectKey } from "@/lib/ingest/review";
import type { StageDayRecord } from "@/lib/ingest/emit";

function rec(opts: { checked?: number | null; rejected?: number | null; statedPct?: number | null; stageId?: string } = {}): StageDayRecord {
  const { checked = 10982, rejected = 1054, statedPct = 9.5975, stageId = "visual" } = opts;
  return {
    occurredOn: { kind: "day", start: "2025-04-01", end: "2025-04-01" },
    stageId,
    source: { file: "f.xlsx", fileHash: "h", sheet: "VISUAL", tableId: "t1" },
    checked: checked == null ? null : { value: checked, cell: "VISUAL!B2", header: "QTY" },
    acceptedGood: null,
    rework: null,
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

  test("editing a defect never auto-adjusts rejected or any other field", () => {
    const base = rec({ checked: 100, rejected: 40, statedPct: null });
    let records = [{ ...base, defects: [{ raw: "SCRATCH", value: 40, cell: "D!E2" }] }];
    records = applyEdit(records, 0, "SCRATCH", 25); // user edits only the defect count
    expect(records[0].rejected?.value).toBe(40); // untouched — no chain reaction
    expect(records[0].checked?.value).toBe(100);  // untouched
    expect(records[0].defects.find(d => d.raw === "SCRATCH")?.value).toBe(25);

    // The now-mismatched defect sum (25) vs rejected (40) surfaces as invalid,
    // pointing only at the responsible cells, instead of being silently "fixed".
    const row = reviewRow(records[0], 0);
    expect(row.status).toBe("invalid");
    expect(row.flags.join(" ")).toMatch(/Defect Mismatch/);
    expect(row.invalidFields).toEqual(expect.arrayContaining(["rejected", "SCRATCH"]));
    expect(row.invalidFields).not.toContain("checked");
    expect(row.invalidFields).not.toContain("acceptedGood");
  });

  // Reproduces the real-world bug found via live browser testing on
  // DATA/VISUAL INSPECTION REPORT 2025.xlsx: the parser stores the sheet's raw
  // header text ("COAG") as defects[].raw, but the grid used to send the
  // registry's descriptive label ("Coagulum") on edit. applyEdit matched by
  // exact string equality, so the edit never found the existing entry — it
  // silently pushed a *duplicate* under the label key instead of updating the
  // code-keyed one, doubling that portion of the defect sum.
  test("editing a defect by its registry label updates the SAME entry the parser wrote under the raw code (no duplicate)", () => {
    const base = rec({ checked: 10982, rejected: 1054, statedPct: null });
    let records = [{ ...base, defects: [{ raw: "COAG", value: 181, cell: "APRIL 25!H8" }] }];

    // MOD v2: the grid edits by CODE (the catalog's defectCode) — identity is
    // separator/case-insensitive on the code itself, no alias table.
    records = applyEdit(records, 0, "coag", 190);
    expect(records[0].defects).toHaveLength(1);
    expect(records[0].defects[0]).toMatchObject({ raw: "COAG", value: 190 });
    expect(records[0].rejected?.value).toBe(1054); // still untouched by the defect edit

    records = applyEdit(records, 0, "COAG", 200);
    expect(records[0].defects).toHaveLength(1);
    expect(records[0].defects[0].value).toBe(200);
  });

  test("defectKey is case/separator-insensitive on the code (catalog-free identity)", () => {
    expect(defectKey("coag")).toBe(defectKey("COAG"));
    expect(defectKey("90/10")).toBe(defectKey("90-10"));
    expect(defectKey("PIN HOLE")).toBe(defectKey("PINHOLE"));
  });
});
