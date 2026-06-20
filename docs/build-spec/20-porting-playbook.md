# 20 · Porting Playbook — Prompts for Antigravity / Claude Code

**Goal:** rebuild as **FastAPI + Pydantic + pandas backend, REUSING the existing React/Next.js frontend** (Option B). Do NOT rewrite the UI in Python — port only `src/lib/*` (the pure engine). Keep this repo as the read-only **reference + test oracle**.

## 0. The method: parity-test-driven porting
Re-implementing from reading code re-introduces subtle bugs. Instead, make the TS reference the oracle:
1. Dump a golden fixture from the TS engine (events + KPIs over `ANALYTICAL DATA/`).
2. Port each Python module **test-first** — assert Python output == the golden TS output, number-for-number.
3. Port until green. Behaviorally identical, module by module.

## 1. Paste this PREAMBLE into EVERY porting prompt
> You are porting a proven TypeScript reference app to Python (FastAPI + Pydantic + pandas). The reference repo is at `<PATH_TO_RAIS-Pro>` (read-only). The spec is in `docs/build-spec/`. Honor these **non-negotiable invariants** (`docs/build-spec/18-correctness-invariants.md`): the model never computes a number; dedup identity is `stage|date` with size-wise authoritative + one source file per stage·day; doubling the ledger must not change any KPI; `totalChecked` = entry stage only; rejection rate = Σ per-stage rates; FPY = Π(1−stageRate); stage yield = 1−rejRate; `resolveDefect` is separator-insensitive (90-10==90/10), unknown→verbatim never "Unknown"; numbers must reproduce the client's embedded YEARLY-sheet totals. Mirror the reference's types exactly (Pydantic = the Zod schema). Write the parity test FIRST (load `golden.json`, assert equality), then implement until green. Do not invent fields or change formulas.

## 2. Setup prompts

**P0 — Generate the golden fixture (run in THIS repo first):**
> In the RAIS-Pro repo, write `scripts/dump-golden.ts`: seed `ANALYTICAL DATA/` via `recordsFromBuffer`+`dedupeByPrecedence`+`emitMany`, run `canonicalizeEvents`, and write `golden/golden.json` containing: the full canonical event list, and for DEFAULT_SCOPE + each month: rejectionRate, totalChecked, totalRejected, fpy, byStage (with yield+contributionPct), byDefect, bySize. Also copy a few representative `ANALYTICAL DATA` files into `golden/fixtures/`. This JSON is the cross-language contract.

**P1 — Scaffold the Python backend:**
> Scaffold a FastAPI service `moid-api/`: Python 3.11, Pydantic v2, pandas, openpyxl, psycopg/SQLAlchemy, pytest. Mirror the reference module layout: `contract/`, `ingest/parsers/`, `analytics/`, `registry/`, `store/`, `api/`. Add a `tests/` dir that loads `golden/golden.json`. No business logic yet — just structure, deps, and a health route.

## 3. Engine porting prompts (bottom-up; one module per prompt, each with PREAMBLE)

**P2 — Contract (data model):** Port `src/lib/contract/d1.ts` → Pydantic. Every event variant (production/inspection/rejection/aggregate-claim/correction/annotation/carryover/dispatch), Period, Provenance, Confidence, ClientRegistry, CostConfig. Use a discriminated union on `event_type`. Port `hash.ts` exactly: `canonicalize`=JSON with sorted keys (arrays keep order), `hash_event`/`hash_finding`=sha256(...)[:32], excluding the same non-identity fields. **Test:** re-hash 50 events from `golden.json` → identical `event_id`s. See `docs/build-spec/03`.

**P3 — Registry:** Port `registry/disposafe.ts`: 5 stages (eye-punching effective 2025-11-01), 13 defects+aliases, `resolve_defect` (normalize = upper + strip non-alphanumerics), `active_stage_ids(date)`. **Test:** `resolve_defect` parity table (90-10/90/10/90 10→"90/10", THIN SPOD→THSP, ZZZ→None). See `docs/build-spec/04`.

**P4 — Excel parsers:** Port `ingest/parsers/` with **pandas/openpyxl**. `route_family`, `parse_size_wise` (content-based Valve vs Visual detection — scan sheet text for "VALVE INTEGRITY"/"STRUCK BALLOON" vs "REASON FOR REJECTION"; valve book emits balloon+valve rows from the side-by-side columns), `parse_rejection_analysis`, `records_from_buffer`. Port `parser.detect_header_row`/`build_header_block` (multi-row header merge). **Test:** parse `golden/fixtures/*` → `StageDayRecord`s match the golden records (stage, size, checked, rejected, defects). See `docs/build-spec/05`.

**P5 — Emit + dedup:** Port `emit.py` (StageDayRecord→events: checked→production, rejected/accepted/rework→inspection, defects→rejection, statedPct→aggregate-claim) and `dedupe_by_precedence` (group by `stage|date`, winning family, single source file). **Test:** emit golden records → events match `golden.json`. See `docs/build-spec/05`, `06`.

**P6 — Canonicalizer (CRITICAL):** Port `analytics/canonical.canonicalize_events`: (1) eventId dedup, (2) drop size=null when size!=null exists per stage·day, (3) one source file per stage·day (precedence via route_family, lexicographic tie-break). **Test (the key one):** `canonicalize(events) == canonicalize(events*2)` byte-for-byte, AND equals the golden canonical set. See `docs/build-spec/06`.

**P7 — Analytics:** Port `analytics/{rejection,defect,size,cost,trust,status,scope,narrative}.py` with EXACT formulas from `docs/build-spec/07`: rejection rate=Σ stage rates, totalChecked=entry stage, FPY=Π(1−r), byStage.yield=1−rejRate, COPQ=Σ rejₛ×cost×weight (STAGE_WEIGHTS), savingsOpportunity, trustScore, qualityStatus, scope (FY=Apr–Mar, week-of-month). **Test:** every KPI/byStage/byDefect for DEFAULT_SCOPE + each month matches `golden.json`; clean months match YEARLY (Apr 14.18%, etc.).

**P8 — Validation/Findings:** Port `entry/validate-entry.checkRecord` (V-013/V-001/V-004/V-003, EPS=0.005) and `checkSpike` (V-009, 3σ); port `contract/d3` Finding/Adjudication/Rulebook Pydantic models. See `docs/build-spec/08`.

**P9 — Store + DB:** Port `store/` to **local PostgreSQL** (SQLAlchemy). Implement the `events`/`findings`/`registries`/`cost_config` tables from `docs/build-spec/12`. `append` idempotent on `event_id`; `effective(filter)`. Auto-seed OFF; `/hard-reset` clears blank. **Test:** append same events twice → one row.

**P10 — AI layer:** Port `ai.try_models` chain but target **local Ollama** first (`meta-llama-3-8b-instruct`); keep structured output via an Ollama JSON-schema/`instructor` equivalent of `generateObject`+Zod. AI = classification (with metrics-sane gate) + narrative ONLY. Add the de-identification middleware (`docs/build-spec/14`). See `docs/build-spec/09`.

**P11 — API routes:** FastAPI endpoints matching the reference contract so the React frontend works unchanged: `GET /api/events` (returns **canonicalized** events), `POST /api/ingest`, `POST /api/archive-upload`, `POST /api/chat`, `POST /api/hard-reset`, `GET/POST /api/schema`. **Test:** `GET /api/events` JSON shape == the TS route's shape.

**P12 — Audit export:** Port `audit-package.build_audit_package` → ZIP (use Python `zipfile`) of the 6 CSVs + `manifest.json` with SHA-256 per file (`docs/build-spec/13`). **Test:** unzip, re-hash, every manifest hash matches.

## 4. Frontend rewiring (NOT a rewrite)

**P13 — Point React at FastAPI:**
> Copy the React/Next.js frontend (`src/app/*`, `src/components/*`, `TweaksContext`, design tokens, `src/lib/analytics/*` types) from the reference repo verbatim. Change ONLY the data layer: replace Next.js API-route handlers with `fetch` calls to the FastAPI base URL (env `NEXT_PUBLIC_API_BASE`). Keep all UI, theming, charts, verify-beam, staging grid identical. The frontend must not contain business logic — it renders what `/api/events`-derived selectors compute (or move the selectors server-side and return computed view models). Verify the cockpit renders against the FastAPI backend.

*(Alternative: keep selectors client-side in TS — then the analytics layer is duplicated. Prefer moving selectors to the Python API and returning view models, so there's ONE source of truth for the math.)*

## 5. Final acceptance prompt

**P14 — Parity & gates:**
> Run the full parity suite: every KPI/byStage/byDefect over `ANALYTICAL DATA/` must equal `golden.json`; clean months must equal the client's YEARLY sheet; `canonicalize(events) == canonicalize(events*2)`; audit ZIP hashes verify. Then run the on-prem gates from `docs/build-spec/15`. Produce a parity report listing any divergence (there should be none).

## 6. Anti-patterns to FORBID in every prompt
- ❌ Rewriting the UI in Streamlit/Reflex/Dash (loses the UI/UX).
- ❌ Letting the LLM compute/return any KPI or chart value.
- ❌ Dedup keyed on `stage|size|date` (re-introduces 2× double-count).
- ❌ Summing `checked` across stages (quadruple-count) or `yield = good/checked`.
- ❌ Defect matching on punctuation; emitting "Unknown" for unmapped defects.
- ❌ Auto-seeding demo data in production.
- ❌ "Looks right" — every module must pass its parity test vs `golden.json`.
