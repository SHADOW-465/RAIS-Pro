import {
  toSourceRows,
  normalizeSourceRows,
  filterSourceRows,
  groupSourceRows,
  sortSourceDetail,
  summarizeSource,
  defaultGroupMode,
  fileBasename,
  qtyNumber,
  inferSourceKind,
  primaryQty,
  type SourceRow,
} from "../source-trace";

function row(partial: Partial<SourceRow> & Pick<SourceRow, "date" | "stage" | "type" | "qty" | "file" | "cell">): SourceRow {
  return {
    kind: partial.kind ?? "other",
    size: partial.size ?? null,
    stageId: partial.stageId,
    defectCode: partial.defectCode ?? null,
    batch: partial.batch ?? null,
    isDirect: partial.isDirect ?? false,
    fileHash: partial.fileHash ?? null,
    sheet: partial.sheet,
    ...partial,
  };
}

describe("source-trace", () => {
  it("infers kinds from event-like type strings", () => {
    expect(inferSourceKind({ eventType: "production" })).toBe("checked");
    expect(inferSourceKind({ eventType: "inspection", disposition: "rejected" })).toBe("rejected");
    expect(inferSourceKind({ eventType: "inspection", disposition: "accepted" })).toBe("accepted");
    expect(inferSourceKind({ eventType: "rejection", defectCode: "PINH" })).toBe("defect");
  });

  it("toSourceRows maps events and sorts by date desc", () => {
    const events = [
      {
        eventType: "production",
        stageId: "visual",
        occurredOn: { start: "2025-04-01" },
        quantity: 100,
        provenance: { file: "DATA/a.xlsx", cells: ["B2"], sheet: "APR" },
      },
      {
        eventType: "inspection",
        disposition: "rejected",
        stageId: "visual",
        occurredOn: { start: "2025-05-01" },
        quantity: 5,
        provenance: { file: "DATA/a.xlsx", cells: ["C3"], sheet: "MAY", is_direct_entry: false },
      },
      {
        eventType: "rejection",
        defectCodeRaw: "PINH",
        stageId: "final",
        occurredOn: { start: "2025-05-02" },
        quantity: 2,
        provenance: { file: "Manual Entry", cells: ["ENTRY"], is_direct_entry: true },
      },
    ];
    const rows = toSourceRows(events);
    expect(rows).toHaveLength(3);
    expect(rows[0].date).toBe("2025-05-02");
    expect(rows[0].kind).toBe("defect");
    expect(rows[0].isDirect).toBe(true);
    expect(rows.find((r) => r.kind === "checked")?.stage).toBe("Visual Inspection");
  });

  it("filters by source, stage, kind, search", () => {
    const rows = normalizeSourceRows([
      row({ date: "2025-01-01", stage: "Visual Inspection", stageId: "visual", type: "production", kind: "checked", qty: 10, file: "a.xlsx", cell: "A1", isDirect: false }),
      row({ date: "2025-01-02", stage: "Final Inspection", stageId: "final", type: "rejection PINH", kind: "defect", defectCode: "PINH", qty: 2, file: "Manual Entry", cell: "ENTRY", isDirect: true }),
    ]);
    expect(filterSourceRows(rows, { source: "manual", stageId: "all", size: "all", kind: "all", search: "" })).toHaveLength(1);
    expect(filterSourceRows(rows, { source: "all", stageId: "visual", size: "all", kind: "all", search: "" })).toHaveLength(1);
    expect(filterSourceRows(rows, { source: "all", stageId: "all", size: "all", kind: "defect", search: "" })).toHaveLength(1);
    expect(filterSourceRows(rows, { source: "all", stageId: "all", size: "all", kind: "all", search: "pinh" })).toHaveLength(1);
  });

  it("groups by stage and ranks by rejection contribution", () => {
    const rows: SourceRow[] = [
      row({ date: "2025-01-01", stage: "Visual Inspection", stageId: "visual", type: "inspection·rejected", kind: "rejected", qty: 50, file: "a.xlsx", cell: "A1" }),
      row({ date: "2025-01-01", stage: "Final Inspection", stageId: "final", type: "inspection·rejected", kind: "rejected", qty: 10, file: "a.xlsx", cell: "A2" }),
      row({ date: "2025-01-01", stage: "Visual Inspection", stageId: "visual", type: "production", kind: "checked", qty: 200, file: "a.xlsx", cell: "B1" }),
    ];
    const groups = groupSourceRows(rows, "stage", { metricKind: "rejection_rate" });
    expect(groups[0].key).toBe("visual");
    expect(groups[0].contributionPct).toBeGreaterThan(groups[1].contributionPct);
    expect(groups[0].recordCount).toBe(2);
  });

  it("defaultGroupMode is metric-aware", () => {
    expect(defaultGroupMode("pareto")).toBe("defect");
    expect(defaultGroupMode("size")).toBe("size");
    expect(defaultGroupMode("rejection_rate")).toBe("stage");
  });

  it("groups by defect for pareto", () => {
    const rows: SourceRow[] = [
      row({ date: "2025-01-01", stage: "Visual Inspection", stageId: "visual", type: "rejection PINH", kind: "defect", defectCode: "PINH", qty: 8, file: "a.xlsx", cell: "A1" }),
      row({ date: "2025-01-01", stage: "Visual Inspection", stageId: "visual", type: "rejection CRACK", kind: "defect", defectCode: "CRACK", qty: 3, file: "a.xlsx", cell: "A2" }),
      row({ date: "2025-01-01", stage: "Visual Inspection", stageId: "visual", type: "production", kind: "checked", qty: 100, file: "a.xlsx", cell: "B1" }),
    ];
    const groups = groupSourceRows(rows, "defect", { metricKind: "pareto" });
    expect(groups[0].key).toBe("PINH");
    expect(groups.some((g) => g.key === "(non-defect)")).toBe(true);
  });

  it("summarizeSource reports top driver and date span", () => {
    const rows: SourceRow[] = [
      row({ date: "2025-04-10", stage: "Visual Inspection", stageId: "visual", type: "inspection·rejected", kind: "rejected", qty: 20, file: "a.xlsx", cell: "A1" }),
      row({ date: "2025-06-01", stage: "Final Inspection", stageId: "final", type: "inspection·rejected", kind: "rejected", qty: 5, file: "b.xlsx", cell: "A1" }),
    ];
    const s = summarizeSource(rows, "rejection_rate");
    expect(s.recordCount).toBe(2);
    expect(s.fileCount).toBe(2);
    expect(s.dateFrom).toBe("2025-04-10");
    expect(s.dateTo).toBe("2025-06-01");
    expect(s.topDriver?.label).toMatch(/Visual/i);
    expect(s.topDriver?.sharePct).toBeGreaterThan(50);
  });

  it("sortSourceDetail uses stage process order within same date", () => {
    const rows = sortSourceDetail([
      row({ date: "2025-01-01", stage: "Final Inspection", stageId: "final", type: "production", kind: "checked", qty: 1, file: "a.xlsx", cell: "A1" }),
      row({ date: "2025-01-01", stage: "Visual Inspection", stageId: "visual", type: "production", kind: "checked", qty: 1, file: "a.xlsx", cell: "A2" }),
    ]);
    expect(rows[0].stageId).toBe("visual");
    expect(rows[1].stageId).toBe("final");
  });

  it("fileBasename and qtyNumber helpers", () => {
    expect(fileBasename("DATA/folder/x.xlsx")).toBe("x.xlsx");
    expect(qtyNumber("1,234")).toBe(1234);
    expect(qtyNumber("—")).toBe(0);
  });

  it("primaryQty prefers rejected for rejection_rate", () => {
    expect(primaryQty({ checkedQty: 100, acceptedQty: 0, rejectedQty: 5, defectQty: 2 }, "rejection_rate")).toBe(7);
    expect(primaryQty({ checkedQty: 100, acceptedQty: 0, rejectedQty: 0, defectQty: 0 }, "checked")).toBe(100);
  });
});
