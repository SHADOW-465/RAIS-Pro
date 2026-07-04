// src/app/api/day-records/route.ts
// Reconstruct StageDayRecord[] for one calendar date from the canonical event
// ledger — the reverse of emitStageDay(). Feeds the Data Entry spreadsheet so
// opening an existing date loads whatever is ACTUALLY on file (any source:
// upload or manual entry), not a separate "manual entries only" view. Reads
// through the same canonicalizeEvents() the dashboard uses, so what the
// operator edits is exactly what's currently shown everywhere else.
import { NextRequest, NextResponse } from "next/server";
import { getStores } from "@/lib/store";
import { canonicalizeEvents } from "@/lib/analytics/canonical";
import type { StageDayRecord } from "@/lib/ingest/emit";

const COUNTABLE = new Set(["production", "inspection", "rejection"]);

export async function GET(req: NextRequest) {
  try {
    const date = req.nextUrl.searchParams.get("date");
    if (!date) return NextResponse.json({ error: "date is required" }, { status: 400 });

    const { events } = getStores();
    const dayEvents = canonicalizeEvents(await events.effective({ from: date, to: date }))
      .filter((e: any) => e.occurredOn?.start === date && COUNTABLE.has(e.eventType));

    // One record per (stageId, size) — mirrors how emitStageDay() groups a
    // single StageDayRecord's fields into separate events.
    const groups = new Map<string, StageDayRecord>();
    const keyOf = (stageId: string, size: string | null) => `${stageId}|${size ?? "__line__"}`;

    for (const e of dayEvents as any[]) {
      const size: string | null = e.size ?? null;
      const key = keyOf(e.stageId, size);
      let rec = groups.get(key);
      if (!rec) {
        rec = {
          occurredOn: e.occurredOn,
          stageId: e.stageId,
          size,
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
