// src/app/api/chat/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { normalizeResult, extractJson } from '@/lib/analysis-utils';
import type { DashboardConfig } from '@/types/dashboard';

const SYSTEM_PROMPT =
  'You are a data analyst. Given a dataset summary and a user question, return a single valid JSON object — no markdown, no preamble.\n\n' +
  'Return this exact shape:\n' +
  '{\n' +
  '  "question": "<the user question>",\n' +
  '  "headline": "<one sentence finding that MUST contain a specific number>",\n' +
  '  "charts": [ /* 1 chart for simple questions, 2 for comparative questions */ ],\n' +
  '  "bullets": [ /* exactly 3-4 strings, each referencing a specific data point */ ]\n' +
  '}\n\n' +
  'Each chart must follow: { "title": "...", "type": "bar"|"line"|"doughnut", "data": { "labels": [...], "datasets": [{ "label": "...", "data": [...numbers...] }] } }\n' +
  'Only use data values present in the dataset summary. Never invent numbers.';

function buildChatPrompt(
  question: string,
  dataSummary: string,
  currentConfig: DashboardConfig,
): string {
  return `DATASET SUMMARY:
${dataSummary}

DASHBOARD CONTEXT (current KPIs):
${JSON.stringify(currentConfig?.kpis ?? [], null, 2).slice(0, 1500)}

USER QUESTION: ${question}

Return the insight slide JSON object now.`;
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
    const { question, dataSummary, currentConfig } = await req.json();

    if (!question || typeof question !== 'string') {
      return NextResponse.json({ error: 'question is required' }, { status: 400 });
    }

    const prompt = buildChatPrompt(
      question,
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

        // Validate the slide shape
        if (
          typeof raw.headline === "string" &&
          Array.isArray(raw.charts) &&
          Array.isArray(raw.bullets)
        ) {
          const slide = {
            question,
            headline: raw.headline,
            charts: raw.charts,
            bullets: raw.bullets,
            createdAt: new Date().toISOString(),
          };
          return NextResponse.json({ type: "slide", slide });
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
