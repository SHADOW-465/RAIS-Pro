// scripts/check-ai.ts
// Pings OpenRouter with a minimal generateObject call and reports status.
//
// Usage:
//   npm run check:ai
//

import "dotenv/config";
import { generateObject } from "ai";
import { z } from "zod";
import {
  availableBackends,
  resolveModel,
  type ModelBackend,
} from "../src/lib/ai";

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
    console.error("✗ No backends configured. Set NVIDIA_API_KEY or OPENROUTER_API_KEY in .env.local.");
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
    console.log("✓ AI backends are healthy.");
    process.exit(0);
  } else {
    console.error("✗ AI backends failed. Fix credentials or model IDs.");
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
