// src/app/api/narrative/route.ts
//
// NARRATIVE phase (slow, AI prose only). Split out from /api/analyze so the
// dashboard can render its computed numbers immediately while this fills in.
// The model writes prose ONLY — every number it cites comes from the already-
// computed MetricsResult passed in. It never does maths.

import { NextRequest, NextResponse } from "next/server";
import { generateObject, NoObjectGeneratedError } from "ai";
import { createServerClient } from "@/lib/supabase";
import { tryModels } from "@/lib/ai";
import { NarrativeSchema } from "@/lib/schemas";
import { buildNarrativePrompt } from "@/lib/analysis-utils";
import type { MetricsResult } from "@/types/metrics";

const SYSTEM_PROMPT =
  "You are a senior quality-analytics analyst. Return ONLY data that conforms " +
  "to the requested schema. Never invent numbers — every value must trace to " +
  "the provided data.";

export async function POST(req: NextRequest) {
  try {
    const { metrics, sessionId } = (await req.json()) as {
      metrics: MetricsResult;
      sessionId?: string | null;
    };

    if (!metrics || !Array.isArray(metrics.metrics)) {
      return NextResponse.json({ error: "metrics result is required" }, { status: 400 });
    }

    let narrative;
    try {
      const { object } = await tryModels((model) =>
        generateObject({
          model,
          schema: NarrativeSchema,
          system: SYSTEM_PROMPT,
          prompt: buildNarrativePrompt(metrics),
          temperature: 0.2,
        }),
      );
      narrative = object;
    } catch (err) {
      if (err instanceof NoObjectGeneratedError) {
        console.error("[narrative] produced no valid object:", err.cause);
        return NextResponse.json(
          { error: "Analysis model returned no valid narrative. Try again." },
          { status: 502 },
        );
      }
      throw err;
    }

    // Patch the saved session's dashboard with the prose (best-effort).
    if (sessionId && typeof sessionId === "string") {
      try {
        const db = createServerClient();
        const { data: row } = await db
          .from("sessions")
          .select("dashboard")
          .eq("id", sessionId)
          .single();
        if (row?.dashboard) {
          const merged = {
            ...row.dashboard,
            dashboardTitle: narrative.dashboardTitle,
            executiveSummary: narrative.executiveSummary,
            insights: narrative.insights,
            recommendations: narrative.recommendations,
            alerts: narrative.alerts,
          };
          await db
            .from("sessions")
            .update({ dashboard: merged, title: narrative.dashboardTitle })
            .eq("id", sessionId);
        }
      } catch (saveErr) {
        console.warn("[narrative] session patch failed (non-fatal):", saveErr);
      }
    }

    return NextResponse.json({
      dashboardTitle: narrative.dashboardTitle,
      executiveSummary: narrative.executiveSummary,
      insights: narrative.insights,
      recommendations: narrative.recommendations,
      alerts: narrative.alerts,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[narrative] fatal:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
