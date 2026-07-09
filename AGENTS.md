<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Working in this repo

Next.js 16 + React 19 + AI SDK v6. APIs and conventions may differ from your
training data. Defer to `node_modules/next/dist/docs/` and `node_modules/ai/docs/`
when in doubt. The Vercel AI Gateway is the default model backend — model
addressing uses `"provider/model"` strings, not provider-specific packages.

## Design direction (locked)

Enterprise Manufacturing Intelligence OS for GMs/QMs/engineers — Linear /
Stripe Dashboard / Vercel register, not editorial. **Geist** for UI and
headings, **Geist Mono** for technical data (IDs, logs, provenance, cell
refs). Hierarchy comes from size/weight/spacing, not color. Burnt orange
`#C8421C` accent reserved for status/accent, not headings. Flat / outlined /
shadowed cards. **Not glassmorphism.** The old
`glass-card`/`btn-primary`/`topbar` Tailwind utility classes are gone.

Type scale (`globals.css`): `.kpi` 48px/700 (executive KPI values), `.h1`
32px/700 (page titles), `.h2` 24px/600 (section titles), `.h3` 16px/500 (card
titles), `.body` 14px/400, `.small` 13px/400 (secondary/metadata). Tabular
numerals are on globally (`body { font-variant-numeric: tabular-nums }`).

Theming flows through `<body data-density / data-bg / data-card /
data-chart-style>` plus CSS variables (`--paper`, `--ink`, `--accent`,
`--serif`, etc.) live-painted by `TweaksContext`. New components should
consume these CSS vars rather than hardcoding hex.

## Where things live

- **Design-system primitives:** `src/components/editorial/`
- **Domain components:** `src/components/`
- **AI layer:** `src/lib/ai.ts` (backend resolver), `src/lib/schemas.ts` (Zod), `src/lib/analysis-utils.ts` (prompt builders)
- **Analysis engine:** `src/lib/metrics.ts` (`inferSheetGraph` heuristic column-role classifier + `computeMetrics` deterministic aggregation), `src/lib/dashboard-builder.ts` (graph reconcile, metrics→KPI/chart mapping, sanity gate, merge-plan derivation), `src/types/metrics.ts` (graph + metric types)
- **Routes:** `src/app/api/{analyze,chat,sessions}/`
- **Persistence:** `src/lib/supabase.ts` + `supabase/migrations/`

See `README.md` § "Project layout" for the full map.

## AI provider chain

All AI calls flow through `tryModels(fn, opts)` in [`src/lib/ai.ts`](src/lib/ai.ts). It walks every configured backend in priority order: Gateway → Anthropic → OpenRouter → Google → Groq → Ollama. First success wins; failures cascade. Never call `generateObject` with a raw model handle in route handlers — always use `tryModels` so the chain is honored.

When changing schemas, run `npm run check:ai` to confirm every backend still accepts the new shape. Cross-provider compatibility rules live in the [`src/lib/schemas.ts`](src/lib/schemas.ts) header: use `.nullable()` not `.optional()` (Groq/OpenAI strict mode), plain ints not literal unions (Google), and strings not type-unions for KPI values.

## Pipeline invariants

The analyze route (`src/app/api/analyze/route.ts`) runs three phases:
**graph → compute → narrative**.

1. **The model never does maths.** AI is used only for *classification* (the
   per-sheet column-role **graph**) and *narrative* (prose for the dashboard).
   All numbers come from `computeMetrics()` in `src/lib/metrics.ts` — pure JS
   arithmetic over the raw rows. Never let KPI or chart values come from the
   model.
2. **The graph has a heuristic fallback with a sanity gate.** Phase 1 always
   computes a heuristic graph via `inferSheetGraph()` per sheet. The LLM graph
   (Zod `SheetGraphSetSchema`) is `reconcileGraph()`'d against the real columns
   (hallucinated columns dropped, omitted real ones back-filled), then its
   metrics are accepted **only if** `metricsSane()` passes vs. the heuristic
   baseline. Otherwise the golden-tested heuristic wins. The user gets
   LLM-driven understanding without risking "random numbers."
3. **Schemas are the contract.** `generateObject` + Zod via `tryModels`. If the
   model can't produce a valid object, fall back (graph) or surface an error
   (narrative) — don't silently coerce. Phase 2 returns 422 if no KPIs survive.
4. **Views are derived deterministically.** `metricsToKpis()` /
   `metricsToCharts()` / `deriveMergePlan()` in `src/lib/dashboard-builder.ts`
   map a `MetricsResult` into the `DashboardConfig`. `rejection_rate` leads;
   `kpi.history` + trend are computed from `monthlyTrend` here, not by the
   model. Don't add a parallel "history" path elsewhere.
5. **Verify-mode beam math runs client-side** — KPI `sourceColumn` ref → column
   header ref → `getBoundingClientRect()` on both, recompute on scroll/resize.

## Hard rules

- Don't add provider-specific AI SDK packages unless explicitly asked. Default
  to the gateway via `getModel()` in `src/lib/ai.ts`.
- Don't reintroduce **Chart.js**, **lucide-react**, or **framer-motion**. They
  were removed deliberately — the editorial charts are inline SVG and the
  animations are pure CSS (`pulse-ring`, `blink`, `fade-up`, `draw-line`).
- Don't add new Tailwind utility classes for theming colors. Use CSS
  variables instead, so the Tweaks panel keeps working.
- Don't bypass schemas by writing custom JSON parsers — if validation needs
  to relax, widen the schema with `.optional()` / `.union()` instead.

## Testing

`npx jest` runs schema tests + a device-id mock test. Schema tests document
what the AI is expected to produce; if you change a prompt, update the
schemas (and the tests) in lockstep.

## Conventions

- File names: `PascalCase.tsx` for components, `kebab-case.ts` for lib utilities.
- Editorial primitives in `src/components/editorial/` use inline `style={{ … }}`
  against CSS variables because the design is heavily token-driven. This is
  intentional — don't refactor into a class-per-element pattern unless a file
  has genuinely reusable visual logic.
- Sticky positioning on the dashboard masthead and verify-panel headers must
  remain — both screens are scroll-heavy.

## Session History (June 18, 2026)

In this session, the following updates were made:
- **Design System & Typography**: Re-aligned colors and loaded **Fraunces** display serif and **Inter Tight** UI fonts via Google Fonts. Resolved offline build failures from standard google-font pre-fetching by loading fonts via `@import` in `globals.css` and mapping `--font-display`, `--font-sans`, and `--font-mono` directly in the global `:root`.
- **Factory Staging Grid**: Revamped `/staging` (in `src/app/staging/page.tsx`) to support editable input cells for Checked and Rejected quantities, and a row-level comment log drawer.
- **Ledger Ingestion & Audit trail**: Wired discrepancy/override comments from the manual entry grid to `/api/ingest`. They are mapped to `StageDayRecord` records and emitted as canonical `AnnotationEvent`s in the append-only events store.
- **React Compiler Memoization Fixes**: Removed manual `useMemo` for the `resolved` column match in `VerifyPanel.tsx` to solve `react-hooks/preserve-manual-memoization` compiler blockages.
- **CSR Bailout & Suspense Fixes**: Wrapped the `/chat` page (Ask RAIS) in a React `<Suspense>` boundary to allow build-time prerendering without bailing on Client-Side Rendering hooks (`useSearchParams`).
- **Reports Page Type Fixes**: Resolved a TypeScript compilation error in `src/app/reports/page.tsx` by correctly referencing the `rejected` field on `DefectRow`.
- **Codebase Sanitization**: Cleaned up multiple unused imports, variables, and parameters in `Dashboard.tsx`, `ProcessingLoader.tsx`, `AppShell.tsx`, `rejection.ts`, and corresponding unit tests.
- **D/W/M/FY Grain Architecture**: Wired up the segmented control in the topbar header to dynamically aggregate quality snapshot metrics by the active period (most recent day, week, month, or FY), while trend charts render pruned, clean historical trends (last 15 days, 12 weeks, 12 months, or all FYs) without label clutter.
- **Dynamic SPC Control Limits**: Custom-rendered a dynamic X-bar control chart showing LCL, Mean, and UCL calculated on-the-fly from active trend points, flagging out-of-spec events and counting Western Electric rules violations in real time.
- **Layout Scaling & Legibility**: Removed hardcoded `maxWidth` constraints on reports and settings page outer containers to utilize full screen space. Enhanced font readability and color contrast by adjusting muted (`--text-3`) and secondary (`--text-2`) text variables in both light and dark modes.
- **File Ingestion Error Recovery**: Enhanced client-side file uploading on `/staging` to catch native browser `NotReadableError` / permission exceptions (which occur when the uploaded spreadsheet is open/locked in Microsoft Excel on Windows). The app now intercept this condition and prompts the user with clear instructions to close Excel and retry.
- **Verification**: Ensured that the application builds successfully and passes all **130 unit tests** successfully.

