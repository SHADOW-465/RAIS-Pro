import { attachConversionHalves } from "../audit-halves";
import type { AuditBatchGroup } from "@/lib/analytics/audit-sessions";
import type { BatchConversion } from "../types";

function group(batch: string, extra: Partial<AuditBatchGroup> = {}): AuditBatchGroup {
  return {
    batch,
    stages: [],
    checkedQty: 0,
    acceptedQty: 0,
    rejectedQty: 0,
    rowCount: 0,
    eventCount: 0,
    dateFrom: "2026-09-17",
    dateTo: "2026-09-25",
    sources: ["manual"],
    ...extra,
  };
}

const conversion: BatchConversion = {
  id: "bc_26I17-30_26I17-16",
  fromBatch: "26I17-30",
  toBatch: "26I17-16",
  fromSize: "30Fr",
  toSize: "16Fr",
  changedQty: 1200,
  stageId: "visual",
  convertedOn: "2026-09-25",
  reason: "Customer",
  createdAt: "2026-09-25T00:00:00.000Z",
  createdBy: "gm",
};

test("original lot gains a convert half and the converted lot is not listed alone", () => {
  const out = attachConversionHalves(
    [group("26I17-30", { checkedQty: 8000 }), group("26I17-16", { checkedQty: 1200 }), group("26J16-14")],
    [conversion],
  );
  expect(out.map((g) => g.batch)).toEqual(["26I17-30", "26J16-14"]);
  expect(out[0].conversion?.toBatch).toBe("26I17-16");
  expect(out[0].convertGroup?.checkedQty).toBe(1200);
  expect(out[1].conversion).toBeNull();
  expect(out[1].convertGroup).toBeNull();
});

test("lots without conversion are unchanged", () => {
  const out = attachConversionHalves([group("26J16-14")], []);
  expect(out).toHaveLength(1);
  expect(out[0].conversion).toBeNull();
});

test("matches canonical batch spelling", () => {
  const out = attachConversionHalves(
    [group("26i17-30"), group("26I17-16")],
    [conversion],
  );
  expect(out).toHaveLength(1);
  expect(out[0].conversion?.changedQty).toBe(1200);
});
