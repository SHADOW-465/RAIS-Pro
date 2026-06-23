// Re-uploading the same data must NOT double the numbers — even if the file was
// renamed or re-exported (different provenance). Event ids are semantic, so the
// same fact collides on its id and the append dedups it.

import { emitMany, type StageDayRecord } from "@/lib/ingest/emit";
import { MemoryEventStore } from "@/lib/store/memory";

function rec(file: string): StageDayRecord {
  return {
    occurredOn: { kind: "day", start: "2025-12-01", end: "2025-12-01" },
    stageId: "visual",
    source: { file, fileHash: "h", sheet: "VISUAL", tableId: "t1" },
    checked: { value: 6742, cell: `${file}!C2`, header: "QTY CHECKED" },
    acceptedGood: null,
    rework: null,
    rejected: { value: 824, cell: `${file}!D2`, header: "REJECTION" },
    defects: [],
    statedPct: null,
    extractedBy: "heuristic",
    ingestionId: "i1",
  };
}

describe("ingest idempotency", () => {
  it("the same fact from differently-named files produces identical event ids", () => {
    const a = emitMany([rec("December.xlsx")]);
    const b = emitMany([rec("December (copy).xlsx")]);
    expect(a.map((e) => e.eventId).sort()).toEqual(b.map((e) => e.eventId).sort());
  });

  it("re-appending the same data dedups instead of doubling", async () => {
    const store = new MemoryEventStore();
    const first = await store.append(emitMany([rec("December.xlsx")]));
    const second = await store.append(emitMany([rec("December (copy).xlsx")]));
    expect(first.inserted).toBeGreaterThan(0);
    expect(second.inserted).toBe(0);
    expect(second.deduped).toBe(first.inserted);
    const eff = await store.effective();
    expect(eff.length).toBe(first.inserted); // not doubled
  });
});
