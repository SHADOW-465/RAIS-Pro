// Forces the memory store so this test never touches a real Supabase project.
process.env.MOID_STORE = "memory";

import { GET } from "../route";
import { NextRequest } from "next/server";
import { getStores } from "@/lib/store";
import { emitMany } from "@/lib/ingest/emit";
import type { StageDayRecord } from "@/lib/ingest/emit";

function rec(date: string, overrides: Partial<StageDayRecord> = {}): StageDayRecord {
  return {
    occurredOn: { kind: "day", start: date, end: date },
    stageId: "visual",
    size: "Fr8",
    source: { file: "Manual Entry", fileHash: `manual-${date}`, sheet: "Data Entry", tableId: "entry" },
    checked: { value: 100, cell: "EDIT!checked", header: "checked" },
    acceptedGood: { value: 90, cell: "EDIT!acceptedGood", header: "acceptedGood" },
    rework: null,
    rejected: { value: 10, cell: "EDIT!rejected", header: "rejected" },
    defects: [],
    statedPct: null,
    extractedBy: "direct-entry",
    ingestionId: `ing-${date}`,
    ...overrides,
  };
}

async function seed(records: StageDayRecord[]) {
  const { events } = getStores();
  await events.append(emitMany(records));
}

function req(qs: string) {
  return new NextRequest(`http://localhost/api/day-records?${qs}`);
}

describe("/api/day-records", () => {
  it("date-only mode is unchanged: returns every stage/size for that single date", async () => {
    await seed([rec("2026-04-01"), rec("2026-04-01", { stageId: "production", size: null })]);
    const res = await GET(req("date=2026-04-01"));
    const json = await res.json();
    expect(json.records).toHaveLength(2);
    expect(json.records.every((r: StageDayRecord) => r.occurredOn.start === "2026-04-01")).toBe(true);
  });

  it("from/to range mode returns one record per (date, stage, size)", async () => {
    await seed([rec("2026-04-01"), rec("2026-04-02"), rec("2026-04-03")]);
    const res = await GET(req("from=2026-04-01&to=2026-04-30&stageId=visual&size=Fr8"));
    const json = await res.json();
    expect(json.records).toHaveLength(3);
    const dates = json.records.map((r: StageDayRecord) => r.occurredOn.start).sort();
    expect(dates).toEqual(["2026-04-01", "2026-04-02", "2026-04-03"]);
  });

  it("range mode never merges two different days into one record", async () => {
    await seed([rec("2026-04-01", { rejected: { value: 5, cell: "x", header: "" } }), rec("2026-04-02", { rejected: { value: 20, cell: "x", header: "" } })]);
    const res = await GET(req("from=2026-04-01&to=2026-04-30&stageId=visual&size=Fr8"));
    const json = await res.json();
    const byDate = Object.fromEntries(json.records.map((r: StageDayRecord) => [r.occurredOn.start, r.rejected?.value]));
    expect(byDate["2026-04-01"]).toBe(5);
    expect(byDate["2026-04-02"]).toBe(20);
  });

  it("stageId/size filters narrow the range query", async () => {
    await seed([rec("2026-05-01", { stageId: "visual", size: "Fr8" }), rec("2026-05-01", { stageId: "visual", size: "Fr14" }), rec("2026-05-01", { stageId: "balloon", size: "Fr8" })]);
    const res = await GET(req("from=2026-05-01&to=2026-05-31&stageId=visual&size=Fr8"));
    const json = await res.json();
    expect(json.records).toHaveLength(1);
    expect(json.records[0].stageId).toBe("visual");
    expect(json.records[0].size).toBe("Fr8");
  });

  it("an empty range returns an empty array, not an error", async () => {
    const res = await GET(req("from=2099-01-01&to=2099-01-31&stageId=visual&size=Fr8"));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.records).toEqual([]);
  });

  it("neither date nor from/to is a 400", async () => {
    const res = await GET(req("stageId=visual"));
    expect(res.status).toBe(400);
  });
});
