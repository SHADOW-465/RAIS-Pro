# 11 · Persistence & Store

## 11.1 The `EventStore` abstraction (`src/lib/store/`)
`getStores()` → `{ events: EventStore, findings: FindingStore, rulebook: RulebookStore, backend }`. Singleton on `globalThis` (survives across API calls in one process).
```
EventStore.append(events: Event[]) → { inserted, deduped }   // idempotent on eventId
EventStore.effective(filter?: { from?, to?, stageId?, eventType?, defectCode? }) → Event[]
```
**Backend selection:**
- **Supabase (Postgres)** when `NEXT_PUBLIC_SUPABASE_URL` + (`SUPABASE_SERVICE_ROLE_KEY` | anon key) present.
- **In-memory** otherwise, or forced by `MOID_STORE=memory`. Process-singleton; fine for the demo, resets on restart.
- Swapping to **local Postgres** for on-prem = implement the same interface (or point the Supabase client at the LAN PG). The rest of the app is backend-agnostic.

## 11.2 Read path
`GET /api/events` → `store.effective(filter)` → **`canonicalizeEvents(...)`** → JSON. Every screen (`/`, stage/size/defect-analysis, spc, copq, process-flow, reports, audit, chat, AppShell) fetches this. Provenance/sourceEventIds stay consistent because selectors compute over the canonical set.

## 11.3 Write path
`POST /api/ingest` → validation → reconcile → `emitMany` → `store.append`. `supabase-mappers.ts` flattens an `Event` ↔ the `events` row (envelope columns + `payload jsonb` + flattened `provenance_*`).

## 11.4 Seeding policy (production-correct)
- **Auto-seed is OFF by default.** `seedStore()` no-ops unless `MOID_AUTOSEED=1`. The app **starts blank**; users upload (`/staging`) or key in (`/data-entry`).
- `seedFromDisk(events)` (dev/demo only) walks `ANALYTICAL DATA/` (or `MOID_DATA_DIR`), `recordsFromBuffer` per file, `dedupeByPrecedence`, `emitMany`, append — only if the store is empty.
- `POST /api/hard-reset` clears all transactional tables **to blank** (no re-seed). Use it to wipe stale data after a logic change.

## 11.5 Findings / rulebook / sessions stores
`FindingStore.upsert(...)`, `RulebookStore` (rules + applications). Legacy `sessions`/`dashboards`/`insight_slides` tables back the analyze-pipeline session view (not the live cockpit).

## 11.6 Migrations
`supabase/migrations/` — see [12-database-schema-sql](12-database-schema-sql.md) for the actual table DDL. The canonical ledger lives in `events`; the §4 relational "golden schema" (`stage_measurements` with a balance CHECK) is **not** what the app uses — it can be added as a read projection for SQL/BI if the plant wants it.
