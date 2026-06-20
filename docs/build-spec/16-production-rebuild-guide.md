# 16 · Production Rebuild Guide (on-prem)

The PoC proves the engine. To ship the plant's air-gapped local app, change only the host/DB/LLM bindings — **copy the engine verbatim**.

## 16.1 What changes vs the PoC
| Concern | PoC | Production on-prem |
|---|---|---|
| **LLM** | Groq/NVIDIA/OpenRouter (cloud free tier) | **Local Ollama** (`meta-llama-3-8b-instruct`). Add as a `tryModels` backend; make it first/only; drop cloud keys. If a cloud fallback is allowed → de-id middleware + Nginx whitelist. |
| **DB** | Supabase cloud | **Local PostgreSQL** on the LAN. Same `EventStore` interface (point the PG client at the LAN, or implement `PgEventStore`). |
| **Hosting** | Vercel | Local server, `next start` behind Nginx; reachable by GM/Supervisor/Operator terminals over LAN. |
| **Backend** | Next.js API routes | Keep Next.js API routes **or** extract the pure engine (parsers, dedupe, analytics, emit) behind **FastAPI** if Python-side BI/SPC is desired. The engine is framework-agnostic TS. |
| **Files** | archive route | Read-only `/Uploads/Original/`. |
| **Auth** | minimal/device | Role auth (GM/QM/Supervisor/Operator) + Postgres RLS. |
| **Egress** | open | Air-gapped; de-id + Nginx proxy for any external call. |

## 16.2 Copy VERBATIM (the IP — correctness-proven, do not re-derive)
- Event contract: `src/lib/contract/{d1,d3,hash}.ts`
- Ingestion: `src/lib/ingest/parsers/*` + `ingest/{emit,schema-extractor,from-rejection-sheets,date,review}.ts`
- **De-dup:** `parsers/dedupe.ts` + **`analytics/canonical.ts`** (wire `canonicalizeEvents` at the read boundary)
- Analytics: `src/lib/analytics/*` (the exact formulas in [07](07-analytics-engine.md))
- Registry: `src/lib/registry/disposafe.ts`
- Export: `src/lib/audit-package.ts`
- Design tokens + editorial primitives

## 16.3 Re-derive (bindings only)
Store backend (PG), LLM backend (Ollama), hosting/proxy, auth/RLS, file storage path.

## 16.4 Build order (checklist)
1. Scaffold Next 16 + React 19 + TS; deps: `ai`, `zod`, `xlsx`, PG client.
2. Port `contract/*` + `store/*` (swap to local PG).
3. Port `ingest/parsers/*` + `emit` + `dedupeByPrecedence`; keep `routeFamily` content-detection.
4. Port `analytics/*`; **wire `canonicalizeEvents` at `/api/events`**; port `registry`.
5. Wire `tryModels` → local Ollama; keep AI to classification + narrative; `npm run check:ai`.
6. Build screens from the editorial tokens; empty-state guidance; verify beams; staging grid.
7. Port `audit-package.ts`; add the 3-page A4 print report.
8. Role auth + RLS; de-id middleware + Nginx proxy.
9. **Verify (the gates in [15](15-testing-verification.md)):** tsc + jest + build green; clean-month KPIs == YEARLY sheet; doubling-stability; audit ZIP hashes. Only then deploy.

## 16.5 Sequencing & risk
- Keep auto-seed OFF in production; the plant uploads real files. Use a one-shot data-migration script if importing history.
- Eye-punching stage is effective-dated (2025-11-01) — respect `activeStageIds` so older months stay valid.
- Validate against the client's embedded totals on **every** new file family before trusting the dashboard.
