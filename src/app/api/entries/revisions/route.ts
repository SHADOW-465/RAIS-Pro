// GET /api/entries/revisions?date=&batch=&stageId=&size=
// Full append-only history for one plant row (including superseded events).

import { withNoStore } from "@/lib/http/live-cache";
import { NextRequest, NextResponse } from "next/server";
import { getStores } from "@/lib/store";
import { eventBatchId, isDirectEntryEvent } from "@/lib/analytics/scope";
import type { Event } from "@/lib/store/types";

async function getHandler(req: NextRequest) {
  try {
    const sp = req.nextUrl.searchParams;
    const date = (sp.get("date") ?? "").trim();
    const batch = (sp.get("batch") ?? "").trim();
    const stageId = (sp.get("stageId") ?? "").trim();
    const size = (sp.get("size") ?? "").trim();

    if (!date || !stageId) {
      return NextResponse.json(
        { error: "date and stageId are required." },
        { status: 400 },
      );
    }

    const { events: store } = getStores();
    const all = await store.all({ from: date, to: date });

    const superseded = new Set<string>();
    for (const e of all) {
      if (e.eventType === "correction") {
        const id = (e as { supersedesEventId?: string }).supersedesEventId;
        if (id) superseded.add(id);
      }
    }

    const batchWant = batch && batch !== "(no batch)" ? batch.toUpperCase() : "";
    const sizeWant = size || null;

    const matches = all.filter((e) => {
      if (e.occurredOn?.start !== date) return false;
      const s = (e as Event & { stageId?: string }).stageId;
      if (s != null && s !== stageId) {
        // corrections may lack stageId — keep if they supersede something in slice
        if (e.eventType === "correction") return true;
        return false;
      }
      if (s == null && e.eventType !== "correction") return false;

      const b = eventBatchId(e);
      if (batchWant) {
        if (!b || b !== batchWant) {
          if (e.eventType === "correction") return true; // filter later
          return false;
        }
      } else if (batch === "(no batch)" && b) {
        return false;
      }

      if (sizeWant) {
        const sz = (e as Event & { size?: string | null }).size;
        if (sz != null && String(sz).trim() && String(sz).trim() !== sizeWant) {
          if (e.eventType !== "correction") return false;
        }
      }
      return true;
    });

    // Tighten corrections: only those that supersede an eventId we already matched
    const primaryIds = new Set(
      matches.filter((e) => e.eventType !== "correction").map((e) => e.eventId),
    );
    const slice = matches.filter((e) => {
      if (e.eventType !== "correction") return true;
      const id = (e as { supersedesEventId?: string }).supersedesEventId;
      return id ? primaryIds.has(id) || superseded.has(id) : false;
    });
    // Also include supersedes targets even if filtered oddly
    for (const e of all) {
      if (e.eventType === "correction") {
        const id = (e as { supersedesEventId?: string }).supersedesEventId;
        if (id && primaryIds.has(id) && !slice.some((x) => x.eventId === e.eventId)) {
          slice.push(e);
        }
      }
    }

    const timeline = slice
      .map((e) => {
        const any = e as Event & {
          quantity?: number;
          disposition?: string;
          defectCode?: string | null;
          defectCodeRaw?: string;
          supersedesEventId?: string;
          replacementEventId?: string | null;
          reason?: string;
          size?: string | null;
        };
        const cf = (e as { customFields?: Record<string, unknown> }).customFields ?? {};
        return {
          eventId: e.eventId,
          eventType: e.eventType,
          recordedAt: e.recordedAt,
          occurredOn: e.occurredOn,
          /** Which save this event belongs to — the unit a revision diff groups by. */
          ingestionId: e.ingestionId ?? null,
          // Who / what, so history can answer "who changed it and to what".
          // productType was written on every event from day one and read back
          // by nothing — it never appeared on any screen until now.
          operator: typeof cf.operator === "string" ? cf.operator : null,
          productType: typeof cf.productType === "string" ? cf.productType : null,
          shift: (e as { provenance?: { sheet?: string } }).provenance?.sheet ?? null,
          remarks: typeof cf.notes === "string" ? cf.notes : null,
          quantity: any.quantity ?? null,
          disposition: any.disposition ?? null,
          defect:
            any.defectCodeRaw || any.defectCode || null,
          size: any.size ?? null,
          batch: eventBatchId(e) || null,
          stageId: (e as { stageId?: string }).stageId ?? stageId,
          isDirectEntry: isDirectEntryEvent(e),
          isSuperseded: superseded.has(e.eventId),
          supersedesEventId: any.supersedesEventId ?? null,
          replacementEventId: any.replacementEventId ?? null,
          reason: any.reason ?? null,
          extractedBy: e.extractedBy,
        };
      })
      .sort((a, b) => (a.recordedAt ?? "").localeCompare(b.recordedAt ?? ""));

    return NextResponse.json({
      key: { date, batch, stageId, size: sizeWant },
      count: timeline.length,
      timeline,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to load revisions";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export const GET = withNoStore(getHandler);
