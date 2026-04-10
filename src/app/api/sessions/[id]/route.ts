import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const deviceId = req.nextUrl.searchParams.get("deviceId");
  if (!deviceId) {
    return NextResponse.json({ error: "deviceId is required" }, { status: 400 });
  }

  try {
    const db = createServerClient();

    const [sessionResult, slidesResult] = await Promise.all([
      db.from("sessions").select("*").eq("id", id).eq("device_id", deviceId).single(),
      db.from("insight_slides").select("*").eq("session_id", id).order("created_at", { ascending: true }),
    ]);

    if (sessionResult.error) throw sessionResult.error;
    return NextResponse.json({
      session: sessionResult.data,
      slides: slidesResult.data ?? [],
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { deviceId } = await req.json().catch(() => ({}));
  if (!deviceId) {
    return NextResponse.json({ error: "deviceId is required" }, { status: 400 });
  }

  try {
    const db = createServerClient();
    const { error } = await db
      .from("sessions")
      .delete()
      .eq("id", id)
      .eq("device_id", deviceId);

    if (error) throw error;
    return NextResponse.json({ success: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
