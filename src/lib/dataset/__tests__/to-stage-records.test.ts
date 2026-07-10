import { toStageRecords } from "../to-stage-records";
import type { Dataset, DatasetRow } from "../types";

const dataset: Dataset = {
  id: "ds1",
  signatureHash: "ds1",
  title: "Visual Inspection",
  columns: [
    { role: "dimension-date", name: "date" },
    { role: "measure", name: "quantity checked" },
    { role: "measure", name: "rejection" },
    { role: "defect", name: "coag" },
    { role: "defect", name: "sd" },
  ],
  sources: [{ fileName: "a.xlsx", sheetName: "VISUAL", rowCount: 2 }],
  recognitionConfidence: null,
  recognitionBasis: null,
  totalRows: 2,
  recognizedStageId: "visual",
};

const row = (rowIndex: number, values: DatasetRow["values"]): DatasetRow => ({
  datasetId: "ds1",
  fileName: "a.xlsx",
  sheetName: "VISUAL",
  rowIndex,
  values,
});

describe("toStageRecords", () => {
  it("converts recognized rows into StageDayRecords with stage, date, counts, defects", () => {
    const rows = [
      row(0, { date: "2025-04-01", "quantity checked": 100, rejection: 10, coag: 3, sd: 0 }),
      row(1, { date: "2025-04-02", "quantity checked": 200, rejection: 20, coag: 0, sd: 5 }),
    ];
    const recs = toStageRecords(dataset, rows, "ing-1");
    expect(recs).toHaveLength(2);
    expect(recs[0].stageId).toBe("visual");
    expect(recs[0].occurredOn).toEqual({ kind: "day", start: "2025-04-01", end: "2025-04-01" });
    expect(recs[0].checked?.value).toBe(100);
    expect(recs[0].rejected?.value).toBe(10);
    expect(recs[0].defects).toEqual([expect.objectContaining({ raw: "coag", value: 3 })]);
    expect(recs[1].defects).toEqual([expect.objectContaining({ raw: "sd", value: 5 })]);
    expect(recs[0].ingestionId).toBe("ing-1");
    expect(recs[0].source.file).toBe("a.xlsx");
  });

  it("skips rows with no parseable date", () => {
    const recs = toStageRecords(dataset, [row(0, { date: "SUNDAY", "quantity checked": 5 })], "ing-1");
    expect(recs).toEqual([]);
  });

  it("returns [] for an unrecognized dataset regardless of rows", () => {
    const recs = toStageRecords(
      { ...dataset, recognizedStageId: null },
      [row(0, { date: "2025-04-01", "quantity checked": 100 })],
      "ing-1",
    );
    expect(recs).toEqual([]);
  });

  it("extracts the size from a per-size sheet name like 16FR", () => {
    const sized: DatasetRow = { ...row(0, { date: "2025-04-01", "quantity checked": 50 }), sheetName: "16FR" };
    const recs = toStageRecords(dataset, [sized], "ing-1");
    expect(recs[0].size).toBe("Fr16");
  });
});
