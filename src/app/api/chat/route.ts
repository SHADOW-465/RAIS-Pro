// src/app/api/chat/route.ts
import { NextRequest, NextResponse } from "next/server";
import { generateObject, NoObjectGeneratedError } from "ai";
import { tryModels } from "@/lib/ai";
import { InsightSlideAnswerSchema } from "@/lib/schemas";
import type { DashboardConfig, KPI, Chart } from "@/types/dashboard";

const SYSTEM_PROMPT =
  "You are a quality-analytics assistant answering follow-up questions about a " +
  "dashboard. You reply with a focused insight slide. CRITICAL: every number you " +
  "state in a chart or bullet MUST be one of the VERIFIED FIGURES provided below — " +
  "these were computed deterministically from the source data. Never invent, " +
  "estimate, or recompute a value. If the answer is not derivable from the verified " +
  "figures, say so plainly in a bullet instead of guessing.";

const fmtKpi = (k: KPI) =>
  `- ${k.label}: ${k.value}${k.unit ? " " + k.unit : ""}` +
  `${k.context ? `  [${k.context}]` : ""}${k.delta ? `  (${k.delta})` : ""}`;

function fmtChart(c: Chart): string {
  const labels = c.data?.labels ?? [];
  const series = c.data?.datasets?.[0]?.data ?? [];
  const pairs = labels.map((l, i) => `${l}=${series[i] ?? "?"}`).join(", ");
  return `- ${c.title} (${c.type}): ${pairs}`;
}

/**
 * Ground the chat in the SAME verified, structured data the dashboard shows
 * (KPIs, chart series, per-sheet sections) — not the raw parser input. This
 * keeps chat answers consistent with the dashboard and auditable.
 */
function buildChatContext(cfg: DashboardConfig): string {
  const parts: string[] = [];
  if (cfg.dashboardTitle) parts.push(`ANALYSIS: ${cfg.dashboardTitle}`);
  if (cfg.executiveSummary) parts.push(`SUMMARY: ${cfg.executiveSummary}`);

  parts.push("VERIFIED HEADLINE METRICS (combined across all sheets):");
  parts.push((cfg.kpis ?? []).map(fmtKpi).join("\n") || "(none)");

  if (cfg.charts?.length) {
    parts.push("VERIFIED CHART SERIES:");
    parts.push(cfg.charts.map(fmtChart).join("\n"));
  }

  if (cfg.sections?.length) {
    parts.push("VERIFIED PER-SHEET BREAKDOWN (one row per source sheet / month):");
    parts.push(
      cfg.sections
        .map(
          (s) =>
            `- ${s.label}: ` +
            s.kpis
              .map((k) => `${k.label}=${k.value}${k.unit ? " " + k.unit : ""}`)
              .join(", "),
        )
        .join("\n"),
    );
  }

  if (cfg.insights?.length) {
    parts.push("PRIOR OBSERVATIONS:\n" + cfg.insights.map((i) => `- ${i}`).join("\n"));
  }
  return parts.join("\n\n");
}

function buildPrompt(question: string, currentConfig: DashboardConfig): string {
  return [
    buildChatContext(currentConfig),
    "",
    `USER QUESTION: ${question}`,
    "",
    "Answer using ONLY the verified figures above (reference specific labels and " +
      "numbers). For comparisons or trends, build a chart from the per-sheet " +
      "breakdown or chart series. Generate the insight slide now.",
  ].join("\n");
}

export async function POST(req: NextRequest) {
  try {
    const { question, currentConfig } = await req.json();

    if (!question || typeof question !== "string") {
      return NextResponse.json({ error: "question is required" }, { status: 400 });
    }

    const cfg = (currentConfig ?? {}) as DashboardConfig;
    if (!cfg.kpis?.length) {
      return NextResponse.json(
        { error: "No analysis context available to answer against." },
        { status: 400 },
      );
    }

    const prompt = buildPrompt(question, cfg);

    try {
      const { object } = await tryModels((model) =>
        generateObject({
          model,
          schema: InsightSlideAnswerSchema,
          system: SYSTEM_PROMPT,
          prompt,
          temperature: 0.2,
        }),
      );

      return NextResponse.json({
        type: "slide",
        slide: {
          question,
          headline: object.headline,
          charts: object.charts,
          bullets: object.bullets,
          createdAt: new Date().toISOString(),
        },
      });
    } catch (err) {
      if (err instanceof NoObjectGeneratedError) {
        return NextResponse.json(
          { error: "Model could not produce a valid slide. Rephrase the question and try again." },
          { status: 502 },
        );
      }
      throw err;
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[chat] fatal:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
