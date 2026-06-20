# 02 · Architecture & Data Flow

## 2.1 Tech stack (as-built PoC)
| Layer | Choice |
|---|---|
| UI / app | Next.js 16 (App Router) + React 19 + TypeScript |
| AI | AI SDK v6 via `tryModels()` — Groq → NVIDIA → OpenRouter (free tier). On-prem adds **Ollama**. |
| Validation | Zod 4 (the contract for every event + every AI call) |
| Spreadsheets | SheetJS (`xlsx`), isomorphic |
| DB | Supabase (Postgres) **or** in-memory process singleton |
| Styling | Tailwind v4 + CSS variables; inline SVG charts; CSS-only animation |
| Tests | Jest (161) |

## 2.2 The LIVE data flow (the only one that feeds the cockpit)
```
 Excel workbooks ──┐                              ┌── Direct entry (/data-entry form)
                   ▼                              ▼
        recordsFromBuffer(buf, fileName)     StageDayRecord (typed)
        routeFamily → family parser                │
                   ▼                              ▼
              StageDayRecord[]  ───────────────────
                   │  dedupeByPrecedence  (identity = stageId|date; size-wise authoritative)
                   ▼
              emitMany() → CanonicalEvent[]
                   │   checked → ProductionEvent
                   │   rejected/accepted/rework → InspectionEvent
                   │   defects[] → RejectionEvent (resolveDefect)
                   │   statedPct → AggregateClaimEvent (a claim, never an input)
                   ▼
        POST /api/ingest → EventStore.append()   (idempotent on content-hash eventId)
                   ▼
        GET /api/events → canonicalizeEvents()   ◄── single chokepoint; the no-double-count guard
                   ▼
        src/lib/analytics/* selectors  (pure, deterministic)
                   ▼
        Dashboard cockpit + 11 analytics screens (React, inline SVG)
```

## 2.3 The LEGACY pipeline — do NOT extend
`/api/analyze` → `metrics.ts` (`inferSheetGraph` + `computeMetrics`) → `dashboard-builder.ts` → `components/Dashboard.tsx`.
A self-contained "upload → instant DashboardConfig" session view. **It does not feed the main cockpit** (which reads the event store). It exists from an earlier design; keep for reference, build nothing new on it. *(This trap cost a prior debugging attempt — edits there changed nothing on the live dashboard.)*

## 2.4 Request surface (API routes — `src/app/api/`)
| Route | Purpose |
|---|---|
| `GET /api/events` | Returns the **canonicalized** ledger (all screens fetch here). |
| `POST /api/ingest` | Commit verified `StageDayRecord[]` → emit → append; runs validation + conflict reconcile. |
| `POST /api/archive-upload` | Store raw file bytes, return `fileHash`. |
| `POST /api/chat` | Ask RAS NL Q&A over the ledger. |
| `POST /api/hard-reset` | Clear the store to blank (no re-seed). |
| `GET/POST /api/schema` | Master registry (stage/defect config) get/set. |
| `/api/sessions/*` | Legacy session persistence (analyze pipeline). |

## 2.5 On-prem deployment topology (production target)
```
 [Shopfloor Terminal] [Supervisor Terminal] [GM Terminal]
        └──────────────┬──────────────┘   (Local LAN, HTTP/HTTPS)
                       ▼
              Next.js Web UI + API routes        (or Next UI + FastAPI engine)
                       ▼
        ┌──────────────┴───────────────┐
        ▼                              ▼
  Local PostgreSQL              Local GPU server (Ollama, llama-3-8b)
        ▼
  Read-only /Uploads/Original/  (source files never edited)
```
No outbound internet by default. If a cloud AI fallback is permitted, it passes through the **de-identification middleware** + an **Nginx whitelist proxy** ([14-security-airgap](14-security-airgap.md)).
