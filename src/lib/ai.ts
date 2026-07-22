// src/lib/ai.ts
// AI backend chain: MiniCPM (self-hosted, primary) → Groq (API fallback).
//
// MiniCPM runs on our own servers behind an OpenAI-compatible endpoint
// (vLLM / llama.cpp / SGLang) addressed by MINICPM_BASE_URL. When it's
// unreachable or throttled the request cascades to Groq's free API tier.
// RAIS_AI_BACKEND names a PREFERRED backend (moved to the front) but is NOT
// exclusive — the other still acts as a fallback.

import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import type { LanguageModel } from "ai";

// JSON-capable defaults. Override per-backend via env.
const MODELS = {
  minicpm: { main: "openbmb/MiniCPM5-1B", fast: "openbmb/MiniCPM5-1B" },
  groq:    { main: "llama-3.3-70b-versatile", fast: "llama-3.1-8b-instant" },
} as const;

export type ModelBackend = "minicpm" | "groq";

// Priority order: our own MiniCPM first (no rate limits, data stays in-house),
// Groq as the online fallback.
const DEFAULT_ORDER: readonly ModelBackend[] = ["minicpm", "groq"];

function isAvailable(b: ModelBackend): boolean {
  if (b === "minicpm") return !!process.env.MINICPM_BASE_URL;
  if (b === "groq") return !!process.env.GROQ_API_KEY;
  return false;
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
  if (backend === "minicpm") {
    const baseURL = process.env.MINICPM_BASE_URL;
    if (!baseURL) throw noBackendError();
    // Local servers usually accept any bearer token; MINICPM_API_KEY overrides.
    const apiKey = process.env.MINICPM_API_KEY ?? "local";
    const provider = createOpenAICompatible({ name: "minicpm", apiKey, baseURL });
    const main = process.env.MINICPM_MODEL ?? MODELS.minicpm.main;
    const f = process.env.MINICPM_MODEL_FAST ?? MODELS.minicpm.fast;
    return provider.chatModel(fast ? f : main);
  }

  if (backend === "groq") {
    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey) throw noBackendError();
    const provider = createOpenAICompatible({ name: "groq", apiKey, baseURL: "https://api.groq.com/openai/v1" });
    const main = process.env.GROQ_MODEL ?? MODELS.groq.main;
    const f = process.env.GROQ_MODEL_FAST ?? MODELS.groq.fast;
    return provider.chatModel(fast ? f : main);
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
    "No AI backend is configured. Set MINICPM_BASE_URL (self-hosted) or GROQ_API_KEY in .env.local.",
  );
}
