// src/lib/ai.ts
// Multi-provider AI backend supporting NVIDIA NIM and OpenRouter.
//

import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import type { LanguageModel } from "ai";

const MODELS = {
  nvidia: { main: "meta/llama-3.3-70b-instruct", fast: "meta/llama-3.1-8b-instruct" },
  openrouter: { main: "openrouter/free", fast: "openrouter/free" },
} as const;

export type ModelBackend = "nvidia" | "openrouter";

const ALL_BACKENDS: readonly ModelBackend[] = ["nvidia", "openrouter"];

function isAvailable(b: ModelBackend): boolean {
  if (b === "nvidia") {
    return !!process.env.NVIDIA_API_KEY;
  }
  if (b === "openrouter") {
    return !!process.env.OPENROUTER_API_KEY;
  }
  return false;
}

/** Returns backends with credentials present. */
export function availableBackends(): ModelBackend[] {
  const forceBackend = process.env.RAIS_AI_BACKEND as ModelBackend | undefined;
  if (forceBackend && ALL_BACKENDS.includes(forceBackend)) {
    if (isAvailable(forceBackend)) {
      return [forceBackend];
    }
  }
  return ALL_BACKENDS.filter(isAvailable);
}

export function resolveModel(backend: ModelBackend, fast: boolean): LanguageModel {
  if (backend === "nvidia") {
    const apiKey = process.env.NVIDIA_API_KEY;
    if (!apiKey) {
      throw noBackendError();
    }
    const provider = createOpenAICompatible({
      name: "nvidia",
      apiKey,
      baseURL: "https://integrate.api.nvidia.com/v1",
    });
    const mainModel = process.env.NVIDIA_MODEL      ?? MODELS.nvidia.main;
    const fastModel = process.env.NVIDIA_MODEL_FAST ?? MODELS.nvidia.fast;
    return provider.chatModel(fast ? fastModel : mainModel);
  }

  if (backend === "openrouter") {
    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) {
      throw noBackendError();
    }
    const router = createOpenRouter({ apiKey });
    const mainModel = process.env.OPENROUTER_MODEL      ?? MODELS.openrouter.main;
    const fastModel = process.env.OPENROUTER_MODEL_FAST ?? MODELS.openrouter.fast;
    return router.chat(fast ? fastModel : mainModel, { maxTokens: 2000 });
  }

  throw new Error(`Unsupported backend: ${backend}`);
}

/** Highest-priority available backend. Throws if none are configured. */
export function activeBackend(): ModelBackend {
  const backends = availableBackends();
  if (backends.length === 0) throw noBackendError();
  return backends[0];
}

/** Resolve a model handle. */
export function getModel(opts: { fast?: boolean } = {}): LanguageModel {
  return resolveModel(activeBackend(), !!opts.fast);
}

/**
 * Run `fn` against the available backends in priority order.
 */
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
      console.warn(`[ai] ✗ ${backend} failed:`, err);
      lastError = err;
    }
  }

  throw lastError ?? new Error("All backends failed");
}

function noBackendError(): Error {
  return new Error(
    "No AI backend is configured. Set NVIDIA_API_KEY or OPENROUTER_API_KEY in .env.local.",
  );
}

