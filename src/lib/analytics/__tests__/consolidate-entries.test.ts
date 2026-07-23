import { consolidateEntries, type SourceRow } from "../source-trace";

const base: Omit<SourceRow, "kind" | "qty" | "cell"> = {
  date: "2026-07-13",
  stage: "Final Inspection",
  stageId: "final",
  size: "Fr8",
  type: "",
  batch: "26G13-8",
  file: "Manual Entry",
  isDirect: true,
};

const row = (kind: SourceRow["kind"], qty: number, cell: string, defectCode?: string): SourceRow => ({
  ...base,
  kind,
  qty,
  cell,
  defectCode: defectCode ?? null,
});

describe("consolidateEntries", () => {
  it("folds checked/accepted/rejected of one entry into a single row", () => {
    const out = consolidateEntries([
      row("checked", 2059, "ENTRY!checked"),
      row("accepted", 2011, "ENTRY!accept"),
      row("rejected", 48, "ENTRY!reject"),
    ]);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({
      date: "2026-07-13",
      batch: "26G13-8",
      size: "Fr8",
      checkedQty: 2059,
      acceptedQty: 2011,
      rejectedQty: 48,
      rowCount: 3,
    });
    expect(out[0].cells.sort()).toEqual(["ENTRY!accept", "ENTRY!checked", "ENTRY!reject"]);
  });

  it("keeps different batches/dates as separate entries and preserves order", () => {
    const out = consolidateEntries([
      row("rejected", 5, "ENTRY!reject"),
      { ...row("rejected", 9, "ENTRY!reject"), batch: "26G13-9" },
    ]);
    expect(out).toHaveLength(2);
    expect(out[0].batch).toBe("26G13-8"); // insertion order preserved (top contributor first)
    expect(out[1].batch).toBe("26G13-9");
  });

  it("rolls defect codes up with their quantities", () => {
    const out = consolidateEntries([
      row("defect", 30, "ENTRY!d1", "PINHOLE"),
      row("defect", 12, "ENTRY!d2", "PINHOLE"),
      row("defect", 6, "ENTRY!d3", "CRACK"),
    ]);
    expect(out).toHaveLength(1);
    expect(out[0].defects).toEqual([
      { code: "PINHOLE", qty: 42 },
      { code: "CRACK", qty: 6 },
    ]);
  });
});
