# RAIS Pro — The Rejection Report

Editorial diagnostic for regulated manufacturing operations (pilot: Disposafe, a
medical-device maker in Delhi — ISO 13485 / MDR 2017). RAIS Pro is **MO!D V1** —
see `docs/MOID-BLUEPRINT.md`. Drop in plant spreadsheets, get an executive read in
under thirty seconds — magazine-style layout, real numbers, auditable sources,
follow-up chat that returns saveable insight slides.

## What it does

1. **Upload** one or more `.xlsx` / `.xls` / `.csv` files (multiple plants, multiple sheets — rollup sheets are auto-detected and excluded from totals).
2. **Build a column-role graph** — client-side SheetJS parsing produces sheet summaries, then a small model classifies each column's *role* (stage-checked, stage-rejected, reason-count, date, …). The model only labels; it never computes. A golden-tested heuristic graph is always built in parallel as a fallback.
3. **Compute metrics deterministically** — `computeMetrics()` does pure JS arithmetic over the raw rows from the graph. A sanity gate discards the LLM graph and keeps the heuristic if the LLM's numbers drift from the baseline, so the dashboard can never show "random numbers."
4. **Generate the narrative** — a structured-output call writes prose only (title, executive summary, insights, recommendations, alerts). KPIs, charts, sparkline history and trends are derived from the computed metrics, not the model.
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
│     ├─ analyze/route.ts         3-phase pipeline (graph → compute → narrative)
│     ├─ chat/route.ts            Insight-slide answers
│     └─ sessions/                CRUD for saved sessions + slides
├─ components/
│  