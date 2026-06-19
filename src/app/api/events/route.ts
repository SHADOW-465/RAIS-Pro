// src/app/api/events/route.ts
// Serves the effective canonical-event ledger to the analytics engine (plan 01/02).
// Screens fetch this once per scope window; selectors do the rest client-side.

import { NextRequest, NextResponse } from "next/server";
import { getStores } from "@/lib/store";
import type { EventFilter } from "@/lib/store/types";
import { canonicalizeEvents } from "@/lib/analytics/canonical";

export async function GET(req: NextRequest) {
  try {
    const sp = req.nextUrl.searchParams;
    const filter: EventFilter = {
      from: sp.get("from") ?? undefined,
      to: sp.get("to") ?? undefined,
      stageId: sp.get("stageId") ?? undefined,
      eventType: (sp.get("eventType") as EventFilter["eventType"]) ?? undefined,
    };
    const { events, backend } = getStores();
    // Canonicalize on read so the ledger can contain re-seeds / overlapping
    // files / duplicate uploads and the analytics still never double-count.
    const data = canonicalizeEvents(await events.effective(filter));
    return NextResponse.json({ events: data, count: data.length, backend });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? "Failed to load events" }, { status: 500 });
  }
}
