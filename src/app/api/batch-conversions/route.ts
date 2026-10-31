// Isolated lineage API. Reads and writes batch_conversions only.
// Never appends, corrects, or purges ledger events.

import { NextRequest, NextResponse } from "next/server";
import { requireCapability, requireSession } from "@/lib/auth/guard";
import { ConversionError, LineageUnavailableError } from "@/lib/lineage/types";
import { getLineageStore } from "@/lib/lineage/store";
import { eligibleQtyFromEvents, lotExistsInEvents } from "@/lib/lineage/eligible";
import { canonLot } from "@/lib/lineage/ids";
import { resolveStageId } from "@/core/ontology/plant-catalog";
import { getStores } from "@/lib/store";
import type { AuditEventLike } from "@/lib/analytics/audit-sessions";
import { LIVE_CACHE, withNoStore } from "@/lib/http/live-cache";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function getHandler(req: NextRequest) {
  const auth = await requireSession(req);
  if (!auth.ok) return auth.response;

  try {
    const store = getLineageStore();
    const batch = req.nextUrl.searchParams.get("batch");
    if (batch) {
      const chain = await store.chainFor(batch);
      return NextResponse.json({ chain }, { headers: LIVE_CACHE });
    }
    const conversions = await store.list();
    return NextResponse.json({ conversions }, { headers: LIVE_CACHE });
  } catch (err: unknown) {
    return failure(err, "Failed to load conversions");
  }
}

function failure(err: unknown, fallback: string) {
  if (err instanceof LineageUnavailableError) {
    return NextResponse.json({ error: err.message, code: "storage-unavailable" }, { status: 503 });
  }
  if (err instanceof ConversionError) {
    return NextResponse.json({ error: err.message, code: err.code }, { status: 400 });
  }
  if (err instanceof SyntaxError) {
    return NextResponse.json({ error: "Request body must be valid JSON." }, { status: 400 });
  }
  return NextResponse.json({ error: err instanceof Error ? err.message : fallback }, { status: 500 });
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
    // A number or nothing: Number(true) is 1 and Number("") is 0, and neither
    // is a quantity. planConversion rejects NaN, 0, negatives and fractions.
    const changedQty = typeof body?.changedQty === "number" ? body.changedQty : Number.NaN;
    if (!body?.fromBatch || !body?.toSize || !body?.convertedOn || !body?.stageId) {
      return NextResponse.json(
        { error: "fromBatch, toSize, changedQty, stageId, and convertedOn are required." },
        { status: 400 },
      );
    }
    // What the original lot can give up comes from the ledger, never from the
    // request. An unparseable lot or station is left for planConversion to
    // reject with its own message.
    // ponytail: reads the whole effective ledger per save; saves are rare.
    const lot = canonLot(body.fromBatch);
    const stage = resolveStageId(body.stageId);
    const events = lot ? ((await getStores().events.effective()) as unknown as AuditEventLike[]) : null;
    const eligibleQty = events && lot && stage ? eligibleQtyFromEvents(events, lot, stage) : undefined;
    const lotKnown = events && lot ? lotExistsInEvents(events, lot) : undefined;
    const conversion = await getLineageStore().create({
      fromBatch: body.fromBatch,
      toSize: body.toSize,
      toBatch: body.toBatch,
      changedQty,
      stageId: body.stageId,
      convertedOn: body.convertedOn,
      reason: body.reason ?? "",
      createdBy: auth.actor.username,
      eligibleQty,
      lotKnown,
    });
    return NextResponse.json({ conversion }, { status: 201, headers: LIVE_CACHE });
  } catch (err: unknown) {
    return failure(err, "Failed to record conversion");
  }
}

export const GET = withNoStore(getHandler);
