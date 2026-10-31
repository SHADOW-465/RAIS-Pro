// Current entry gating for a converted lot versus a normal lot.
//
// This file records what the code does today. It does not change the gate.
// Required rule (Showmik, not implemented where the comments say otherwise):
// a converted lot may start at its change station without primary/secondary;
// a normal lot must still be blocked from skipping them.
//
// Client (checkEntry / missingProcessStep): matches the required rule when
// entryFromStageId is the change station. An empty stage id does not waive.
// Server (POST /api/ingest): does not apply this gate. See
// src/app/api/ingest/__tests__/entry-stage-gating.test.ts and
// docs/HARDENING_NOTES.md.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { checkEntry, type EntryDraft } from "../check-entry";
import { resolveEntrySchema } from "../entry-schema";
import { mayOpenStation, missingProcessStep } from "../process-sequence";
import { __resetLineageStoreForTests, getLineageStore } from "@/lib/lineage/store";

const schema = resolveEntrySchema({
  stages: [
    { stageId: "stripping", label: "Stripping", category: "primary", columns: [{ key: "checked" }] },
    { stageId: "eye-punching", label: "Eye Punching", category: "secondary", columns: [{ key: "checked" }] },
    { stageId: "visual", label: "Visual Inspection", category: "assembly", columns: [{ key: "checked" }, { key: "accepted" }] },
    { stageId: "balloon", label: "Balloon Inspection", category: "assembly", columns: [{ key: "checked" }, { key: "accepted" }] },
  ],
  sections: [
    { id: "primary", label: "Production Dipping" },
    { id: "secondary", label: "Secondary" },
    { id: "assembly", label: "Assembly" },
  ],
});

const LOT = "26H01-16";
const TODAY = "2026-08-15";

function draft(over: Partial<EntryDraft> = {}): EntryDraft {
  return {
    lot: LOT,
    station: "visual",
    stationLabel: "Visual Inspection",
    size: "16Fr",
    date: TODAY,
    checked: 1000,
    accepted: 1000,
    hold: 0,
    rejected: 0,
    defectSum: 0,
    capturesAccepted: true,
    capturesHold: false,
    capturesRejected: false,
    capturesDefects: false,
    ...over,
  };
}

function gap(entryFromStageId?: string | null) {
  return missingProcessStep({
    lot: LOT,
    station: "visual",
    schema,
    occupied: new Set(),
    entryFromStageId,
  });
}

describe("client gate — current behaviour", () => {
  test("a normal lot is blocked from opening Visual before primary and secondary", () => {
    const g = gap(null);
    expect(g?.missingStationId).toBe("stripping");
    const open = mayOpenStation({
      lot: LOT,
      station: "visual",
      schema,
      occupied: new Set(),
    });
    expect(open.ok).toBe(false);
    const verdict = checkEntry(draft(), new Map(), TODAY, { schema, occupied: new Set() });
    expect(verdict.canSave).toBe(false);
    expect(verdict.blocks.map((b) => b.code)).toContain("process-incomplete");
  });

  test("a converted lot may start at its change station without primary or secondary", () => {
    expect(gap("visual")).toBeNull();
    const open = mayOpenStation({
      lot: LOT,
      station: "visual",
      schema,
      occupied: new Set(),
      entryFromStageId: "visual",
    });
    expect(open.ok).toBe(true);
    const verdict = checkEntry(draft(), new Map(), TODAY, {
      schema,
      occupied: new Set(),
      entryFromStageId: "visual",
    });
    expect(verdict.canSave).toBe(true);
    expect(verdict.blocks.map((b) => b.code)).not.toContain("process-incomplete");
  });

  test("an empty change station does not waive primary and secondary", () => {
    expect(gap("")?.missingStationId).toBe("stripping");
    expect(gap("   ")?.missingStationId).toBe("stripping");
    const verdict = checkEntry(draft(), new Map(), TODAY, {
      schema,
      occupied: new Set(),
      entryFromStageId: "",
    });
    expect(verdict.canSave).toBe(false);
  });

  test("a converted lot still cannot skip past the change station", () => {
    const g = missingProcessStep({
      lot: LOT,
      station: "balloon",
      schema,
      occupied: new Set(),
      entryFromStageId: "visual",
    });
    expect(g?.missingStationId).toBe("visual");
  });

  test("Data Entry takes the waiver from the conversion's stage, and only when the chain has a parent", () => {
    const entry = readFileSync(join(process.cwd(), "src/components/BatchMatrixEntry.tsx"), "utf8");
    expect(entry).toMatch(/data\.chain\.length < 2/);
    expect(entry).toMatch(/const entryFromStageId = activeConversionFlow\?\.stageId\?\.trim\(\) \|\| null/);
    const sequence = readFileSync(join(process.cwd(), "src/lib/entry/process-sequence.ts"), "utf8");
    expect(sequence).toMatch(/export function missingProcessStep/);
    expect(sequence).toMatch(/entryFromStageId/);
  });
});

describe("a reversed conversion is not a waiver", () => {
  beforeEach(() => {
    __resetLineageStoreForTests();
  });

  test("after a GM undo the chain is a single node, so entry would not start at the change station", async () => {
    const store = getLineageStore();
    const row = await store.create({
      fromBatch: "26I21-14",
      toSize: "16Fr",
      changedQty: 80,
      stageId: "visual",
      convertedOn: "2026-09-23",
      reasonCategory: "size-reclassification",
      reasonNote: "14 became 16 at visual",
      createdBy: "gm",
    });
    const live = await store.chainFor(row.toBatch);
    expect(live.length).toBeGreaterThanOrEqual(2);
    expect(live.find((n) => n.batch === row.toBatch)?.via?.stageId).toBe("visual");

    await store.reverse({ id: row.id, actor: "gm", reason: "recorded on the wrong lot" });
    const after = await store.chainFor(row.toBatch);
    expect(after).toHaveLength(1);
    expect(after[0].via).toBeNull();
    // The client clears the waiver when the chain is shorter than 2
    // (BatchMatrixEntry.tsx). With no stage id, Visual is blocked again.
    expect(gap(after[0].via?.stageId ?? null)?.missingStationId).toBe("stripping");
  });
});
