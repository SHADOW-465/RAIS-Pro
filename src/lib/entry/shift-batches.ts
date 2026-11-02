// This browser's log of shift batches typed into Data Entry. The ledger is the
// record; this is the "not on the ledger yet" view and a convenience for
// revising a just-saved row. Wrapped and validated like every stored value.

import { z } from "zod";
import { slot } from "@/lib/storage";
import type { ShiftBatchRecord } from "@/lib/entry/disposafe-matrix";

// Only the fields every reader relies on are checked; the rest of the record
// passes through untouched.
const rows = z.array(
  z.looseObject({
    id: z.string(),
    date: z.string(),
    batchId: z.string(),
    checked: z.number(),
  }),
);

const shiftBatches = slot({
  name: "shift-batches",
  schema: rows as unknown as z.ZodType<ShiftBatchRecord[]>,
  legacyKeys: ["disposafe_shift_batches"],
});

export function loadShiftBatches(): ShiftBatchRecord[] {
  return shiftBatches.get() ?? [];
}

export function persistShiftBatches(next: ShiftBatchRecord[]): boolean {
  return shiftBatches.set(next);
}
