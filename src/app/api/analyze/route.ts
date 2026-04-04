import { NextRequest, NextResponse } from 'next/server';

const SYSTEM_PROMPT =
  'You are a senior manufacturing data analyst. Your only job is to return a single valid JSON object — ' +
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

// ── JSON extraction ──────────────────────────────────────────────────────────

function extractJson(text: string): unknown {
  const t = text.trim();
  try { return JSON.parse(t); } catch { /* fall through */ }

  const fenced = t.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenced) {
    try { return JSON.parse(fenced[1].trim()); } catch { /* fall through */ }
  }

  const start = t.indexOf('{');
  const end = t.lastIndexOf('}');
  if (start !== -1 && end > start) {
    try { return JSON.parse(t.slice(start, end + 1)); } catch { /* fall through */ }
  }

  throw new Error('Could not extract valid JSON from AI response');
}

// ── Prompt builder ───────────────────────────────────────────────────────────

function buildPrompt(summaries: unknown): string {
  const data = JSON.stringify(summaries, null, 2).slice(0, 12000);

  return `Analyze this operational Excel data and return a JSON object matching EXACTLY this schema.

SCHEMA:
{
  "executiveSummary": "2–3 sentence plain-language brief for a General Manager. Reference specific numbers.",

  "kpis": {
    "rejectionRate": { "value": "number or 'N/A'", "trend": 0, "context": "short label" },
    "totalOutput":   { "value": "number or formatted string like '14.2k'", "trend": 0, "context": "short label" },
    "downtime":      { "value": 0, "trend": 0, "context": "short label", "unit": "m or h or %" },
    "qualityScore":  { "value": 0.0, "trend": 0, "context": "short label" }
  },

  "insights": [
    "Specific insight referencing actual data values",
    "...", "...", "...", "..."
  ],

  "recommendations": [
    "Short actionable recommendation",
    "...", "...", "..."
  ],

  "charts": [
    {
      "title": "Chart title from data",
      "type": "line",
      "data": {
        "labels": ["label1", "label2", "label3"],
        "datasets": [{
          "label": "Series name",
          "data": [10, 20, 30],
          "borderColor": "#00E5CC",
          "backgroundColor": "rgba(0, 229, 204, 0.1)",
          "fill": true,
          "tension": 0.4
        }]
      }
    },
    {
      "title": "Second chart title",
      "type": "bar",
      "data": {
        "labels": ["label1", "label2", "label3"],
        "datasets": [{
          "label": "Series name",
          "data": [40, 60, 80],
          "backgroundColor": "#00E5CC"
        }]
      }
    }
  ],

  "alerts": []
}

RULES:
- All KPI values must come from the actual data. Use "N/A" and trend 0 if a KPI cannot be determined.
- Chart labels and data arrays must be derived from the uploaded data — no made-up numbers.
- alerts is an empty array [] unless there is a genuine critical anomaly.
- Exactly 5 insights, exactly 4 recommendations.
- Return ONLY the JSON object. Nothing before or after it.

DATA:
${data}`;
}

// ── Route handler ────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    const { summaries } = await req.json();
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
        const result = extractJson(text);
        console.log(`[analyze] success via ${name}`);
        return NextResponse.json(result);
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
