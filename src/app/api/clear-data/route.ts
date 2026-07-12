// src/app/api/clear-data/route.ts
import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";

export async function POST(req: NextRequest) {
  try {
    const db = createServerClient();

    // Delete all records from the transactional tables
    // We use .neq filters to delete all rows (since .delete() without filters is blocked in PostgREST by default)
    const errors: any[] = [];

    const clearTable = async (table: string, primaryKeyCol: string) => {
      const { error } = await db.from(table).delete().neq(primaryKeyCol, "00000000-0000-0000-0000-000000000000");
      if (error) {
        console.error(`Error clearing table ${table}:`, error);
        errors.push({ table, error });
      }
    };

    // Clear transactional tables
    await clearTable("events", "event_id");
    await clearTable("findings", "finding_id");
    await clearTable("adjudications", "adjudication_id");
    await clearTable("rule_applications", "finding_id");
    await clearTable("raw_files", "file_hash");
    await clearTable("ingestions", "ingestion_id");
    await clearTable("sessions", "id");
    await clearTable("dashboards", "id");

    // Workbook explorer state (datasets + persisted rows) must die with the
    // ledger — /workbooks reads these stores, not the events table.
    try {
    } catch (err) {
      console.error("Error clearing dataset stores:", err);
    }

    if (errors.length > 0) {
      return NextResponse.json({
        success: false,
        error: "Failed to clear some tables.",
        details: errors,
      }, { status: 500 });
    }

    return NextResponse.json({ success: true, cleared: true });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? "Purging failed" }, { status: 500 });
  }
}
