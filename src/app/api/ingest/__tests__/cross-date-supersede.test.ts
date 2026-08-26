// Split-day operations: the same lot at the same station on TWO recorded-on
// dates is two physical inspections (Visual 1st–3rd of the month = three
// Visual rows). Identity is (lot · station · date · pass). Re-saving the SAME
// date still supersedes; a different date appends.
process.env.MOID_STORE = "memory";

import { POST } from "../route";
import { NextRequest } from "next/server";
import { getStores } from "@/lib/store";
import { authedJsonHeaders } from "@/__tests__/fixtures/auth";
import type { StageDayRecord } from "@/lib/ingest/emit";

const LOT = "26H25-18";

function rec(date: string, rejected: number, overrides: Partial<StageDayRecord> = {}): StageDayRecord {
  return {
    occurredOn: { kind: "day", start: date, end: date },
    stageId: "visual",
    size: "Fr18",
    source: { file: "Manual Entry", fileHash: "manual", sheet: "Data Entry", tableId: "entry" },
    checked: { value: 500, cell: "ENTRY!checked", header: "Checked Qty" },
    acceptedGood: { value: 500 - rejected, cell: "ENTRY!accepted", header: "Accepted Qty" },
    rework: null,
    rejected: { value: rejected, cell: "ENTRY!rejected", header: "Rejected Qty" },
    defects: [],
    statedPct: null,
    extractedBy: "direct-entry",
    ingestionId: "x",
    customFields: { batch: LOT },
    ...overrides,
  } as StageDayRecord;
}

async function post(records: StageDayRecord[], ingestionId: string) {
  return POST(
    new NextRequest("http://localhost/api/ingest", {
      method: "POST",
      headers: await authedJsonHeaders("operator"),
      body: JSON.stringify({ ingestionId, fileName: "test", records }),
    }),
  );
}

async function effectiveRejections() {
  const { events } = getStores();
  return (await events.effective({})).filter(
    (e) => e.eventType === "inspection" && (e as never as { disposition: string }).disposition === "rejected",
  );
}

beforeEach(async () => {
  const { events } = getStores();
  const all = await events.all({});
  if (all.length) await events.purge(all.map((e) => e.eventId));
});

describe("split days at the same station", () => {
  it("keeps a second recorded-on date as its own effective row", async () => {
    await post([rec("2026-08-01", 10)], "day-1");
    await post([rec("2026-08-04", 25)], "day-2");

    const rejected = await effectiveRejections();
    expect(rejected).toHaveLength(2);
    const byDay = new Map(
      rejected.map((e) => [e.occurredOn.start, (e as never as { quantity: number }).quantity]),
    );
    expect(byDay.get("2026-08-01")).toBe(10);
    expect(byDay.get("2026-08-04")).toBe(25);
  });

  it("sums the lot's rejected total across split days", async () => {
    await post([rec("2026-08-01", 10)], "d1");
    await post([rec("2026-08-09", 40)], "d2");

    const total = (await effectiveRejections()).reduce(
      (sum, e) => sum + (e as never as { quantity: number }).quantity,
      0,
    );
    expect(total).toBe(50);
  });

  it("a re-save of the SAME recorded-on date still supersedes that day only", async () => {
    await post([rec("2026-08-01", 10)], "first");
    await post([rec("2026-08-01", 33)], "rewrite");
    await post([rec("2026-08-04", 7)], "other-day");

    const rejected = await effectiveRejections();
    expect(rejected).toHaveLength(2);
    const byDay = new Map(
      rejected.map((e) => [e.occurredOn.start, (e as never as { quantity: number }).quantity]),
    );
    expect(byDay.get("2026-08-01")).toBe(33);
    expect(byDay.get("2026-08-04")).toBe(7);
  });

  it("leaves a DIFFERENT lot at the same station alone", async () => {
    await post([rec("2026-08-01", 10)], "lot-a");
    await post(
      [rec("2026-08-05", 7, { customFields: { batch: "26H26-18" } })],
      "lot-b",
    );

    // Two lots, two physical inspections, two effective rows.
    expect(await effectiveRejections()).toHaveLength(2);
  });

  it("leaves a different STATION for the same lot alone", async () => {
    await post([rec("2026-08-01", 10)], "st-a");
    await post([rec("2026-08-05", 7, { stageId: "balloon" })], "st-b");

    expect(await effectiveRejections()).toHaveLength(2);
  });

  it("keeps an explicitly declared second pass as its own row", async () => {
    // pass > 1 is the escape hatch for a lot genuinely re-run at a station.
    await post([rec("2026-08-01", 10)], "p1");
    await post([rec("2026-08-05", 7, { customFields: { batch: LOT, pass: 2 } })], "p2");

    expect(await effectiveRejections()).toHaveLength(2);
  });

  it("a typed revision on the SAME day supersedes a workbook row for that day, and says so", async () => {
    // Two branches, two rules, and it is worth keeping them straight:
    //
    //   UPDATE  — same identity, restated. Direct entry wins: `precedenceOf`
    //             in canonical.ts gives a human Infinity, "never silently
    //             outvoted by an upload". Leaving both effective would double
    //             count one physical inspection.
    //   REMOVAL — payload owns the identity but states no value. Here the
    //             workbook IS protected (see the removal-sweep test in
    //             reconcile.test.ts); typing a row must not erase what an
    //             upload stated.
    //
    // Same-date already behaved this way. Only the cross-date case leaked,
    // which is what made this look like a rule about workbooks rather than a
    // gap in the search window.
    await post(
      [rec("2026-08-01", 10, { extractedBy: "heuristic", source: { file: "BOOK.xlsx", fileHash: "h1", sheet: "S", tableId: "t1" } })],
      "excel",
    );
    await post([rec("2026-08-01", 25)], "typed");

    const rejected = await effectiveRejections();
    expect(rejected).toHaveLength(1);
    expect((rejected[0] as never as { quantity: number }).quantity).toBe(25);

    // The override is not silent: a CorrectionEvent records what replaced what,
    // which is what the revision history renders.
    const { events } = getStores();
    const corrections = (await events.all({})).filter((e) => e.eventType === "correction");
    expect(corrections.length).toBeGreaterThan(0);
    expect(
      corrections.some(
        (c) => (c as never as { reason: string }).reason === "Re-entry updated this value",
      ),
    ).toBe(true);
  });

});
