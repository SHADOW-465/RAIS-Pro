# RAIS — Dynamic Dashboard & Chat Design
*Date: 2026-04-05 · Status: Approved*

---

## Problem

The current implementation has two gaps that contradict the "universal for any industry" goal:

1. `/api/analyze` forces a hardcoded KPI schema (`rejectionRate`, `totalOutput`, `downtime`, `qualityScore`) — manufacturing-only fields that make no sense for sales, HR, finance, or logistics data.
2. There is no way for the GM to ask follow-up questions after the dashboard loads — they are stuck with the initial analysis.

---

## Goals

- KPIs are fully dynamic: the AI freely decides what metrics to surface based on the uploaded data, with no hardcoded field names.
- The dashboard is universal: the same pipeline works correctly for any industry and any dataset.
- The GM can ask follow-up questions in a chat panel below the dashboard — getting either a text answer or a dashboard refresh depending on the question.

---

## Out of Scope

- Streaming chat responses (text appears word-by-word) — can be added as a later enhancement.
- Saving or sharing chat history across sessions.
- Multiple simultaneous chat threads or analytical lenses.
- Any changes to file parsing, the multi-provider AI fallback, or the Upload/Processing screens.

---

## Architecture

### What changes

| File | Change |
|------|--------|
| `src/app/api/analyze/route.ts` | System prompt → industry-neutral. KPI schema → free array. `normalizeResult` → accepts `kpi[]`. |
| `src/components/Dashboard.tsx` | KPI section maps over `config.kpis[]`. Receives `dataSummary` + `onRefresh` props. Mounts `ChatPanel` at bottom. |
| `src/components/KPICard.tsx` | Props updated to accept a single `kpi: KPI` object. |
| `src/app/page.tsx` | Stores `dataSummary` string alongside `analysisData` in state. Passes both to `Dashboard`. |

### What is added

| File | Purpose |
|------|---------|
| `src/components/ChatPanel.tsx` | Chat input + message thread UI. Calls `/api/chat`. Triggers `onRefresh` on dashboard updates. |
| `src/app/api/chat/route.ts` | Receives question + history + dataSummary + currentConfig. Returns `{type:"answer", text}` or `{type:"refresh", config}`. Reuses existing multi-provider fallback. |

### What stays the same

- `src/lib/parser.ts` — SheetJS parsing, column summarization, sheet selection
- `src/lib/analyzer.ts` — multi-provider fallback, `/api/analyze` call. **One addition:** after filtering sheets, serialize the summaries to a truncated JSON string (`JSON.stringify(filtered).slice(0, 12000)`) and return it alongside the dashboard config as `{ config, dataSummary }`. This gives `page.tsx` the summary string without changing the API response shape.
- `src/components/UploadZone.tsx`
- `src/components/ProcessingLoader.tsx`
- `src/components/ChartContainer.tsx`

---

## Data Flow

```
Upload → Parse → /api/analyze → DashboardConfig → render dashboard
                     ↓
               dataSummary (12k char truncated)
               stored in page.tsx state
                                                        ↓
                                              ChatPanel mounts below
                                                        ↓
                                         User question → /api/chat
                                              ↓                ↓
                                        {type:"answer"}   {type:"refresh"}
                                         text in thread    new config →
                                                           dashboard re-renders
```

---

## Data Schema

### DashboardConfig (returned by `/api/analyze`)

```ts
interface DashboardConfig {
  dashboardTitle: string;
  executiveSummary: string;
  kpis: KPI[];                // 3–6 items, AI picks freely
  charts: Chart[];            // 4–8 items, unchanged
  insights: string[];         // 5 items, unchanged
  recommendations: string[];  // 4 items, unchanged
  alerts: string[];           // conditional, unchanged
}

interface KPI {
  label: string;
  value: string | number;
  unit?: string;
  trend: -1 | 0 | 1;         // -1 = bad/down, 0 = neutral, 1 = good/up
  context: string;            // short label shown below value
}
```

### `/api/chat` request

```ts
{
  question: string;
  history: { role: "user" | "assistant"; content: string }[];  // last 10 messages max
  dataSummary: string;         // same truncated summary used for initial analysis
  currentConfig: DashboardConfig;
}
```

### `/api/chat` response

```ts
{ type: "answer";  text: string }
// or
{ type: "refresh"; config: DashboardConfig }
```

The AI decides which shape to return based on the question. Factual lookups → `answer`. Re-framing or focus requests → `refresh`.

The `/api/chat` system prompt instructs the AI explicitly:
```
You are a data analyst assistant. Given a dataset summary, a current dashboard config,
and a user question, return one of two JSON shapes:
- {"type":"answer","text":"..."} for factual questions about the data
- {"type":"refresh","config":{...full DashboardConfig...}} when the user asks to
  re-analyze, refocus, or change the dashboard view
Return only raw JSON. No preamble.
```

---

## System Prompt Change

**Before:**
```
You are a senior manufacturing data analyst. Your only job is to return a single valid JSON object...
```

**After:**
```
You are a senior data analyst. Your only job is to return a single valid JSON object...
```

The KPI section of `buildPrompt` changes from a fixed schema with named fields to a free array instruction:

```
"kpis": [
  { "label": "AI-chosen metric name", "value": "actual value from data", "unit": "optional", "trend": 1, "context": "short label" },
  ...3–6 items total, chosen entirely based on what matters most in this dataset...
]
```

---

## ChatPanel Component

```
┌─────────────────────────────────────────────┐
│  ASK A FOLLOW-UP                            │
│  ─────────────────────────────────────────  │
│  [user]  Which dept had worst rejection?    │
│  [ai]    Assembly — 6.8%, highest of 5.     │
│  [user]  Refocus on cost impact             │
│  [ai]  ↻ Refreshing dashboard...            │
│                                             │
│  ┌─────────────────────────────┐ [Send →]   │
│  │ Ask anything about your data│            │
│  └─────────────────────────────┘            │
└─────────────────────────────────────────────┘
```

**Props:**
```ts
interface ChatPanelProps {
  dataSummary: string;
  currentConfig: DashboardConfig;
  onRefresh: (config: DashboardConfig) => void;
}
```

**Internal state:**
```ts
messages: { role: "user" | "assistant"; content: string; type?: "answer" | "refresh" }[]
input: string
loading: boolean
```

---

## Error Handling

| Scenario | Behaviour |
|----------|-----------|
| `/api/chat` network/provider error | Error bubble appears in thread. "Something went wrong. Try again." Retry button. Dashboard unchanged. |
| `/api/chat` returns malformed `refresh` config | `normalizeResult()` sanitizes. If still invalid, treat as `answer` with fallback message. Dashboard unchanged. |
| AI returns 0 KPIs | "No key metrics identified" placeholder in KPI grid. |
| AI returns >8 KPIs | Cap at 8, render in auto-fit grid. |
| KPI value null/missing | Render "N/A" (existing behaviour). |
| KPI trend field missing | Default to 0 (neutral). |
| Chat history exceeds 10 messages | Trim oldest messages, keep last 10 before sending to API. |
| User clicks "New Analysis" | Both `analysisData` and `dataSummary` cleared. Chat history cleared. Returns to Upload screen. |

---

## Acceptance Criteria

1. Uploading a sales Excel produces KPIs with labels like "Total Revenue", "Avg Order Value" — not "Rejection Rate" or "Downtime".
2. Uploading a manufacturing Excel produces KPIs appropriate to that data — but the field names are AI-chosen, not hardcoded.
3. The GM can type a question in the chat panel and receive a text answer without the dashboard changing.
4. The GM can type "refocus on cost" (or similar) and the dashboard re-renders with a new config.
5. A `/api/chat` failure shows an error in the thread and leaves the dashboard intact.
6. Clicking "New Analysis" resets everything including the chat thread.
