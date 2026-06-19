# MO!D Build Status

Living tracker for handoff between agents (Claude Code ⇄ Antigravity).
**Branch: `feat/phase2-real-parsers`.** Updated 2026-06-19.
Tests: **160 green**, `tsc` clean, `npm run build` clean.

> Handoff rule: keep this file current. When you finish a task, tick it here and commit.
> The active work plan is `docs/plans/2026-06-19-friend-issues-round2.md`.
> Design spec: `docs/2026-06-18-data-pipeline-and-charts-design.md`.

## Architecture (current, as built)
- **Durable ledger:** Supabase/Postgres. `src/lib/store/` (`supabase.ts` adapter + `supabase-mappers.ts`,
  memory adapter for tests). Migration `supabase/migrations/20260618_canonical_ledger.sql`.
  `shouldUseSupabase()` = durable by default; `MOID_STORE=memory` for tests.
  Reseed util: `npx tsx --env-file=.env.local scripts/reseed-db.ts` (clears + reseeds from real parsers).
- **Real parsers (no synthetic data):** `src/lib/ingest/parsers/` — `parse-assembly-daily`,
  `parse-rejection-analysis`, `parse-size-wise`, `dedupe` (precedence: size-wise > assembly/rejection >
  cumulative-claims), `reconcile` (merge-or-clarify). Seeder: `src/lib/store/seed.ts`.
  Date helpers `src/lib/ingest/date.ts` (local-ISO + filename-date, fixes UTC off-by-one).
- **Analytics (numbers only here):** `src/lib/analytics/` — `scope`, `rejection`, `defect`, `size`,
  `cost`, `trust`, `status`, `narrative`.
- **Cockpit:** `src/app/page.tsx` + per-screen pages; charts in `src/components/app/widgets.tsx`;
  shell `src/components/app/AppShell.tsx` (grain D/W/M/FY + date-range presets).
- **AI:** `src/lib/ai.ts` — free-tier chain Groq → NVIDIA NIM → OpenRouter (preferred-first via
  `RAIS_AI_BACKEND`, never exclusive; valid `:free` models; `maxRetries:1` fast-fail). Chat
  `src/app/api/chat/route.ts` (slide → text → rule-based fallback; Markdown answers).

## ✅ Done this cycle (Phase 1 + 2 + fixes)
- Phase 1 durable Supabase ledger (PR #5, merged to main).
- Phase 2 real parsers + dedupe/merge + seed rewrite (no synthetic weights). 4,520 real events.
- Stabilized Antigravity handoff (build/types/tests green).
- Original 33-issue list + 16 production issues: largely resolved (`0af0d0b` + later commits).
- Ask RAIS: responds + Markdown formatting; AI free-tier chain hardened.
- **Data verification feature** (`cd656fd`): bigger/cleaner `FloatingDetailModal`, "View Source"
  bezier-beam provenance trace (value → exact source cell), wired for KPIs + stage/defect/size.

## 🚧 In progress — Round-2 friend issues (plan: 2026-06-19-friend-issues-round2.md)
Status of the 7 tasks (RC = root cause):
- [ ] **RC-1 dashboard** — headline metrics ignore date range / break on week-day grain (#4,5,6).
      Make `m` aggregate over `scope` (selected range); grain only buckets trends.
- [ ] **RC-1 process-flow + copq pages** — same snapshot bug (#10, #11).
- [ ] **RC-2** — size dropdown hardcoded 8 vs YTD 11 (#1, #7): derive options from `m.sizes`.
- [ ] **RC-5** — custom-field add forces Operator/required fill (#12): gate required on submit only.
- [ ] **RC-3** — SPC UCL/LCL wrong (#9): proper p-chart `σ=√(p̄(1−p̄)/n̄)`, pooled centerline, fix interp.
- [ ] **RC-4** — Pareto: show % per defect on chart + table (#8).
- [ ] **RC-6** — verify size/weekly/COPQ trends after RC-1; clean if still noisy (#2, #3).

## Known good commands
- `npx tsc --noEmit` · `npm run build` · `npx jest`
- Dev: `PORT=3000 npm run dev` (Supabase env in `.env.local`).

## Notes / invariants
- Numbers come ONLY from `src/lib/analytics/*`; screens never compute. No synthetic data — absent
  data → explicit "No data" empty state (never assumed splits).
- Two fiscal years coexist on one timeline: assembly/rejection = FY2025-26, size-wise = FY2026-27.
- Strict-real: when an uploaded file lacks a size/defect split, the UI must offer manual entry, not invent.
