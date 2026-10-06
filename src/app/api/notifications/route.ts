// Operational notifications: entry exceptions + edit requests for the GM.

import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth/guard";
import {
  createNotification,
  listNotifications,
  openCount,
  patchNotification,
} from "@/lib/notifications/store";
import type { NotificationType } from "@/lib/notifications/types";
import { issueGrant } from "@/lib/entry/edit-grants";
import type { EditRequestPayload } from "@/lib/notifications/types";
import { LIVE_CACHE } from "@/lib/http/live-cache";

export const dynamic = "force-dynamic";
// Authority now comes from the session actor's capabilities (see guard.ts).

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const statusParam = req.nextUrl.searchParams.get("status") ?? "open";
  const type = req.nextUrl.searchParams.get("type") as NotificationType | null;
  const status =
    statusParam === "all" || statusParam === "closed" || statusParam === "open" ||
    statusParam === "acked" || statusParam === "approved" || statusParam === "denied"
      ? statusParam
      : "open";
  const list = await listNotifications({
    status: status as "open" | "all" | "closed" | "acked" | "approved" | "denied",
    type: type || undefined,
  });
  return NextResponse.json(
    { notifications: list, openCount: await openCount() },
    { headers: LIVE_CACHE },
  );
}

export async function POST(req: NextRequest) {
  const auth = await requireSession(req);
  if (!auth.ok) return auth.response;

  try {
    const body = await req.json();
    if (!body?.type || !body?.title || !body?.body) {
      return NextResponse.json({ error: "type, title, body required" }, { status: 400 });
    }
    const n = await createNotification({
      type: body.type,
      title: body.title,
      body: body.body,
      // From the session, never the body: a client that names its own
      // author can forge one.
      createdBy: auth.actor.username,
      targetPersona: body.targetPersona ?? "gm",
      payload: body.payload ?? {},
    });
    return NextResponse.json({ notification: n, openCount: await openCount() });
  } catch (err: unknown) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to create notification" },
      { status: 500 },
    );
  }
}

export async function PATCH(req: NextRequest) {
  const auth = await requireSession(req);
  if (!auth.ok) return auth.response;

  try {
    const body = await req.json();
    const id = body?.id as string | undefined;
    const action = body?.action as "ack" | "approve" | "deny" | undefined;
    const note = typeof body?.note === "string" ? body.note : undefined;
    // The resolver is whoever holds the session. This used to be read off the
    // request body, so an operator could approve their own edit request just by
    // naming themselves GM in the payload — the check below was self-asserted.
    const actorPersona = auth.actor.role;

    if (!id || !action) {
      return NextResponse.json({ error: "id and action required" }, { status: 400 });
    }
    if (!["ack", "approve", "deny"].includes(action)) {
      return NextResponse.json({ error: "invalid action" }, { status: 400 });
    }

    // Any resolution action requires the approve capability (GM).
    if (!auth.actor.capabilities.approve) {
      return NextResponse.json(
        { error: "Only GM may acknowledge, approve, or deny alerts" },
        { status: 403 },
      );
    }

    const existing = (await listNotifications({ status: "all" })).find((n) => n.id === id);
    if (!existing) {
      return NextResponse.json({ error: "not found" }, { status: 404 });
    }
    if (existing.status !== "open") {
      return NextResponse.json(
        { error: `Already ${existing.status} by ${existing.resolvedBy ?? "someone"}` },
        { status: 409 },
      );
    }

    const updated = await patchNotification(id, {
      action,
      actor: actorPersona,
      note,
    });
    if (!updated) {
      return NextResponse.json({ error: "not found" }, { status: 404 });
    }

    let grant = null;
    if (action === "approve" && existing.type === "edit_request") {
      const p = existing.payload as EditRequestPayload;
      if (p?.entryKey) {
        grant = issueGrant({
          entryKey: p.entryKey,
          approvedBy: actorPersona,
          notificationId: id,
        });
      }
    }

    return NextResponse.json({ notification: updated, grant, openCount: await openCount() });
  } catch (err: unknown) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to patch notification" },
      { status: 500 },
    );
  }
}
