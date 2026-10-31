// What POST /api/ingest does today about skipping primary and secondary.
//
// Required (NOT implemented — do not "fix" this file by changing the route):
// a normal lot must be rejected when it starts at assembly without primary
// and secondary. A converted lot may start at its change station.
//
// Current behaviour: the route never calls missingProcessStep or checkEntry.
// Both lots are accepted. The normal-lot 200 is a deviation. The converted-lot
// 200 matches the required outcome only because nothing is gated.
process.env.MOID_STORE = "memory";

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { NextRequest } from "next/server";
import { POST } from "../route";
import { authedJsonHeaders } from "@/__tests__/fixtures/auth";
import { __resetLineageStoreForTests, getLineageStore } from "@/lib/lineage/store";
import { getStores } from "@/lib/store";
import type { StageDayRecord } from "@/lib/ingest/emit";

function rec(batch: string): StageDayRecord {
  return {
    occurredOn: { kind: "day", start: "2026-09-23", end: "2026-09-23" },
    stageId: "visual",
    size: "Fr16",
    source: { file: "Manual Entry", fileHash: "manual", sheet: "Data Entry", tableId: "entry" },
    checked: { value: 100, cell: "ENTRY!checked", header: "Checked Qty" },
    acceptedGood: { value: 100, cell: "ENTRY!accepted", header: "Accepted Qty" },
    rework: null,
    rejected: null,
    defects: [],
    statedPct: null,
    extractedBy: "direct-entry",
    ingestionId: "gate",
    customFields: { batch },
  } as StageDayRecord;
}

async function post(records: StageDayRecord[]) {
  return POST(
    new NextRequest("http://localhost/api/ingest", {
      method: "POST",
      headers: await authedJsonHeaders("operator"),
      body: JSON.stringify({ ingestionId: `gate-${records[0]?.customFields?.batch ?? "x"}`, fileName: "test", records }),
    }),
  );
}

beforeEach(async () => {
  __resetLineageStoreForTests();
  const { events } = getStores();
  const all = await events.all({});
  if (all.length) await events.purge(all.map((e) => e.eventId));
});

test("the ingest route does not consult the process gate", () => {
  const src = readFileSync(join(process.cwd(), "src/app/api/ingest/route.ts"), "utf8");
  expect(src).not.toMatch(/missingProcessStep/);
  expect(src).not.toMatch(/entryFromStageId/);
  expect(src).not.toMatch(/\bcheckEntry\b/);
});

test("a normal lot that starts at Visual is accepted", async () => {
  // DEVIATION. The required rule blocks this. The route returns 200 because
  // it never calls missingProcessStep. Not changed — awaiting Showmik's decision.
  const res = await post([rec("26I22-14")]);
  expect(res.status).toBe(200);
});

test("a converted lot that starts at its change station is accepted", async () => {
  // Matches the required outcome. The server is not the thing enforcing it;
  // see the normal-lot test above.
  await getLineageStore().create({
    fromBatch: "26I21-14",
    toSize: "16Fr",
    changedQty: 100,
    stageId: "visual",
    convertedOn: "2026-09-23",
    reasonCategory: "size-reclassification",
    reasonNote: "pieces became 16Fr at visual",
    createdBy: "gm",
  });
  const res = await post([rec("26I21-16")]);
  expect(res.status).toBe(200);
});

// Required, and not what the route does today. Left as a todo so a later
// change is a decision, not a silent edit of this characterization.
test.todo("rejects a normal lot that starts at Visual without primary or secondary");
