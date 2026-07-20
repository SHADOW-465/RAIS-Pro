import { parseQtyDraft } from "@/components/entry/QtyInput";
import { applyEdit } from "@/lib/ingest/review";
import type { StageDayRecord } from "@/lib/ingest/emit";

describe("parseQtyDraft — stable quantity entry", () => {
  test("accepts plain non-negative integers", () => {
    expect(parseQtyDraft("0", true)).toBe(0);
    expect(parseQtyDraft("42", true)).toBe(42);
    expect(parseQtyDraft(" 100 ", true)).toBe(100);
  });

  test("empty is null when allowEmpty, invalid otherwise", () => {
    expect(parseQtyDraft("", true)).toBe(null);
    expect(parseQtyDraft("   ", true)).toBe(null);
    expect(parseQtyDraft("", false)).toBe("invalid");
  });

  test("rejects decimals, signs, e-notation, and mixed junk", () => {
    expect(parseQtyDraft("1.5", true)).toBe("invalid");
    expect(parseQtyDraft("-3", true)).toBe("invalid");
    expect(parseQtyDraft("+3", true)).toBe("invalid");
    expect(parseQtyDraft("1e3", true)).toBe("invalid");
    expect(parseQtyDraft("12abc", true)).toBe("invalid");
  });
});

function blankRec(): StageDayRecord {
  return {
    occurredOn: { kind: "day", start: "2026-07-01", end: "2026-07-01" },
    stageId: "visual",
    source: { file: "Manual Entry", fileHash: "m", sheet: "Data Entry", tableId: "entry" },
    checked: { value: 100, cell: "c", header: "Checked" },
    acceptedGood: { value: 80, cell: "a", header: "Good" },
    rework: { value: 5, cell: "h", header: "Hold" },
    rejected: { value: 15, cell: "r", header: "Rejected" },
    defects: [{ raw: "COAG", value: 10, cell: "d" }],
    statedPct: null,
    extractedBy: "direct-entry",
    ingestionId: "t",
  };
}

describe("applyEdit — no sibling auto-rewrite (entry invariant)", () => {
  test("editing checked leaves accept/hold/reject/defects untouched", () => {
    const [next] = applyEdit([blankRec()], 0, "checked", 250);
    expect(next.checked?.value).toBe(250);
    expect(next.acceptedGood?.value).toBe(80);
    expect(next.rework?.value).toBe(5);
    expect(next.rejected?.value).toBe(15);
    expect(next.defects).toEqual([{ raw: "COAG", value: 10, cell: "d" }]);
  });

  test("editing accept leaves checked/hold/reject/defects untouched", () => {
    const [next] = applyEdit([blankRec()], 0, "acceptedGood", 70);
    expect(next.acceptedGood?.value).toBe(70);
    expect(next.checked?.value).toBe(100);
    expect(next.rework?.value).toBe(5);
    expect(next.rejected?.value).toBe(15);
    expect(next.defects[0].value).toBe(10);
  });

  test("editing a defect never lifts or rewrites rejected", () => {
    const [next] = applyEdit([blankRec()], 0, "COAG", 99);
    expect(next.defects[0].value).toBe(99);
    expect(next.rejected?.value).toBe(15);
    expect(next.checked?.value).toBe(100);
    expect(next.acceptedGood?.value).toBe(80);
  });

  test("sequential edits keep each typed value (no balance auto-fix)", () => {
    let rows = [blankRec()];
    rows = applyEdit(rows, 0, "checked", 200);
    rows = applyEdit(rows, 0, "acceptedGood", 150);
    rows = applyEdit(rows, 0, "rework", 20);
    rows = applyEdit(rows, 0, "rejected", 30);
    rows = applyEdit(rows, 0, "COAG", 12);
    expect(rows[0].checked?.value).toBe(200);
    expect(rows[0].acceptedGood?.value).toBe(150);
    expect(rows[0].rework?.value).toBe(20);
    expect(rows[0].rejected?.value).toBe(30);
    expect(rows[0].defects.find((d) => d.raw === "COAG")?.value).toBe(12);
  });
});
