// Isolated lineage API. Reads and writes batch_conversions only.
// Never appends, corrects, or purges ledger events.

import { NextRequest, NextResponse } from "next/server";
import { requireCapability, requireSession } from "@/lib/auth/guard";
import { ConversionError } from "@/lib/lineage/types";
import { getLineageStore } from "@/lib/lineage/store";
import { LIVE_CACHE } from "@/lib/http/live-cache";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const auth = await requireSession(req);
  if (!auth.ok) return auth.response;

  const store = getLineageStore();
  const batch = req.nextUrl.searchParams.get("batch");
  if (batch) {
    const chain = await store.chainFor(batch);
    return NextResponse.json({ chain }, { headers: LIVE_CACHE });
  }
  const conversions = await store.list();
  return NextResponse.json({ conversions }, { headers: LIVE_CACHE });
}

export async function POST(req: NextRequest) {
  const auth = await requireCapability(req, "write");
  if (!auth.ok) return auth.response;

  try {
    const body = (await req.json()) as {
      fromBatch?: string;
      toSize?: string;
      toBatch?: string;
      changedQty?: number;
      stageId?: string;
      convertedOn?: string;
      reason?: string;
    };
    const changedQty = Number(body?.changedQty);
    if (!body?.fromBatch || !body?.toSize || !body?.convertedOn || !body?.stageId || !changedQty) {
      return NextResponse.json(
        { error: "fromBatch, toSize, changedQty, stageId, and convertedOn are required." },
        { status: 400 },
      );
    }
    const conversion = await getLineageStore().create({
      fromBatch: body.fromBatch,
      toSize: body.toSize,
      toBatch: body.toBatch,
      changedQty,
      stageId: body.stageId,
      convertedOn: body.convertedOn,
      reason: body.reason ?? "",
      createdBy: auth.actor.username,
    });
    return NextResponse.json({ conversion }, { status: 201, headers: LIVE_CACHE });
  } catch (err: unknown) {
    if (err instanceof ConversionError) {
      return NextResponse.json({ error: err.message, code: err.code }, { status: 400 });
    }
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to record conversion" },
      { status: 500 },
    );
  }
}
