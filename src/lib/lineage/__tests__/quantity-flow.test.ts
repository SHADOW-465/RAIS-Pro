import {
  chipFromQty,
  stageShowsConvert,
  buildQuantityFlow,
  qtyFromRows,
  defaultFlowStations,
  eligibleTransferQty,
  transferQtyError,
  type FlowStation,
} from "../quantity-flow";
import type { AuditEntryRow } from "@/lib/analytics/audit-sessions";

const stations: FlowStation[] = [
  { stageId: "production", label: "Production", laneId: "primary" },
  { stageId: "secondary", label: "Secondary", laneId: "secondary" },
  { stageId: "visual", label: "Visual Inspection", laneId: "assembly" },
  { stageId: "balloon", label: "Balloon Inspection", laneId: "assembly" },
];

test("eligible transfer uses accepted at the change station, else checked", () => {
  expect(eligibleTransferQty({ acceptedQty: 4000, checkedQty: 6000 })).toBe(4000);
  expect(eligibleTransferQty({ acceptedQty: 0, checkedQty: 6000 })).toBe(6000);
  expect(eligibleTransferQty(null)).toBeNull();
});

test("transfer above eligible quantity is rejected", () => {
  expect(transferQtyError(5001, 5000, "Visual")).toMatch(/Only 5,000/);
  expect(transferQtyError(10, 0, "Visual")).toMatch(/no quantity at Visual/);
  expect(transferQtyError(200, 5000, "Visual")).toBeNull();
  expect(transferQtyError(-1, 5000, "Visual")).toMatch(/negative/);
});

test("WIP is the remainder of checked minus accept, hold, and reject", () => {
  expect(chipFromQty({ checked: 6000, accepted: 4000, hold: 600, rejected: 200 })).toEqual({
    checked: 6000,
    accepted: 4000,
    hold: 600,
    rejected: 200,
    wip: 1200,
  });
});

test("WIP floors at zero when the identity already balances", () => {
  expect(chipFromQty({ checked: 8000, accepted: 6000, hold: 1500, rejected: 500 }).wip).toBe(0);
});

test("empty quantities stay zero — no demo numbers", () => {
  expect(chipFromQty({})).toEqual({
    checked: 0,
    accepted: 0,
    hold: 0,
    rejected: 0,
    wip: 0,
  });
});

test("convert half starts at the change station and continues downstream", () => {
  expect(stageShowsConvert("production", "visual")).toBe(false);
  expect(stageShowsConvert("secondary", "visual")).toBe(false);
  expect(stageShowsConvert("visual", "visual")).toBe(true);
  expect(stageShowsConvert("balloon", "visual")).toBe(true);
});

test("flow board peels remain qty into convert at the change station", () => {
  const bands = buildQuantityFlow({
    stations,
    original: {
      production: { checked: 8000, accepted: 6000, hold: 1500, rejected: 500 },
      secondary: { checked: 6000, accepted: 4000, hold: 600, rejected: 200 },
      visual: { checked: 2800, accepted: 1600, hold: 450, rejected: 250 },
      balloon: { checked: 1600, accepted: 1500, hold: 40, rejected: 10 },
    },
    convert: {
      visual: { checked: 1200, accepted: 600, hold: 200, rejected: 200 },
      balloon: { checked: 600, accepted: 400, hold: 100, rejected: 30 },
    },
    conversion: { stageId: "visual", changedQty: 1200, toBatch: "26I17-16" },
  });

  expect(bands).toHaveLength(4);
  expect(bands[0].convert).toBeNull();
  expect(bands[1].convert).toBeNull();
  expect(bands[1].original.wip).toBe(1200);
  expect(bands[2].convert?.checked).toBe(1200);
  expect(bands[2].convert?.accepted).toBe(600);
  expect(bands[2].convert?.wip).toBe(200);
  expect(bands[3].convert?.checked).toBe(600);
  expect(bands[3].convert?.accepted).toBe(400);
  expect(bands[3].toBatch).toBe("26I17-16");
});

test("first convert checked falls back to changedQty until the converted lot has an entry", () => {
  const bands = buildQuantityFlow({
    stations,
    original: {
      visual: { checked: 2800, accepted: 1600, hold: 0, rejected: 0 },
    },
    convert: {},
    conversion: { stageId: "visual", changedQty: 1200, toBatch: "26I17-16" },
  });
  const visual = bands.find((b) => b.stageId === "visual");
  expect(visual?.convert?.checked).toBe(1200);
  expect(visual?.convert?.accepted).toBe(0);
});

test("default board bands follow the entry line: Stripping, Eye Punching, Hanging, then the four gates", () => {
  const ids = defaultFlowStations().map((s) => s.stageId);
  expect(ids).toEqual([
    "stripping",
    "eye-punching",
    "hanging",
    "visual",
    "balloon",
    "valve-integrity",
    "final",
  ]);
});

test("qtyFromRows sums hold from rework and does not invent values", () => {
  const rows = [
    {
      checked: 2800,
      accepted: 1600,
      rework: 450,
      rejected: 250,
    },
  ] as AuditEntryRow[];
  expect(qtyFromRows(rows)).toEqual({
    checked: 2800,
    accepted: 1600,
    hold: 450,
    rejected: 250,
  });
  expect(qtyFromRows([])).toEqual({ checked: 0, accepted: 0, hold: 0, rejected: 0 });
});
