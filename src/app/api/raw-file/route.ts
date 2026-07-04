// src/app/api/raw-file/route.ts
// Serves an archived upload's raw bytes back out, by content hash. This is
// what lets Verify Mode reconstruct the ORIGINAL worksheet for a source row
// that belongs to a file uploaded in a PAST browser session — every event's
// provenance.fileHash already points here (raw_files is populated on every
// upload by /api/archive-upload); Verify Mode just wasn't reading it back.
import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";

export async function GET(req: NextRequest) {
  const hash = req.nextUrl.searchParams.get("hash");
  if (!hash) {
    return NextResponse.json({ error: "hash is required" }, { status: 400 });
  }

  const db = createServerClient();
  const { data, error } = await db
    .from("raw_files")
    .select("file_name, file_bytes")
    .eq("file_hash", hash)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!data) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  // PostgREST returns bytea as a "\x<hex>" string over JSON.
  const raw = data.file_bytes as unknown as string;
  const hex = raw.startsWith("\\x") ? raw.slice(2) : raw;
  const buffer = Buffer.from(hex, "hex");

  return new NextResponse(buffer, {
    headers: {
      "content-type": "application/octet-stream",
      "x-file-name": encodeURIComponent(data.file_name),
      "cache-control": "private, max-age=3600, immutable",
    },
  });
}
