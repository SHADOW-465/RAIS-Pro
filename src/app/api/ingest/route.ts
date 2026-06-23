// src/app/api/ingest/route.ts
// Commit verified StageDayRecords → canonical events + live clarification checks.
// The classify/verify step happens client-side; this route is the deterministic
// emit + append + check stage (MOID-SPEC §8/§9/§13).

import { NextRequest, NextResponse } from "next/server";
import { emitMany, type StageDayRecord } from "@/lib/ingest/emit";
import { checkRecord } from "@/lib/entry/validate-entry";
import { getStores } from "@/lib/store";
import { createServerClient } from "@/lib/supabase";

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

    // Attach comments to records (keyed by stageId or by row index)
    const recordsWithComments = records.map((r, idx) => {
      const comment = body.comments?.[r.stageId] || body.comments?.[idx.toString()] || null;
      return {
        ...r,
        comment: comment && comment.trim() ? comment.trim() : null
      };
    });

    // 1. Live clarification checks (point-in-time) — surfaced, never blocking.
    const issues = recordsWithComments.flatMap((r) =>
      checkRecord(r).map((i) => ({ ...i, stageId: r.stageId, date: r.occurredOn.start }))
    );

    // Query existing events in the date range of the incoming records to check for conflicts
    const dates = recordsWithComments.map(r => r.occurredOn.start);
    const from = dates.reduce((min, d) => d < min ? d : min, dates[0]);
    const to = dates.reduce((max, d) => d > max ? d : max, dates[0]);

    const { events: store, findings: findingsStore } = getStores();
    const existingEvents = await store.effective({ from, to });

    // Map existing events to minimal StageDayRecord shape for comparison
    const existingMap = new Map<string, { stageId: string, size: string | null, date: string, rejectedVal: number }>();
    for (const event of existingEvents) {
      if (event.eventType === "inspection" && (event as any).disposition === "rejected") {
        const stageId = (event as any).stageId;
        const size = (event as any).size ?? null;
        const date = event.occurredOn.start;
        const key = `${stageId}|${size ?? "·"}|${date}`;
        existingMap.set(key, {
          stageId,
          size,
          date,
          rejectedVal: (event as any).quantity ?? 0
        });
      }
    }

    const existingRecords = Array.from(existingMap.values()).map(x => ({
      stageId: x.stageId,
      size: x.size,
      occurredOn: { kind: "day" as const, start: x.date, end: x.date },
      rejected: { value: x.rejectedVal, cell: "", header: "" },
      checked: null,
      acceptedGood: null,
      rework: null,
      defects: [],
      statedPct: null,
      extractedBy: "heuristic",
      ingestionId: ""
    }));

    // Reconcile conflicts
    const { reconcileConflicts } = require("@/lib/ingest/parsers/reconcile");
    const { toWrite, conflicts } = reconcileConflicts(existingRecords, recordsWithComments);

    // Turn conflicts into Findings and upsert them
    if (conflicts.length > 0) {
      const { hashFinding } = require("@/lib/contract/hash");
      const { Finding } = require("@/lib/contract/d3");
      const findingsToUpsert = conflicts.map((c: any) => {
        const ruleId = "V-010" as const;
        const subtype = "value-conflict";
        const matchingEventIds = existingEvents
          .filter(e => (e as any).stageId === c.stageId && ((e as any).size ?? null) === c.size && e.occurredOn.start === c.day)
          .map(e => e.eventId);

        const findingId = hashFinding({
          ruleId,
          subtype,
          evidenceEventIds: matchingEventIds.length > 0 ? matchingEventIds : [`conflict-${c.stageId}-${c.day}`]
        });

        return Finding.parse({
          findingId,
          schemaVersion: "1.0.0",
          ingestionId: body.ingestionId,
          ruleId,
          subtype,
          severity: "critical",
          question: `Value conflict on ${c.stageId} for ${c.day}`,
          detail: `Existing rejected count is ${c.existing}, but incoming uploaded/entered count is ${c.incoming}.`,
          evidence: {
            eventIds: matchingEventIds.length > 0 ? matchingEventIds : [`conflict-${c.stageId}-${c.day}`],
            cells: [c.size ? `${c.size}!` : "A1"],
            provenance: {
              file: body.fileName,
              fileHash: "local",
              sheet: c.size || "Unknown",
              tableId: "t1",
              cells: [],
              headerPath: [],
              rowLabel: null,
              formulaText: null,
              cachedValue: null,
              externalRef: null,
            },
            statedValue: c.existing,
            computedValue: c.incoming,
            magnitude: Math.abs(c.existing - c.incoming),
          },
          hypotheses: [
            { kind: "mistake", text: "Typo in manual entry or spreadsheet data." },
            { kind: "intentional-practice", text: "Intentional correction/revision of previous data." }
          ],
          requiresGmAuthority: false,
          occurredOn: { kind: "day", start: c.day, end: c.day },
          recordedAt: new Date().toISOString(),
        });
      });

      await findingsStore.upsert(findingsToUpsert);
    }

    // 2. Emit canonical events and append (idempotent on content hash).
    let activeRegistry = undefined;
    try {
      const db = createServerClient();
      const { data: regRow } = await db
        .from("registries")
        .select("*")
        .eq("client_id", "disposafe")
        .maybeSingle();
      if (regRow) {
        activeRegistry = {
          clientId: regRow.client_id,
          registryVersion: regRow.registry_version,
          fiscalYearStartMonth: regRow.fiscal_year_start_month,
          stages: regRow.stages,
          defects: regRow.defects,
          costConfig: regRow.cost_config || null,
        };
      }
    } catch (err) {
      console.warn("Could not fetch active registry (non-fatal, falling back to static default):", err);
    }

    const events = emitMany(toWrite, activeRegistry);

    // Upsert reconcile: when a re-ingest changes a value, supersede the prior
    // event for the same stage·day·size·kind so totals UPDATE instead of doubling.
    // Byte-identical re-ingests fall through to content-hash dedup (no churn).
    const PRIMARY = new Set(["production", "inspection", "rejection"]);
    const sk = (e: any) => `${e.eventType}|${e.stageId}|${e.occurredOn.start}|${e.disposition ?? ""}|${e.defectCode ?? e.defectCodeRaw ?? ""}|${e.size ?? ""}`;
    const incomingByKey = new Map<string, string[]>();
    for (const e of events as any[]) {
      if (!PRIMARY.has(e.eventType)) continue;
      const k = sk(e);
      const arr = incomingByKey.get(k); if (arr) arr.push(e.eventId); else incomingByKey.set(k, [e.eventId]);
    }
    const { hashEvent } = require("@/lib/contract/hash");
    const { CorrectionEvent } = require("@/lib/contract/d1");
    const corrections: any[] = [];
    for (const e of existingEvents as any[]) {
      if (!PRIMARY.has(e.eventType)) continue;
      const ids = incomingByKey.get(sk(e));
      if (!ids || ids.includes(e.eventId)) continue; // not re-ingested, or identical → keep as-is
      const payload = { supersedesEventId: e.eventId, replacementEventId: ids[0], reason: "Re-ingest updated this value", authorisedBy: "ingest:auto-reconcile" };
      const eventId = hashEvent({ eventType: "correction", occurredOn: e.occurredOn, provenance: e.provenance, payload });
      corrections.push(CorrectionEvent.parse({ eventId, schemaVersion: "1.0.0", ingestionId: body.ingestionId, occurredOn: e.occurredOn, provenance: e.provenance, confidence: { score: 1, basis: "exact" }, extractedBy: "ingest:auto-reconcile", recordedAt: new Date().toISOString(), supersededBy: null, eventType: "correction", ...payload }));
    }
    const { inserted, deduped } = await store.append([...events, ...corrections]);

    // 3. Per-stage rollup for the success summary (deterministic, from events).
    const byStage: Record<string, { checked: number; rejected: number; days: number }> = {};
    for (const r of toWrite) {
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
