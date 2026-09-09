// Balloon checked > Visual passed-forward must NOT 500 the ingest.
// It is V-014, a surfaced finding — the row still reaches the ledger.
process.env.MOID_STORE = "memory";

import { POST } from "../route";
import { NextRequest } from "next/server";
import { getStores } from "@/lib/store";
import { authedJsonHeaders } from "@/__tests__/fixtures/auth";
import type { StageDayRecord } from "@/lib/ingest/emit";

const LOT = "27A01-20";

function rec(stageId: string, checked: number, accepted: number): StageDayRecord {
  return {
    occurredOn: { kind: "day", start: "2026-08-31", end: "2026-08-31" },
    stageId,
    size: "Fr20",
    source: { file: "Manual Entry", fileHash: "manual", sheet: "Data Entry", tableId: "entry" },
    checked: { value: checked, cell: "ENTRY!checked", header: "Checked Qty" },
    acceptedGood: { value: accepted, cell: "ENTRY!accepted", header: "Accepted Qty" },
    rework: null,
    rejected: { value: checked - accepted, cell: "ENTRY!rejected", header: "Rejected Qty" },
    defects: [],
    statedPct: null,
    extractedBy: "direct-entry",
    ingestionId: "ing",
    customFields: { batch: LOT },
  };
}

async function post(records: StageDayRecord[], ingestionId: string) {
  return POST(
    new NextRequest("http://localhost/api/ingest", {
      method: "POST",
      headers: await authedJsonHeaders("operator"),
      body: JSON.stringify({ ingestionId, fileName: `Batch Entry ${LOT}`, records }),
    }),
  );
}

test("V-014 mass-balance is a warning on a successful write, not a Zod 500", async () => {
  await post([rec("visual", 1000, 900)], "ing-visual");
  const res = await post([rec("balloon", 1000, 900)], "ing-balloon");
  const body = await res.json();
  expect(res.status).toBe(200);
  expect(body.error).toBeUndefined();
  expect(body.inserted).toBeGreaterThan(0);
  const v014 = (body.issues as { code: string; message: string }[]).find((i) => i.code === "V-014");
  expect(v014).toBeDefined();
  expect(v014!.message).toMatch(/balloon checked 1000/i);
  expect(v014!.message).toMatch(/passed forward 900/i);
  const { events } = getStores();
  const balloon = (await events.effective({})).filter((e: any) => e.stageId === "balloon");
  expect(balloon.length).toBeGreaterThan(0);
});
