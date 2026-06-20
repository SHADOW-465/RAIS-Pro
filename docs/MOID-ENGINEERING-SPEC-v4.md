# MO!D — Engineering Spec & Production Rebuild Guide
*Version 4.0 · As-Built Architecture (PoC) + On-Prem Rebuild Blueprint · June 2026*
*Companion to [MOID-CANONICAL-SPEC.md](./MOID-CANONICAL-SPEC.md) (product vision, security, on-prem topology). Where the canonical spec's §4 "golden relational schema" and §3 "FastAPI" differ from this document, **this document reflects what is actually built and proven**; §4/§3 are an alternate target discussed in the Rebuild section.*

---

## 0. How to read this
- **§1–§12** = the as-built application (the working PoC). Copy these patterns verbatim — they are the IP and they are correctness-proven.
- **§13** = what to change to ship the on-prem production build (local LLM, local Postgres, air-gap).
- **§14** = module map. **§15** = rebuild checklist.

The single most important idea: **the dashboard is a pure function of an append-only event ledger. The LLM never computes a number. All arithmetic is deterministic JS, verified against the client's own embedded spreadsheet totals.**

---

## 1. Product summary

MO!D (Manufacturing Operational Intelligence & Diagnostics, a.k.a. RAIS) turns a medical-device plant's messy daily inspection paperwork (Foley Balloon Catheter line, Disposafe) into a traceable rejection-intelligence cockpit. V1 scope = **rejections and money lost**.

**Personas:** GM (reads cockpit, exports audit pack), Quality Manager (drills stage/defect/size, runs Ask RAS), Supervisor/Operator (uploads sheets, edits staging grid, adds comments).

**Three things competitors can't do:** (1) every KPI traces to a source cell + file hash + edit comment (provenance), (2) overlapping/duplicate uploads can never double-count (read-side canonicalizer), (3) numbers reproduce the client's own Excel charts exactly (verified).

---

## 2. Tech stack (as-built)

| Layer | Choice | Notes |
|---|---|---|
| Framework | **Next.js 16 (App Router) + React 19 + TypeScript** | API routes + RSC; not FastAPI in the PoC. |
| AI | **AI SDK v6** via `tryModels()` provider chain | Gateway → Anthropic → OpenRouter → Google → Groq → **Ollama**. `generateObject` + Zod only. |
| Validation | **Zod 4** | Schemas are the contract for every AI call and the canonical event union. |
| Spreadsheets | **SheetJS (`xlsx`)** | Client- and server-side, isomorphic parsers. |
| Persistence | **Supabase (Postgres)** or process-singleton **in-memory store** | Swappable behind `EventStore`. |
| Styling | **Tailwind v4 + CSS variables** (design tokens), inline SVG charts | No Chart.js / lucide / framer-motion. CSS-only animation. |
| Tests | **Jest** (161 tests: schema, analytics, parsers, dedupe, correctness) | Golden tests vs embedded spreadsheet totals. |

---

## 3. System architecture (data flow)

```
 Excel workbooks ──┐                          ┌── Direct entry (/data-entry)
                   ▼                          ▼
        recordsFromBuffer(buf, name)   StageDayRecord (typed form)
        routeFamily → family parser            │
                   ▼                          ▼
            StageDayRecord[]  ──────────────────────────
                   ▼  dedupeByPrecedence (stage|date, size-wise authoritative)
              emitMany() → CanonicalEvent[]   (checked→Production, rejected→Inspection,
                   ▼                            defects→Rejection, %→AggregateClaim)
           EventStore.append()  (idempotent on content-hash eventId)
                   ▼
        GET /api/events → canonicalizeEvents()   ◄── THE no-double-count guard
                   ▼
        src/lib/analytics/* selectors (pure, deterministic)
                   ▼
        Dashboard + 11 analytics screens (React, inline SVG)
```

**Two pipelines exist; only one is live.**
- **LIVE:** the flow above (`/staging` + `/data-entry` → event store → `/api/events` → `analytics/*`).
- **LEGACY (do not extend):** `/api/analyze` + `metrics.ts` + `dashboard-builder.ts` → `components/Dashboard.tsx`. A self-contained session view; **does not feed the cockpit.** Kept for reference only.

---

## 4. Canonical data model — the event ledger (the heart)

Append-only. Defined as a Zod **discriminated union on `eventType`** (`src/lib/contract/d1.ts`), re-exported as `Event` from `src/lib/store/types.ts`.

**Envelope (every event):** `eventId` (SHA-256 content hash of type+occurredOn+provenance+payload → free idempotency), `schemaVersion`, `ingestionId`, `occurredOn` (`Period {kind: day|week|month|fiscal-year, start, end}`), `provenance` (`file, fileHash, sheet, tableId, cells[], headerPath[], rowLabel, formulaText, cachedValue, …`), `confidence {score, basis}`, `extractedBy` (`heuristic|llm:<model>|direct-entry`), `recordedAt`, `supersededBy`.

**Variants:**
| eventType | payload | emitted from |
|---|---|---|
| `production` | stageId, quantity, unit, batchNo, size | `checked` qty |
| `inspection` | stageId, **disposition** (accepted/rejected/rework/hold/downgrade), quantity, size | `rejected`/`accepted`/`rework` qty |
| `rejection` | stageId, **defectCode** (registry id, nullable), **defectCodeRaw** (verbatim), quantity, size | each `defects[]` entry |
| `aggregate-claim` | claimKind (sum/percentage/…), statedValue, aboutStageId, aboutDefectCode | stated `REJ %` (a claim **to verify, never an input**) |
| `correction` | supersedesEventId, replacementEventId, reason, authorisedBy | adjudication |
| `annotation` | targetEventIds[], targetCells[], text, author, findingId, verdict | staging-grid comments |
| `carryover`, `dispatch` | quantity, refs | reserved |

**Why an event ledger, not the §4 relational tables:** append-only = native audit trail (ALCOA+), idempotency via content hash, corrections never mutate history (supersede instead), and read-side dedup tolerates any ingestion order. The §4 golden schema (`stage_measurements` with `chk_qty_balance` constraint) is a fine *projection* of these events for an on-prem Postgres if desired (see §13).

---

## 5. Ingestion pipeline

### 5.1 Family parsers (`src/lib/ingest/parsers/`)
`routeFamily(filename)` (pure, in `parsers/types.ts`) → `size-wise | assembly-daily | rejection-analysis | stage-report | cumulative | null`. `recordsFromBuffer(buf, fileName)` routes to:
- **parse-size-wise** — per-FR size sheets (`6FR…26FR`). Detects **Valve vs Visual workbook from sheet content** (`"VALVE INTEGRITY"/"STRUCK BALLOON"` vs `"REC. QTY"/"REASON FOR REJECTION"`) because browser uploads have no folder path. Valve books emit **balloon + valve-integrity** rows (side-by-side tables); Visual books emit **visual**. Reads CHECKED/REC + REJ + defect columns per size.
- **parse-rejection-analysis** → `classifyRejectionSheets` — stage-per-sheet monthly books (sheet name → stage). Reads DATE/CHECKED/REJECTION. No defects.
- **parse-assembly-daily** — fixed-column daily activity (currently `routeFamily` skips `DAILY ACTIVITY REPORT`: its evolving layout doesn't match the fixed columns and it's redundant for counts).

All parsers produce **`StageDayRecord`** (`src/lib/ingest/emit.ts`): `{occurredOn, stageId, size, source{file,fileHash,sheet,tableId}, checked|acceptedGood|rework|rejected: SourcedValue|null, defects[], statedPct, extractedBy, ingestionId, comment}`.

### 5.2 De-dup — `dedupeByPrecedence` (seed-time) + `canonicalizeEvents` (read-time)
**Identity is `stageId|date`, NOT `stageId|size|date`** (the original bug: null-size whole-line and per-Fr rows never collided → ~2× inflation). Rules, applied at BOTH layers:
1. Collapse exact-duplicate `eventId`s (re-seeds, re-uploads).
2. **Size tier:** if any per-size row exists for a stage·day, drop the redundant whole-line (size=null) aggregate; the per-size rows sum to the stage total.
3. **One source file per stage·day:** highest family precedence wins (`size-wise 40 > assembly/rejection 30 > stage-report 20 > cumulative 0`), lexicographic tie-break. Multiple batches **within** one file still sum.

`canonicalizeEvents` runs once at `/api/events` (the single chokepoint all 11 screens fetch). **This makes correctness independent of ingestion order or store contents** — proven STABLE under ledger-doubling. Source identity uses `provenance.file` (disk-seed events all share `fileHash:"local"`).

### 5.3 Generic fallback + staging
For unknown layouts: `extractSchemaFromWorkbook` + `classifyWithSchema` (`schema-extractor.ts`) map columns by header regex to roles. `/staging` processes **all** uploaded files, prefers family parsers, falls back to the generic classifier, runs `dedupeByPrecedence`, shows an **editable review grid** (per-cell edit, swap checked↔rejected, comments), then `POST /api/ingest` → `emitMany` → store.

---

## 6. Analytics engine (`src/lib/analytics/`) — exact formulas

> **Invariant: the model never does maths.** Every number below is pure JS over the canonical events.

- **Rejection Rate (headline)** = **Σ of per-stage rejection rates** = Σₛ(rejectedₛ / checkedₛ). This is the client's "Total Rejection %" convention — it reproduces their YEARLY sheet exactly (Apr = 7.78+0.88+2.85+2.67 = 14.18%). It is **not** overall rejected÷checked.
- **Total Checked** = the **entry stage** (Visual) checked qty. Never Σ-checked across stages (same physical unit at each gate → quadruple-count).
- **Total Rejected** = Σ rejected units across all stages (a count).
- **FPY** = rolled-throughput yield = **Πₛ(1 − rateₛ)**. (Note: FPY and the Σ-stage rejection rate intentionally do **not** sum to 100% — Π(1−r) ≥ 1−Σr always. Both are correct.)
- **byStage:** per stage `{checked, rejected, rejRate=rej/chk, yield=(chk−rej)/chk=1−rejRate, contributionPct=rej/ΣRej}`. **Yield must be 1−rejRate** — never `good/checked` (accepted is only partially captured by parsers and would report ~0%).
- **byDefect (Pareto):** group rejection events by resolved `defectCode` (fallback raw), desc, with cumulative %. `resolveDefect` is **separator-insensitive** (collapses non-alphanumerics → `90-10`==`90/10`); unknown codes show verbatim (low-confidence), never "Unknown".
- **bySize:** per-Fr checked/rejected/rate.
- **COPQ** = Σₛ rejectedₛ × (financeCost × stageWeightₛ). **Savings** = max(target-gap, 25%·COPQ). Costs are dynamic inputs (₹/unit, rework), never hardcoded.
- **Trends:** `trend` (Σ-stage % per period), `stageTrend`, `weeklyTrend`. Grain = day/week/month/fy; **FY = Apr–Mar**; week = week-of-month.
- **SPC:** X-bar with LCL/mean/UCL computed on-the-fly from active trend points; Western Electric rule violations flagged.

`scope.ts`: `scopeEvents(events, scope)` filters by date-overlap, stageIds, sizes; events without a stage/size pass through.

---

## 7. Domain ontology — registry (`src/lib/registry/disposafe.ts`)

Versioned config (not events). `DISPOSAFE_REGISTRY`: **5 stages** in funnel order — `visual → eye-punching (effective 2025-11-01) → balloon → valve-integrity → final`; `activeStageIds(date)` respects effective-dating drift. **13 defect codes** with alias lists (THSP, STBL, LEAK, BLBR, BUB, 90/10, PINH, COAG, SD, RW, BM, WEB, OTH). Unresolved raw labels → low-confidence event + a V-007 Finding, **never an invented category**. Shop-floor sheet field schema captured in [shop-floor-schemas/shop-floor-log-schema.xlsx](./shop-floor-schemas/shop-floor-log-schema.xlsx).

---

## 8. Validation rules & Findings (the ingestion gate)
Run locally before commit (Excel or manual):
1. **Arithmetic balance:** Checked = Accepted + Hold + Rejected.
2. **Defect sum:** Σ defective = Rejected.
3. **Mass balance (Poka-Yoke):** Checkedₛ ≤ Acceptedₛ₋₁ + carryover.
4. **Spike (3σ):** stage rate vs 30-day mean ≥ 3σ → warning.
Failures → row flagged **Pending Adjudication**, cells highlighted amber/red, user edits or comments, commit writes events + an `annotation` event. Conflicts on re-ingest raise a Finding (`V-010 value-conflict`), not a silent overwrite.

---

## 9. AI layer

- **All AI flows through `tryModels(fn, opts)` (`src/lib/ai.ts`)** — walks every configured backend in priority order; first success wins. Never call `generateObject` with a raw handle.
- **AI is used for two things only:** (a) **classification** — the per-sheet column-role graph (heuristic `inferSheetGraph` fallback + a `metricsSane()` sanity gate so a hallucinated graph can never inject "random numbers"); (b) **narrative** — prose for the cockpit/Ask RAS. **Never KPI or chart values.**
- **Ask RAS chat** (`/chat`, `/api/chat`): NL Q&A over the ledger; answers carry a **View Source** flyout → exact cell coords, file hash, ledger id, edit comments (§7 canonical spec).
- **Schemas (`src/lib/schemas.ts`)** obey cross-provider rules: `.nullable()` not `.optional()` (Groq/OpenAI strict), plain ints not literal unions (Google), strings for KPI values. Run `npm run check:ai` after schema changes.

---

## 10. UI / UX — "The Rejection Report" editorial design

Locked design language (an editorial diagnostic for pharma GMs — **not** glassmorphism, not stock-market charts):
- **Palette:** warm paper bg, near-black ink, burnt-orange accent `#C8421C`, status colors. **Fonts:** Fraunces (display serif), Inter Tight (UI), JetBrains Mono (numbers, tabular-nums).
- **Theming via CSS variables** painted by `TweaksContext` on `<body data-density / data-bg / data-card / data-chart-style>` (`--paper, --ink, --accent, --serif…`). New components consume vars, never hardcode hex. Design primitives in `src/components/editorial/`.
- **Charts are inline SVG**; animations are pure CSS (`pulse-ring, blink, fade-up, draw-line`).
- **Screens (`src/app/`):** dashboard (cockpit), staging, data-entry, stage-analysis, size-analysis, defect-analysis, spc, copq, process-flow, reports, audit, chat, settings, capa.
- **Cockpit layout:** AI Executive Summary + Recommended Actions + COPQ gauge + Quality Status; KPI strip (Rejection Rate / Total Rejections / FPY / COPQ / Savings); Rejection Trend (D/W/M/FY segmented); Process Flow Overview (per-stage Checked|Rej|Yield + rate badge); Stage-wise trend; Pareto; Size-wise.
- **Empty state** (no events): names the exact workbooks to upload (Visual size-wise, Valve Integrity size-wise, Rejection Analysis) + button to Staging. **No demo/seed data** (start blank).
- **Verify mode:** KPI `sourceColumn` ref → column header ref → `getBoundingClientRect()` on both → bezier beam recomputed on scroll/resize (client-side).
- **Sticky** masthead + verify-panel headers (scroll-heavy screens).

---

## 11. Export — audit-ready package (`src/lib/audit-package.ts`)
`buildAuditPackage(events, scope)` → **ZIP** (dependency-free stored-ZIP writer + Web Crypto SHA-256), wired to the AppShell **Export** button. Contents: `01-rejection-summary` (KPIs **with metric definitions**), `02-stage-wise`, `03-defect-pareto`, `04-size-wise`, `05-monthly-trend`, `06-event-ledger` (full provenance), + **`manifest.json`** hashing every file (ALCOA+). Also: 3-page A4 print report (browser print-to-PDF). *(ZIP, not RAR — RAR needs a proprietary encoder; ZIP is the ALCOA+ standard.)*

---

## 12. Persistence & store abstraction (`src/lib/store/`)
`getStores()` → `{events, findings, rulebook, backend}`. `EventStore.append(events)` (idempotent on `eventId`) / `effective(filter)`. Backends: **Supabase** (when `NEXT_PUBLIC_SUPABASE_URL` + key) or **in-memory** (process singleton; `MOID_STORE=memory`). **Auto-seed is OFF by default** (`MOID_AUTOSEED=1` to enable disk seeding for dev). `/api/hard-reset` clears to blank (no re-seed). Migrations in `supabase/migrations/`.

---

## 13. Production rebuild — on-prem deployment (what changes)

The PoC proves the engine. For the plant's air-gapped local systems (MOID-CANONICAL-SPEC §3, §8):

| Concern | PoC (now) | Production on-prem |
|---|---|---|
| **LLM** | AI Gateway / cloud providers | **Local Ollama** (`meta-llama-3-8b-instruct`) — already last in the `tryModels` chain; set `OLLAMA_BASE_URL`, drop cloud keys, or front with the de-id middleware + Nginx whitelist proxy (§8 canonical) if a cloud fallback is allowed. |
| **DB** | Supabase cloud | **Local PostgreSQL** — same `EventStore` interface; point Supabase client at the LAN PG, or implement a `PgEventStore`. Optionally also project events into the §4 relational tables (`stage_measurements` + `chk_qty_balance`) for SQL/BI. |
| **Hosting** | Vercel | **Local server on plant LAN** (HTTP/HTTPS), Next.js `next start` behind Nginx; multi-terminal (GM/Supervisor/Operator) via LAN. |
| **Backend split** | Next.js API routes | Keep Next.js API routes **or** extract the deterministic engine (parsers, dedupe, analytics, emit — all pure TS) behind FastAPI if Python-side SPC/BI is wanted. The engine is framework-agnostic. |
| **File storage** | archive route | Read-only `/Uploads/Original/` (never edits source). |
| **Auth/roles** | minimal | Role-based views (GM/QM/Supervisor/Operator); Postgres RLS. |
| **Security** | n/a | Payload **de-identification middleware** (pseudonymize SKU/operator/machine before any external call) + Nginx forward-proxy whitelisting only the AI endpoint; everything else 403. |

**Copy verbatim (the IP, correctness-proven):** the event-ledger contract (`contract/d1.ts`), `ingest/parsers/*` + `emit.ts` + `dedupeByPrecedence`, `analytics/*` (esp. `canonical.ts` + the formulas in §6), `registry/disposafe.ts`, `audit-package.ts`, the design tokens. **Re-derive only the host/DB/LLM bindings.**

---

## 14. Module map
- **Contract/model:** `src/lib/contract/d1.ts` (events), `d3.ts` (Findings), `store/types.ts`.
- **Ingestion:** `src/lib/ingest/parsers/{index,types,parse-size-wise,parse-rejection-analysis,parse-assembly-daily,dedupe,reconcile}.ts`, `ingest/{emit,schema-extractor,from-rejection-sheets,review,date}.ts`.
- **Analytics:** `src/lib/analytics/{canonical,rejection,defect,size,cost,trust,status,scope,narrative,index}.ts`.
- **Registry:** `src/lib/registry/disposafe.ts`. **AI:** `src/lib/ai.ts`, `schemas.ts`, `analysis-utils.ts`.
- **Store:** `src/lib/store/{index,memory,supabase,seed,types}.ts`. **Export:** `src/lib/audit-package.ts`.
- **Routes:** `src/app/api/{events,ingest,chat,hard-reset,archive-upload,schema,sessions}/`.
- **UI:** `src/app/*` (screens), `src/components/{editorial,app}/`, `TweaksContext`.
- **Legacy (don't extend):** `api/analyze`, `lib/metrics.ts`, `lib/dashboard-builder.ts`, `components/Dashboard.tsx`.
- **Verification harnesses:** `scripts/{diagnose-analytical,audit-verify}.ts`.

---

## 15. Rebuild checklist
1. Scaffold Next.js 16 + React 19 + TS; add `ai` (v6), `zod`, `xlsx`, `@supabase/supabase-js` (or local PG client).
2. Port the **event contract** (`contract/d1.ts`) and `store/` (swap backend to local PG).
3. Port `ingest/parsers/*`, `emit.ts`, `dedupeByPrecedence`, `schema-extractor` — keep `routeFamily` content-detection.
4. Port `analytics/*` incl. **`canonicalizeEvents` wired at `/api/events`** and the §6 formulas. Port `registry/disposafe.ts`.
5. Wire `tryModels` to **local Ollama**; keep AI to classification + narrative only; `npm run check:ai`.
6. Build screens from the editorial design tokens; empty-state guidance; verify-mode beams.
7. Port `audit-package.ts`; add the 3-page A4 print report.
8. Add role auth + RLS; de-id middleware + Nginx proxy for any external AI.
9. **Verify like the PoC:** golden tests vs the client's embedded spreadsheet totals (clean months must match YEARLY exactly); doubling-stability test for the canonicalizer; `tsc` + full jest + build green before deploy.

---

## 16. Correctness invariants (must hold — these are the proof points)
1. The model never produces a KPI/chart number.
2. De-dup identity is `stage|date`; size-wise authoritative; one source file per stage·day; **doubling the ledger must not change any KPI.**
3. Headline rejection rate = Σ per-stage rates (matches client YEARLY); `totalChecked` = entry stage; FPY = Π(1−r); stage `yield` = 1−rejRate.
4. `resolveDefect` separator-insensitive; unknown → verbatim, never "Unknown"/invented.
5. App starts blank; uploads/entry are the only data sources; every KPI traces to a source cell + hash + comment.
6. Export = ZIP of CSVs + SHA-256 manifest (ALCOA+).
