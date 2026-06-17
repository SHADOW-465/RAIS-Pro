# RAIS Dynamic Dashboard & Chat Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace hardcoded manufacturing KPIs with an AI-chosen dynamic array, and add a chat panel below the dashboard for follow-up questions and dashboard refresh.

**Architecture:** Pure functions (`buildPrompt`, `normalizeResult`, `extractJson`) are extracted to a testable utility module and updated to use a free KPI array. A new `ChatPanel` component mounts below the dashboard and calls a new `/api/chat` route returning either a text answer or a full config refresh. `Dashboard.tsx` owns its live config state, initialized from the initial analysis and updated by chat.

**Tech Stack:** Next.js App Router, TypeScript, Framer Motion, Lucide React, Chart.js, Anthropic/OpenRouter/Groq AI providers.

---

## File Map

| Status | File | Role |
|--------|------|------|
| **Create** | `src/types/dashboard.ts` | Shared `KPI`, `DashboardConfig`, `ChatMessage` types |
| **Create** | `src/lib/analysis-utils.ts` | Extracted + updated `buildPrompt`, `normalizeResult`, `extractJson` |
| **Create** | `src/__tests__/analysis-utils.test.ts` | Unit tests for the two pure functions |
| **Create** | `src/components/ChatPanel.tsx` | Chat UI: message thread + input |
| **Create** | `src/app/api/chat/route.ts` | Chat API: answer or dashboard refresh |
| **Create** | `jest.config.ts` | Jest config (uses Next.js SWC transform) |
| **Modify** | `src/app/api/analyze/route.ts` | Remove `buildPrompt`/`normalizeResult`/`extractJson`, import from utils, fix system prompt |
| **Modify** | `src/lib/analyzer.ts` | Build and return `dataSummary` alongside config |
| **Modify** | `src/components/KPICard.tsx` | Accept `kpi: KPI` instead of individual props |
| **Modify** | `src/components/Dashboard.tsx` | Map `kpis[]`, own config state, use `dashboardTitle`, fix alerts, mount `ChatPanel` |
| **Modify** | `src/app/page.tsx` | Store `dataSummary`, pass to `Dashboard` |

---

## Task 1: Jest Setup

**Files:**
- Create: `jest.config.ts`
- Modify: `package.json` (add test script)

- [ ] **Step 1: Install Jest**

```bash
npm install --save-dev jest @types/jest
```

- [ ] **Step 2: Create `jest.config.ts`**

```ts
// jest.config.ts
import type { Config } from 'jest';
import nextJest from 'next/jest.js';

const createJestConfig = nextJest({ dir: './' });

const config: Config = {
  testEnvironment: 'node',
};

export default createJestConfig(config);
```

- [ ] **Step 3: Add test script to `package.json`**

In `package.json`, add to the `"scripts"` section:

```json
"test": "jest"
```

- [ ] **Step 4: Verify Jest runs**

```bash
npx jest --listTests
```

Expected: prints `(no tests found)` or an empty list — no error.

- [ ] **Step 5: Commit**

```bash
git add jest.config.ts package.json package-lock.json
git commit -m "chore: add Jest test runner"
```

---

## Task 2: Shared TypeScript Types

**Files:**
- Create: `src/types/dashboard.ts`

- [ ] **Step 1: Create the types file**

```ts
// src/types/dashboard.ts

export interface KPI {
  label: string;
  value: string | number;
  unit?: string;
  /** -1 = declining/bad, 0 = stable/neutral, 1 = improving/good */
  trend: -1 | 0 | 1;
  context: string;
}

export interface ChartDataset {
  label: string;
  data: number[];
  borderColor?: string;
  backgroundColor?: string | string[];
  fill?: boolean;
  tension?: number;
}

export interface Chart {
  title: string;
  type: 'line' | 'bar' | 'horizontalBar' | 'area' | 'pie' | 'doughnut' | 'radar';
  description?: string;
  data: {
    labels: string[];
    datasets: ChartDataset[];
  };
}

export interface DashboardConfig {
  dashboardTitle: string;
  executiveSummary: string;
  kpis: KPI[];
  charts: Chart[];
  insights: string[];
  recommendations: string[];
  alerts: string[];
}

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  isRefresh?: boolean;
  error?: boolean;
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/types/dashboard.ts
git commit -m "feat: add shared DashboardConfig and KPI types"
```

---

## Task 3: Extract and Update Analysis Utils

**Files:**
- Create: `src/lib/analysis-utils.ts`
- Create: `src/__tests__/analysis-utils.test.ts`

This task extracts `buildPrompt`, `normalizeResult`, and `extractJson` from `route.ts` into a testable module, and updates them for the dynamic KPI array and universal system prompt.

- [ ] **Step 1: Write the failing tests**

```ts
// src/__tests__/analysis-utils.test.ts
import { buildPrompt, normalizeResult, extractJson } from '../lib/analysis-utils';

describe('normalizeResult', () => {
  it('maps a valid kpis array', () => {
    const raw = {
      dashboardTitle: 'Sales Q1',
      executiveSummary: 'Revenue up.',
      kpis: [
        { label: 'Revenue', value: '$2.4M', trend: 1, context: 'vs last Q' },
        { label: 'Orders',  value: 340,     trend: 0, context: 'total' },
      ],
      charts: [],
      insights: ['Insight one'],
      recommendations: ['Do this'],
      alerts: [],
    };
    const result = normalizeResult(raw);
    expect(result.dashboardTitle).toBe('Sales Q1');
    expect(result.kpis).toHaveLength(2);
    expect(result.kpis[0].label).toBe('Revenue');
    expect(result.kpis[0].trend).toBe(1);
    expect(result.kpis[1].value).toBe(340);
  });

  it('returns empty kpis array when kpis is missing', () => {
    const result = normalizeResult({ executiveSummary: 'ok' });
    expect(result.kpis).toEqual([]);
  });

  it('caps kpis at 8', () => {
    const raw = {
      kpis: Array.from({ length: 12 }, (_, i) => ({
        label: `KPI ${i}`, value: i, trend: 0, context: '',
      })),
    };
    expect(normalizeResult(raw).kpis).toHaveLength(8);
  });

  it('defaults missing trend to 0', () => {
    const raw = { kpis: [{ label: 'X', value: 1, context: '' }] };
    expect(normalizeResult(raw).kpis[0].trend).toBe(0);
  });

  it('falls back gracefully when kpis is an object (old format)', () => {
    const raw = { kpis: { rejectionRate: { value: 4 } } };
    expect(normalizeResult(raw).kpis).toEqual([]);
  });
});

describe('buildPrompt', () => {
  it('contains the free-array kpis schema', () => {
    const prompt = buildPrompt([{ sheetName: 'Sheet1', totalRows: 5, columns: [] }]);
    expect(prompt).toContain('"kpis": [');
    expect(prompt).toContain('"label"');
    expect(prompt).toContain('"trend"');
  });

  it('does not contain hardcoded manufacturing field names', () => {
    const prompt = buildPrompt([]);
    expect(prompt).not.toContain('rejectionRate');
    expect(prompt).not.toContain('totalOutput');
    expect(prompt).not.toContain('qualityScore');
  });

  it('truncates data at 12000 chars', () => {
    const bigData = Array.from({ length: 1000 }, (_, i) => ({ col: `value_${i}` }));
    const prompt = buildPrompt(bigData);
    // The data section should not cause the total prompt to be astronomically large
    expect(prompt.length).toBeLessThan(15000);
  });
});

describe('extractJson', () => {
  it('parses raw JSON', () => {
    expect(extractJson('{"a":1}')).toEqual({ a: 1 });
  });

  it('parses JSON inside markdown fences', () => {
    expect(extractJson('```json\n{"a":2}\n```')).toEqual({ a: 2 });
  });

  it('extracts JSON from surrounding text', () => {
    expect(extractJson('Here is the result: {"a":3} done')).toEqual({ a: 3 });
  });

  it('throws on invalid JSON', () => {
    expect(() => extractJson('not json')).toThrow();
  });
});
```

- [ ] **Step 2: Run tests — verify they fail**

```bash
npx jest analysis-utils
```

Expected: FAIL — `Cannot find module '../lib/analysis-utils'`

- [ ] **Step 3: Create `src/lib/analysis-utils.ts`**

```ts
// src/lib/analysis-utils.ts
import type { DashboardConfig } from '@/types/dashboard';

// ── JSON extraction ──────────────────────────────────────────────────────────

export function extractJson(text: string): unknown {
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

// ── Result normalizer ────────────────────────────────────────────────────────

export function normalizeResult(raw: any): DashboardConfig {
  return {
    dashboardTitle:
      raw.dashboardTitle ?? raw.dashboard_title ?? 'Data Analysis',

    executiveSummary:
      raw.executiveSummary ?? raw.executive_summary ?? raw.summary ?? 'Analysis complete.',

    kpis: Array.isArray(raw.kpis)
      ? raw.kpis.slice(0, 8).map((k: any) => ({
          label:   String(k.label   ?? 'Metric'),
          value:   k.value          ?? 'N/A',
          unit:    k.unit,
          trend:   ([-1, 0, 1].includes(Number(k.trend)) ? Number(k.trend) : 0) as -1 | 0 | 1,
          context: String(k.context ?? ''),
        }))
      : [],

    insights: Array.isArray(raw.insights)
      ? raw.insights.filter((s: unknown) => typeof s === 'string' && s.trim())
      : [],

    recommendations: Array.isArray(raw.recommendations)
      ? raw.recommendations.filter((s: unknown) => typeof s === 'string' && s.trim())
      : [],

    charts: Array.isArray(raw.charts)
      ? raw.charts.filter(
          (c: any) => c?.title && c?.type && c?.data?.labels && c?.data?.datasets
        )
      : [],

    alerts: Array.isArray(raw.alerts)
      ? raw.alerts.filter((s: unknown) => typeof s === 'string' && s.trim())
      : [],
  };
}

// ── Prompt builder ───────────────────────────────────────────────────────────

export function buildPrompt(summaries: unknown): string {
  const data = JSON.stringify(summaries, null, 2).slice(0, 12000);

  return `Analyze this dataset and return a JSON object matching EXACTLY this schema.

SCHEMA:
{
  "dashboardTitle": "Short descriptive title based on the data (max 8 words)",

  "executiveSummary": "2-3 sentence plain-language brief for a General Manager. Reference specific numbers.",

  "kpis": [
    {
      "label": "AI-chosen metric name relevant to this dataset",
      "value": "actual value from data (number or formatted string like '14.2k' or '4.2%')",
      "unit": "optional unit string — omit if value already contains it",
      "trend": 1,
      "context": "short label e.g. 'vs last month', 'YTD', 'target'"
    }
  ],

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
    }
  ],

  "alerts": []
}

RULES:
- kpis: 3-6 items. Choose the metrics that matter most for THIS specific dataset. Do not use fixed field names like rejectionRate or totalOutput.
- trend must be exactly -1 (declining/bad), 0 (stable/neutral), or 1 (improving/good).
- All KPI values and chart data must come from the actual uploaded data — no invented numbers.
- Chart type must be one of: line, bar, horizontalBar, area, pie, doughnut, radar.
- alerts: empty array [] unless there is a genuine critical anomaly.
- Exactly 5 insights, exactly 4 recommendations.
- Return ONLY the JSON object. Nothing before or after it.

DATA:
${data}`;
}
```

- [ ] **Step 4: Run tests — verify they pass**

```bash
npx jest analysis-utils
```

Expected: all 10 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/analysis-utils.ts src/__tests__/analysis-utils.test.ts
git commit -m "feat: extract and update analysis utils with dynamic KPI array"
```

---

## Task 4: Update `/api/analyze/route.ts`

**Files:**
- Modify: `src/app/api/analyze/route.ts`

Replace the three inline functions with imports from `analysis-utils`, and update the system prompt.

- [ ] **Step 1: Rewrite the file**

Replace the entire contents of `src/app/api/analyze/route.ts` with:

```ts
import { NextRequest, NextResponse } from 'next/server';
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
        const result = normalizeResult(extractJson(text));
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
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Run all tests**

```bash
npx jest
```

Expected: all tests still PASS (the route no longer defines the functions, but the tests cover them via analysis-utils).

- [ ] **Step 4: Commit**

```bash
git add src/app/api/analyze/route.ts
git commit -m "refactor: analyze route imports utils, uses industry-neutral prompt"
```

---

## Task 5: Update `KPICard.tsx`

**Files:**
- Modify: `src/components/KPICard.tsx`

Change from individual props to a single `kpi: KPI` object. Trend is now -1 | 0 | 1 (direction only, no percentage).

- [ ] **Step 1: Rewrite the component**

```tsx
// src/components/KPICard.tsx
"use client";

import { motion } from "framer-motion";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";
import type { KPI } from "@/types/dashboard";

interface KPICardProps {
  kpi: KPI;
}

export default function KPICard({ kpi }: KPICardProps) {
  const { label, value, unit, trend, context } = kpi;

  return (
    <motion.div
      variants={{
        hidden: { opacity: 0, y: 20 },
        visible: { opacity: 1, y: 0 }
      }}
      className="glass-card p-6 flex flex-col justify-between group h-full"
    >
      <div className="space-y-2">
        <h3 className="text-text-secondary font-condensed font-bold uppercase tracking-widest text-xs">
          {label}
        </h3>
        <div className="flex items-baseline gap-1">
          <span className="text-4xl font-display font-bold text-text-primary tracking-tight">
            {value}
          </span>
          {unit && (
            <span className="text-text-muted font-condensed text-sm">{unit}</span>
          )}
        </div>
      </div>

      <div className="mt-4 flex items-center justify-between border-t border-border pt-4">
        <div className={`flex items-center gap-1 text-sm font-bold font-condensed ${
          trend === 1 ? 'text-success' : trend === -1 ? 'text-danger' : 'text-text-muted'
        }`}>
          {trend === 1
            ? <TrendingUp size={16} />
            : trend === -1
            ? <TrendingDown size={16} />
            : <Minus size={16} />}
        </div>
        <span className="text-[10px] text-text-muted font-mono uppercase tracking-tighter">
          {context || "—"}
        </span>
      </div>
    </motion.div>
  );
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: will fail on Dashboard.tsx (still passing old props) — that's fine, it gets fixed in Task 8. The error should be on Dashboard lines only.

- [ ] **Step 3: Commit**

```bash
git add src/components/KPICard.tsx
git commit -m "feat: KPICard accepts dynamic KPI object instead of named props"
```

---

## Task 6: Return `dataSummary` from `analyzer.ts`

**Files:**
- Modify: `src/lib/analyzer.ts`

- [ ] **Step 1: Rewrite `analyzer.ts`**

```ts
// src/lib/analyzer.ts
import { SheetSummary } from './parser';

function selectSheetsForPrompt(summaries: any[]): SheetSummary[] {
  const byFile = new Map<string, any[]>();
  for (const s of summaries) {
    const file = s.name.split(' - ')[0];
    if (!byFile.has(file)) byFile.set(file, []);
    byFile.get(file)!.push(s);
  }

  const selected: any[] = [];
  for (const [, sheets] of byFile) {
    const yearly = sheets.filter((s: any) => s.isYearly);
    if (yearly.length > 0) {
      selected.push(...yearly);
    } else {
      selected.push(...sheets);
    }
  }
  return selected;
}

export async function runAnalysis(
  summaries: any[]
): Promise<{ config: any; dataSummary: string }> {
  const filtered = selectSheetsForPrompt(summaries);
  const dataSummary = JSON.stringify(filtered).slice(0, 12000);

  const res = await fetch('/api/analyze', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ summaries: filtered }),
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    console.error('Analysis failed:', body);
    throw new Error(body.error || 'Analysis engine failure');
  }

  const config = await res.json();
  return { config, dataSummary };
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: will fail on `page.tsx` (which destructures the return value of `runAnalysis` as a plain value) — that is fixed in Task 7.

- [ ] **Step 3: Commit**

```bash
git add src/lib/analyzer.ts
git commit -m "feat: analyzer returns dataSummary alongside dashboard config"
```

---

## Task 7: Update `page.tsx`

**Files:**
- Modify: `src/app/page.tsx`

- [ ] **Step 1: Rewrite `page.tsx`**

```tsx
// src/app/page.tsx
"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import UploadZone from "@/components/UploadZone";
import ProcessingLoader from "@/components/ProcessingLoader";
import Dashboard from "@/components/Dashboard";
import type { DashboardConfig } from "@/types/dashboard";

export type AppState = "upload" | "processing" | "dashboard";

export default function Home() {
  const [appState, setAppState] = useState<AppState>("upload");
  const [analysisData, setAnalysisData] = useState<DashboardConfig | null>(null);
  const [dataSummary, setDataSummary] = useState<string>("");

  const handleUploadComplete = async (files: File[]) => {
    setAppState("processing");
    try {
      const { parseExcelFiles } = await import("@/lib/parser");
      const { runAnalysis } = await import("@/lib/analyzer");

      const summaries = await parseExcelFiles(files);
      const { config, dataSummary: summary } = await runAnalysis(summaries);

      setAnalysisData(config);
      setDataSummary(summary);
      setAppState("dashboard");
    } catch (error) {
      console.error("Analysis failed:", error);
      setAppState("upload");
      alert("Intelligence Scan Failed. Check your API configuration and try again.");
    }
  };

  const handleReset = () => {
    setAppState("upload");
    setAnalysisData(null);
    setDataSummary("");
  };

  return (
    <main className="min-h-screen p-4 md:p-8 flex flex-col items-center justify-center">
      <AnimatePresence mode="wait">
        {appState === "upload" && (
          <motion.div
            key="upload"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            transition={{ duration: 0.5 }}
            className="w-full max-w-4xl"
          >
            <UploadZone onUpload={handleUploadComplete} />
          </motion.div>
        )}

        {appState === "processing" && (
          <motion.div
            key="processing"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.5 }}
          >
            <ProcessingLoader />
          </motion.div>
        )}

        {appState === "dashboard" && analysisData && (
          <motion.div
            key="dashboard"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.8 }}
            className="w-full"
          >
            <Dashboard
              data={analysisData}
              dataSummary={dataSummary}
              onReset={handleReset}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </main>
  );
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: fails on `Dashboard.tsx` (doesn't yet accept `dataSummary` prop) — fixed in Task 8.

- [ ] **Step 3: Commit**

```bash
git add src/app/page.tsx
git commit -m "feat: page.tsx stores and passes dataSummary to Dashboard"
```

---

## Task 8: Update `Dashboard.tsx`

**Files:**
- Modify: `src/components/Dashboard.tsx`

Key changes:
1. Accept `dataSummary` prop and `DashboardConfig` type for `data`
2. Own `currentConfig` state (initialized from `data`, updatable by chat refresh)
3. Map over `currentConfig.kpis[]` instead of named slots
4. Use `currentConfig.dashboardTitle` in the header
5. Fix alerts rendering (now `string[]`, not `{message, type}[]`)
6. Remove hardcoded manufacturing fallback
7. Mount `ChatPanel` at the bottom

- [ ] **Step 1: Rewrite `Dashboard.tsx`**

```tsx
// src/components/Dashboard.tsx
"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { Download, RefreshCw, Layers, Zap, Info } from "lucide-react";
import KPICard from "./KPICard";
import ChartContainer from "./ChartContainer";
import StatusAlert from "./StatusAlert";
import ChatPanel from "./ChatPanel";
import type { DashboardConfig } from "@/types/dashboard";

interface DashboardProps {
  data: DashboardConfig;
  dataSummary: string;
  onReset: () => void;
}

export default function Dashboard({ data, dataSummary, onReset }: DashboardProps) {
  const [currentConfig, setCurrentConfig] = useState<DashboardConfig>(data);

  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: { staggerChildren: 0.1, delayChildren: 0.3 }
    }
  };

  return (
    <div className="w-full space-y-8 animate-in fade-in duration-1000">
      {/* Sticky Header */}
      <header className="sticky top-0 z-50 glass backdrop-blur-3xl px-8 py-4 -mx-8 flex items-center justify-between border-b border-border">
        <div className="flex items-center gap-4">
          <div className="w-10 h-10 bg-accent-gradient rounded-lg flex items-center justify-center text-background">
            <Zap size={24} />
          </div>
          <div>
            <h1 className="text-xl font-display font-medium text-text-primary tracking-tight">
              {currentConfig.dashboardTitle || "Data Analysis"}
            </h1>
            <p className="text-[10px] text-text-muted font-mono uppercase tracking-[0.2em]">
              RAIS · Intelligence Status: OPTIMAL
            </p>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <button onClick={onReset} className="btn-secondary flex items-center gap-2 group">
            <RefreshCw size={16} className="group-hover:rotate-180 transition-transform duration-500" />
            New Analysis
          </button>
          <button className="btn-primary flex items-center gap-2" onClick={() => window.print()}>
            <Download size={16} />
            Export
          </button>
        </div>
      </header>

      <motion.div
        variants={containerVariants}
        initial="hidden"
        animate="visible"
        className="space-y-8"
      >
        {/* Alerts */}
        {(currentConfig.alerts ?? []).map((alert, i) => (
          <StatusAlert key={i} message={alert} type="danger" />
        ))}

        {/* Executive Summary */}
        <motion.div variants={{ hidden: { opacity: 0, x: -20 }, visible: { opacity: 1, x: 0 } }}>
          <div className="glass-card p-1 pb-0 bg-accent/20">
            <div className="bg-surface p-8 space-y-4">
              <div className="flex items-center gap-2 text-accent font-bold uppercase tracking-widest text-xs">
                <Layers size={14} /> Executive Summary
              </div>
              <p className="text-2xl font-display font-light text-text-primary leading-snug">
                {currentConfig.executiveSummary}
              </p>
            </div>
          </div>
        </motion.div>

        {/* KPI Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {(currentConfig.kpis ?? []).length === 0 ? (
            <div className="col-span-4 text-text-muted text-sm text-center py-4">
              No key metrics identified
            </div>
          ) : (
            currentConfig.kpis.map((kpi, i) => (
              <KPICard key={i} kpi={kpi} />
            ))
          )}
        </div>

        {/* Chart Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {(currentConfig.charts ?? []).map((chart, i) => (
            <ChartContainer key={i} title={chart.title} type={chart.type} data={chart.data} />
          ))}
        </div>

        {/* Insights & Recommendations */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <motion.div
            variants={{ hidden: { opacity: 0, y: 20 }, visible: { opacity: 1, y: 0 } }}
            className="lg:col-span-2 glass-card p-8 space-y-6"
          >
            <h3 className="text-lg font-display flex items-center gap-3">
              <Info className="text-accent" /> Key Intelligence Insights
            </h3>
            <div className="space-y-6">
              {(currentConfig.insights ?? []).map((insight, idx) => (
                <div key={idx} className="flex gap-6 items-start group">
                  <span className="font-mono text-accent/40 text-xl font-bold">0{idx + 1}</span>
                  <p className="text-text-secondary leading-relaxed group-hover:text-text-primary transition-colors">
                    {insight}
                  </p>
                </div>
              ))}
            </div>
          </motion.div>

          <motion.div
            variants={{ hidden: { opacity: 0, y: 20 }, visible: { opacity: 1, y: 0 } }}
            className="glass-card p-8 bg-accent/5 border-accent/20 space-y-6"
          >
            <h3 className="text-lg font-display text-accent font-bold">Recommendations</h3>
            <ul className="space-y-4">
              {(currentConfig.recommendations ?? []).map((rec, i) => (
                <li key={i} className="flex gap-3 text-sm text-text-primary">
                  <div className="w-1.5 h-1.5 rounded-full bg-accent mt-1.5 shrink-0" />
                  {rec}
                </li>
              ))}
            </ul>
          </motion.div>
        </div>

        {/* Chat Panel */}
        <ChatPanel
          dataSummary={dataSummary}
          currentConfig={currentConfig}
          onRefresh={setCurrentConfig}
        />

        {/* Footer */}
        <div className="flex flex-wrap gap-3 pt-12 border-t border-border opacity-40">
          <span className="text-[10px] font-mono border border-white/20 px-2 py-1 rounded">
            RAIS Analysis
          </span>
        </div>
      </motion.div>
    </div>
  );
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: TypeScript compile fails on `Cannot find module './ChatPanel'` — this is expected and intentional. The import is satisfied when Task 9 creates the file. The commit below still works cleanly.

- [ ] **Step 3: Commit**

```bash
git add src/components/Dashboard.tsx
git commit -m "feat: Dashboard uses dynamic KPI array, AI title, string alerts, mounts ChatPanel"
```

---

## Task 9: Build `ChatPanel.tsx`

**Files:**
- Create: `src/components/ChatPanel.tsx`

- [ ] **Step 1: Create the component**

```tsx
// src/components/ChatPanel.tsx
"use client";

import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Send, MessageCircle, RefreshCw } from "lucide-react";
import type { DashboardConfig, ChatMessage } from "@/types/dashboard";

interface ChatPanelProps {
  dataSummary: string;
  currentConfig: DashboardConfig;
  onRefresh: (config: DashboardConfig) => void;
}

export default function ChatPanel({ dataSummary, currentConfig, onRefresh }: ChatPanelProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const sendMessage = async () => {
    const question = input.trim();
    if (!question || loading) return;

    const history = messages
      .slice(-10)
      .map(m => ({ role: m.role, content: m.content }));

    setMessages(prev => [...prev, { role: "user", content: question }]);
    setInput("");
    setLoading(true);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question, history, dataSummary, currentConfig }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? "Chat request failed");
      }

      const result = await res.json();

      if (result.type === "refresh" && result.config) {
        onRefresh(result.config);
        setMessages(prev => [
          ...prev,
          { role: "assistant", content: "Dashboard updated based on your request.", isRefresh: true },
        ]);
      } else {
        setMessages(prev => [
          ...prev,
          { role: "assistant", content: result.text ?? "I couldn't generate a response." },
        ]);
      }
    } catch (err) {
      setMessages(prev => [
        ...prev,
        {
          role: "assistant",
          content: err instanceof Error ? err.message : "Something went wrong. Try again.",
          error: true,
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="glass-card p-8 space-y-6">
      <div className="flex items-center gap-2 text-accent font-bold uppercase tracking-widest text-xs">
        <MessageCircle size={14} /> Ask a Follow-Up
      </div>

      {messages.length === 0 && (
        <p className="text-text-muted text-sm">
          Ask anything about your data — factual questions get a direct answer. Ask to
          &quot;refocus on cost&quot; or &quot;show me Q1 only&quot; to refresh the dashboard.
        </p>
      )}

      <div className="space-y-3 max-h-80 overflow-y-auto pr-1">
        <AnimatePresence initial={false}>
          {messages.map((msg, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
            >
              <div className={`max-w-[80%] rounded-lg px-4 py-2 text-sm leading-relaxed ${
                msg.role === "user"
                  ? "bg-accent/10 border border-accent/20 text-text-primary"
                  : msg.error
                  ? "bg-danger/10 border border-danger/20 text-danger"
                  : "bg-surface-raised text-text-secondary"
              }`}>
                {msg.isRefresh && (
                  <RefreshCw size={12} className="inline mr-1 text-accent" />
                )}
                {msg.content}
              </div>
            </motion.div>
          ))}
        </AnimatePresence>

        {loading && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex justify-start">
            <div className="bg-surface-raised rounded-lg px-4 py-2 text-sm text-text-muted">
              Analyzing…
            </div>
          </motion.div>
        )}

        <div ref={bottomRef} />
      </div>

      <div className="flex gap-3">
        <input
          type="text"
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter") sendMessage(); }}
          placeholder="Ask anything about your data…"
          disabled={loading}
          className="flex-1 bg-background border border-border rounded-lg px-4 py-2 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent disabled:opacity-50 transition-colors"
        />
        <button
          onClick={sendMessage}
          disabled={loading || !input.trim()}
          className="btn-primary px-4 py-2 flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <Send size={14} />
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: TS compile now succeeds — ChatPanel satisfies the import in Dashboard.tsx. The `/api/chat` route not existing is a runtime concern only. If compile fails, it's a type error in ChatPanel — fix before proceeding.

- [ ] **Step 3: Commit**

```bash
git add src/components/ChatPanel.tsx
git commit -m "feat: add ChatPanel component with answer and refresh modes"
```

---

## Task 10: Build `/api/chat/route.ts`

**Files:**
- Create: `src/app/api/chat/route.ts`

- [ ] **Step 1: Create the route**

```ts
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
```

- [ ] **Step 2: Verify TypeScript compiles cleanly**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Run all tests**

```bash
npx jest
```

Expected: all tests PASS.

- [ ] **Step 4: Commit**

```bash
git add src/app/api/chat/route.ts
git commit -m "feat: add /api/chat route for follow-up questions and dashboard refresh"
```

---

## Task 11: End-to-End Verification

**Files:** none — manual browser test only.

- [ ] **Step 1: Start dev server**

```bash
npm run dev
```

Expected: server starts at `http://localhost:3000`, no compile errors in terminal.

- [ ] **Step 2: Test with a non-manufacturing file**

Open `http://localhost:3000`. Drop one of the sales or finance Excel files from the `DATA/` folder (e.g. `COMMULATIVE 2025-26.xlsx`).

Expected:
- Processing screen shows 5 steps activating sequentially
- Dashboard renders with KPI labels appropriate to the data (NOT "Rejection Rate", "Total Output", "Downtime", "Quality Score")
- Dashboard title is AI-generated and descriptive (not "Manufacturing Performance Insight")
- Chat panel appears below all content with the placeholder text

- [ ] **Step 3: Test chat — answer mode**

In the chat input, type: `What is the highest value in the dataset?`

Expected:
- User message appears in thread
- "Analyzing…" loader appears
- AI response appears in thread as a text answer
- Dashboard does NOT change

- [ ] **Step 4: Test chat — refresh mode**

In the chat input, type: `Refocus the dashboard on the top performing categories`

Expected:
- User message appears in thread
- Dashboard re-renders with updated config
- A "↺ Dashboard updated based on your request." message appears in thread

- [ ] **Step 5: Test chat error handling**

Temporarily set an invalid API key in `.env.local`, reload, run an analysis, then type a chat question.

Expected:
- Error message appears in the chat thread: the API error text
- Dashboard remains visible and unchanged
- Input is still usable (can type another question)

Restore the valid API key after this step.

- [ ] **Step 6: Test New Analysis reset**

Click "New Analysis" in the header.

Expected:
- Returns to the upload screen
- No chat history carried over on next analysis

- [ ] **Step 7: Final commit**

```bash
git add .
git commit -m "feat: RAIS dynamic dashboard with universal KPIs and chat follow-up"
```
