import {
  isValidRecordedConversion,
  conversionHistoryLotIds,
  conversionHistoryLabel,
  lineageRowsForHistory,
  eventsForConversionHistory,
} from "../conversion-history";
import { buildAuditConversionLookup } from "../open-lot-groups";
import type { BatchConversion } from "../types";
import type { AuditEventLike } from "@/lib/analytics/audit-sessions";
import type { AuditBatchGroup } from "@/lib/analytics/audit-sessions";
import type { AuditConversionLookup } from "../open-lot-groups";

const conversion: BatchConversion = {
  id: "bc_26I17-30_26I17-16",
  fromBatch: "26I17-30",
  toBatch: "26I17-16",
  fromSize: "30Fr",
  toSize: "16Fr",
  changedQty: 300,
  stageId: "visual",
  convertedOn: "2026-09-25",
  reason: "Customer",
  createdAt: "2026-09-25T00:00:00.000Z",
  createdBy: "gm",
};

function ev(batch: string, qty = 100): AuditEventLike {
  return { batchNo: batch, quantity: qty, eventType: "inspection", stageId: "visual" };
}

test("ordinary production batches with zero conversions yield an empty history", () => {
  const ordinary = Array.from({ length: 100 }, (_, i) => ev(`26J${String(10 + (i % 20)).padStart(2, "0")}-16`, 50 + i));
  expect(eventsForConversionHistory(ordinary, [])).toEqual([]);
  expect(conversionHistoryLotIds([])).toEqual(new Set());
});

test("a valid conversion includes original and converted lots once, and no other lots", () => {
  const events = [
    ev("26I17-30", 1000),
    ev("26I17-16", 300),
    ev("26J30-10", 800),
    ev("26J16-16", 1591),
  ];
  const out = eventsForConversionHistory(events, [conversion]);
  expect(out.map((e) => e.batchNo)).toEqual(["26I17-30", "26I17-16"]);
  expect(out).toHaveLength(2);
});

test("unrelated Data Entry / audit events without a conversion are excluded", () => {
  const events = [ev("26J30-16"), ev("26J30-24"), ev("26J30-6")];
  expect(eventsForConversionHistory(events, [])).toEqual([]);
});

test("partial quantity conversion does not rewrite ledger quantities", () => {
  const events = [ev("26I17-30", 1000), ev("26I17-16", 300)];
  const out = eventsForConversionHistory(events, [conversion]);
  expect(out.find((e) => e.batchNo === "26I17-30")?.quantity).toBe(1000);
  expect(out.find((e) => e.batchNo === "26I17-16")?.quantity).toBe(300);
  expect(conversion.changedQty).toBe(300);
});

test("incomplete conversion rows are not treated as confirmed history", () => {
  expect(isValidRecordedConversion({ ...conversion, toBatch: "" })).toBe(false);
  expect(isValidRecordedConversion({ ...conversion, changedQty: 0 })).toBe(false);
  expect(isValidRecordedConversion({ ...conversion, convertedOn: "soon" })).toBe(false);
  expect(isValidRecordedConversion({ ...conversion, stageId: "" })).toBe(false);
  expect(isValidRecordedConversion({ ...conversion, toBatch: "26I17-30" })).toBe(false);
  const events = [ev("26I17-30"), ev("26J30-8")];
  expect(eventsForConversionHistory(events, [{ ...conversion, changedQty: 0 }])).toEqual([]);
});

test("search/export dataset cannot reintroduce ordinary lots", () => {
  const events = [ev("26I17-30"), ev("26I17-16"), ev("26J30-24"), ev("26J30-8")];
  const dataset = eventsForConversionHistory(events, [conversion]);
  const search = dataset.filter((e) => String(e.batchNo).includes("26J30"));
  expect(search).toEqual([]);
});

function group(
  batch: string,
  stageId: string,
  checkedQty: number,
): AuditBatchGroup {
  return {
    batch,
    stages: [{ stageId, rows: [], checkedQty, acceptedQty: checkedQty, rejectedQty: 0, rowCount: 1 }],
    checkedQty,
    acceptedQty: checkedQty,
    rejectedQty: 0,
    rowCount: 1,
    eventCount: 1,
    dateFrom: "2026-10-16",
    dateTo: "2026-10-16",
    sources: ["manual"],
  };
}

test("Audit same-stem CT inference includes original and converted lots with no persisted row", () => {
  const groups = [group("26J16-24", "production-dipping", 5000), group("26J16-22", "hanging", 1200)];
  const lookup = buildAuditConversionLookup(groups, []);
  expect(lookup.byBatch["26J16-22"]?.isConverted).toBe(true);

  const events = [ev("26J16-24"), ev("26J16-22"), ev("26J30-10"), ev("26J30-16")];
  const out = eventsForConversionHistory(events, [], lookup);
  expect(out.map((e) => e.batchNo).sort()).toEqual(["26J16-22", "26J16-24"]);
  expect(conversionHistoryLabel("26J16-22", [], lookup)).toBe("26J16-24 CT 22");
});

test("same-day lots that all have primary dipping stay ordinary and out of history", () => {
  const groups = [
    group("26J30-10", "production-dipping", 800),
    group("26J30-16", "production-dipping", 900),
    group("26J30-24", "production-dipping", 700),
  ];
  const lookup = buildAuditConversionLookup(groups, []);
  expect(lookup.convertedCount).toBe(0);
  const events = [ev("26J30-10"), ev("26J30-16"), ev("26J30-24")];
  expect(eventsForConversionHistory(events, [], lookup)).toEqual([]);
  expect(conversionHistoryLotIds([], lookup)).toEqual(new Set());
});

test("lineage table lists inferred CT pairs without duplicating a recorded row", () => {
  const inferred: AuditConversionLookup = {
    byBatch: {
      "26J16-22": {
        batch: "26J16-22",
        isConverted: true,
        fromBatch: "26J16-24",
        toBatch: "26J16-22",
        displayCode: "26J16-24 CT 22",
        breakdown: null,
        convertedAtStage: "Hanging",
        explicitConversion: null,
      },
    },
    okCount: 1,
    convertedCount: 1,
    totalCount: 2,
  };
  const rows = lineageRowsForHistory([], inferred);
  expect(rows).toHaveLength(1);
  expect(rows[0].fromBatch).toBe("26J16-24");
  expect(rows[0].toBatch).toBe("26J16-22");
  expect(rows[0].id.startsWith("inferred_")).toBe(true);

  const recorded = lineageRowsForHistory([conversion], inferred);
  expect(recorded.map((r) => r.id)).toEqual([conversion.id, rows[0].id]);
});
