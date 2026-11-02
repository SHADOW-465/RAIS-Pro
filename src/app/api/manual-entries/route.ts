// src/app/api/manual-entries/route.ts
import { withNoStore } from "@/lib/http/live-cache";
import { NextRequest, NextResponse } from "next/server";
import { requireCapability } from "@/lib/auth/guard";
import { getStores } from "@/lib/store";
import { aggregate } from "@/lib/analytics/rejection";
import {
  eventBatchId,
  eventSourceFileLabel,
  isDirectEntryEvent,
} from "@/lib/analytics/scope";
import type { Event } from "@/lib/store/types";

/** UI / query label for the source channel of a ledger event. */
function rowSourceLabel(e: Event): string {
  if (isDirectEntryEvent(e)) return "Direct Entry";
  return eventSourceFileLabel(e) || e.provenance?.file || "Upload";
}

/**
 * Match ?source= against a row. "Direct Entry" and "Manual Entry" both mean
 * data-entry / batch-matrix rows (file is stored as "Manual Entry"; older
 * clients and the DELETE UI use either label).
 */
function matchesSource(e: Event, source: string): boolean {
  const want = source.trim();
  if (!want) return true;
  if (want === "Direct Entry" || want === "Manual Entry") {
    return isDirectEntryEvent(e);
  }
  // Excel / named file: exact file label or full provenance.file
  if (isDirectEntryEvent(e)) return false;
  const label = eventSourceFileLabel(e);
  const file = e.provenance?.file ?? "";
  return label === want || file === want || file.endsWith(want);
}

async function getHandler(req: NextRequest) {
  try {
    // Same store abstraction /api/events uses — works against the in-memory
    // store in local/test runs (no Supabase configured) as well as Supabase,
    // instead of querying Supabase directly and hard-failing without it.
    const { events: store } = getStores();
    const events = (await store.effective({}))
      .slice()
      .sort((a, b) => (b.recordedAt ?? "").localeCompare(a.recordedAt ?? ""));

    // Group events by occurredOn.start (Date) and provenance.sheet (Shift)
    const groups = new Map<string, Event[]>();
    for (const e of events) {
      const date = e.occurredOn?.start;
      const shift = e.provenance?.sheet || "Day Shift";
      const key = `${date}|${shift}`;
      if (!groups.has(key)) {
        groups.set(key, []);
      }
      groups.get(key)!.push(e);
    }

    const records = Array.from(groups.entries()).map(([key, groupEvents]) => {
      const [date, shift] = key.split("|");
      const firstEvent = groupEvents[0];
      const ingestionId = firstEvent.ingestionId;
      const customFields = (firstEvent as Event & { customFields?: Record<string, unknown> }).customFields || {};

      const operator = customFields.operator || (firstEvent.provenance as any)?.operator || "";
      const supervisor = customFields.supervisor || (firstEvent.provenance as any)?.supervisor || "";
      const machine = customFields.machine || (firstEvent.provenance as any)?.machine || "";
      const product = customFields.product || (firstEvent.provenance as any)?.product || "";
      const size = customFields.size || (firstEvent as any).size || "";
      const batch =
        eventBatchId(firstEvent) ||
        (typeof customFields.batch === "string" ? customFields.batch : "") ||
        "";
      const notes = customFields.notes || "";
      const source = rowSourceLabel(firstEvent);

      // Reconstruct stage-wise field values. `provenance.headerPath` is
      // whatever the source used (an internal field key like "checked" for
      // direct entry, or the raw sheet header text for an upload) — never a
      // reliable match for the "Checked Qty"/"Rejected Qty" keys the ledger
      // summary reads. Use the event's own semantic type instead (same
      // aggregate() the rest of the analytics layer trusts), grouped by stage.
      const stageData: Record<string, Record<string, any>> = {};
      const stageIds = new Set(groupEvents.map((e) => (e as any).stageId).filter(Boolean));
      for (const stageId of stageIds) {
        const agg = aggregate(groupEvents.filter((e) => (e as any).stageId === stageId));
        stageData[stageId] = {
          "Checked Qty": agg.checked,
          "Good Qty": agg.good,
          "Rework Qty": agg.rework,
          "Rejected Qty": agg.rejected,
        };
      }

      // Copy any genuine custom fields (excluding the header fields already
      // grouped at the top level) onto their stage.
      for (const e of groupEvents) {
        const stageId = (e as any).stageId;
        if (!stageId || !(e as any).customFields) continue;
        Object.entries((e as any).customFields).forEach(([k, v]) => {
          if (!["operator", "supervisor", "machine", "product", "size", "batch", "notes"].includes(k)) {
            stageData[stageId][k] = v;
          }
        });
      }

      return {
        date,
        shift,
        ingestionId,
        operator,
        supervisor,
        machine,
        product,
        size,
        batch,
        notes,
        stageData,
        source,
        recordedAt: firstEvent.recordedAt,
      };
    });

    return NextResponse.json({ records });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? "Failed to load manual entries" }, { status: 500 });
  }
}

/**
 * Erase one ledger entry outright — the deliberate exception to append-only.
 *
 * Beta testing means dummy rows, and a dummy row that can only be *superseded*
 * still sits in the audit trail forever. So this purges instead: the events of
 * the entry, plus the corrections and annotations that point at them, so no
 * orphan provenance is left behind.
 *
 * Scope, narrowest first:
 *   ?ingestionId=X                         exactly one save
 *   ?date=&shift=[&source=][&batch=][&stageId=][&size=]
 *     the ledger row as displayed. source guards Excel vs Data Entry.
 *     batch / stageId / size narrow a single batch-matrix row (required when
 *     several batches share a day·shift).
 *   ?batch=X[&source=Direct Entry]         orphan cleanup — every event for that
 *     batch ID (used when the shift list no longer has the row but audit does).
 */
export async function DELETE(req: NextRequest) {
  const auth = await requireCapability(req, "eraseLedger");
  if (!auth.ok) return auth.response;

  try {
    const { searchParams } = new URL(req.url);
    const ingestionId = searchParams.get("ingestionId");
    const date = searchParams.get("date");
    const shift = searchParams.get("shift");
    const source = searchParams.get("source");
    const batch = searchParams.get("batch") ?? searchParams.get("batchId");
    const stageId = searchParams.get("stageId");
    const size = searchParams.get("size");

    const batchWant = batch?.trim() ? batch.trim().toUpperCase() : null;
    const batchOnly = !ingestionId && !(date && shift) && !!batchWant;

    if (!ingestionId && !(date && shift) && !batchOnly) {
      return NextResponse.json(
        { error: "Pass ingestionId, date+shift, or batch (for orphan purge)." },
        { status: 400 },
      );
    }

    const { events: store } = getStores();
    // `all`, not `effective` — a superseded event still occupies the row and
    // must go too, or re-saving the same day resurrects stale numbers.
    const everything = await store.all({});

    const sizeWant = size?.trim() ? size.trim() : null;

    const targeted = everything.filter((e) => {
      if (ingestionId) return e.ingestionId === ingestionId;

      if (batchOnly) {
        const got = eventBatchId(e);
        if (!got || got !== batchWant) return false;
        if (source && !matchesSource(e, source)) return false;
        return true;
      }

      if (e.occurredOn?.start !== date) return false;
      if ((e.provenance?.sheet || "Day Shift") !== shift) return false;

      if (source && !matchesSource(e, source)) return false;

      if (batchWant) {
        const got = eventBatchId(e);
        if (!got || got !== batchWant) return false;
      }

      if (stageId) {
        const s = (e as Event & { stageId?: string }).stageId;
        // Corrections / annotations may not carry stageId — still purge if they
        // target primary events we remove (handled in the sweep below). For
        // primary rows, require a match.
        if (s != null && s !== stageId) return false;
        if (
          s == null &&
          (e.eventType === "production" ||
            e.eventType === "inspection" ||
            e.eventType === "rejection")
        ) {
          return false;
        }
      }

      if (sizeWant) {
        const sz = (e as Event & { size?: string | null }).size;
        if (sz != null && String(sz).trim() && String(sz).trim() !== sizeWant) return false;
      }

      return true;
    });

    const ids = new Set(targeted.map((e) => e.eventId));
    if (ids.size === 0) {
      return NextResponse.json({ success: true, deletedCount: 0 });
    }

    // Sweep up events that only exist to describe the ones being erased.
    for (const e of everything) {
      if (ids.has(e.eventId)) continue;
      const supersedes = (e as any).supersedesEventId;
      if (supersedes && ids.has(supersedes)) ids.add(e.eventId);
      const targets: string[] = (e as any).targetEventIds ?? [];
      if (targets.length > 0 && targets.every((t) => ids.has(t))) ids.add(e.eventId);
    }

    const deletedCount = await store.purge([...ids]);
    return NextResponse.json({ success: true, deletedCount });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? "Failed to delete manual entry" }, { status: 500 });
  }
}

export const GET = withNoStore(getHandler);
