// src/app/api/events/route.ts
// Serves the effective canonical-event ledger to the analytics engine (plan 01/02).
// Screens fetch this once per scope window; selectors do the rest client-side.
//
// ── Why this route authorizes at all ───────────────────────────────────────
// It used to check nothing. `src/proxy.ts` requires a session, so it was not
// open to the world, but it was role-blind — and this one endpoint is where
// every number on every screen comes from. Hiding a screen from a role while
// this hands the same browser the whole ledger is tidiness, not
// confidentiality: the rows are one network-tab away.
//
// That is the right trade for most of it. A supervisor does not need the SPC
// screen and nobody is harmed if they could have reconstructed it. It is the
// wrong trade for a role a plant has deliberately limited to one line, so a
// role may carry a stage scope and it is applied HERE, before the rows leave
// the server, rather than in the browser that is being limited.
//
// An unscoped role — every role, until a GM says otherwise — gets exactly what
// it got before.

import { NextRequest, NextResponse } from "next/server";
import { getStores } from "@/lib/store";
import { requireSession } from "@/lib/auth/guard";
import { resolveRole } from "@/lib/auth/roles";
import { scopeEventsForRole } from "@/lib/access/scope";
import { dateBounds } from "@/lib/analytics/scope";
import type { Event, EventFilter } from "@/lib/store/types";
import { LIVE_CACHE, withNoStore } from "@/lib/http/live-cache";
import { defaultEventRange, EventPageError, pageEvents, parseEventLimit } from "@/lib/store/event-page";

export const dynamic = "force-dynamic";

async function getHandler(req: NextRequest) {
  const auth = await requireSession(req);
  if (!auth.ok) return auth.response;

  try {
    const sp = req.nextUrl.searchParams;

    // Dates only — the client uses this to turn "last 90 days" into a window
    // before it downloads rows. Same role scope as the row read. If the scan
    // fails, say so; the client then reads without a window instead of
    // painting an empty plant.
    if (sp.get("bounds") === "1") {
      try {
        const { events, backend } = getStores();
        const all = await events.effective();
        const role = await resolveRole(auth.actor.role);
        const data = scopeEventsForRole(all, role?.scope);
        const { min, max } = dateBounds(data);
        // max stays the latest occurredOn.start (relative presets anchor on it).
        // maxEnd is the latest occurredOn.end, so a week-span row is not clipped
        // when "All data" asks for start..end.
        let maxEnd: string | undefined;
        for (const e of data) {
          const end = e.occurredOn?.end;
          if (!end) continue;
          if (maxEnd === undefined || end > maxEnd) maxEnd = end;
        }
        return NextResponse.json(
          { min: min ?? null, max: max ?? null, maxEnd: maxEnd ?? null, backend },
          { headers: LIVE_CACHE },
        );
      } catch (err: any) {
        console.warn("[events] bounds read failed; clients will load without a date window", err);
        return NextResponse.json(
          { boundsUnavailable: true, error: err?.message ?? "bounds failed" },
          { headers: LIVE_CACHE },
        );
      }
    }

    // A bare read is the last 30 UTC days. bounds=1 (handled above) and
    // span=all stay unscoped. An explicit from or to wins over both.
    const spanAll = sp.get("span") === "all";
    let from = sp.get("from") || undefined;
    let to = sp.get("to") || undefined;
    if (!from && !to && !spanAll) {
      const window = defaultEventRange(new Date());
      from = window.from;
      to = window.to;
    }

    const filter: EventFilter = {
      from,
      to,
      stageId: sp.get("stageId") ?? undefined,
      eventType: (sp.get("eventType") as EventFilter["eventType"]) ?? undefined,
    };
    const { events, backend } = getStores();
    // Return the effective (non-superseded) ledger WITHOUT collapsing sources.
    // Analytics call scopeEvents → filter (date/stage/**source channel/file**)
    // → then canonicalize. Collapsing here first would hide Excel rows that
    // lose to same-day Data Entry, making "Excel only" impossible.
    // The 30-day default lives here, not in EventStore.effective, so decide,
    // day-records, and export keep their own windows.
    const all = await events.effective(filter);

    // The caller's own scope, never one named in the request: a client that can
    // ask for a wider scope than its role has is not a scope.
    const role = await resolveRole(auth.actor.role);
    const data = scopeEventsForRole(all, role?.scope);

    let page: { events: Event[]; nextCursor: string | null };
    try {
      page = pageEvents(data, {
        limit: parseEventLimit(sp.get("limit")),
        cursor: sp.get("cursor") || null,
      });
    } catch (err) {
      if (err instanceof EventPageError) {
        return NextResponse.json({ error: err.message }, { status: 400 });
      }
      throw err;
    }

    return NextResponse.json(
      {
        events: page.events,
        count: page.events.length,
        total: data.length,
        nextCursor: page.nextCursor,
        from: from ?? null,
        to: to ?? null,
        backend,
        // So a screen can say "your line" rather than quietly showing a smaller
        // plant. A number that is scoped and does not say so is a wrong number.
        scopedToStages: role?.scope?.stages?.length ? role.scope.stages : undefined,
      },
      { headers: LIVE_CACHE },
    );
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? "Failed to load events" }, { status: 500 });
  }
}

export const GET = withNoStore(getHandler);
