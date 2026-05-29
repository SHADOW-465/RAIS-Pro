# RAIS Pro — The Rejection Report

Editorial diagnostic for pharma operations. Drop in plant spreadsheets, get an
executive read in under thirty seconds — magazine-style layout, real numbers,
auditable sources, follow-up chat that returns saveable insight slides.

## What it does

1. **Upload** one or more `.xlsx` / `.xls` / `.csv` files (multiple plants, multiple sheets — rollup sheets are auto-detected and excluded from totals).
2. **Parse + classify** client-side via SheetJS, then a small model classifies sheets into source groups and produces a merge plan.
3. **Aggregate deterministically** — pure JS arithmetic from the merge plan, no AI involved in the maths.
4. **Generate the dashboard** — a single structured-output call returns the lead story, KPIs (with sparkline history), editorial figures, insights, recommendations, and alerts.
5. **Verify** — split-pane mode draws an animated bezier trace beam from any KPI card to its source column in the raw spreadsheet.
6. **Ask follow-ups** — the chat dock returns a focused insight slide (headline + chart + 3-4 bullets), saveable as PNG.

## Stack

- **Next.js 16** App Router + **React 19** + **TypeScript 5** + **Tailwind 4** (utility classes only — the editorial design is CSS-variable driven, not utility-driven).
- **AI SDK v6** + **Zod** → `generateObject` with strict schemas. No JSON-extraction or normalize-from-loose-shape code anywhere.
- **Vercel AI Gateway** as the default model backend (`anthropic/claude-sonnet-4.6` + `anthropic/claude-haiku-4.5`), with direct-Anthropic and Ollama fallbacks for local dev.
- **Supabase** for session persistence (best-effort — the app works without it).
- **SheetJS (xlsx)** for client-side parsing.
- **html2canvas** for insight-slide PNG export.

## Project layout

```
src/
├─ app/
│  ├─ layout.tsx                  Root + font loaders + TweaksProvider
│  ├─ page.tsx                    Landing (masthead → upload → archive)
│  ├─ globals.css                 Editorial tokens, data-attr theme modes
│  ├─ session/[id]/page.tsx       Persisted-session viewer
│  └─ api/
│     ├─ analyze/route.ts         3-phase pipeline (merge plan → aggregate → dashboard)
│     ├─ chat/route.ts            Insight-slide answers
│     └─ sessions/                CRUD for saved sessions + slides
├─ components/
│  ├─ editorial/                  Design-system primitives
│  │  ├─ Icon.tsx                 Line-stroke icon set
│  │  ├─ Pill.tsx                 6-tone label
│  │  ├─ EditorialHeader.tsx      Landing masthead
│  │  ├─ EditorialCharts.tsx      Inline SVG: TrendLine, Donut, Bars, Sparkline, DualLine
│  │  ├─ TweaksContext.tsx        Live-tweak state, paints CSS vars
│  │  └─ TweaksPanel.tsx          Dev-only floating control panel (⌘.)
│  ├─ Dashboard.tsx               Lead story + KPIs + figures + sources + verify split
│  ├─ KPICard.tsx                 Serif numeral, accent trend, optional sparkline
│  ├─ ChartContainer.tsx          Figure wrapper, routes to editorial chart by type
│  ├─ InsightSlide.tsx            Magazine-clipping card, PNG export
│  ├─ BeamOverlay.tsx             Bezier trace beam with glow + draw-line animation
│  ├─ DataTable.tsx               Verify panel — paper-bg raw rows + accent column
│  ├─ ChatPanel.tsx               Editorial chat dock with suggested questions
│  ├─ SourcesPanel.tsx            Collapsible included/excluded/warnings audit
│  ├─ ProcessingLoader.tsx        Dual-ring SVG spinner + 5-step timeline
│  ├─ UploadZone.tsx              Editorial dropzone + queued file grid
│  ├─ SessionCard.tsx             Recent diagnostics tile
│  └─ StatusAlert.tsx             Critical / warning / info banner
├─ lib/
│  ├─ ai.ts                       Backend resolver: gateway → anthropic → ollama
│  ├─ schemas.ts                  Zod: MergePlan, DashboardConfig, InsightSlide
│  ├─ analyzer.ts                 Client-side analyzer caller
│  ├─ analysis-utils.ts           Prompt builders for both AI phases
│  ├─ parser.ts                   SheetJS → SheetSummary + RawSheet
│  ├─ merger.ts                   Deterministic aggregation (no AI)
│  ├─ supabase.ts                 Server + browser clients
│  └─ device-id.ts                Browser-local device UUID
└─ types/
   ├─ dashboard.ts                KPI, Chart, DashboardConfig, InsightSlide
   └─ analysis.ts                 Manifests, MergePlan, MergedResult
```

## Setup

```bash
# 1. install deps
npm install

# 2. copy and edit env
cp .env.example .env.local
#    Set AI_GATEWAY_API_KEY (recommended) or ANTHROPIC_API_KEY for local dev.
#    Optionally point at Supabase. Optionally point at a local Ollama.

# 3. dev
npm run dev          # http://localhost:3000

# 4. typecheck + tests + AI backend health
npx tsc --noEmit
npx jest
npm run check:ai     # pings every configured AI backend, reports green/red
```

## AI backend chain

[`src/lib/ai.ts`](src/lib/ai.ts) walks a failover chain — every backend with credentials gets tried in priority order until one succeeds. Per-call routing log is emitted to the server console (`[ai] ✓ <backend>` / `[ai] ✗ <backend>: …`).

| Priority | Backend | Env var | Default models |
|---|---|---|---|
| 1 | Vercel AI Gateway | `AI_GATEWAY_API_KEY` (or OIDC on Vercel) | `anthropic/claude-sonnet-4.6` · `anthropic/claude-haiku-4.5` |
| 2 | Direct Anthropic | `ANTHROPIC_API_KEY` | `claude-sonnet-4-6` · `claude-haiku-4-5` |
| 3 | OpenRouter | `OPENROUTER_API_KEY` | `nvidia/nemotron-3-super-120b-a12b:free` (override with `OPENROUTER_MODEL` / `OPENROUTER_MODEL_FAST`) |
| 4 | Google Gemini | `GOOGLE_GENERATIVE_AI_API_KEY` | `gemini-2.5-flash` · `gemini-2.5-flash-lite` |
| 5 | Groq | `GROQ_API_KEY` | `openai/gpt-oss-120b` · `openai/gpt-oss-20b` |
| 6 | Ollama (offline) | `OLLAMA_BASE_URL` + `OLLAMA_MODEL` | `qwen2.5:3b` (or whatever you've pulled) |

To force a single backend (skip the chain), set `RAIS_AI_BACKEND` to one of: `gateway | anthropic | openrouter | google | groq | ollama`.

**Recommended for production:** `AI_GATEWAY_API_KEY` alone. Gateway gives you observability, retries, per-call cost tracking, and zero-data-retention by default.

**Recommended for free-tier development:** combine Google Gemini + Groq + OpenRouter. Three independent free pools — at least one is virtually always healthy.

Run `npm run check:ai` to verify every configured backend can complete a structured-output request end-to-end. Reports per-backend latency and pass/fail.

## Pipeline

```
Browser                     Server
─────────                   ──────
parser.ts → SheetSummary  → /api/analyze
                              │
                              ├─ Phase 1: generateObject(MergePlanSchema)   ← AI (fast model)
                              │   skipped for single-sheet uploads
                              │
                              ├─ Phase 2: applyMergePlan()                  ← deterministic JS
                              │
                              └─ Phase 3: generateObject(DashboardConfigSchema) ← AI (main model)

Dashboard.tsx ← DashboardConfig + MergePlan + RawSheets
   │
   ├─ Verify mode → BeamOverlay (bezier ink/accent)
   └─ Ask RAIS → /api/chat → generateObject(InsightSlideAnswerSchema)
                                                      ↓
                                                InsightSlide (PNG-exportable)
```

## Tweaks (dev only)

The editorial design supports live knobs — paper warmth, density, accent color, heading font, card style, chart style, beam visibility. The panel auto-mounts in development (or via `?tweaks=1` on a preview deployment). Open with **⌘.** / **Ctrl+.** or click the FAB.

## Testing

Jest runs schema-validation tests and a small device-id mock test. The schemas test catches drift between the prompt instructions and what the model is expected to return — keep them in sync.

```bash
npx jest
```

## Deployment

The app deploys cleanly to Vercel as a standard Next.js App Router project. On Vercel:

- Add `AI_GATEWAY_API_KEY` (or rely on OIDC if your project is wired to the Gateway).
- Add the Supabase env vars if you want session persistence.
- Default function timeout (300s) covers the 3-phase pipeline comfortably.

## License

Private.
