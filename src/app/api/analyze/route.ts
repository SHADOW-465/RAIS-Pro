import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from "@/lib/supabase";
import { buildPrompt, normalizeResult, extractJson } from '@/lib/analysis-utils';

const SYSTEM_PROMPT =
  'You are a senior data analyst. Your only job is to return a single valid JSON object — ' +
  'no markdown fences, no explanation, no preamble. Just raw JSON.';

// ── Provider callers ─────────────────────────────────────────────────────────

async function callAnthropic(prompt: string): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY not set');

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-6',
      max_tokens: 4000,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: prompt }],
    }),
  });

  if (!res.ok) throw new Error(`Anthropic ${res.status}: ${await res.text()}`);
  const d = await res.json();
  return d.content[0].text;
}

async function callOpenRouter(prompt: string): Promise<string> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) throw new Error('OPENROUTER_API_KEY not set');

  const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'https://rais-pro.vercel.app',
      'X-Title': 'RAIS Pro',
    },
    body: JSON.stringify({
      model: 'anthropic/claude-sonnet-4-6',
      max_tokens: 4000,
      temperature: 0.1,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: prompt },
      ],
    }),
  });

  if (!res.ok) throw new Error(`OpenRouter ${res.status}: ${await res.text()}`);
  const d = await res.json();
  return d.choices[0].message.content;
}

async function callGroq(prompt: string): Promise<string> {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) throw new Error('GROQ_API_KEY not set');

  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'llama-3.3-70b-versatile',
      max_tokens: 4000,
      temperature: 0.1,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: prompt },
      ],
    }),
  });

  if (!res.ok) throw new Error(`Groq ${res.status}: ${await res.text()}`);
  const d = await res.json();
  return d.choices[0].message.content;
}

// ── Route handler ────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    const { summaries, deviceId, fileNames } = await req.json();
    const prompt = buildPrompt(summaries);

    const providers: Array<{ name: string; fn: (p: string) => Promise<string> }> = [
      { name: 'Anthropic',  fn: callAnthropic  },
      { name: 'OpenRouter', fn: callOpenRouter },
      { name: 'Groq',       fn: callGroq       },
    ];

    const errors: string[] = [];

    for (const { name, fn } of providers) {
      try {
        console.log(`[analyze] trying ${name}…`);
        const text   = await fn(prompt);
        const result = normalizeResult(extractJson(text));
        // Save session to Supabase (best-effort — don't fail analysis if save fails)
        let sessionId: string | null = null;
        try {
          if (deviceId && typeof deviceId === "string") {
            const db = createServerClient();
            const { data: session } = await db
              .from("sessions")
              .insert({
                device_id: deviceId,
                title: result.dashboardTitle ?? "Analysis",
                files: Array.isArray(fileNames)
                  ? fileNames.map((name: string) => ({ name }))
                  : [],
                dashboard: result,
              })
              .select("id")
              .single();
            sessionId = session?.id ?? null;
          }
        } catch (saveErr) {
          console.warn("[analyze] session save failed (non-fatal):", saveErr);
        }

        console.log(`[analyze] success via ${name}`);
        return NextResponse.json({ ...result, sessionId });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`[analyze] ${name} failed:`, msg);
        errors.push(`${name}: ${msg}`);
      }
    }

    return NextResponse.json(
      { error: `All providers failed — ${errors.join(' | ')}` },
      { status: 500 }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
