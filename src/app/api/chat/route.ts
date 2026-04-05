// src/app/api/chat/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { normalizeResult, extractJson } from '@/lib/analysis-utils';
import type { DashboardConfig } from '@/types/dashboard';

const SYSTEM_PROMPT =
  'You are a data analyst assistant. Given a dataset summary, the current dashboard config, ' +
  'conversation history, and a user question, return exactly one of these two JSON shapes:\n' +
  '1. {"type":"answer","text":"..."} for factual questions about the data\n' +
  '2. {"type":"refresh","config":{...full DashboardConfig...}} when the user asks to re-analyze, ' +
  'refocus, or change the dashboard view\n' +
  'Return only raw JSON. No markdown, no preamble.';

function buildChatPrompt(
  question: string,
  history: { role: string; content: string }[],
  dataSummary: string,
  currentConfig: DashboardConfig,
): string {
  const historyText = history
    .map(m => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}`)
    .join('\n');

  return `DATASET SUMMARY:
${dataSummary}

CURRENT DASHBOARD CONFIG:
${JSON.stringify(currentConfig, null, 2).slice(0, 3000)}

CONVERSATION HISTORY:
${historyText || '(none)'}

USER QUESTION: ${question}

Return {"type":"answer","text":"..."} or {"type":"refresh","config":{...DashboardConfig...}}.`;
}

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

export async function POST(req: NextRequest) {
  try {
    const { question, history, dataSummary, currentConfig } = await req.json();

    if (!question || typeof question !== 'string') {
      return NextResponse.json({ error: 'question is required' }, { status: 400 });
    }

    const prompt = buildChatPrompt(
      question,
      Array.isArray(history) ? history.slice(-10) : [],
      String(dataSummary ?? ''),
      currentConfig ?? {},
    );

    const providers: Array<{ name: string; fn: (p: string) => Promise<string> }> = [
      { name: 'Anthropic',  fn: callAnthropic  },
      { name: 'OpenRouter', fn: callOpenRouter },
      { name: 'Groq',       fn: callGroq       },
    ];

    const errors: string[] = [];

    for (const { name, fn } of providers) {
      try {
        console.log(`[chat] trying ${name}…`);
        const text = await fn(prompt);
        const raw  = extractJson(text) as any;

        if (raw.type === 'answer' && typeof raw.text === 'string') {
          return NextResponse.json({ type: 'answer', text: raw.text });
        }

        if (raw.type === 'refresh' && raw.config) {
          return NextResponse.json({
            type: 'refresh',
            config: normalizeResult(raw.config),
          });
        }

        throw new Error(`Unexpected response shape: ${JSON.stringify(raw).slice(0, 200)}`);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`[chat] ${name} failed:`, msg);
        errors.push(`${name}: ${msg}`);
      }
    }

    return NextResponse.json(
      { error: `All providers failed — ${errors.join(' | ')}` },
      { status: 500 },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
