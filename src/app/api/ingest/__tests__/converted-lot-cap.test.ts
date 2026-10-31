// A converted lot holds only the pieces that moved to its size, whichever
// screen sends the entry.
process.env.MOID_STORE = "memory";

import { POST } from "../route";
import { NextRequest } from "next/server";
import { authedJsonHeaders } from "@/__tests__/fixtures/auth";
import { __resetLineageStoreForTests, getLineageStore } from "@/lib/lineage/store";
import { getStores } from "@/lib/store";
import type { StageDayRecord } from "@/lib/ingest/emit";

function rec(batch: string, checked: number): StageDayRecord {
  return {
    occurredOn: { kind: "day", start: "2026-09-23", end: "2026-09-23" },
    stageId: "visual",
    size: "Fr16",
    source: { file: "Manual Entry", fileHash: "manual", sheet: "Data Entry", tableId: "entry" },
    checked: { value: checked, cell: "ENTRY!checked", header: "Checked Qty" },
    acceptedGood: { value: checked, cell: "ENTRY!accepted", header: "Accepted Qty" },
    rework: null,
    rejected: null,
    defects: [],
    statedPct: null,
    extractedBy: "direct-entry",
    ingestionId: "x",
    customFields: { batch },
  } as StageDayRecord;
}

async function post(records: StageDayRecord[]) {
  return POST(
    new NextRequest("http://localhost/api/ingest", {
      method: "POST",
      headers: await authedJsonHeaders("operator"),
      body: JSON.stringify({ ingestionId: "cap-1", fileName: "test", records }),
    }),
  );
}

beforeEach(async () => {
  __resetLineageStoreForTests();
  const { events } = getStores();
  const all = await events.all({});
  if (all.length) await events.purge(all.map((e) => e.eventId));
  // The ledger is not consulted here: no eligibleQty / lotKnown on the input.
  await getLineageStore().create({
    fromBatch: "26I21-14",
    toSize: "16Fr",
    changedQty: 1146,
    stageId: "visual",
    convertedOn: "2026-09-23",
    reason: "customer",
    createdBy: "t",
  });
});

it("refuses 99,999,999 on a lot converted with 1,146 pieces, and writes nothing", async () => {
  const res = await post([rec("26I21-16", 99_999_999)]);
  expect(res.status).toBe(400);
  expect((await res.json()).code).toBe("converted-lot-over-cap");
  expect(await getStores().events.all({})).toHaveLength(0);
});

it("accepts the converted quantity, and any quantity on an unconverted lot", async () => {
  expect((await post([rec("26I21-16", 1146)])).status).toBe(200);
  expect((await post([rec("26I22-14", 5000)])).status).toBe(200);
});
