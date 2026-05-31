// src/app/api/analyze/route.ts
//
// Pipeline (see AGENTS.md "Pipeline invariants" — the model never does maths):
//   Phase 1  GRAPH      AI classifies every column into a semantic role.
//                       Heuristic inferSheetGraph() is the guaranteed fallback.
//   Phase 2  COMPUTE    computeMetrics() turns the graph into exact numbers in
//                       pure JS. We compute from BOTH the LLM graph and the
//                       heuristic and only keep the LLM result if it is sane.
//   Phase 3  NARRATIVE  AI writes prose only (title/summary/insights/recs).
//                       KPIs + charts are built deterministically from Phase 2.

import { NextRequest, NextResponse } from "next/server";
import { generateObject, NoObjectGeneratedError } from "ai";
import { createServerClient } from "@/lib/supabase";
import { tryModels } from "@/lib/ai";
import { NarrativeSchema, SheetGraphSetSchema } from "@/lib/schemas";
import { buildGraphPrompt, buildNarrativePrompt } from "@/lib/analysis-utils";
import { inferSheetGraph, computeMetrics } from "@/lib/metrics";
import {
  reconcileGraph,
  metricsSane,
  metricsToKpis,
  metricsToCharts,
  deriveMergePlan,
} from "@/lib/dashboard-builder";
import type { SheetSummary } from "@/lib/parser";
import type { SheetGraph } from "@/types/metrics";
import type { DashboardConfig } from "@/types/dashboard";

const SYSTEM_PROMPT =
  "You are a senior quality-analytics analyst. Return ONLY data that conforms " +
  "to the requested schema. Never invent numbers — every value must trace to " +
  "the provided data.";

export async function POST(req: NextRequest) {
  try {
    const { summaries, deviceId, fileNames } = (await req.json()) as {
      summaries: SheetSummary[];
      deviceId?: string;
      fileNames?: string[];
    };

    if (!Array.isArray(summaries) || summaries.length === 0) {
      return NextResponse.json({ error: "No summaries provided" }, { status: 400 });
    }

    // Defensive dedup — prevent doubled numbers if the same sheet arrives twice.
    const seen = new Set<string>();
    const uniqueSummaries: SheetSummary[] = summaries.filter((s) => {
      if (seen.has(s.name)) {
        console.warn(`[analyze] duplicate sheetKey dropped: ${s.name}`);
        return false;
      }
      seen.add(s.name);
      return true;
    });

    // ── Phase 1: semantic column-role graph ─────────────────────────────────
    // Heuristic graph is the deterministic, golden-tested baseline + fallback.
    const heuristicGraphs: SheetGraph[] = uniqueSummaries.map(inferSheetGraph);
    let graphs = heuristicGraphs;
    let graphSource: "llm" | "heuristic" = "heuristic";

    try {
      const { object } = await tryModels(
        (model) =>
          generateObject({
            model,
            schema: SheetGraphSetSchema,
            system: SYSTEM_PROMPT,
            prompt: buildGraphPrompt(uniqueSummaries),
            temperature: 0.1,
          }),
        { fast: true },
      );

      const llmByKey = new Map(object.sheets.map((g) => [g.sheetKey, g]));
      const reconciled = uniqueSummaries.map((s, i) => {
        const llm = llmByKey.get(s.name);
        return llm ? reconcileGraph(llm, s, heuristicGraphs[i]) : heuristicGraphs[i];
      });

      // Accept the LLM graph only if the numbers it yields are sane.
      const candidate = computeMetrics(uniqueSummaries, reconciled);
      const baseline = computeMetrics(uniqueSummaries, heuristicGraphs);
      if (metricsSane(candidate, baseline)) {
        graphs = reconciled;
        graphSource = "llm";
      } else {
        console.warn("[analyze] LLM graph failed sanity gate; using heuristic graph");
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(`[analyze] graph classification failed (${msg}); using heuristic graph`);
    }

    // ── Phase 2: deterministic metric computation ───────────────────────────
    const metrics = computeMetrics(uniqueSummaries, graphs);
    const kpis = metricsToKpis(metrics);
    const charts = metricsToCharts(metrics);
    const mergePlan = deriveMergePlan(uniqueSummaries, graphs);

    console.log(
      `[analyze] graph=${graphSource}, kpis=${kpis.length}, charts=${charts.length}, ` +
        `rate=${metrics.metrics.find((m) => m.id === "rejection_rate")?.display}`,
    );

    if (kpis.length === 0) {
      return NextResponse.json(
        { error: "No measurable quantities found in the uploaded sheets." },
        { status: 422 },
      );
    }

    // ── Phase 3: narrative (prose only) ─────────────────────────────────────
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
        console.error("[analyze] narrative generation produced no valid object:", err.cause);
        return NextResponse.json(
          { error: "Analysis model returned no valid result. Try again." },
          { status: 502 },
        );
      }
      throw err;
    }

    const dashboard: DashboardConfig = {
      dashboardTitle: narrative.dashboardTitle,
      executiveSummary: narrative.executiveSummary,
      kpis,
      charts,
      insights: narrative.insights,
      recommendations: narrative.recommendations,
      alerts: narrative.alerts,
    };

    // ── Save to Supabase (best-effort) ──────────────────────────────────────
    let sessionId: string | null = null;
    try {
      if (deviceId && typeof deviceId === "string") {
        const db = createServerClient();
        const { data: session } = await db
          .from("sessions")
          .insert({
            device_id: deviceId,
            title: dashboard.dashboardTitle,
            files: Array.isArray(fileNames) ? fileNames.map((n) => ({ name: n })) : [],
            dashboard,
            merge_plan: mergePlan,
            data_summary: JSON.stringify(summaries),
          })
          .select("id")
          .single();
        sessionId = session?.id ?? null;
      }
    } catch (saveErr) {
      console.warn("[analyze] session save failed (non-fatal):", saveErr);
    }

    return NextResponse.json({ ...dashboard, sessionId, mergePlan });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[analyze] fatal:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
