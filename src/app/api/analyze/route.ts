// src/app/api/analyze/route.ts
//
// COMPUTE phase only (fast, deterministic). The slow AI prose lives in
// /api/narrative, so the dashboard can render its real numbers immediately and
// the narrative fills in afterwards (progressive reveal).
//
// Pipeline (see AGENTS.md "Pipeline invariants" — the model never does maths):
//   Phase 1  GRAPH      AI classifies every column into a semantic role.
//                       Heuristic inferSheetGraph() is the guaranteed fallback.
//   Phase 2  COMPUTE    computeMetrics() turns the graph into exact numbers in
//                       pure JS. We compute from BOTH the LLM graph and the
//                       heuristic and only keep the LLM result if it is sane.
//   (Phase 3 NARRATIVE now lives in /api/narrative.)

import { NextRequest, NextResponse } from "next/server";
import { generateObject } from "ai";
import { createServerClient } from "@/lib/supabase";
import { tryModels } from "@/lib/ai";
import { SheetMappingSetSchema } from "@/lib/schemas";
import { buildGraphPrompt } from "@/lib/analysis-utils";
import { inferSheetGraph, computeMetrics } from "@/lib/metrics";
import {
  reconcileGraph,
  metricsSane,
  metricsToKpis,
  metricsToCharts,
  calculatePareto,
  deriveMergePlan,
} from "@/lib/dashboard-builder";
import { parseMonth, sheetNameOf } from "@/lib/verify-nav";
import type { SheetSummary } from "@/lib/parser";
import type { SheetGraph } from "@/types/metrics";
import type { DashboardConfig } from "@/types/dashboard";

const SYSTEM_PROMPT =
  "You are a senior quality-analytics analyst. Return ONLY data that conforms " +
  "to the requested schema. Never invent numbers — every value must trace to " +
  "the provided data.";

/** Translates the new strict AI Ontology Alignment Mapping to the internal legacy SheetGraph structure. */
function translateMappingToGraph(
  sheetKey: string,
  mapping: any,
  fallback: SheetGraph,
): SheetGraph {
  const stageOrderSet = new Set<string>();
  const columns = mapping.columnMapping.map((col: any) => {
    let role = "ignore";
    if (col.mappedRole === "date") role = "date";
    else if (col.mappedRole === "checked") role = "stage_checked";
    else if (col.mappedRole === "accepted") role = "stage_accepted";
    else if (col.mappedRole === "rejected") role = "stage_rejected";
    else if (col.mappedRole === "hold") role = "stage_hold";
    else if (col.mappedRole === "defect_mode") role = "reason_count";
    else if (col.mappedRole === "sku" || col.mappedRole === "size") role = "dimension";
    else if (col.mappedRole === "ignore") role = "ignore";

    let stage = null;
    if (col.targetStage) {
      if (col.targetStage === "Visual Inspection") stage = "Visual";
      else if (col.targetStage === "Balloon Testing") stage = "Balloon";
      else if (col.targetStage === "Final Inspection") stage = "Final";
      else stage = col.targetStage;

      if (role.startsWith("stage_")) {
        stageOrderSet.add(stage);
      }
    }

    return {
      column: col.excelHeaderName,
      role,
      stage,
    };
  });

  const stageOrder = Array.from(stageOrderSet);

  return {
    sheetKey,
    reportType: fallback.reportType,
    isSummary: mapping.metadata.containsSummaryBlocks || fallback.isSummary,
    stageOrder: stageOrder.length > 0 ? stageOrder : fallback.stageOrder,
    columns,
    notes: null,
  };
}

/** Deterministic placeholder title shown until the narrative supplies a real one. */
function fallbackTitle(fileNames?: string[]): string {
  const first = fileNames?.[0]?.replace(/\.[^.]+$/, "").trim();
  return first ? `${first} — Rejection Analysis` : "Rejection Inspection Analysis";
}

/** Bound the optional LLM-graph call so compute always returns fast even if a
 *  provider hangs — the heuristic graph is the guaranteed fallback. */
const GRAPH_TIMEOUT_MS = 12_000;
function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms)),
  ]);
}

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
      const { object } = await withTimeout(
        tryModels(
          (model) =>
            generateObject({
              model,
              schema: SheetMappingSetSchema,
              system: SYSTEM_PROMPT,
              prompt: buildGraphPrompt(uniqueSummaries),
              temperature: 0.1,
            }),
          { fast: true },
        ),
        GRAPH_TIMEOUT_MS,
        "graph classification",
      );

      const llmByKey = new Map(object.sheets.map((g) => [g.sheetKey, g.mapping]));
      const reconciled = uniqueSummaries.map((s, i) => {
        const mapping = llmByKey.get(s.name);
        let graph = heuristicGraphs[i];
        if (mapping) {
          graph = translateMappingToGraph(s.name, mapping, heuristicGraphs[i]);
        }
        return reconcileGraph(graph, s, heuristicGraphs[i]);
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
    const pareto = calculatePareto(metrics.reasonPareto);
    const mergePlan = deriveMergePlan(uniqueSummaries, graphs);

    // Per-sheet sections: each non-summary sheet gets its own deterministic
    // KPIs + charts so the user can drill into (and verify) one sheet at a time.
    const sections = uniqueSummaries
      .map((s, i) => ({ s, g: graphs[i] }))
      .filter(({ g }) => !g.isSummary)
      .map(({ s, g }) => {
        const m = computeMetrics([s], [g]);
        const month = parseMonth(sheetNameOf(s.name));
        return {
          id: s.name,
          label: month ? month.label : sheetNameOf(s.name),
          sortIndex: month ? month.sortIndex : Number.MAX_SAFE_INTEGER,
          kpis: metricsToKpis(m),
          charts: metricsToCharts(m),
          pareto: calculatePareto(m.reasonPareto),
        };
      })
      .filter((sec) => sec.kpis.length > 0)
      .sort((a, b) => a.sortIndex - b.sortIndex)
      .map(({ id, label, kpis: k, charts: c, pareto: p }) => ({ id, label, kpis: k, charts: c, pareto: p }));

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

    // Deterministic dashboard: real numbers now, prose fields left empty for
    // /api/narrative to fill in (the client shows skeletons meanwhile).
    const dashboard: DashboardConfig = {
      dashboardTitle: fallbackTitle(fileNames),
      executiveSummary: "",
      kpis,
      charts,
      insights: [],
      recommendations: [],
      alerts: [],
      sections,
      pareto,
    };

    // ── Save to Supabase (best-effort) ──────────────────────────────────────
    // Saved now (numbers only) so the session appears in the archive instantly;
    // /api/narrative patches in the prose when it's ready.
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

    // metrics is returned so /api/narrative can write prose without recomputing.
    return NextResponse.json({ ...dashboard, sessionId, mergePlan, metrics, narrativePending: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[analyze] fatal:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
