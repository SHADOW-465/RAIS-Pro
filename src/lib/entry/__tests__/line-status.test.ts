import { resolveEntrySchema } from "../entry-schema";
import { occupiedStageIds } from "../process-sequence";
import { buildLineStatus, laneCaption } from "../line-status";

const SCHEMA = resolveEntrySchema({
  stages: [
    {
      stageId: "production",
      label: "Production Dipping",
      category: "primary",
      columns: [{ key: "checked" }],
    },
    {
      stageId: "eye-punching",
      label: "Eye Punching",
      category: "secondary",
      columns: [{ key: "checked" }],
    },
    {
      stageId: "secondary",
      label: "Secondary",
      category: "secondary",
      columns: [{ key: "checked" }],
    },
    {
      stageId: "visual",
      label: "Visual Inspection",
      category: "assembly",
      columns: [{ key: "checked" }],
    },
    {
      stageId: "balloon",
      label: "Balloon Inspection",
      category: "assembly",
      columns: [{ key: "checked" }],
    },
    {
      stageId: "valve-integrity",
      label: "Valve Integrity",
      category: "assembly",
      columns: [{ key: "checked" }],
    },
    {
      stageId: "final",
      label: "Final Inspection",
      category: "assembly",
      columns: [{ key: "checked" }],
    },
  ],
  sections: [
    { id: "primary", label: "Production Dipping" },
    { id: "secondary", label: "Secondary (P10–P14)" },
    { id: "assembly", label: "Assembly (P15–P27)" },
  ],
});

const LOT = "26H01-16";

function occ(...stages: string[]) {
  return occupiedStageIds(
    stages.map((stageId) => ({
      stageId,
      batchNo: LOT,
      eventType: "production",
      quantity: 100,
    })),
    LOT,
  );
}

function captions(lot: string, occupied: Set<string>) {
  return buildLineStatus({ lot, schema: SCHEMA, occupied }).lanes.map((l) => ({
    id: l.id,
    caption: laneCaption(l),
  }));
}

describe("buildLineStatus", () => {
  test("blank lot is a new start at Production Dipping", () => {
    const s = buildLineStatus({ lot: "", schema: SCHEMA, occupied: new Set() });
    expect(s.isBlank).toBe(true);
    expect(s.isNew).toBe(false);
    expect(s.nextLaneId).toBe("primary");
    expect(s.nextStationId).toBe("production");
    expect(s.headline).toMatch(/New lots start at Production Dipping/);
    expect(captions("", new Set()).map((c) => c.caption)).toEqual([
      "Not started",
      "Not started",
      "Not started",
    ]);
  });

  test("a newly typed lot with no ledger rows starts at Dipping", () => {
    const s = buildLineStatus({ lot: LOT, schema: SCHEMA, occupied: new Set() });
    expect(s.isNew).toBe(true);
    expect(s.lot).toBe(LOT);
    expect(s.nextStationId).toBe("production");
    expect(s.headline).toBe("New lot 26H01-16 — start at Production Dipping.");
    expect(laneCaption(s.lanes[0])).toBe("Not started");
  });

  test("entries through Visual show dipping completed, secondary 2/2, assembly 1/4, next Balloon", () => {
    const occupied = occ("production", "eye-punching", "secondary", "visual");
    const s = buildLineStatus({ lot: LOT, schema: SCHEMA, occupied });
    expect(laneCaption(s.lanes[0])).toBe("Completed");
    expect(laneCaption(s.lanes[1])).toBe("2/2 completed");
    expect(laneCaption(s.lanes[2])).toBe("1/4 complete");
    expect(s.nextLaneId).toBe("assembly");
    expect(s.nextStationId).toBe("balloon");
    expect(s.nextStationLabel).toMatch(/Balloon/);
    expect(s.headline).toBe("Assembly 1/4 complete. Next: Balloon Inspection.");
  });

  test("production-dipping alias counts as dipping complete", () => {
    const occupied = occ("production-dipping");
    const s = buildLineStatus({ lot: LOT, schema: SCHEMA, occupied });
    expect(s.lanes[0].complete).toBe(true);
    expect(s.nextStationId).toBe("eye-punching");
    expect(s.headline).toMatch(/Production Dipping completed/);
  });

  test("Eye Punching is 1/2 Secondary; Hanging is 2/2", () => {
    const ep = occ("production", "eye-punching");
    const s1 = buildLineStatus({ lot: LOT, schema: SCHEMA, occupied: ep });
    expect(s1.lanes[1].done).toBe(1);
    expect(s1.lanes[1].total).toBe(2);
    expect(s1.lanes[1].complete).toBe(false);
    expect(s1.nextStationId).toBe("hanging");
    expect(laneCaption(s1.lanes[1])).toBe("1/2 complete");

    const both = occ("production", "eye-punching", "hanging");
    const s2 = buildLineStatus({ lot: LOT, schema: SCHEMA, occupied: both });
    expect(s2.lanes[1].done).toBe(2);
    expect(s2.lanes[1].complete).toBe(true);
    expect(laneCaption(s2.lanes[1])).toBe("2/2 completed");
    expect(s2.nextStationId).toBe("visual");
  });

  test("builtin seed schema still counts Eye Punching + Hanging as Secondary 2/2", () => {
    const seed = resolveEntrySchema(null);
    const occupied = occ("production", "eye-punching", "hanging", "visual", "balloon", "valve-integrity", "final");
    const s = buildLineStatus({ lot: LOT, schema: seed, occupied });
    const secondary = s.lanes.find((l) => l.id === "secondary")!;
    expect(secondary.total).toBe(2);
    expect(secondary.done).toBe(2);
    expect(secondary.complete).toBe(true);
    expect(s.isComplete).toBe(true);
  });

  test("a finished lot has no next station", () => {
    const occupied = occ(
      "production",
      "eye-punching",
      "secondary",
      "visual",
      "balloon",
      "valve-integrity",
      "final",
    );
    const s = buildLineStatus({ lot: LOT, schema: SCHEMA, occupied });
    expect(s.isComplete).toBe(true);
    expect(s.nextStationId).toBeNull();
    expect(s.headline).toBe("Lot 26H01-16 is complete on the line.");
  });
});
