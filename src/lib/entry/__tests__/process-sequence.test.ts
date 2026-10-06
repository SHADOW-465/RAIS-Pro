import { resolveEntrySchema } from "../entry-schema";
import {
  missingProcessStep,
  occupiedStageIds,
  lotHasStage,
  isLineCompleteStage,
  mayOpenStation,
} from "../process-sequence";

const SCHEMA = resolveEntrySchema({
  stages: [
    {
      stageId: "production",
      label: "Dipping",
      category: "primary",
      columns: [{ key: "checked" }, { key: "accepted" }, { key: "rejected" }],
    },
    {
      stageId: "secondary",
      label: "Secondary",
      category: "secondary",
      columns: [{ key: "checked" }, { key: "accepted" }],
    },
    {
      stageId: "visual",
      label: "Visual Inspection",
      category: "assembly",
      columns: [{ key: "checked" }, { key: "accepted" }, { key: "hold" }, { key: "rejected" }],
    },
    {
      stageId: "balloon",
      label: "Balloon Inspection",
      category: "assembly",
      columns: [{ key: "checked" }, { key: "accepted" }, { key: "rejected" }],
    },
    {
      stageId: "valve-integrity",
      label: "Valve Integrity",
      category: "assembly",
      columns: [{ key: "checked" }, { key: "accepted" }, { key: "rejected" }],
    },
    {
      stageId: "final",
      label: "Final Inspection",
      category: "assembly",
      columns: [{ key: "checked" }, { key: "accepted" }, { key: "rejected" }],
    },
  ],
  sections: [
    { id: "primary", label: "Production Dipping" },
    { id: "secondary", label: "Secondary" },
    { id: "assembly", label: "Assembly" },
  ],
});

const LOT = "26H01-16";

function prod(stageId: string, qty = 1000, lot = LOT) {
  return { stageId, batchNo: lot, eventType: "production" as const, quantity: qty };
}

function gap(station: string, occupied: Set<string>, editing = false) {
  return missingProcessStep({ lot: LOT, station, schema: SCHEMA, occupied, editing });
}

describe("occupiedStageIds", () => {
  test("counts Excel and typed production on the lot", () => {
    const occ = occupiedStageIds(
      [
        prod("production", 3650),
        { stageId: "visual", batchNo: "26H02-16", eventType: "production", quantity: 10 },
      ],
      LOT,
    );
    expect(lotHasStage(occ, "production")).toBe(true);
    expect(lotHasStage(occ, "visual")).toBe(false);
  });

  test("production-dipping alias counts as dipping", () => {
    const occ = occupiedStageIds([prod("production-dipping", 3650)], LOT);
    expect(lotHasStage(occ, "production")).toBe(true);
    expect(lotHasStage(occ, "production-dipping")).toBe(true);
  });

  test("unsynced local shift row unlocks the next process immediately", () => {
    const occ = occupiedStageIds([], LOT, [{ batchId: LOT, stageId: "production", checked: 3650 }]);
    expect(lotHasStage(occ, "production")).toBe(true);
  });

  test("zero quantity does not occupy a station", () => {
    const occ = occupiedStageIds([prod("production", 0)], LOT);
    expect(occ.size).toBe(0);
  });
});

describe("missingProcessStep — Dipping → Secondary → Assembly", () => {
  test("Dipping is the start of the line", () => {
    expect(gap("production", new Set())).toBeNull();
  });

  test("Secondary without Dipping is blocked", () => {
    const g = gap("secondary", new Set());
    expect(g?.missingStationId).toBe("production");
    expect(g?.message).toMatch(/Dipping/);
    expect(g?.message).toMatch(/26H01-16/);
  });

  test("Secondary is open once Dipping is on the lot", () => {
    expect(gap("secondary", occupiedStageIds([prod("production")], LOT))).toBeNull();
  });

  test("Assembly without Secondary is blocked even if Dipping is done", () => {
    const g = gap("visual", occupiedStageIds([prod("production")], LOT));
    expect(g?.missingStationId).toBe("secondary");
    expect(g?.message).toMatch(/Secondary/);
  });

  test("jumping straight to Assembly with an empty lot is blocked", () => {
    const g = gap("visual", new Set());
    expect(g?.missingStationId).toBe("production");
    expect(g?.message).toMatch(/Complete the line in order/);
  });

  test("Visual is open after Dipping and Secondary", () => {
    const occ = occupiedStageIds([prod("production"), prod("secondary")], LOT);
    expect(gap("visual", occ)).toBeNull();
  });

  test("Balloon without Visual is blocked", () => {
    const occ = occupiedStageIds([prod("production"), prod("secondary")], LOT);
    const g = gap("balloon", occ);
    expect(g?.missingStationId).toBe("visual");
    expect(g?.missingStationLabel).toMatch(/Visual/);
  });

  test("Balloon is open after Visual", () => {
    const occ = occupiedStageIds(
      [prod("production"), prod("secondary"), prod("visual")],
      LOT,
    );
    expect(gap("balloon", occ)).toBeNull();
  });

  test("Final without Valve is blocked", () => {
    const occ = occupiedStageIds(
      [prod("production"), prod("secondary"), prod("visual"), prod("balloon")],
      LOT,
    );
    expect(gap("final", occ)?.missingStationId).toBe("valve-integrity");
  });

  test("Excel dipping unlocks typed Secondary", () => {
    const occ = occupiedStageIds(
      [{ stageId: "production", batchNo: LOT, eventType: "production", quantity: 3650 }],
      LOT,
    );
    expect(gap("secondary", occ)).toBeNull();
  });

  test("revising an existing row skips the gate", () => {
    expect(gap("visual", new Set(), true)).toBeNull();
    expect(gap("final", new Set(), true)).toBeNull();
  });

  test("inspecting a station that already has the lot is always allowed", () => {
    const occupied = occupiedStageIds([prod("visual")], LOT);
    const open = mayOpenStation({
      lot: LOT,
      station: "visual",
      schema: SCHEMA,
      occupied,
    });
    expect(open.ok).toBe(true);
  });

  test("an operator cannot open empty Assembly when Dipping is missing", () => {
    const open = mayOpenStation({
      lot: LOT,
      station: "visual",
      schema: SCHEMA,
      occupied: new Set(),
    });
    expect(open.ok).toBe(false);
    if (!open.ok) expect(open.gap.missingStationId).toBe("production");
  });

  test("GM may open any station to inspect the lot", () => {
    const open = mayOpenStation({
      lot: LOT,
      station: "final",
      schema: SCHEMA,
      occupied: new Set(),
      inspectAll: true,
    });
    expect(open.ok).toBe(true);
  });

  test("Final is the last gate — Memory releases after it is saved", () => {
    expect(isLineCompleteStage("final")).toBe(true);
    expect(isLineCompleteStage("visual")).toBe(false);
    expect(isLineCompleteStage("production")).toBe(false);
    expect(isLineCompleteStage("production-dipping")).toBe(false);
  });

  test("a converted lot that changes at Visual skips Dipping and Secondary", () => {
    const open = missingProcessStep({
      lot: LOT,
      station: "visual",
      schema: SCHEMA,
      occupied: new Set(),
      entryFromStageId: "visual",
    });
    expect(open).toBeNull();
  });

  test("a converted lot still has to enter Balloon after Visual", () => {
    const g = missingProcessStep({
      lot: LOT,
      station: "balloon",
      schema: SCHEMA,
      occupied: new Set(),
      entryFromStageId: "visual",
    });
    expect(g?.missingStationId).toBe("visual");
  });

  test("stations before the size change are not part of the converted lot", () => {
    const dipping = mayOpenStation({
      lot: LOT,
      station: "production",
      schema: SCHEMA,
      occupied: new Set(),
      entryFromStageId: "visual",
    });
    expect(dipping.ok).toBe(false);
    if (!dipping.ok) {
      expect(dipping.gap.missingStationId).toBe("visual");
      expect(dipping.gap.message).toMatch(/original lot/);
    }
    const secondary = mayOpenStation({
      lot: LOT,
      station: "secondary",
      schema: SCHEMA,
      occupied: new Set(),
      entryFromStageId: "visual",
    });
    expect(secondary.ok).toBe(false);
  });

  test("Balloon is open once the converted lot has Visual", () => {
    const occupied = occupiedStageIds([prod("visual")], LOT);
    expect(
      missingProcessStep({
        lot: LOT,
        station: "balloon",
        schema: SCHEMA,
        occupied,
        entryFromStageId: "visual",
      }),
    ).toBeNull();
  });

  test("going back to Dipping after Assembly is always allowed", () => {
    const occ = occupiedStageIds(
      [prod("production"), prod("secondary"), prod("visual"), prod("balloon"), prod("final")],
      LOT,
    );
    expect(gap("production", occ)).toBeNull();
  });
});
