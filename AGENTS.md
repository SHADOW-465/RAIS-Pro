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

This is "The Rejection Report" — an editorial diagnostic for pharma GMs.
Warm paper background, near-black ink, **Fraunces** display serif, **Inter
Tight** UI, **JetBrains Mono** for numbers. Burnt orange `#C8421C` accent.
Flat / outlined / shadowed cards. **Not glassmorphism.** The old
`glass-card`/`btn-primary`/`topbar` Tailwind utility classes are gone.

Theming flows through `<body data-density / data-bg / data-card /
data-chart-style>` plus CSS variables (`--paper`, `--ink`, `--accent`,
`--serif`, etc.) live-painted by `TweaksContext`. New components should
consume these CSS vars rather than hardcoding hex.

## Where things live

- **Design-system primitives:** `src/components/editorial/`
- **Domain components:** `src/components/`
- **AI layer:** `src/lib/ai.ts` (backend resolver), `src/lib/schemas.ts` (Zod), `src/lib/analysis-utils.ts` (prompt builders)
- **Routes:** `src/app/api/{analyze,chat,sessions}/`
- **Persistence:** `src/lib/supabase.ts` + `supabase/migrations/`

See `README.md` § "Project layout" for the full map.

## AI provider chain

All AI calls flow through `tryModels(fn, opts)` in [`src/lib/ai.ts`](src/lib/ai.ts). It walks every configured backend in priority order: Gateway → Anthropic → OpenRouter → Google → Groq → Ollama. First success wins; failures cascade. Never call `generateObject` with a raw model handle in route handlers — always use `tryModels` so the chain is honored.

When changing schemas, run `npm run check:ai` to confirm every backend still accepts the new shape. Cross-provider compatibility rules live in the [`src/lib/schemas.ts`](src/lib/schemas.ts) header: use `.nullable()` not `.optional()` (Groq/OpenAI strict mode), plain ints not literal unions (Google), and strings not type-unions for KPI values.

## Pipeline invariants

1. **The model never does maths.** Aggregation is `applyMergePlan()` —
   pure JS arithmetic. AI is only for *classification* (manifest → merge plan)
   and *narrative* (aggregates → dashboard config). Never let chart values
   come from the model when raw rows could be summed.
2. **Schemas are the contract.** `generateObject` + Zod. If the model can't
   produce a valid object, surface a 502 — don't silently coerce.
3. **`history` arrays power KPI sparklines.** When a metric has a time series
   in PRE-COMPUTED CHART SERIES, the dashboard prompt instructs the model to
   populate `kpi.history`. Don't add a parallel "history" path elsewhere.
4. **Verify-mode beam math runs client-side** — KPI ref → column header ref
   → `getBoundingClientRect()` on both, recompute on scroll/resize.

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
