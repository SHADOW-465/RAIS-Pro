import {
  buildProcessLotGrouping,
  scopeRowsForProcessLots,
  formatConvertBatchCode,
  parseConvertBatchParts,
  buildAuditConversionLookup,
} from "../open-lot-groups";
import type { OpenLotRow } from "../../analytics/open-lots";
import type { AuditBatchGroup } from "../../analytics/audit-sessions";
import type { SourceRow } from "../../analytics/source-trace";
import type { BatchConversion } from "../types";

function makeLot(
  batch: string,
  primaryDone: number,
  secondaryDone: number,
  assemblyDone: number
): OpenLotRow {
  const pComp = primaryDone > 0;
  const sComp = secondaryDone > 0;
  const aComp = assemblyDone > 0;
  const lineComplete = pComp && sComp && aComp;
  const started = pComp || sComp || aComp;
  const waitingOn = !pComp ? "primary" : !sComp ? "secondary" : !aComp ? "assembly" : null;
  const occupied: string[] = [];
  if (pComp) occupied.push("production-dipping");
  if (sComp) occupied.push("hanging");
  if (aComp) occupied.push("sterilization");
  return {
    batch,
    firstDate: "2026-08-01",
    lastDate: "2026-08-10",
    completedOn: lineComplete ? "2026-08-10" : null,
    daysIdle: 1,
    stalled: false,
    lineComplete,
    open: started && !lineComplete,
    waitingOn,
    occupied,
    lastAccepted: 1000,
    processes: {
      primary: {
        process: "primary",
        done: primaryDone,
        total: 1,
        complete: pComp,
        nextStageId: pComp ? null : "production-dipping",
        nextStageLabel: pComp ? null : "Dipping",
      },
      secondary: {
        process: "secondary",
        done: secondaryDone,
        total: 1,
        complete: sComp,
        nextStageId: sComp ? null : "hanging",
        nextStageLabel: sComp ? null : "Hanging",
      },
      assembly: {
        process: "assembly",
        done: assemblyDone,
        total: 1,
        complete: aComp,
        nextStageId: aComp ? null : "sterilization",
        nextStageLabel: aComp ? null : "Sterilization",
      },
    },
  };
}

describe("buildProcessLotGrouping & scopeRowsForProcessLots", () => {
  it("groups started lots into completed, not_completed, and converted while excluding unstarted lots", () => {
    const lots: OpenLotRow[] = [
      makeLot("26H01-14", 1, 1, 1), // completed in primary
      makeLot("26H02-14", 0, 1, 0), // incomplete in primary (not converted)
      makeLot("26H01-16", 0, 1, 1), // incomplete in primary, stem 26H01 matches 26H01-14 -> inferred converted
      makeLot("26H03-18", 0, 1, 0), // incomplete in primary, explicit conversion from 26H01-14
      makeLot("26H99-14", 0, 0, 0), // unstarted lot (should be excluded from startedLots)
    ];

    const conversions: BatchConversion[] = [
      {
        id: "bc_26H01-14_26H03-18",
        fromBatch: "26H01-14",
        toBatch: "26H03-18",
        fromSize: "14Fr",
        toSize: "18Fr",
        stageId: "hanging",
        changedQty: 500,
        convertedOn: "2026-08-05",
        reason: "Customer demand",
        createdAt: "2026-08-05T00:00:00Z",
        createdBy: "operator",
      },
    ];

    const grouping = buildProcessLotGrouping(lots, conversions, { process: "primary" });

    expect(grouping.totalCount).toBe(4);
    expect(grouping.completedCount).toBe(1);
    expect(grouping.notCompletedCount).toBe(1);
    expect(grouping.convertedCount).toBe(2);

    expect(grouping.completedBatches).toContain("26H01-14");
    expect(grouping.notCompletedBatches).toContain("26H02-14");
    expect(grouping.convertedBatches).toContain("26H01-16");
    expect(grouping.convertedBatches).toContain("26H03-18");
    expect(grouping.byBatch["26H01-16"]?.convertBatchCode).toBe("26H01-14 CT 16");
    expect(grouping.byBatch["26H03-18"]?.fromBatch).toBe("26H01-14");
    expect(grouping.byBatch["26H03-18"]?.convertBatchCode).toBe("26H01-14 CT 18");
  });

  it("formats and parses OK batch (26J16-24) and Convert batch (26J16-24 CT 22) nomenclature", () => {
    expect(formatConvertBatchCode("26J16-24", "26J16-22")).toBe("26J16-24 CT 22");
    expect(formatConvertBatchCode("26J16-24", "22Fr")).toBe("26J16-24 CT 22");

    const okParts = parseConvertBatchParts("26J16-24");
    expect(okParts).toEqual({
      isConverted: false,
      year: "26",
      month: "J",
      day: "16",
      mainSize: "24",
      convertMarker: null,
      convertSize: null,
      okBatchCode: "26J16-24",
      convertBatchCode: "26J16-24",
      rawTargetBatch: "26J16-24",
    });

    const convParts = parseConvertBatchParts("26J16-22", "26J16-24");
    expect(convParts).toEqual({
      isConverted: true,
      year: "26",
      month: "J",
      day: "16",
      mainSize: "24",
      convertMarker: "CT",
      convertSize: "22",
      okBatchCode: "26J16-24",
      convertBatchCode: "26J16-24 CT 22",
      rawTargetBatch: "26J16-22",
    });

    const directCt = parseConvertBatchParts("26J16-24 CT 22");
    expect(directCt?.isConverted).toBe(true);
    expect(directCt?.convertBatchCode).toBe("26J16-24 CT 22");
    expect(directCt?.mainSize).toBe("24");
    expect(directCt?.convertSize).toBe("22");
  });

  it("classifies AuditBatchGroups into OK batch and Convert batch (CT)", () => {
    const groups: AuditBatchGroup[] = [
      {
        batch: "26J16-24",
        stages: [{ stageId: "production-dipping", rows: [], checkedQty: 5000, acceptedQty: 4900, rejectedQty: 100, rowCount: 1 }],
        checkedQty: 5000,
        acceptedQty: 4900,
        rejectedQty: 100,
        rowCount: 1,
        eventCount: 2,
        dateFrom: "2026-10-16",
        dateTo: "2026-10-16",
        sources: ["manual"],
      },
      {
        batch: "26J16-22",
        stages: [{ stageId: "hanging", rows: [], checkedQty: 1200, acceptedQty: 1180, rejectedQty: 20, rowCount: 1 }],
        checkedQty: 1200,
        acceptedQty: 1180,
        rejectedQty: 20,
        rowCount: 1,
        eventCount: 2,
        dateFrom: "2026-10-16",
        dateTo: "2026-10-17",
        sources: ["manual"],
      },
    ];

    const lookup = buildAuditConversionLookup(groups, []);
    expect(lookup.okCount).toBe(1);
    expect(lookup.convertedCount).toBe(1);
    expect(lookup.byBatch["26J16-24"]?.isConverted).toBe(false);
    expect(lookup.byBatch["26J16-24"]?.displayCode).toBe("26J16-24");
    expect(lookup.byBatch["26J16-22"]?.isConverted).toBe(true);
    expect(lookup.byBatch["26J16-22"]?.displayCode).toBe("26J16-24 CT 22");
  });

  it("scopes rows for completed process lots to that process category while keeping fallback rows for waiting lots", () => {
    const lots: OpenLotRow[] = [
      makeLot("26H01-14", 1, 1, 1), // has primary & secondary
      makeLot("26H02-14", 0, 1, 0), // only has secondary
    ];

    const grouping = buildProcessLotGrouping(lots, [], { process: "primary" });
    const makeRow = (batch: string, stageId: string, stage: string): SourceRow => ({
      date: "2026-08-05",
      type: "ProductionRecordAdded",
      kind: "checked",
      batch,
      stageId,
      stage,
      qty: 1000,
      file: "direct-entry",
      cell: "—",
    });
    const allRows: SourceRow[] = [
      makeRow("26H01-14", "production-dipping", "Dipping"),
      makeRow("26H01-14", "hanging", "Hanging"),
      makeRow("26H02-14", "hanging", "Hanging"),
    ];

    const scoped = scopeRowsForProcessLots(allRows, grouping, "primary");
    expect(scoped).toEqual([
      makeRow("26H01-14", "production-dipping", "Dipping"),
      makeRow("26H02-14", "hanging", "Hanging"),
    ]);
  });
});
