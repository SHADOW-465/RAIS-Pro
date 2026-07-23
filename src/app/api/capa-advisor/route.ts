// src/app/api/capa-advisor/route.ts
// Conversational CAPA advisor for the composer modal. Grounds the model in the
// clicked recommendation + verified metric context so a GM can reason about
// root cause and corrective action without leaving the dashboard.
// Invariant (AGENTS.md): the model NEVER originates numbers — it explains the
// verified figures passed in and proposes actions.

import { NextRequest, NextResponse } from "next/server";
import { generateText } from "ai";
import { tryModels } from "@/lib/ai";

const SYSTEM_PROMPT =
  "You are a manufacturing quality CAPA advisor helping a General Manager decide " +
  "on a Corrective and Preventive Action. You are given ONE flagged recommendation " +
  "and a set of VERIFIED FIGURES computed deterministically from the plant's quality " +
  "records. Rules: (1) Every number you cite MUST come from the verified figures — " +
  "never invent, estimate, or recompute. (2) Be concise and decision-oriented: the GM " +
  "wants to know the likely root cause, the cost at stake, and a concrete action he can " +
  "assign. (3) When asked for an action plan, give 2-4 specific, ownable steps. " +
  "(4) Answer in short scannable Markdown, under ~8 lines, no headings or code fences.";

interface Msg {
  role: "user" | "assistant";
  content: string;
}

export async function POST(req: NextRequest) {
  try {
    const { recommendation, context, messages } = await req.json();
    const history: Msg[] = Array.isArray(messages) ? messages : [];
    const lastUser = [...history].reverse().find((m) => m.role === "user");
    if (!lastUser) {
      return NextResponse.json({ error: "no user message" }, { status: 400 });
    }

    const transcript = history
      .map((m) => `${m.role === "user" ? "GM" : "ADVISOR"}: ${m.content}`)
      .join("\n");

    const prompt = [
      `FLAGGED RECOMMENDATION:\n${recommendation || "(none)"}`,
      "",
      `VERIFIED FIGURES:\n${context || "(none provided)"}`,
      "",
      `CONVERSATION SO FAR:\n${transcript}`,
      "",
      "Reply as ADVISOR to the GM's most recent message. Use only the verified figures.",
    ].join("\n");

    try {
      const { text } = await tryModels((model) =>
        generateText({
          model,
          system: SYSTEM_PROMPT,
          prompt,
          temperature: 0.3,
          maxRetries: 1,
        }),
      );
      return NextResponse.json({ reply: text.trim() || "I couldn't find that in the verified figures." });
    } catch (err) {
      console.error("[capa-advisor] generation failed:", err);
      return NextResponse.json({
        reply:
          "The AI service is currently rate-limited. Based on the flagged figures, " +
          "focus the CAPA on the highest-rejection stage and assign an owner with a due date.",
      });
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[capa-advisor] fatal:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
