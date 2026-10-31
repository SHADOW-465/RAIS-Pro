// Plant CAPA register. Migration is a file only — a missing table returns
// source "unavailable" and the browser keeps its local list.
//
// GET    any signed-in role
// PUT    { capa }                 create or update one CAPA   (write)
// PUT    { importLocal, capas }   seed an empty register from a browser (write)
// DELETE ?id=                     remove one CAPA            (write)

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireCapability, requireSession } from "@/lib/auth/guard";
import { companyId } from "@/lib/auth/config";
import { CapaRecordSchema, getCapaStore } from "@/lib/capa/store";
import { LIVE_CACHE } from "@/lib/http/live-cache";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const PutBody = z.union([
  z.object({ capa: CapaRecordSchema }),
  z.object({ importLocal: z.literal(true), capas: z.array(CapaRecordSchema).max(1000) }),
]);

const failed = (err: unknown, fallback: string) =>
  NextResponse.json({ error: err instanceof Error ? err.message : fallback }, { status: 500 });

export async function GET(req: NextRequest) {
  const auth = await requireSession(req);
  if (!auth.ok) return auth.response;
  try {
    return NextResponse.json(await getCapaStore().read(companyId()), { headers: LIVE_CACHE });
  } catch (err: unknown) {
    return NextResponse.json(
      { source: "unavailable", capas: [], error: err instanceof Error ? err.message : "Failed to read CAPAs" },
      { status: 200, headers: LIVE_CACHE },
    );
  }
}

export async function PUT(req: NextRequest) {
  const auth = await requireCapability(req, "write");
  if (!auth.ok) return auth.response;
  const parsed = PutBody.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid CAPA", issues: parsed.error.issues }, { status: 400 });
  }
  try {
    const store = getCapaStore();
    const actor = auth.actor.username;
    const body = parsed.data;
    const read = "capa" in body
      ? await store.save(companyId(), body.capa, actor)
      : await store.importIfEmpty(companyId(), body.capas, actor);
    return NextResponse.json(read);
  } catch (err: unknown) {
    return failed(err, "Failed to save CAPA");
  }
}

export async function DELETE(req: NextRequest) {
  const auth = await requireCapability(req, "write");
  if (!auth.ok) return auth.response;
  const id = req.nextUrl.searchParams.get("id")?.trim();
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  try {
    return NextResponse.json(await getCapaStore().remove(companyId(), id));
  } catch (err: unknown) {
    return failed(err, "Failed to delete CAPA");
  }
}
