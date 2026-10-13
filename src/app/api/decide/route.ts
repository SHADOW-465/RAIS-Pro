// src/app/api/decide/route.ts
// POST {scope, explain?} → {recommendations, vars}
// Decision engine entry point (ADD §9, Phase 6).

import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth/guard";
import { DecideRequest } from "@/shared/models/decision";
import { getStores } from "@/lib/store";
import { canonicalizeEvents } from "@/lib/analytics/canonical";
import { decide } from "@/core/decision/engine";
import { explainRecommendations } from "@/core/decision/explain";
import { getModStore } from "@/core/ontology/store/mod-store";
import { getPolicyStore } from "@/core/policy/policy-store";
import type { Scope } from "@/lib/analytics/scope";

export async function POST(req: NextRequest) {
  const auth = await requireSession(req);
  if (!auth.ok) return auth.response;

  try {
    const body = await req.json();
    const parsed = DecideRequest.safeParse({
      scope: body?.scope ?? { grain: "month", dateFrom: null, dateTo: null, stageIds: null, sizes: null },
      explain: body?.explain ?? false,
      companyId: body?.companyId ?? null,
    });
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid request", details: parsed.error.flatten() }, { status: 400 });
    }

    const { scope: s, explain, companyId } = parsed.data;
    const scope: Scope = {
      grain: s.grain,
      dateFrom: s.dateFrom ?? undefined,
      dateTo: s.dateTo ?? undefined,
      stageIds: s.stageIds ?? undefined,
      sizes: s.sizes ?? undefined,
    };

    const { events } = getStores();
    const data = canonicalizeEvents(await events.effective({
      from: scope.dateFrom,
      to: scope.dateTo,
    }));

    const company = companyId || process.env.MOID_COMPANY_ID || "default";
    let registry;
    try {
      registry = await getModStore().catalogFor(company);
    } catch {
      registry = undefined;
    }

    let policy;
    try {
      policy = (await getPolicyStore().current(company)).policy;
    } catch {
      policy = undefined;
    }
    const scoped = policy ? { ...scope, policy } : scope;
    const result = await decide(data, scoped, {
      registry,
      targetRate: policy ? policy.targetRejectionPct / 100 : undefined,
      watchRate: policy ? policy.watchRejectionPct / 100 : undefined,
    });
    let recommendations = result.recommendations;

    if (explain) {
      recommendations = await explainRecommendations(recommendations, result.vars);
    }

    return NextResponse.json({
      recommendations,
      vars: result.vars,
      count: recommendations.length,
    });
  } catch (err: unknown) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Decision engine failed" },
      { status: 500 },
    );
  }
}
