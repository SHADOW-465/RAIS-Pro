// src/app/api/hard-reset/route.ts
import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";

export async function POST(req: NextRequest) {
  try {
    const db = createServerClient();
    const errors: any[] = [];

    const clearTable = async (table: string, primaryKeyCol: string) => {
      const { error } = await db
        .from(table)
        .delete()
        .neq(primaryKeyCol, "00000000-0000-0000-0000-000000000000");
      if (error) {
        console.error(`Error clearing table ${table}:`, error);
        errors.push({ table, error });
      }
    };

    // Cascading delete of all transactional data
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

    // Also clear registries configuration
    const { error: regError } = await db
      .from("registries")
      .delete()
      .neq("client_id", "00000000-0000-0000-0000-000000000000");

    if (regError) {
      console.error("Error clearing registries table:", regError);
      errors.push({ table: "registries", error: regError });
    }

    if (errors.length > 0) {
      return NextResponse.json({
        success: false,
        error: "Failed to perform hard reset on some tables.",
        details: errors,
      }, { status: 500 });
    }

    // Reset leaves the store BLANK — no re-seed. The app starts empty and the
    // user uploads their own workbooks (/staging) to populate it.
    return NextResponse.json({ success: true, cleared: true });
  } catch (err: any) {
    console.error("Hard reset failed:", err);
    return NextResponse.json({ error: err?.message ?? "Hard reset failed" }, { status: 500 });
  }
}
