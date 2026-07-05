// src/app/api/day-records/route.ts
// Reconstruct StageDayRecord[] for a calendar date (or a date range) from the
// canonical event ledger — the reverse of emitStageDay(). Feeds the Data Entry
// spreadsheet (single date) and the Monthly Entry grid (a whole month) so
// opening an existing date/range loads whatever is ACTUALLY on file (any
// source: upload or manual entry). Reads through the same canonicalizeEvents()
// the dashboard uses, so what the operator edits is exactly what's shown
// everywhere else.
import { NextRequest, NextResponse } from "next/server";
import { getStores } from "@/lib/store";
import { canonicalizeEvents } from "@/lib/analytics/canonical";
import type { StageDayRecord } from "@/lib/ingest/emit";

const COUNTABLE = new Set(["production", "inspection", "rejection"]);

export async function GET(req: NextRequest) {
  try {
    const date = req.nextUrl.searchParams.get("date");
    const from = req.nextUrl.searchParams.get("from");
    const to = req.nextUrl.searchParams.get("to");
    const stageId = req.nextUrl.searchParams.get("stageId");
    const size = req.nextUrl.searchParams.get("size");

    const rangeFrom = date ?? from;
    const rangeTo = date ?? to;
    if (!rangeFrom || !rangeTo) {
      return NextResponse.json({ error: "date, or both from and to, are required" }, { status: 400 });
    }

    const { events } = getStores();
    let dayEvents = canonicalizeEvents(await events.effective({ from: rangeFrom, to: rangeTo }))
      .filter((e: any) => COUNTABLE.has(e.eventType) && e.occurredOn?.start >= rangeFrom && e.occurredOn?.start <= rangeTo);

    if (stageId) dayEvents = dayEvents.filter((e: any) => e.stageId === stageId);
    if (size) dayEvents = dayEvents.filter((e: any) => (e.size ?? null) === size);

    // One record per (date, stageId, size) — mirrors how emitStageDay() groups
    // a single StageDayRecord's fields into separate events. Date is folded
    // into the key so a range query never merges two different days.
    const groups = new Map<string, StageDayRecord>();
    const keyOf = (d: string, sId: string, sz: string | null) => `${d}|${sId}|${sz ?? "__line__"}`;

    for (const e of dayEvents as any[]) {
      const evDate = e.occurredOn.start;
      const evSize: string | null = e.size ?? null;
      const key = keyOf(evDate, e.stageId, evSize);
      let rec = groups.get(key);
      if (!rec) {
        rec = {
          occurredOn: e.occurredOn,
          stageId: e.stageId,
          size: evSize,
          // Sheet fixed to "Data Entry" regardless of original source: once
          // loaded for editing, review.ts's stageLabel() falls back to the
          // registry's proper stage label instead of a stale sheet name.
          source: { file: e.provenance?.file ?? "Data Entry", fileHash: e.provenance?.fileHash ?? "local", sheet: "Data Entry", tableId: "entry" },
          checked: null,
          acceptedGood: null,
          rework: null,
          rejected: null,
          defects: [],
          statedPct: null,
          extractedBy: e.extractedBy,
          ingestionId: e.ingestionId,
          customFields: e.customFields ?? {},
        };
        groups.set(key, rec);
      }
      const sv = { value: e.quantity, cell: e.provenance?.cells?.[0] ?? "", header: e.provenance?.headerPath?.[0] ?? "" };
      if (e.eventType === "production") rec.checked = sv;
      else if (e.eventType === "inspection") {
        if (e.disposition === "rejected") rec.rejected = sv;
        else if (e.disposition === "accepted") rec.acceptedGood = sv;
        else if (e.disposition === "rework") rec.rework = sv;
      } else if (e.eventType === "rejection") {
        rec.defects.push({ raw: e.defectCodeRaw, value: e.quantity, cell: e.provenance?.cells?.[0] ?? "" });
      }
    }

    return NextResponse.json({ records: Array.from(groups.values()) });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? "Failed to load day records" }, { status: 500 });
  }
}
