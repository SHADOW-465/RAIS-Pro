// Server totals for the plant screens. The body is the same header state the
// browser already uses. The registry and the role scope are loaded here, not
// taken from the request. When the totals RPCs are missing or disagree, the
// payload is still the JS selectors.

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireSession } from "@/lib/auth/guard";
import { resolveRole } from "@/lib/auth/roles";
import { scopeEventsForRole } from "@/lib/access/scope";
import { getStores } from "@/lib/store";
import { withNoStore } from "@/lib/http/live-cache";
import { resolveScope, type ScopeTweaks } from "@/lib/analytics/scope";
import { selectTotalsEvents } from "@/lib/analytics/plant-totals";
import { resolveServerTotals } from "@/lib/analytics/server-totals";
import { loadPlantRegistry } from "@/lib/analytics/load-plant-registry";
import type { EventFilter } from "@/lib/store/types";

export const dynamic = "force-dynamic";

const Body = z.object({
  dateBasis: z.enum(["lot", "entry"]).optional(),
  grain: z.enum(["day", "week", "month", "fy"]).optional(),
  datePreset: z.enum(["all", "this-day", "this-week", "last-week", "this-month", "last-month", "last-3-months", "last-3-month", "last-90-days", "last-12-months", "this-fy", "custom"]).optional(),
  dateFrom: z.string().nullable().optional(),
  dateTo: z.string().nullable().optional(),
  stageView: z.string().nullable().optional(),
  stageCategories: z.array(z.enum(["primary", "secondary", "assembly"])).nullable().optional(),
  includeExcel: z.boolean().optional(),
  includeDirectEntry: z.boolean().optional(),
  excelFiles: z.array(z.string()).nullable().optional(),
  batchIds: z.array(z.string()).nullable().optional(),
  /** Occurred-on window the ledger fetch used. Omitted with span=all reads the whole ledger. */
  from: z.string().nullable().optional(),
  to: z.string().nullable().optional(),
  span: z.enum(["all"]).nullable().optional(),
  entryFrom: z.string().nullable().optional(),
  entryTo: z.string().nullable().optional(),
});

async function postHandler(req: NextRequest) {
  const auth = await requireSession(req);
  if (!auth.ok) return auth.response;

  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = Body.safeParse(json);
  if (!parsed.success) return NextResponse.json({ error: "Invalid totals request" }, { status: 400 });
  const body = parsed.data;

  const basis = body.dateBasis ?? "lot";
  const explicitRange = !!(body.from || body.to);
  const spanAll = !explicitRange;
  if (!explicitRange && body.span !== "all") {
    console.warn("[totals] request had no occurred-on window; reading the full ledger rather than the last 30 days");
  }

  try {
    const role = await resolveRole(auth.actor.role);
    const nav = role?.navAllow ?? [];
    const { registry, policy } = await loadPlantRegistry(nav);
    const filter: EventFilter = {};
    if (!spanAll) {
      if (body.from) filter.from = body.from;
      if (body.to) filter.to = body.to;
    }
    const { events } = getStores();
    const loaded = await events.effective(filter);
    const scoped = scopeEventsForRole(loaded, role?.scope);

    const tweaks: ScopeTweaks = {
      grain: body.grain ?? "month",
      datePreset: basis === "entry" ? "all" : (body.datePreset ?? "all"),
      dateFrom: body.dateFrom ?? "",
      dateTo: body.dateTo ?? "",
      stageView: body.stageView ?? undefined,
      stageCategories: body.stageCategories ?? undefined,
      includeExcel: body.includeExcel,
      includeDirectEntry: body.includeDirectEntry,
      excelFiles: body.excelFiles ?? undefined,
      batchIds: body.batchIds ?? undefined,
    };
    const scope = resolveScope(scoped, tweaks, policy);
    const selected = selectTotalsEvents(scoped, {
      basis,
      scope,
      entryFrom: body.entryFrom,
      entryTo: body.entryTo,
    });
    const totals = await resolveServerTotals(selected.events, selected.scope, registry);
    return NextResponse.json(totals);
  } catch (err) {
    console.error("[totals] failed", err);
    return NextResponse.json({ error: err instanceof Error ? err.message : "Totals failed" }, { status: 500 });
  }
}

export const POST = withNoStore(postHandler);
