// src/app/api/manual-entries/route.ts
import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import { getStores } from "@/lib/store";
import { aggregate } from "@/lib/analytics/rejection";

export async function GET(req: NextRequest) {
  try {
    // Same store abstraction /api/events uses — works against the in-memory
    // store in local/test runs (no Supabase configured) as well as Supabase,
    // instead of querying Supabase directly and hard-failing without it.
    const { events: store } = getStores();
    const events = (await store.effective({}))
      .slice()
      .sort((a, b) => (b.recordedAt ?? "").localeCompare(a.recordedAt ?? ""));

    // Group events by occurredOn.start (Date) and provenance.sheet (Shift)
    const groups = new Map<string, any[]>();
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
      const customFields = firstEvent.customFields || {};

      const operator = customFields.operator || firstEvent.provenance?.operator || "";
      const supervisor = customFields.supervisor || firstEvent.provenance?.supervisor || "";
      const machine = customFields.machine || firstEvent.provenance?.machine || "";
      const product = customFields.product || firstEvent.provenance?.product || "";
      const size = customFields.size || firstEvent.provenance?.size || "";
      const batch = customFields.batch || firstEvent.provenance?.batch || "";
      const notes = customFields.notes || "";
      const isDirect = firstEvent.provenance?.is_direct_entry === true;
      const source = isDirect ? "Direct Entry" : (firstEvent.provenance?.file || "Upload");

      // Reconstruct stage-wise field values. `provenance.headerPath` is
      // whatever the source used (an internal field key like "checked" for
      // direct entry, or the raw sheet header text for an upload) — never a
      // reliable match for the "Checked Qty"/"Rejected Qty" keys the ledger
      // summary reads. Use the event's own semantic type instead (same
      // aggregate() the rest of the analytics layer trusts), grouped by stage.
      const stageData: Record<string, Record<string, any>> = {};
      const stageIds = new Set(groupEvents.map((e) => e.stageId).filter(Boolean));
      for (const stageId of stageIds) {
        const agg = aggregate(groupEvents.filter((e) => e.stageId === stageId));
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
        const stageId = e.stageId;
        if (!stageId || !e.customFields) continue;
        Object.entries(e.customFields).forEach(([k, v]) => {
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
        recordedAt: firstEvent.recordedAt
      };
    });

    return NextResponse.json({ records });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? "Failed to load manual entries" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const date = searchParams.get("date");
    const shift = searchParams.get("shift");

    if (!date || !shift) {
      return NextResponse.json({ error: "Missing date or shift parameter" }, { status: 400 });
    }

    const db = createServerClient();
    
    // First select events to delete to get their IDs
    const { data: rows, error: selectError } = await db
      .from("events")
      .select("event_id, occurred_on, provenance, is_direct_entry");

    if (selectError) throw selectError;

    const toDelete = (rows || []).filter(e => 
      e.occurred_on?.start === date && 
      e.provenance?.sheet === shift
    );

    const ids = toDelete.map(e => e.event_id);
    
    if (ids.length > 0) {
      const { error: deleteError } = await db
        .from("events")
        .delete()
        .in("event_id", ids);
      if (deleteError) throw deleteError;
    }

    return NextResponse.json({ success: true, deletedCount: ids.length });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? "Failed to delete manual entry" }, { status: 500 });
  }
}
