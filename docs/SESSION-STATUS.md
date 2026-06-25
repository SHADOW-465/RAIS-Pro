# Session Status — 2026-06-25

A plain-English record of everything done in this session, what's verified, what's
still open, and where to look. Use this to brief Antigravity or pick up later.

> **TL;DR.** Three bodies of work shipped to `main`: (1) the full-fidelity
> multi-stage / size-wise data-entry feature, (2) the on-prem appliance packaging
> (Docker/Compose/Caddy + guide), and (3) the Supabase→Postgres + cloud→local-LLM
> migration. **Everything is build-verified and unit-tested (190 jest tests pass,
> `next build` green).** It is **not yet runtime-tested against a live Postgres +
> Ollama** — that happens on your first `docker compose up`.

---

## 1. Full-fidelity multi-stage, size-wise data capture  ✅ done & pushed

**What changed:** Data Entry went from one flat table to **registry-driven stage
tabs + a size×field grid**. Each quality gate (Visual/Balloon/Valve/Final) now
captures per-size rows with the right defect columns; throughput stages
(Production, Leaching, etc.) capture a single whole-line row. Bulk Excel import
and manual entry now produce identical records and de-duplicate on `stage|date`.

- Registry: full 13-stage process chain, 28-code SOP defect catalog, a `sizes`
  dimension, and per-stage `captures`/`sizeWise` metadata.
- Parsers: size-wise now captures **Accept + Hold**; **new Daily Activity Report
  parser** ingests the full process chain (was previously skipped).
- Staging auto-extracts French sizes from `NN FR` sheet names into the registry.
- Plan: `docs/superpowers/plans/2026-06-25-fullfidelity-multistage-entry.md`.

**Verified:** 12 tasks, each spec- + quality-reviewed; daily-activity column map
validated against the real workbook binary; jest + tsc + build all green.

**Scope note:** this deliberately expands beyond the old "rejection-only v1" — it
now covers full throughput (you chose this).

## 2. On-prem appliance packaging  ✅ done & pushed

A sealed, air-gapped, single-box deployment. See **`docs/DEPLOYMENT.md`** (full
guide) and **`docs/DOCKER-FOR-BEGINNERS.md`** (step-by-step for first-timers).

- `Dockerfile` — multi-stage; ships only the minified Next standalone bundle (no
  source).
- `docker-compose.yml` — `caddy` (TLS) + `app` + `db` (Postgres) + `ollama`.
- `Caddyfile` — HTTPS via internal CA; only service that exposes ports.
- `.env.template` — all on-prem config; egress off by default.
- `next.config.ts` — `output: "standalone"` + `pg` externalized.

## 3. Supabase → Postgres + cloud → local LLM  ✅ done & pushed

The app now runs on a plain Postgres DB and a local Ollama LLM.

- `src/lib/db/pg-client.ts` — a **pg-backed shim** that mimics the slice of the
  Supabase query-builder the code used, so the ~14 call sites work unchanged.
  Returned by `createServerClient()` whenever `DATABASE_URL` is set.
- `db/init.sql` — consolidated plain-Postgres schema (no Supabase RLS/roles),
  incl. the new `registries.sizes` column and the `dashboards` table. Runs
  automatically on the Postgres container's first boot.
- `src/lib/ai.ts` — added an **Ollama backend**; `RAIS_AI_BACKEND=ollama` makes it
  the active provider. Cloud providers stay available only if keys are set.
- Existing `memory` store and cloud Supabase paths still work (backwards compat).

**Verified:** SQL-generation unit tests for the shim; the two highest-risk areas
(jsonb-array coercion and `ON CONFLICT DO UPDATE` vs `DO NOTHING`) reviewed and
correct; tsc + jest (190) + build all green.

---

## What is NOT done / open items

1. **Runtime integration test.** Nobody has yet run the app against a real
   Postgres + Ollama. First `docker compose up` is the integration test — expect
   to catch small things there; they're easy to fix on first boot.
2. **Apply the size column to your *cloud* Supabase dev DB** (only if you still
   use it for development): run
   `supabase/migrations/20260625_add_registry_sizes.sql`. The on-prem appliance
   doesn't need this — `db/init.sql` already includes the column.
3. **Source hardening Tier-1 (bytenode).** Not wired — only documented
   (DEPLOYMENT.md §9). Today's protection is Tier-0 (minified standalone bundle,
   no source, server-side-only engine) + the container. Add bytenode + a license
   key when you want the stronger posture.
4. **App authentication.** Still a placeholder user ("Rajesh Kumar"). Add a real
   login (hashed creds, operator vs. QM roles) before production, even on LAN.
5. **Size-aware ledger round-trip.** Editing a past *size-wise* manual entry
   collapses it to whole-line (the manual-entries ledger groups by date+shift,
   not size). Documented in the plan as a follow-up.
6. **Pre-pull the Ollama model offline.** For a truly air-gapped first boot,
   pre-load the model weights into the `ollama_models` volume (DEPLOYMENT.md §4).

---

## Where to look (quick map)

| Topic | File(s) |
|------|---------|
| How to deploy | `docs/DEPLOYMENT.md` |
| Docker for first-timers | `docs/DOCKER-FOR-BEGINNERS.md` |
| The data-entry feature plan | `docs/superpowers/plans/2026-06-25-fullfidelity-multistage-entry.md` |
| Schema analysis (source data) | `docs/SCHEMA-DATA.MD` |
| Registry (stages/defects/sizes) | `src/lib/registry/disposafe.ts` |
| DB layer (Postgres shim) | `src/lib/db/pg-client.ts`, `db/init.sql` |
| AI backends (incl. Ollama) | `src/lib/ai.ts` |
| Data Entry UI | `src/app/data-entry/page.tsx` |
| Staging / bulk import | `src/app/staging/page.tsx` |

## Verification commands (run any time)

```bash
npx tsc --noEmit     # type-check  → should be clean
npx jest             # unit tests  → 190 passing
npm run build        # production build → green, 32 routes
```

## Likely questions for Antigravity (with the short answer)

- *"Why did Data Entry change so much?"* — It's now registry-driven so it matches
  the real Excel sheets (per-size rows + per-stage defects). See §1.
- *"Will my old Supabase setup still work?"* — Yes; if `DATABASE_URL` is unset and
  Supabase env is set, it uses Supabase. Postgres kicks in when `DATABASE_URL` is
  set. See §3.
- *"Is my source code safe on their server?"* — Tier-0 protection is in place
  (no source shipped, minified bundle). For stronger, do bytenode + license. See
  DEPLOYMENT.md §9 — and the honest caveat that on-prem can never be 100%.
- *"How do I actually run this?"* — `docs/DOCKER-FOR-BEGINNERS.md`.
