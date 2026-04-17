import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from "@/lib/supabase";
import {
  buildManifestPrompt,
  buildPrompt,
  normalizeResult,
  normalizeMergePlan,
  extractJson,
} from '@/lib/analysis-utils';
import { applyMergePlan } from '@/lib/merger';
import type { SheetSummary } from '@/lib/parser';
import type { MergePlan } from '@/types/analysis';

const SYSTEM_PROMPT =
  'You are a senior data analyst. Your only job is to return a single valid JSON object — ' +
  'no markdown fences, no explanation, no preamble. Just raw JSON.';

// ── Provider callers ─────────────────────────────────────────────────────────

async function callAnthropic(prompt: string, maxTokens = 4000): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY not set');

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({
      model: 'claude-sonnet-4-6',
      max_tokens: maxTokens,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: prompt }],
    }),
  });
  if (!res.ok) throw new Error(`Anthropic ${res.status}: ${await res.text()}`);
  return (await res.json()).content[0].text;
}

async function callOpenRouter(prompt: string, maxTokens = 4000): Promise<string> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) throw new Error('OPENROUTER_API_KEY not set');

  const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json', 'HTTP-Referer': 'https://rais-pro.vercel.app', 'X-Title': 'RAIS Pro' },
    body: JSON.stringify({
      model: 'anthropic/claude-sonnet-4-6',
      max_tokens: maxTokens,
      temperature: 0.1,
      messages: [{ role: 'system', content: SYSTEM_PROMPT }, { role: 'user', content: prompt }],
    }),
  });
  if (!res.ok) throw new Error(`OpenRouter ${res.status}: ${await res.text()}`);
  return (await res.json()).choices[0].message.content;
}

async function callGroq(prompt: string, maxTokens = 4000): Promise<string> {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) throw new Error('GROQ_API_KEY not set');

  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'llama-3.3-70b-versatile',
      max_tokens: maxTokens,
      temperature: 0.1,
      messages: [{ role: 'system', content: SYSTEM_PROMPT }, { role: 'user', content: prompt }],
    }),
  });
  if (!res.ok) throw new Error(`Groq ${res.status}: ${await res.text()}`);
  return (await res.json()).choices[0].message.content;
}

const PROVIDERS: Array<{ name: string; fn: (p: string, t: number) => Promise<string> }> = [
  { name: 'Anthropic',  fn: callAnthropic  },
  { name: 'OpenRouter', fn: callOpenRouter },
  { name: 'Groq',       fn: callGroq       },
];

async function callAI(prompt: string, maxTokens = 4000): Promise<string> {
  const errors: string[] = [];
  for (const { name, fn } of PROVIDERS) {
    try {
      console.log(`[analyze] trying ${name}…`);
      const result = await fn(prompt, maxTokens);
      console.log(`[analyze] success via ${name}`);
      return result;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[analyze] ${name} failed:`, msg);
      errors.push(`${name}: ${msg}`);
    }
  }
  throw new Error(`All providers failed — ${errors.join(' | ')}`);
}

// ── Fallback merge plan for single-sheet uploads ─────────────────────────────

function buildFallbackMergePlan(summaries: SheetSummary[]): MergePlan {
  // When there's only one sheet (or all sheets clearly come from one source),
  // skip the AI classification round-trip and just include everything.
  return {
    groups: [{
      label: 'All Data',
      sheets: summaries.map(s => s.name),
      reason: 'Single source — no deduplication needed',
    }],
    excludedSheets: [],
    crossFileStrategy: 'sum',
    warnings: [],
  };
}

// ── Route handler ────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    const { summaries, deviceId, fileNames } = await req.json() as {
      summaries: SheetSummary[];
      deviceId?: string;
      fileNames?: string[];
    };

    if (!Array.isArray(summaries) || summaries.length === 0) {
      return NextResponse.json({ error: 'No summaries provided' }, { status: 400 });
    }

    // ── Phase 1: Deduplication / merge plan ─────────────────────────────────
    // Skip AI classification for single-sheet uploads (saves latency + cost)
    let mergePlan: MergePlan;

    const manifests = summaries.map(s => s.manifest).filter(Boolean);
    const needsClassification = summaries.length > 1;

    if (needsClassification && manifests.length > 0) {
      console.log('[analyze] Phase 1: manifest classification…');
      try {
        const manifestPrompt = buildManifestPrompt(manifests);
        // Manifest response is small — cap tokens to keep this fast
        const manifestText = await callAI(manifestPrompt, 1000);
        mergePlan = normalizeMergePlan(extractJson(manifestText));

        // Safety: ensure every sheet appears in the plan
        const plannedSheets = new Set([
          ...mergePlan.groups.flatMap(g => g.sheets),
          ...mergePlan.excludedSheets.map(e => e.sheet),
        ]);
        const orphans = summaries.map(s => s.name).filter(k => !plannedSheets.has(k));
        if (orphans.length > 0) {
          // Add orphans to the first group rather than silently dropping them
          if (mergePlan.groups.length > 0) {
            mergePlan.groups[0].sheets.push(...orphans);
          } else {
            mergePlan.groups.push({ label: 'Data', sheets: orphans, reason: 'auto-assigned' });
          }
        }
      } catch (planErr) {
        console.warn('[analyze] manifest classification failed, using fallback:', planErr);
        mergePlan = buildFallbackMergePlan(summaries);
      }
    } else {
      mergePlan = buildFallbackMergePlan(summaries);
    }

    console.log('[analyze] MergePlan groups:', mergePlan.groups.map(g => `${g.label}(${g.sheets.length})`).join(', '));
    if (mergePlan.excludedSheets.length > 0) {
      console.log('[analyze] Excluded sheets:', mergePlan.excludedSheets.map(e => e.sheet).join(', '));
    }

    // ── Phase 2: Deterministic aggregation ──────────────────────────────────
    const mergedResult = applyMergePlan(summaries, mergePlan);

    // ── Phase 3: Dashboard generation ───────────────────────────────────────
    const dashboardPrompt = buildPrompt(mergedResult, summaries);
    const dashboardText   = await callAI(dashboardPrompt, 4000);
    const result          = normalizeResult(extractJson(dashboardText));

    // ── Save to Supabase (best-effort) ───────────────────────────────────────
    let sessionId: string | null = null;
    try {
      if (deviceId && typeof deviceId === 'string') {
        const db = createServerClient();
        const { data: session } = await db
          .from('sessions')
          .insert({
            device_id: deviceId,
            title:     result.dashboardTitle ?? 'Analysis',
            files:     Array.isArray(fileNames) ? fileNames.map((n: string) => ({ name: n })) : [],
            dashboard: result,
          })
          .select('id')
          .single();
        sessionId = session?.id ?? null;
      }
    } catch (saveErr) {
      console.warn('[analyze] session save failed (non-fatal):', saveErr);
    }

    return NextResponse.json({ ...result, sessionId, mergePlan });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[analyze] fatal error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
