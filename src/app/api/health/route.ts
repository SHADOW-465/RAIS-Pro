// Which database credentials the server is using, so someone setting up the
// Supabase lockdown can confirm the service-role key reached the deployment
// BEFORE running it. Reports the key's kind only, never the key.
//
// GET  any signed-in role
//   200 { ok, dbKey: "service_role" | "anon" | "none", store: "supabase" | "memory", buildId }
//   dbKey "service_role" means the lockdown is safe to run.

import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth/guard";
import { withNoStore } from "@/lib/http/live-cache";
import { shouldUseSupabase } from "@/lib/store";
import { supabaseKeyKind } from "@/lib/supabase";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

async function getHandler(req: NextRequest) {
  const auth = await requireSession(req);
  if (!auth.ok) return auth.response;
  const dbKey = supabaseKeyKind();
  return NextResponse.json({
    ok: true,
    dbKey,
    store: shouldUseSupabase() ? "supabase" : "memory",
    lockdownSafe: dbKey === "service_role",
    buildId: process.env.NEXT_PUBLIC_BUILD_ID ?? null,
  });
}

export const GET = withNoStore(getHandler);
