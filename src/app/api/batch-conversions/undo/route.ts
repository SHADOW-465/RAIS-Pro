// GM-only soft undo. The conversion row stays; reversed_at marks it inactive.
// Never deletes a row.

import { NextRequest, NextResponse } from "next/server";
import { requireCapability } from "@/lib/auth/guard";
import { LIVE_CACHE } from "@/lib/http/live-cache";
import { getLineageStore } from "@/lib/lineage/store";
import { ConversionError, LineageUnavailableError } from "@/lib/lineage/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function failure(err: unknown) {
  if (err instanceof LineageUnavailableError) {
    return NextResponse.json({ error: err.message, code: "storage-unavailable" }, { status: 503 });
  }
  if (err instanceof ConversionError) {
    const status = err.code === "not-found" ? 404 : 400;
    return NextResponse.json({ error: err.message, code: err.code }, { status });
  }
  if (err instanceof SyntaxError) {
    return NextResponse.json({ error: "Request body must be valid JSON." }, { status: 400 });
  }
  return NextResponse.json(
    { error: err instanceof Error ? err.message : "Failed to undo conversion" },
    { status: 500 },
  );
}

export async function POST(req: NextRequest) {
  const auth = await requireCapability(req, "write");
  if (!auth.ok) return auth.response;
  if (auth.actor.role !== "gm") {
    return NextResponse.json(
      { error: "Only a General Manager can undo a conversion.", code: "gm-only" },
      { status: 403 },
    );
  }

  try {
    const body = (await req.json()) as { id?: string; reason?: string };
    const id = (body?.id ?? "").trim();
    const reason = (body?.reason ?? "").trim();
    if (!id || !reason) {
      return NextResponse.json(
        { error: "id and a reason are required. Say why this conversion is being undone." },
        { status: 400 },
      );
    }
    const result = await getLineageStore().reverse({ id, actor: auth.actor.username, reason });
    return NextResponse.json(
      {
        conversion: result.conversion,
        audit: result.audit,
        auditStored: result.auditStored,
        warning: result.auditStored
          ? null
          : "The conversion was reversed, but the audit table is missing so the audit row was not stored. The reversal on the conversion is kept.",
      },
      { status: 200, headers: LIVE_CACHE },
    );
  } catch (err: unknown) {
    return failure(err);
  }
}
