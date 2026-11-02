// Plant shared settings. Migration is a file only — a missing table is 503.
// The browser keeps its local copy and shows that message. It does not
// treat an empty document as success.
//
// GET  ?kind=                  any signed-in role
// PUT  { kind, record }        replace the document (capability depends on kind)
// PUT  { kind, import, record} write only when the document is still empty
// PUT  { kind: "edit-grants", grant }          merge one grant (approve)
// PUT  { kind: "edit-grants", revokeEntryKey } drop one grant (approve)

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { companyId } from "@/lib/auth/config";
import { requireCapability, requireSession } from "@/lib/auth/guard";
import { LIVE_CACHE, withNoStore } from "@/lib/http/live-cache";
import {
  capabilityFor,
  grantSchema,
  isSharedKind,
  parseKindRecord,
  SHARED_KINDS,
  type SharedKind,
} from "@/lib/shared-state/kinds";
import { getSharedStateStore, SharedStateUnavailableError } from "@/lib/shared-state/store";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const MAX_RECORD_CHARS = 500_000;

const PutBody = z.object({
  kind: z.enum(SHARED_KINDS),
  record: z.unknown().optional(),
  import: z.literal(true).optional(),
  grant: grantSchema.optional(),
  revokeEntryKey: z.string().trim().min(1).max(500).optional(),
});

function failed(err: unknown): NextResponse {
  if (err instanceof SharedStateUnavailableError) {
    console.warn(err.message);
    return NextResponse.json({ error: err.message, code: "storage-unavailable" }, { status: 503 });
  }
  return NextResponse.json(
    { error: err instanceof Error ? err.message : "Failed to read shared settings" },
    { status: 500 },
  );
}

async function getHandler(req: NextRequest) {
  const auth = await requireSession(req);
  if (!auth.ok) return auth.response;
  const kind = req.nextUrl.searchParams.get("kind");
  if (!isSharedKind(kind)) {
    return NextResponse.json({ error: "Unknown shared setting" }, { status: 400 });
  }
  try {
    const read = await getSharedStateStore().read(companyId(), kind);
    return NextResponse.json({ kind, source: "db", record: read.record }, { headers: LIVE_CACHE });
  } catch (err: unknown) {
    return failed(err);
  }
}

export async function PUT(req: NextRequest) {
  const raw = await req.json().catch(() => null);
  const kind = isSharedKind((raw as { kind?: string } | null)?.kind) ? (raw as { kind: SharedKind }).kind : null;
  if (!kind) {
    const auth = await requireSession(req);
    if (!auth.ok) return auth.response;
    return NextResponse.json({ error: "Invalid shared setting" }, { status: 400 });
  }
  const auth = await requireCapability(req, capabilityFor(kind));
  if (!auth.ok) return auth.response;

  const parsed = PutBody.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid shared setting" }, { status: 400 });
  }
  const body = parsed.data;
  const store = getSharedStateStore();
  const company = companyId();
  const actor = auth.actor.username;

  try {
    if (body.grant) {
      if (body.kind !== "edit-grants") {
        return NextResponse.json({ error: "Grants belong on edit-grants" }, { status: 400 });
      }
      const saved = await store.mergeGrant(company, body.grant, actor);
      return NextResponse.json({ kind, source: "db", record: saved.record });
    }
    if (body.revokeEntryKey) {
      if (body.kind !== "edit-grants") {
        return NextResponse.json({ error: "Grants belong on edit-grants" }, { status: 400 });
      }
      const saved = await store.revokeGrant(company, body.revokeEntryKey, actor);
      return NextResponse.json({ kind, source: "db", record: saved.record });
    }
    if (body.record !== undefined && JSON.stringify(body.record).length > MAX_RECORD_CHARS) {
      return NextResponse.json({ error: "Shared setting is too large" }, { status: 400 });
    }
    const doc = parseKindRecord(body.kind, body.record ?? null);
    if (!doc.ok) return NextResponse.json({ error: "Invalid shared setting" }, { status: 400 });
    if (body.import) {
      const saved = await store.importIfEmpty(company, body.kind, doc.record, actor);
      return NextResponse.json({ kind, source: "db", record: saved.record, imported: saved.imported });
    }
    const saved = await store.replace(company, body.kind, doc.record, actor);
    return NextResponse.json({ kind, source: "db", record: saved.record });
  } catch (err: unknown) {
    return failed(err);
  }
}

export const GET = withNoStore(getHandler);
