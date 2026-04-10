import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import type { InsightSlide } from "@/types/dashboard";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: sessionId } = await params;
  const deviceId = req.nextUrl.searchParams.get("deviceId");
  if (!deviceId) return NextResponse.json({ error: "deviceId required" }, { status: 400 });

  try {
    const db = createServerClient();
    const { data, error } = await db
      .from("insight_slides")
      .select("*")
      .eq("session_id", sessionId)
      .eq("device_id", deviceId)
      .order("created_at", { ascending: true });

    if (error) throw error;
    return NextResponse.json({ slides: data ?? [] });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: sessionId } = await params;
  const body = await req.json();
  const { deviceId, slide } = body as { deviceId: string; slide: InsightSlide };

  if (!deviceId || !slide) {
    return NextResponse.json({ error: "deviceId and slide required" }, { status: 400 });
  }

  try {
    const db = createServerClient();
    const { data, error } = await db
      .from("insight_slides")
      .insert({
        session_id: sessionId,
        device_id: deviceId,
        question: slide.question,
        slide: {
          headline: slide.headline,
          charts: slide.charts,
          bullets: slide.bullets,
          createdAt: slide.createdAt,
        },
      })
      .select("id")
      .single();

    if (error) throw error;
    return NextResponse.json({ id: data.id });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
