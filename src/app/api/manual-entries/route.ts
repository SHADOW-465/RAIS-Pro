// src/app/api/manual-entries/route.ts
import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import { mapRowToEvent } from "@/lib/store/supabase-mappers";

export async function GET(req: NextRequest) {
  try {
    const db = createServerClient();
    const { data: rows, error } = await db
      .from("events")
      .select("*")
      .order("recorded_at", { ascending: false });

    if (error) throw error;

    const events = (rows || []).map(mapRowToEvent);

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

      // Reconstruct stage-wise field values
      const stageData: Record<string, Record<string, any>> = {};
      
      for (const e of groupEvents) {
        const stageId = e.stageId;
        if (!stageId) continue;
        
        if (!stageData[stageId]) {
          stageData[stageId] = {};
        }

        // Extract cell values from event quantity
        const fieldName = e.provenance?.headerPath?.[0];
        if (fieldName) {
          stageData[stageId][fieldName] = e.quantity;
        }

        // Copy custom fields for this stage
        if (e.customFields) {
          Object.entries(e.customFields).forEach(([k, v]) => {
            // Exclude header fields which are grouped at the top level
            if (!["operator", "supervisor", "machine", "product", "size", "batch", "notes"].includes(k)) {
              stageData[stageId][k] = v;
            }
          });
        }
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

    const toDelete = (rows || []).filter((e: any) =>
      e.occurred_on?.start === date &&
      e.provenance?.sheet === shift
    );

    const ids = toDelete.map((e: any) => e.event_id);
    
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
