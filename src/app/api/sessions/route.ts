import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";

export async function GET(req: NextRequest) {
  const deviceId = req.nextUrl.searchParams.get("deviceId");
  if (!deviceId) {
    return NextResponse.json({ error: "deviceId is required" }, { status: 400 });
  }

  try {
    const db = createServerClient();
    const { data, error } = await db
      .from("sessions")
      .select("id, title, files, dashboard, created_at, insight_slides(count)")
      .eq("device_id", deviceId)
      .order("created_at", { ascending: false })
      .limit(20);

    if (error) throw error;
    return NextResponse.json({ sessions: data ?? [] });
  } catch (err) {
    // Persistence is best-effort. If Supabase is unconfigured/unreachable,
    // degrade to an empty archive instead of a 500 (no client console error).
    const message = err instanceof Error ? err.message : String(err);
    console.warn("[sessions] list unavailable (non-fatal):", message);
    return NextResponse.json({ sessions: [] });
  }
}
