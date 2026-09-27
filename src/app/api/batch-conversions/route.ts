// Isolated lineage API. Reads and writes batch_conversions only.
// Never appends, corrects, or purges ledger events.

import { NextRequest, NextResponse } from "next/server";
import { requireCapability, requireSession } from "@/lib/auth/guard";
import { ConversionError } from "@/lib/lineage/types";
import { getLineageStore } from "@/lib/lineage/store";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const auth = await requireSession(req);
  if (!auth.ok) return auth.response;

  const store = getLineageStore();
  const batch = req.nextUrl.searchParams.get("batch");
  if (batch) {
    const chain = await store.chainFor(batch);
    return NextResponse.json({ chain });
  }
  const conversions = await store.list();
  return NextResponse.json({ conversions });
}

export async function POST(req: NextRequest) {
  const auth = await requireCapability(req, "write");
  if (!auth.ok) return auth.response;

  try {
    const body = (await req.json()) as {
      fromBatch?: string;
      toSize?: string;
      toBatch?: string;
      convertedOn?: string;
      reason?: string;
    };
    if (!body?.fromBatch || !body?.toSize || !body?.convertedOn) {
      return NextResponse.json(
        { error: "fromBatch, toSize, and convertedOn are required." },
        { status: 400 },
      );
    }
    const conversion = await getLineageStore().create({
      fromBatch: body.fromBatch,
      toSize: body.toSize,
      toBatch: body.toBatch,
      convertedOn: body.convertedOn,
      reason: body.reason ?? "",
      createdBy: auth.actor.username,
    });
    return NextResponse.json({ conversion }, { status: 201 });
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
