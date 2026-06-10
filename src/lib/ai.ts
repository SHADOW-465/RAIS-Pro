// src/lib/ai.ts
// Single-provider AI backend using OpenRouter.
//

import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import type { LanguageModel } from "ai";

const MODELS = {
  openrouter: { main: "openrouter/free", fast: "openrouter/free" },
} as const;

export type ModelBackend = "openrouter";

const ALL_BACKENDS: readonly ModelBackend[] = ["openrouter"];

function isAvailable(b: ModelBackend): boolean {
  return !!process.env.OPENROUTER_API_KEY;
}

/** Returns backends with credentials present. */
export function availableBackends(): ModelBackend[] {
  return ALL_BACKENDS.filter(isAvailable);
}

function resolveModel(backend: ModelBackend, fast: boolean): LanguageModel {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    throw noBackendError();
  }
  const router = createOpenRouter({ apiKey });
  const mainModel = process.env.OPENROUTER_MODEL      ?? MODELS.openrouter.main;
  const fastModel = process.env.OPENROUTER_MODEL_FAST ?? MODELS.openrouter.fast;
  return router.chat(fast ? fastModel : mainModel, { maxTokens: 2000 });
}

/** Highest-priority available backend. Throws if none are configured. */
export function activeBackend(): ModelBackend {
  const backends = availableBackends();
  if (backends.length === 0) throw noBackendError();
  return backends[0];
}

/** Resolve a model handle from OpenRouter. */
export function getModel(opts: { fast?: boolean } = {}): LanguageModel {
  return resolveModel(activeBackend(), !!opts.fast);
}

/**
 * Run `fn` against the OpenRouter backend.
 */
export async function tryModels<T>(
  fn: (model: LanguageModel) => Promise<T>,
  opts: { fast?: boolean } = {},
): Promise<T> {
  const backends = availableBackends();
  if (backends.length === 0) throw noBackendError();

  const model = resolveModel("openrouter", !!opts.fast);
  console.log(`[ai] trying openrouter${opts.fast ? " (fast)" : ""}…`);
  const result = await fn(model);
  console.log(`[ai] ✓ openrouter`);
  return result;
}

function noBackendError(): Error {
  return new Error(
    "OpenRouter backend is not configured. Set OPENROUTER_API_KEY in .env.local.",
  );
}
