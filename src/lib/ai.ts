// src/lib/ai.ts
// Multi-provider AI backend with automatic failover.
//
// `tryModels(fn)` walks the chain in priority order — the first provider
// with credentials gets tried first; if it errors (rate limit, credit
// exhausted, transient 5xx), the next one is tried. This gives clean
// "use whichever provider is available" semantics across paid and free
// tiers, which is what a factory-floor deployment needs.
//
// ── Provider chain (priority order) ─────────────────────────────────────────
//   1. Vercel AI Gateway   AI_GATEWAY_API_KEY  | OIDC on Vercel
//      Routes "provider/model" strings, with observability + per-call cost.
//      Recommended for production.
//
//   2. Anthropic direct    ANTHROPIC_API_KEY
//      Claude Sonnet 4.6 / Haiku 4.5. Best narrative quality.
//
//   3. OpenRouter          OPENROUTER_API_KEY
//      Multiplexer over 100+ models. Defaults to free DeepSeek + Llama
//      endpoints; override with OPENROUTER_MODEL / OPENROUTER_MODEL_FAST.
//
//   4. Google Gemini       GOOGLE_GENERATIVE_AI_API_KEY
//      Free tier available. Gemini 2.5 Flash for both phases.
//
//   5. Groq                GROQ_API_KEY
//      Free tier, fast. openai/gpt-oss family (Llama 3.3 lacks json_schema).
//
//   6. Ollama (offline)    OLLAMA_BASE_URL
//      Local llama.cpp / qwen / mistral. Last resort.
//
// To pin a specific backend (skip the chain), set RAIS_AI_BACKEND to
// gateway | anthropic | openrouter | google | groq | ollama.

import { anthropic } from "@ai-sdk/anthropic";
import { google } from "@ai-sdk/google";
import { groq } from "@ai-sdk/groq";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import type { LanguageModel } from "ai";

// ── Model IDs (verified live from ai-gateway.vercel.sh/v1/models). ──────────
// Update when a stronger model ships — these are the long-lived aliases.
//
// Groq note: only specific Groq models support `json_schema` response format,
// which is what generateObject() uses. Llama 3.3 does NOT; gpt-oss DOES.
// See https://console.groq.com/docs/structured-outputs
//
// OpenRouter note: defaults to free DeepSeek/Llama; override with env to
// route through paid models (e.g. anthropic/claude-sonnet-4.6) without
// changing code.
const MODELS = {
  gateway:    { main: "anthropic/claude-sonnet-4.6",       fast: "anthropic/claude-haiku-4.5"        },
  anthropic:  { main: "claude-sonnet-4-6",                 fast: "claude-haiku-4-5"                  },
  openrouter: { main: "nvidia/nemotron-3-super-120b-a12b:free", fast: "nvidia/nemotron-3-super-120b-a12b:free" },
  google:     { main: "gemini-2.5-flash",                  fast: "gemini-2.5-flash-lite"             },
  groq:       { main: "openai/gpt-oss-120b",               fast: "openai/gpt-oss-20b"                },
} as const;

export type ModelBackend =
  | "gateway"
  | "anthropic"
  | "openrouter"
  | "google"
  | "groq"
  | "ollama";

const ALL_BACKENDS: readonly ModelBackend[] = [
  "gateway",
  "anthropic",
  "openrouter",
  "google",
  "groq",
  "ollama",
];

// ── Backend availability ────────────────────────────────────────────────────

function isAvailable(b: ModelBackend): boolean {
  switch (b) {
    case "gateway":    return !!(process.env.AI_GATEWAY_API_KEY || process.env.VERCEL);
    case "anthropic":  return !!process.env.ANTHROPIC_API_KEY;
    case "openrouter": return !!process.env.OPENROUTER_API_KEY;
    case "google":     return !!process.env.GOOGLE_GENERATIVE_AI_API_KEY;
    case "groq":       return !!process.env.GROQ_API_KEY;
    case "ollama":     return !!process.env.OLLAMA_BASE_URL;
  }
}

/** Returns backends with credentials present, in priority order. */
export function availableBackends(): ModelBackend[] {
  const forced = process.env.RAIS_AI_BACKEND as ModelBackend | undefined;
  if (forced) {
    if (!ALL_BACKENDS.includes(forced)) {
      throw new Error(
        `Invalid RAIS_AI_BACKEND="${forced}". Use one of: ${ALL_BACKENDS.join(", ")}.`,
      );
    }
    return [forced];
  }
  return ALL_BACKENDS.filter(isAvailable);
}

// ── Model resolution ────────────────────────────────────────────────────────

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
  // Ollama via OpenAI-compatible endpoint
  const baseURL = process.env.OLLAMA_BASE_URL!;
  const ollama = createOpenAICompatible({
    name: "ollama",
    baseURL: baseURL.replace(/\/$/, "") + "/v1",
  });
  const mainModel = process.env.OLLAMA_MODEL ?? "qwen2.5:3b";
  const fastModel = process.env.OLLAMA_MODEL_FAST ?? mainModel;
  return ollama(fast ? fastModel : mainModel);
}

/** Highest-priority available backend. Throws if none are configured. */
export function activeBackend(): ModelBackend {
  const backends = availableBackends();
  if (backends.length === 0) throw noBackendError();
  return backends[0];
}

/** Resolve a model handle from the default (highest-priority) backend. */
export function getModel(opts: { fast?: boolean } = {}): LanguageModel {
  return resolveModel(activeBackend(), !!opts.fast);
}

// ── Failover wrapper ────────────────────────────────────────────────────────

/**
 * Run `fn` against each available backend in priority order, returning the
 * first successful result. Throws an aggregated error if every backend fails.
 *
 *   const { object } = await tryModels(
 *     (model) => generateObject({ model, schema, prompt }),
 *     { fast: true },
 *   );
 *
 * Errors are logged but otherwise swallowed for non-terminal providers so a
 * single dead backend (out of credit, rate limited, network blip) doesn't
 * fail the whole request.
 */
export async function tryModels<T>(
  fn: (model: LanguageModel) => Promise<T>,
  opts: { fast?: boolean } = {},
): Promise<T> {
  const backends = availableBackends();
  if (backends.length === 0) throw noBackendError();

  const errors: string[] = [];
  for (const backend of backends) {
    try {
      const model = resolveModel(backend, !!opts.fast);
      console.log(`[ai] trying ${backend}${opts.fast ? " (fast)" : ""}…`);
      const result = await fn(model);
      console.log(`[ai] ✓ ${backend}`);
      return result;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(`[ai] ✗ ${backend}: ${msg.slice(0, 200)}`);
      errors.push(`${backend}: ${msg}`);
    }
  }
  throw new Error(`All AI backends failed — ${errors.join(" | ")}`);
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function noBackendError(): Error {
  return new Error(
    "No AI backend configured. Set one or more of: AI_GATEWAY_API_KEY " +
      "(recommended), ANTHROPIC_API_KEY, OPENROUTER_API_KEY, " +
      "GOOGLE_GENERATIVE_AI_API_KEY, GROQ_API_KEY, OLLAMA_BASE_URL.",
  );
}
