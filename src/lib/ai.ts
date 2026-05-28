// src/lib/ai.ts
// Single source of truth for which model the app talks to.
//
// Priority order (first match wins):
//   1. Vercel AI Gateway  — preferred; set AI_GATEWAY_API_KEY (or rely on
//      OIDC when deployed on Vercel). Models are addressed via
//      "provider/model" strings, with built-in observability and failover.
//   2. Direct Anthropic   — set ANTHROPIC_API_KEY. Useful for local dev
//      without a Gateway key.
//   3. Ollama (local)     — set OLLAMA_BASE_URL (and optionally OLLAMA_MODEL,
//      OLLAMA_MODEL_FAST). OpenAI-compatible endpoint.
//
// `fast` selects a smaller/cheaper model for the manifest classification
// phase, where strict accuracy matters less than latency.

import { anthropic } from "@ai-sdk/anthropic";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import type { LanguageModel } from "ai";

// Gateway model IDs (verified live from https://ai-gateway.vercel.sh/v1/models).
// Sonnet 4.6 is the current latest editorial-grade model; Haiku 4.5 is the
// fastest small model that still returns reliable structured JSON.
const GATEWAY_MAIN = "anthropic/claude-sonnet-4.6";
const GATEWAY_FAST = "anthropic/claude-haiku-4.5";

// Direct-Anthropic model IDs (same family, no "anthropic/" prefix).
const ANTHROPIC_MAIN = "claude-sonnet-4-6";
const ANTHROPIC_FAST = "claude-haiku-4-5";

export type ModelBackend = "gateway" | "anthropic" | "ollama";

export function activeBackend(): ModelBackend {
  if (process.env.AI_GATEWAY_API_KEY || process.env.VERCEL) return "gateway";
  if (process.env.ANTHROPIC_API_KEY) return "anthropic";
  if (process.env.OLLAMA_BASE_URL) return "ollama";
  throw new Error(
    "No AI backend configured. Set AI_GATEWAY_API_KEY (recommended), " +
      "ANTHROPIC_API_KEY, or OLLAMA_BASE_URL.",
  );
}

/** Resolve the right model handle for the current backend. */
export function getModel(opts: { fast?: boolean } = {}): LanguageModel {
  const fast = !!opts.fast;
  const backend = activeBackend();

  if (backend === "gateway") {
    // AI SDK v6 accepts plain "provider/model" strings and routes through
    // the gateway automatically.
    return (fast ? GATEWAY_FAST : GATEWAY_MAIN) as unknown as LanguageModel;
  }

  if (backend === "anthropic") {
    return anthropic(fast ? ANTHROPIC_FAST : ANTHROPIC_MAIN);
  }

  // Ollama via OpenAI-compatible endpoint.
  const baseURL = process.env.OLLAMA_BASE_URL!;
  const ollama = createOpenAICompatible({
    name: "ollama",
    baseURL: baseURL.replace(/\/$/, "") + "/v1",
  });
  const mainModel = process.env.OLLAMA_MODEL ?? "qwen2.5:3b";
  const fastModel = process.env.OLLAMA_MODEL_FAST ?? mainModel;
  return ollama(fast ? fastModel : mainModel);
}
