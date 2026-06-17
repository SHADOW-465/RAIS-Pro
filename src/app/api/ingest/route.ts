// src/app/api/ingest/route.ts
// Commit verified StageDayRecords → canonical events + live clarification checks.
// The classify/verify step happens client-side; this route is the deterministic
// emit + append + check stage (MOID-SPEC §8/§9/§13).

import { NextRequest, NextResponse } from "next/server";
import { emitMany, type StageDayRecord } from "@/lib/ingest/emit";
import { checkRecord } from "@/lib/entry/validate-entry";
import { getStores } from "@/lib/store";

interface IngestBody {
  ingestionId: string;
  fileName: string;
  records: StageDayRecord[];
  /** per-mapping-row comments keyed by mapping id (carried for provenance/audit) */
  comments?: Record<string, string>;
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as IngestBody;
    const records = body.records ?? [];
    if (records.length === 0) {
      return NextResponse.json({ error: "No records to ingest." }, { status: 400 });
    }

    // 1. Live clarification checks (point-in-time) — surfaced, never blocking.
    const issues = records.flatMap((r) =>
      checkRecord(r).map((i) => ({ ...i, stageId: r.stageId, date: r.occurredOn.start }))
    );

    // 2. Emit canonical events and append (idempotent on content hash).
    const events = emitMany(records);
    const { events: store } = getStores();
    const { inserted, deduped } = await store.append(events);

    // 3. Per-stage rollup for the success summary (deterministic, from events).
    const byStage: Record<string, { checked: number; rejected: number; days: number }> = {};
    for (const r of records) {
      const s = (byStage[r.stageId] ??= { checked: 0, rejected: 0, days: 0 });
      s.checked += r.checked?.value ?? 0;
      s.rejected += r.rejected?.value ?? 0;
      s.days += 1;
    }

    return NextResponse.json({
      ingestionId: body.ingestionId,
      fileName: body.fileName,
      eventsEmitted: events.length,
      inserted,
      deduped,
      issues,
      byStage,
      commentCount: body.comments ? Object.values(body.comments).filter((c) => c.trim()).length : 0,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? "Ingestion failed" }, { status: 500 });
  }
}
