<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Working in this repo

MOID (repo name: RAIS-Pro) is an Enterprise Manufacturing Intelligence OS for
GMs / QMs / engineers at a medical-device plant. Next.js 16 + React 19 +
AI SDK v6. APIs and conventions may differ from your training data; defer to
`node_modules/next/dist/docs/` and `node_modules/ai/docs/` when in doubt.

## The one-paragraph model of the app

Plant Excel goes in at **Staging**. The workbook is profiled, its columns are
classified into a **MOD** (Mapping Ontology Document), a human verifies that
mapping, and publishing the MOD does three things: promotes stages/defects/
sizes into the **company catalog**, learns the Excel→canonical aliases, and
unlocks extraction of day-records. Those records are reviewed, then committed
to an **append-only event ledger**. Every screen — dashboard, analyses,
reports, audit — is a pure read over that ledger. **Data Entry** is a generated
view of the same schema, so ongoing manual entry uses the plant's own column
names instead of a convention the app invented.

## Pipeline (the real one)

```
Excel ──► core/workbook (reader, header, snapshot-store)
          └─ core/profiler (column stats)
              └─ core/ontology/resolver (exact-index → ladder → llm)
                  └─ core/ontology/builder/build-mod → MOD draft
                      ↓ POST /api/mods/verify   human decisions
                      ↓ POST /api/mods          publish (validate → catalog merge → learn)
   verified MOD ──────┼──► catalog-store  ← ALSO edited by hand on /schema
                      ├──► GET /api/entry-template ──► Data Entry grids
                      └──► POST /api/mods/records → extract-from-mod → Staging review
                                                            ↓
                                        POST /api/ingest → lib/ingest/emit → events
                                                            ↓
                                   lib/store (Supabase | memory) → lib/analytics/* → screens
```

## Hard invariants

1. **The model never does maths.** AI is used for *classification* (column →
   canonical role, in the resolver ladder) and *prose* (chat answers, CAPA
   advice). Every number on every screen comes from deterministic JS over
   ledger events in `src/lib/analytics/`. Never let a KPI value originate from
   a model.
2. **The ledger is append-only and content-addressed.** `lib/contract/hash.ts`
   hashes each event, so re-ingesting identical data dedups. A changed value is
   superseded by a `CorrectionEvent`, never mutated in place. Do not add code
   that hard-deletes ledger rows.
3. **The MOD is the only ingestion path.** The legacy parsers were deleted.
   Anything entering the ledger comes from `extract-from-mod` (Excel) or direct
   entry (`extractedBy: "direct-entry"`).
4. **The catalog outlives the workbooks.** Deleting an upload removes the file
   snapshot and MOD lineage only. Master schema is edited exclusively through
   `/api/schema` (Data Schema page) or `/api/clear-schema`.
5. **Data Entry is generated, never hardcoded.** `/api/entry-template` unions
   every verified MOD, then the company catalog overrides it — a rename, delete,
   or addition on Data Schema wins. The built-in defect lists in
   `lib/entry/disposafe-matrix.ts` exist only as the fallback when no schema is
   configured. Column order follows the source sheet; catalog-only additions
   append after it.
6. **Extraction requires a verified MOD.** `/api/mods/records` resolves through
   `activeFor()`; drafts never extract.

## Where things live

- **Ingestion / ontology:** `src/core/` — `workbook/` (read + snapshot),
  `profiler/` (column stats), `ontology/` (resolver, builder, stores, validate),
  `ingest/` (extract, reconcile, precedence), `decision/` (rule engine behind
  `/api/decide`)
- **Ledger + analytics:** `src/lib/` — `contract/` (Zod event schemas + hash),
  `ingest/` (emit, review, mass-balance), `store/` (Supabase | memory adapters),
  `analytics/` (every metric; screens import the `analytics/index.ts` barrel only)
- **Entry:** `src/lib/entry/` (period, batch-id, validation, draft) plus
  `src/components/BatchMatrixEntry.tsx` and `MonthlyEntryGrid.tsx`
- **Design-system primitives:** `src/components/editorial/`; shared chart and
  layout widgets in `src/components/app/widgets.tsx`
- **Routes:** `src/app/api/*` — full table in `README.md`

## AI provider chain

All AI calls go through `tryModels(fn, opts)` in [`src/lib/ai.ts`](src/lib/ai.ts).
Two backends, tried in order: **MiniCPM** (self-hosted, OpenAI-compatible
endpoint at `MINICPM_BASE_URL`) → **Groq** (`GROQ_API_KEY`). First success wins;
failures cascade. `RAIS_AI_BACKEND` moves one to the front but is not exclusive.
Both are addressed through `@ai-sdk/openai-compatible` — do not add
provider-specific SDK packages. Never call `generateObject` with a raw model
handle in a route handler; always use `tryModels` so the chain is honored.

`npm run check:ai` pings every configured backend with a real structured-output
request. Cross-provider schema rules: prefer `.nullable()` over `.optional()`,
plain ints over literal unions, strings over type-unions for displayed values.

## Design direction (locked)

Linear / Stripe Dashboard / Vercel register, not editorial. **Geist** for UI and
headings, **Geist Mono** for technical data (IDs, logs, provenance, cell refs) —
self-hosted via `next/font` in `layout.tsx`. No Google Fonts, no CSS `@import`
for fonts. Hierarchy comes from size/weight/spacing, not color. Burnt orange
`#C8421C` accent is reserved for status/accent, never headings. Flat / outlined
/ shadowed cards. **Not glassmorphism.**

Type scale (`globals.css`): `.kpi` 48px/700 (executive KPI values), `.h1`
32px/700 (page titles), `.h2` 24px/600 (section titles), `.h3` 16px/500 (card
titles), `.body` 14px/400, `.small` 13px/400 (secondary/metadata). Tabular
numerals are on globally.

Theming flows through `<body data-density / data-bg / data-card /
data-chart-style>` plus CSS variables (`--paper`, `--ink`, `--accent`, …)
live-painted by `TweaksContext`. Consume these vars rather than hardcoding hex.

## Hard rules

- Don't add provider-specific AI SDK packages. `@ai-sdk/openai-compatible`
  reaches both backends.
- Don't reintroduce **Chart.js**, **lucide-react**, or **framer-motion**. They
  were removed deliberately — charts are inline SVG
  (`components/app/widgets.tsx`) and animation
  is pure CSS (`pulse-ring`, `blink`, `fade-up`, `draw-line`).
- Don't add new Tailwind utility classes for theming colors. Use CSS variables,
  or the Tweaks panel stops working.
- Don't bypass schemas with hand-written JSON parsing — widen the Zod schema.
- Don't add a second path for something `lib/analytics/` already computes.

## Testing

`npx jest` runs the suite; `npx tsc --noEmit` for types. Tests run in the node
environment only — there is no jsdom or testing-library setup, so test logic,
not rendered components. Non-trivial logic should leave one runnable check
behind. `jest.setup.ts` forces `MOID_STORE=memory` so tests never touch a live
Supabase project.

## Conventions

- File names: `PascalCase.tsx` for components, `kebab-case.ts` for lib utilities.
- Editorial primitives in `src/components/editorial/` use inline `style={{ … }}`
  against CSS variables because the design is token-driven. This is intentional
  — don't refactor into a class-per-element pattern.
- Sticky positioning on the dashboard masthead and verify-panel headers must
  remain — both screens are scroll-heavy.
