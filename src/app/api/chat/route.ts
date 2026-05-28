// src/app/api/chat/route.ts
import { NextRequest, NextResponse } from "next/server";
import { generateObject, NoObjectGeneratedError } from "ai";
import { getModel } from "@/lib/ai";
import { InsightSlideAnswerSchema } from "@/lib/schemas";
import type { DashboardConfig } from "@/types/dashboard";

const SYSTEM_PROMPT =
  "You are a data analyst answering follow-up questions on a dashboard. " +
  "Reply with a focused insight slide. Every chart and bullet must use " +
  "numbers that appear in the provided dataset summary — never invent values.";

function buildPrompt(
  question: string,
  dataSummary: string,
  currentConfig: DashboardConfig,
): string {
  return [
    "DATASET SUMMARY:",
    dataSummary,
    "",
    "DASHBOARD CONTEXT (current KPIs):",
    JSON.stringify(currentConfig?.kpis ?? [], null, 2).slice(0, 1500),
    "",
    `USER QUESTION: ${question}`,
    "",
    "Generate the insight slide now.",
  ].join("\n");
}

export async function POST(req: NextRequest) {
  try {
    const { question, dataSummary, currentConfig } = await req.json();

    if (!question || typeof question !== "string") {
      return NextResponse.json({ error: "question is required" }, { status: 400 });
    }

    const prompt = buildPrompt(
      question,
      String(dataSummary ?? ""),
      (currentConfig ?? {}) as DashboardConfig,
    );

    try {
      const { object } = await generateObject({
        model: getModel(),
        schema: InsightSlideAnswerSchema,
        system: SYSTEM_PROMPT,
        prompt,
        temperature: 0.2,
      });

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
