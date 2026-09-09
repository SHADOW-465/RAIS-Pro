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
import type { EventFilter } from "@/lib/store/types";

export async function GET(req: NextRequest) {
  const auth = await requireSession(req);
  if (!auth.ok) return auth.response;

  try {
    const sp = req.nextUrl.searchParams;
    const filter: EventFilter = {
      from: sp.get("from") ?? undefined,
      to: sp.get("to") ?? undefined,
      stageId: sp.get("stageId") ?? undefined,
      eventType: (sp.get("eventType") as EventFilter["eventType"]) ?? undefined,
    };
    const { events, backend } = getStores();
    // Return the effective (non-superseded) ledger WITHOUT collapsing sources.
    // Analytics call scopeEvents → filter (date/stage/**source channel/file**)
    // → then canonicalize. Collapsing here first would hide Excel rows that
    // lose to same-day Data Entry, making "Excel only" impossible.
    const all = await events.effective(filter);

    // The caller's own scope, never one named in the request: a client that can
    // ask for a wider scope than its role has is not a scope.
    const role = await resolveRole(auth.actor.role);
    const data = scopeEventsForRole(all, role?.scope);

    return NextResponse.json({
      events: data,
      count: data.length,
      backend,
      // So a screen can say "your line" rather than quietly showing a smaller
      // plant. A number that is scoped and does not say so is a wrong number.
      scopedToStages: role?.scope?.stages?.length ? role.scope.stages : undefined,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? "Failed to load events" }, { status: 500 });
  }
}
