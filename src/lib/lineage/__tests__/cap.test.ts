import { convertedLotCapError } from "../cap";
import type { BatchConversion } from "../types";

const conv: BatchConversion = {
  id: "bc_26I21-14_26I21-16",
  fromBatch: "26I21-14",
  toBatch: "26I21-16",
  fromSize: "14Fr",
  toSize: "16Fr",
  changedQty: 1146,
  stageId: "visual",
  convertedOn: "2026-09-23",
  reason: "customer",
  createdAt: "2026-09-23T00:00:00.000Z",
  createdBy: "t",
};
const rec = (batch: string, checked: number | null) => ({
  checked: checked == null ? null : { value: checked },
  customFields: { batch },
});

test("a record for a converted lot may not check more than moved", () => {
  expect(convertedLotCapError([rec("26I21-16", 99_999_999)], [conv])).toMatch(/1,146 pieces/);
  expect(convertedLotCapError([rec("26I21-16", 1146)], [conv])).toBeNull();
  expect(convertedLotCapError([rec("26i21-16", 1147)], [conv])).not.toBeNull();
});

test("other lots, the original lot and unknown quantities are not capped", () => {
  expect(convertedLotCapError([rec("26I21-14", 5000), rec("26I22-14", 5000)], [conv])).toBeNull();
  expect(convertedLotCapError([rec("26I21-16", 5000)], [{ ...conv, changedQty: 0 }])).toBeNull();
  expect(convertedLotCapError([rec("26I21-16", null)], [conv])).toBeNull();
  expect(convertedLotCapError([rec("26I21-16", 5000)], [])).toBeNull();
});
