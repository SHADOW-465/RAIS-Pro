// src/lib/ai.ts
// Multi-provider AI backend for free-tier, rate-limited keys.
//
// Chain (priority order): Groq → NVIDIA NIM → OpenRouter. Every configured
// backend is tried in turn; a rate-limit / failure on one cascades to the next,
// so a single throttled free tier never takes the whole feature down.
// RAIS_AI_BACKEND names a PREFERRED backend (moved to the front) but is NOT
// exclusive — the others still act as fallbacks.

import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import type { LanguageModel } from "ai";

// Free-tier-friendly, JSON-capable defaults. Override per-backend via env.
const MODELS = {
  groq:       { main: "llama-3.3-70b-versatile",       fast: "llama-3.1-8b-instant" },
  nvidia:     { main: "meta/llama-3.3-70b-instruct",   fast: "meta/llama-3.1-8b-instruct" },
  openrouter: { main: "meta-llama/llama-3.3-70b-instruct:free", fast: "meta-llama/llama-3.1-8b-instruct:free" },
} as const;

export type ModelBackend = "groq" | "nvidia" | "openrouter";

// Default reliability order for free tiers: Groq is fastest + most reliable,
// NVIDIA NIM next, OpenRouter (shared free pool) last.
const DEFAULT_ORDER: readonly ModelBackend[] = ["groq", "nvidia", "openrouter"];

function keyFor(b: ModelBackend): string | undefined {
  if (b === "groq") return process.env.GROQ_API_KEY;
  if (b === "nvidia") return process.env.NVIDIA_API_KEY;
  if (b === "openrouter") return process.env.OPENROUTER_API_KEY;
  return undefined;
}

function isAvailable(b: ModelBackend): boolean {
  return !!keyFor(b);
}

/** Configured backends in priority order. RAIS_AI_BACKEND is preferred-first, not exclusive. */
export function availableBackends(): ModelBackend[] {
  const preferred = process.env.RAIS_AI_BACKEND as ModelBackend | undefined;
  const ordered =
    preferred && DEFAULT_ORDER.includes(preferred)
      ? [preferred, ...DEFAULT_ORDER.filter((b) => b !== preferred)]
      : [...DEFAULT_ORDER];
  return ordered.filter(isAvailable);
}

export function resolveModel(backend: ModelBackend, fast: boolean): LanguageModel {
  const apiKey = keyFor(backend);
  if (!apiKey) throw noBackendError();

  if (backend === "groq") {
    const provider = createOpenAICompatible({ name: "groq", apiKey, baseURL: "https://api.groq.com/openai/v1" });
    const main = process.env.GROQ_MODEL ?? MODELS.groq.main;
    const f = process.env.GROQ_MODEL_FAST ?? MODELS.groq.fast;
    return provider.chatModel(fast ? f : main);
  }

  if (backend === "nvidia") {
    const provider = createOpenAICompatible({ name: "nvidia", apiKey, baseURL: "https://integrate.api.nvidia.com/v1" });
    const main = process.env.NVIDIA_MODEL ?? MODELS.nvidia.main;
    const f = process.env.NVIDIA_MODEL_FAST ?? MODELS.nvidia.fast;
    return provider.chatModel(fast ? f : main);
  }

  if (backend === "openrouter") {
    const router = createOpenRouter({ apiKey });
    const main = process.env.OPENROUTER_MODEL ?? MODELS.openrouter.main;
    const f = process.env.OPENROUTER_MODEL_FAST ?? MODELS.openrouter.fast;
    return router.chat(fast ? f : main, { maxTokens: 2000 });
  }

  throw new Error(`Unsupported backend: ${backend}`);
}

/** Highest-priority available backend. Throws if none are configured. */
export function activeBackend(): ModelBackend {
  const backends = availableBackends();
  if (backends.length === 0) throw noBackendError();
  return backends[0];
}

/** Resolve a model handle for the active backend. */
export function getModel(opts: { fast?: boolean } = {}): LanguageModel {
  return resolveModel(activeBackend(), !!opts.fast);
}

/** Errors that mean "this backend is throttled/unavailable — try the next one." */
function isRetriable(err: unknown): boolean {
  const msg = (err instanceof Error ? err.message : String(err)).toLowerCase();
  const status = (err as { statusCode?: number; status?: number })?.statusCode ??
    (err as { status?: number })?.status;
  if (status === 429 || status === 402 || status === 401 || status === 403 || (status && status >= 500)) return true;
  return /rate.?limit|quota|429|402|unauthor|forbidden|payment|insufficient|overload|capacity|timeout|econnreset|fetch failed/.test(msg);
}

/** Run `fn` against each available backend in priority order until one succeeds. */
export async function tryModels<T>(
  fn: (model: LanguageModel) => Promise<T>,
  opts: { fast?: boolean } = {},
): Promise<T> {
  const backends = availableBackends();
  if (backends.length === 0) throw noBackendError();

  let lastError: unknown;
  for (const backend of backends) {
    try {
      const model = resolveModel(backend, !!opts.fast);
      console.log(`[ai] trying ${backend}${opts.fast ? " (fast)" : ""}…`);
      const result = await fn(model);
      console.log(`[ai] ✓ ${backend}`);
      return result;
    } catch (err) {
      lastError = err;
      console.warn(`[ai] ✗ ${backend} failed${isRetriable(err) ? " (retriable, cascading)" : ""}:`, err instanceof Error ? err.message : err);
      // Always continue to the next backend — even non-retriable errors (e.g. a
      // bad model id on one provider) shouldn't kill the whole request.
    }
  }
  throw lastError ?? new Error("All backends failed");
}

function noBackendError(): Error {
  return new Error(
    "No AI backend is configured. Set GROQ_API_KEY, NVIDIA_API_KEY, or OPENROUTER_API_KEY in .env.local.",
  );
}
