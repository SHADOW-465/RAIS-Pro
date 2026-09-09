# MOID — Rejection Diagnostic

Manufacturing intelligence OS for regulated production (pilot: Disposafe, a
medical-device maker in Delhi — ISO 13485 / MDR 2017). Plant Excel goes in once;
after that the app knows the plant's schema, the operators enter data in their
own column names, and every screen reads from one auditable ledger.

Repo name is `RAIS-Pro` for historical reasons; the product is **MOID**
(`src/lib/brand.ts` is the single source of truth for the displayed name).

## What it does

1. **Import** a workbook at `/staging`. It is snapshotted losslessly, profiled,
   and its columns are resolved to canonical roles (stage / date / checked /
   rejected / defect / size).
2. **Verify** the mapping. A human confirms or overrides each column, then
   publishes. Publishing merges the schema into the company catalog and learns
   the Excel→canonical aliases for next time.
3. **Review and commit.** Day-records are extracted from the verified mapping,
   recomputed from scratch (the sheet's own formulas are never trusted), flagged
   where they don't balance, corrected by the operator, and appended to the
   event ledger.
4. **Enter ongoing data** at `/data-entry`, on a grid generated from that same
   schema — the plant's own defect names, in the sheet's own order.
5. **Read** — dashboard, stage / size / defect analysis, SPC, COPQ, process
   flow, reports, CAPA, and a full audit trail, all derived deterministically
   from the ledger.
6. **Ask** — `/chat` answers questions about the loaded data and returns a
   saveable insight slide.

## Core guarantees

- **The ledger is append-only.** Events are content-hashed; identical re-ingest
  dedups, a changed value is superseded by a `CorrectionEvent`. Nothing is
  silently rewritten.
- **The model never does maths.** AI classifies columns and writes prose. Every
  number comes from deterministic JS in `src/lib/analytics/`.
- **Every figure is traceable** to a file, sheet, cell, and ingestion id.
- **The schema is learned, not hardcoded.** Data Entry is a generated view of
  the verified ontology plus the master catalog.

## Stack

- **Next.js 16** App Router + **React 19** + **TypeScript 5** + **Tailwind 4**
  (the design is CSS-variable driven, not utility-driven).
- **AI SDK v6** + **Zod** — `generateObject` with strict schemas, no
  JSON-scraping anywhere.
- **MiniCPM** (self-hosted) with **Groq** as fallback, both via
  `@ai-sdk/openai-compatible`.
- **Supabase** for the ledger and schema stores; an in-memory store is used when
  no Supabase env is present.
- **SheetJS (xlsx)** for workbook parsing, **html2canvas** for slide export.
- **Geist / Geist Mono**, self-hosted through `next/font`.

## Project layout

```
src/
├─ app/
│  ├─ layout.tsx           Root — fonts, TweaksProvider, EventsProvider, RegistryProvider
│  ├─ page.tsx             Dashboard (factory overview, KPIs, trends)
│  ├─ globals.css          Design tokens, data-attr theme modes
│  ├─ staging/             Import → verify mappings → review → publish
│  ├─ workbooks/           Uploaded files, their MOD lineage, per-file stats
│  ├─ schema/              Data Schema — the master plant catalog + learned mappings
│  ├─ data-entry/          Batch matrix + period grid + entry ledger
│  ├─ stage-analysis/  size-analysis/  defect-analysis/  spc/  copq/  process-flow/
│  ├─ reports/  capa/  audit/  chat/  settings/
│  └─ api/                 see route table below
├─ components/
│  ├─ app/                 AppShell (nav + scope), widgets (charts/KPIs), CommandPalette,
│  │                       EventsContext, RegistryContext, MappingVerificationPanel
│  ├─ editorial/           Icon, Pill, EditorialCharts, TweaksContext
│  ├─ entry/               QtyInput
│  ├─ BatchMatrixEntry.tsx MonthlyEntryGrid.tsx  UploadZone.tsx
│  └─ FloatingDetailModal.tsx  ParetoChart.tsx  InsightSlide.tsx  CapaComposerModal.tsx
├─ core/                   Ingestion + ontology (server-side)
│  ├─ workbook/            reader, header detection, snapshot-store
│  ├─ profiler/            column profiling → ProfilingTable
│  ├─ ontology/            resolver (exact → ladder → llm), builder, stores, validate
│  ├─ ingest/              extract-from-mod, reconcile, precedence
│  └─ decision/            rule engine behind /api/decide
├─ lib/
│  ├─ contract/            d1 (canonical events), d3 (findings/rulebook), hash
│  ├─ ingest/              emit (records → events), review (recompute + flags), mass-balance
│  ├─ store/               EventStore/FindingStore adapters (Supabase | memory)
│  ├─ analytics/           every metric; screens import the index barrel only
│  ├─ entry/               period, batch-id, validate-entry, draft, disposafe-matrix
│  └─ ai.ts  brand.ts  supabase.ts  capa-store.ts  persona.ts  audit-package.ts
├─ shared/models/          Zod models for MOD / decision / workbook
└─ types/dashboard.ts      KPI, Chart, DashboardConfig, InsightSlide
```

## API routes

| Route | Purpose |
|---|---|
| `POST /api/workbooks` | Upload → snapshot → profile → build MOD draft |
| `GET/DELETE /api/workbooks` | List uploads; delete one file's snapshot + MOD |
| `GET/POST /api/mods` | Read a MOD; publish a draft (validate → catalog merge → learn) |
| `POST /api/mods/verify` | Record per-column human decisions on a draft |
| `POST /api/mods/records` | Extract day-records from a **verified** MOD |
| `POST /api/ingest` | Commit records → canonical events + clarification checks |
| `GET /api/entry-template` | Data Entry grid definition (MOD union + catalog overrides) |
| `GET/POST/DELETE /api/schema` | Master catalog + learned mappings |
| `POST /api/clear-schema` | Reset the schema brain (keeps the ledger) |
| `POST /api/clear-data` | Clear the transactional ledger (keeps the schema) |
| `GET /api/events` · `GET /api/day-records` | Ledger reads for screens and grids |
| `GET/DELETE /api/manual-entries` | Data Entry ledger rows |
| `POST /api/chat` · `POST /api/capa-advisor` · `POST /api/decide` | AI-backed answers, CAPA drafting, rule recommendations |
| `GET /api/raw-file` · `POST /api/archive-upload` | Original file retrieval / archival |
| `GET/POST/PATCH/DELETE /api/roles` | Plant roles: what each may open, and its capability bits |
| `GET/POST/PATCH /api/users` | Named logins and the role each holds |
| `POST /api/auth/login` · `POST /api/auth/logout` · `GET /api/auth/me` | Sign in, out, and the signed-in role's definition |

## Setup

```bash
npm install
cp .env.example .env.local
npm run dev
```

`.env.example` documents every variable. Nothing is strictly required to boot —
with no Supabase env the app runs on the in-memory store, and with no AI backend
the deterministic parts still work while AI features report that no backend is
configured.

Apply `supabase/migrations/*.sql` in order before pointing at a real project.
Server-side writes need `SUPABASE_SERVICE_ROLE_KEY` (the anon key hits RLS).

```bash
npx tsc --noEmit     # types
npx jest             # tests (node environment, in-memory store)
npm run check:ai     # ping every configured AI backend with a real request
```

## AI backend chain

[`src/lib/ai.ts`](src/lib/ai.ts) tries each configured backend in order until one
succeeds, logging `[ai] ✓ <backend>` / `[ai] ✗ <backend>: …`.

| Priority | Backend | Env | Default models |
|---|---|---|---|
| 1 | MiniCPM (self-hosted, OpenAI-compatible) | `MINICPM_BASE_URL` (+ optional `MINICPM_API_KEY`) | `openbmb/MiniCPM5-1B` |
| 2 | Groq | `GROQ_API_KEY` | `llama-3.3-70b-versatile` · `llama-3.1-8b-instant` |

`RAIS_AI_BACKEND=minicpm|groq` moves one to the front; it does not disable the
other as a fallback.

## Deployment

**Plant / on-prem (supported path):** Docker Compose appliance on a single Linux
server — see **[docs/deploy/on-prem.md](docs/deploy/on-prem.md)** and the
[`deploy/`](deploy/) kit (`install.sh`, backup/restore, air-gap notes).

**Generic Next.js / Vercel:** set Supabase variables plus optional AI backends.
`MOID_COMPANY_ID` scopes schema stores if you host more than one plant; it
defaults to `default`.

**Sign-in (always on):** every request hits `/login` until a session cookie is
set. Roles match the topbar (GM / Owner / Operator); default passwords are
hardcoded (`moid-gm`, `moid-owner`, `moid-operator`). Optional env overrides:
`MOID_AUTH_PASSWORD_*` for passwords, `MOID_AUTH_SECRET` only if you want a
custom session HMAC (a built-in default is used otherwise).

**Move Data Entry between databases:** On Data Entry, topbar **Export entries**
opens a panel to pick scope/dates/format → download JSON → Staging →
*Import transfer package* (idempotent append).

## License

Private.
