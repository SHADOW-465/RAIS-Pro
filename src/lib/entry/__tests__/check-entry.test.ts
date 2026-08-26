import { checkEntry, summariseLedger, type EntryDraft } from "../check-entry";
import { entryIdentity, identityKey, sizeFromLot } from "../identity";

const TODAY = "2026-08-15";

function draft(over: Partial<EntryDraft> = {}): EntryDraft {
  return {
    lot: "26H25-18",
    station: "visual",
    stationLabel: "Visual Inspection",
    size: "18Fr",
    date: TODAY,
    checked: 1326,
    accepted: 1163,
    hold: 124,
    rejected: 39,
    defectSum: 39,
    capturesAccepted: true,
    capturesHold: true,
    capturesRejected: true,
    capturesDefects: true,
    ...over,
  };
}

/** A saved direct entry, in the shape summariseLedger reads. */
function saved(
  lot: string,
  station: string,
  vals: { checked: number; accepted?: number; rejected?: number; date?: string; pass?: number },
) {
  const base = {
    stageId: station,
    batchNo: lot,
    extractedBy: "direct-entry",
    occurredOn: { start: vals.date ?? TODAY },
    customFields: vals.pass && vals.pass > 1 ? { pass: vals.pass } : {},
    provenance: { sheet: "Day Shift" },
  };
  return [
    { ...base, eventType: "production", quantity: vals.checked },
    { ...base, eventType: "inspection", disposition: "accepted", quantity: vals.accepted ?? 0 },
    { ...base, eventType: "inspection", disposition: "rejected", quantity: vals.rejected ?? 0 },
  ];
}

const EMPTY = new Map();

describe("identity", () => {
  it("derives the size from the lot code — the code is authoritative", () => {
    expect(sizeFromLot("26H25-18")).toBe("Fr18");
    expect(sizeFromLot("26G01-6")).toBe("Fr6");
    expect(sizeFromLot("nonsense")).toBeNull();
  });

  it("keys pass 1 without a suffix so pre-pass rows still match", () => {
    expect(identityKey(entryIdentity("26H25-18", "visual", "2026-08-15")!)).toBe(
      "26H25-18|visual|2026-08-15",
    );
    expect(identityKey(entryIdentity("26H25-18", "visual", "2026-08-15", 2)!)).toBe(
      "26H25-18|visual|2026-08-15|2",
    );
  });

  it("folds lot-code spellings onto one identity", () => {
    expect(identityKey(entryIdentity("26H2518", "visual", "2026-08-15")!)).toBe(
      identityKey(entryIdentity("26H25-18", "visual", "2026-08-15")!),
    );
  });

  it("different recorded-on dates are different identities", () => {
    expect(identityKey(entryIdentity("26H25-18", "visual", "2026-08-01")!)).not.toBe(
      identityKey(entryIdentity("26H25-18", "visual", "2026-08-02")!),
    );
  });
});

describe("checkEntry — blocks", () => {
  it("passes a clean entry", () => {
    const v = checkEntry(draft(), EMPTY, TODAY);
    expect(v.blocks).toEqual([]);
    expect(v.canSave).toBe(true);
  });

  it("refuses a lot code that is not a lot code", () => {
    const v = checkEntry(draft({ lot: "26025-18" }), EMPTY, TODAY);
    expect(v.canSave).toBe(false);
    expect(v.blocks.map((b) => b.code)).toContain("lot-code-invalid");
  });

  it("refuses a size that disagrees with the lot code", () => {
    const v = checkEntry(draft({ size: "14Fr" }), EMPTY, TODAY);
    expect(v.blocks.map((b) => b.code)).toContain("size-disagrees-with-lot");
    expect(v.blocks.find((b) => b.code === "size-disagrees-with-lot")!.message).toContain("Fr18");
  });

  it("refuses counts that do not balance", () => {
    const v = checkEntry(draft({ hold: 0 }), EMPTY, TODAY);
    expect(v.blocks.map((b) => b.code)).toContain("counts-do-not-balance");
  });

  it("refuses defect reasons totalling more than the rejected", () => {
    const v = checkEntry(draft({ defectSum: 44 }), EMPTY, TODAY);
    expect(v.blocks.map((b) => b.code)).toContain("defects-exceed-rejected");
  });

  it("refuses a future date but allows a backdated one with a note", () => {
    expect(checkEntry(draft({ date: "2026-08-16" }), EMPTY, TODAY).blocks.map((b) => b.code))
      .toContain("date-in-future");
    const back = checkEntry(draft({ date: "2026-08-12" }), EMPTY, TODAY);
    expect(back.canSave).toBe(true);
    expect(back.notes.map((n) => n.code)).toContain("date-backdated");
  });

  it("names an invalid recorded-on date instead of failing with no message", () => {
    const v = checkEntry(draft({ date: "25 Aug" }), EMPTY, TODAY);
    expect(v.canSave).toBe(false);
    expect(v.blocks.map((b) => b.code)).toContain("date-invalid");
  });

  it("refuses an empty entry", () => {
    expect(checkEntry(draft({ checked: 0, accepted: 0, hold: 0, rejected: 0, defectSum: 0 }), EMPTY, TODAY)
      .blocks.map((b) => b.code)).toContain("nothing-checked");
  });
});

describe("checkEntry — the lot already being at this station", () => {
  const ledger = summariseLedger(saved("26H25-18", "visual", { checked: 1326, accepted: 1163, rejected: 39 }));

  it("warns rather than blocks — the operator may be correcting", () => {
    const v = checkEntry(draft(), ledger, TODAY);
    expect(v.canSave).toBe(true);
    expect(v.warnings.map((w) => w.code)).toContain("station-already-recorded");
  });

  it("a different recorded-on date is another day of the same station, not a rewrite", () => {
    // Visual on the 1st and Visual on the 3rd are two physical inspections of
    // the same lot. Saving the second must ADD a day, not replace the first.
    const v = checkEntry(draft({ date: "2026-08-14" }), ledger, TODAY);
    expect(v.warnings.map((w) => w.code)).not.toContain("station-already-recorded");
    expect(v.canSave).toBe(true);
    expect(v.notes.map((n) => n.code)).toContain("split-day-entry");
    expect(v.notes.find((n) => n.code === "split-day-entry")!.message).toContain("2026-08-15");
  });

  it("says nothing about a DIFFERENT station on the same lot", () => {
    const v = checkEntry(draft({ station: "balloon", stationLabel: "Balloon" }), ledger, TODAY);
    expect(v.warnings.map((w) => w.code)).not.toContain("station-already-recorded");
    expect(v.canSave).toBe(true);
  });

  it("never blocks a later station just because earlier gates are done", () => {
    // The regression that locked finished lots out of Valve Fixing and every
    // primary/secondary station.
    const finished = summariseLedger([
      ...saved("26H25-18", "visual", { checked: 100 }),
      ...saved("26H25-18", "balloon", { checked: 100 }),
      ...saved("26H25-18", "valve-integrity", { checked: 100 }),
      ...saved("26H25-18", "final", { checked: 100 }),
    ]);
    for (const station of ["valve-fixing", "primary-pack-inspection", "production", "trimming"]) {
      const v = checkEntry(
        draft({ station, capturesHold: false, hold: 0, accepted: 1287, defectSum: 39 }),
        finished,
        TODAY,
      );
      expect(v.blocks.map((b) => b.code)).not.toContain("station-already-recorded");
      expect(v.canSave).toBe(true);
    }
  });

  it("stays quiet while editing that same row", () => {
    const v = checkEntry(draft({ editing: true }), ledger, TODAY);
    expect(v.warnings.map((w) => w.code)).not.toContain("station-already-recorded");
  });
});

// The second-pass affordance is gone from the UI: re-entering a lot at a
// station is a rewrite, full stop. `pass` survives in the identity so ledger
// rows written while it existed still resolve to themselves — but nothing can
// mint a pass > 1 entry any more, so the rules that policed one are deleted
// rather than left as untriggerable code.
describe("checkEntry — a pass already on the ledger still resolves", () => {
  const ledger = summariseLedger(saved("26H25-18", "visual", { checked: 700, accepted: 700 }));

  it("an existing pass-2 row keeps its own identity, separate from pass 1", () => {
    const v = checkEntry(draft({ pass: 2 }), ledger, TODAY);
    expect(v.identity?.pass).toBe(2);
    // Not a collision with the pass-1 row, and no leftover pass paperwork.
    expect(v.warnings.map((w) => w.code)).not.toContain("station-already-recorded");
    expect(v.blocks.map((b) => b.code)).not.toContain("pass-needs-reason");
    expect(v.canSave).toBe(true);
  });
});

describe("checkEntry — same counts under a different lot code", () => {
  const ledger = summariseLedger(saved("26H24-18", "visual", { checked: 1326, accepted: 1163, rejected: 39 }));

  it("flags identical counts filed under another lot on the same day", () => {
    const v = checkEntry(draft(), ledger, TODAY);
    expect(v.warnings.map((w) => w.code)).toContain("same-counts-different-lot");
  });

  it("stays quiet when the counts genuinely differ", () => {
    const v = checkEntry(draft({ checked: 1000, accepted: 900, hold: 61, rejected: 39 }), ledger, TODAY);
    expect(v.warnings.map((w) => w.code)).not.toContain("same-counts-different-lot");
  });

  it("stays quiet at a quantity-only station, where one round number proves nothing", () => {
    // Hanging records a single Quantity. Every lot is 1000, so an "identical
    // counts" match carries no information — this fired on nearly every
    // second lot of the day and trained operators to tick past it.
    const hanging = summariseLedger(
      saved("26H19-16", "hanging", { checked: 1000, accepted: 0, rejected: 0 }),
    );
    const v = checkEntry(
      draft({
        lot: "26H19-20",
        size: "20Fr",
        station: "hanging",
        checked: 1000,
        accepted: 0,
        hold: 0,
        rejected: 0,
        capturesAccepted: false,
        capturesHold: false,
        capturesRejected: false,
        capturesDefects: false,
      }),
      hanging,
      TODAY,
    );
    expect(v.warnings.map((w) => w.code)).not.toContain("same-counts-different-lot");
    expect(v.canSave).toBe(true);
  });
});

describe("summariseLedger", () => {
  it("ignores Excel-sourced events — an import is not superseded by typing", () => {
    const excel = saved("26H25-18", "visual", { checked: 1326 }).map((e) => ({
      ...e,
      extractedBy: "mod",
      provenance: { sheet: "Sheet1" },
    }));
    expect(summariseLedger(excel).size).toBe(0);
  });
});
