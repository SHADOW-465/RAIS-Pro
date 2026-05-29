// scripts/check-ai.ts
// Pings every configured AI backend with a minimal generateObject call and
// reports green/red per backend. Useful for verifying credentials, model
// availability, and structured-output support without hitting the full
// analyze pipeline.
//
// Usage:
//   npm run check:ai
//
// Exits 0 if at least one backend is healthy, 1 otherwise.

import "dotenv/config";
import { generateObject } from "ai";
import { z } from "zod";
import {
  availableBackends,
  type ModelBackend,
} from "../src/lib/ai";

// We can't directly import the private resolveModel function — re-route
// through tryModels but force a single backend per call by setting
// RAIS_AI_BACKEND. Simpler approach: replicate resolveModel here.
import { anthropic } from "@ai-sdk/anthropic";
import { google } from "@ai-sdk/google";
import { groq } from "@ai-sdk/groq";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import type { LanguageModel } from "ai";

const MODELS = {
  gateway:    { main: "anthropic/claude-sonnet-4.6",       fast: "anthropic/claude-haiku-4.5"        },
  anthropic:  { main: "claude-sonnet-4-6",                 fast: "claude-haiku-4-5"                  },
  openrouter: { main: "nvidia/nemotron-3-super-120b-a12b:free", fast: "nvidia/nemotron-3-super-120b-a12b:free" },
  google:     { main: "gemini-2.5-flash",                  fast: "gemini-2.5-flash-lite"             },
  groq:       { main: "openai/gpt-oss-120b",               fast: "openai/gpt-oss-20b"                },
} as const;

function resolveModel(backend: ModelBackend, fast: boolean): LanguageModel {
  if (backend === "gateway") {
    const id = fast ? MODELS.gateway.fast : MODELS.gateway.main;
    return id as unknown as LanguageModel;
  }
  if (backend === "anthropic") {
    return anthropic(fast ? MODELS.anthropic.fast : MODELS.anthropic.main);
  }
  if (backend === "openrouter") {
    const router = createOpenRouter({ apiKey: process.env.OPENROUTER_API_KEY! });
    const mainModel = process.env.OPENROUTER_MODEL      ?? MODELS.openrouter.main;
    const fastModel = process.env.OPENROUTER_MODEL_FAST ?? MODELS.openrouter.fast;
    return router.chat(fast ? fastModel : mainModel);
  }
  if (backend === "google") {
    return google(fast ? MODELS.google.fast : MODELS.google.main);
  }
  if (backend === "groq") {
    return groq(fast ? MODELS.groq.fast : MODELS.groq.main);
  }
  const baseURL = process.env.OLLAMA_BASE_URL!;
  const ollama = createOpenAICompatible({
    name: "ollama",
    baseURL: baseURL.replace(/\/$/, "") + "/v1",
  });
  const mainModel = process.env.OLLAMA_MODEL ?? "qwen2.5:3b";
  const fastModel = process.env.OLLAMA_MODEL_FAST ?? mainModel;
  return ollama(fast ? fastModel : mainModel);
}

// Minimal schema — exercises the same JSON-schema features the real
// pipeline uses: a small object with required string + integer + nullable
// fields. If a provider rejects this, it would reject DashboardConfigSchema too.
const PingSchema = z.object({
  status: z.string().describe("Always 'ok'"),
  score: z.number().int().describe("Integer 0 to 10"),
  note: z.string().nullable().describe("Optional note, null if none"),
});

const PROMPT =
  "Return: { status: 'ok', score: 7, note: null }. " +
  "Use the exact strings and numbers shown.";

async function check(backend: ModelBackend, fast: boolean): Promise<{
  ok: boolean;
  latencyMs: number;
  detail: string;
}> {
  const t0 = Date.now();
  try {
    const model = resolveModel(backend, fast);
    const { object } = await generateObject({
      model,
      schema: PingSchema,
      prompt: PROMPT,
      temperature: 0,
    });
    const latencyMs = Date.now() - t0;
    return {
      ok: true,
      latencyMs,
      detail: `status=${object.status} score=${object.score}`,
    };
  } catch (err) {
    const latencyMs = Date.now() - t0;
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, latencyMs, detail: msg.slice(0, 200) };
  }
}

function pad(s: string, n: number): string {
  return s + " ".repeat(Math.max(0, n - s.length));
}

async function main() {
  const backends = availableBackends();
  if (backends.length === 0) {
    console.error("✗ No backends configured. Set at least one API key in .env.local.");
    process.exit(1);
  }

  console.log(`\nConfigured backends: ${backends.join(", ")}\n`);
  console.log(pad("BACKEND", 12) + pad("MODE", 8) + pad("STATUS", 10) + pad("LATENCY", 10) + "DETAIL");
  console.log("─".repeat(90));

  let anyHealthy = false;
  for (const backend of backends) {
    for (const fast of [false, true]) {
      const { ok, latencyMs, detail } = await check(backend, fast);
      const mode = fast ? "fast" : "main";
      const status = ok ? "✓ OK" : "✗ FAIL";
      const latency = `${latencyMs}ms`;
      console.log(
        pad(backend, 12) + pad(mode, 8) + pad(status, 10) + pad(latency, 10) + detail,
      );
      if (ok) anyHealthy = true;
    }
  }

  console.log();
  if (anyHealthy) {
    console.log("✓ At least one backend is healthy — failover chain will work.");
    process.exit(0);
  } else {
    console.error("✗ Every backend failed. Fix credentials or model IDs.");
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
