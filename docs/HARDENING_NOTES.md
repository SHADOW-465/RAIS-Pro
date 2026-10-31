# Hardening notes

## Step A: batch conversion correctness

What changed, and what is still open.

### Fixed

1. **No in-memory fallback.** If `batch_conversions` (or its `changed_qty` / `stage_id`
   columns) is missing, `GET` and `POST /api/batch-conversions` answer **503** with
   `code: "storage-unavailable"` and log a server `console.warn`. Nothing is kept in memory.
   (`MOID_STORE=memory` dev/test mode still uses the memory store by design.)
2. **Server-side quantity bounds.** `changedQty` must be a whole number > 0 and no larger than
   the eligible quantity, which the server computes from the ledger
   (`lineage/eligible.ts`, same grouping as the form). The request body cannot supply it.
3. **Remaining at the change station** is `passedForward(original) - converted`, floored at 0
   (`buildQuantityFlow`).
4. **Eligible = accepted.** `eligibleTransferQty` returns the station's passed-forward quantity
   and no longer falls back to *checked*, so a station that accepted nothing cannot convert.
5. **Converted lot is no longer prefilled as 100% accepted.** Checked is seeded with the moved
   quantity; accepted is left for the operator (page and `BatchMatrixEntry`).
6. **Repeat save of a lot.** Same lot, same target, same quantity is idempotent. A different
   quantity, or a different target, is refused with an explicit "a lot can only be converted
   once" message. A legacy row with `changed_qty = 0` (quantity unknown) still accepts a repeat.
7. **Real calendar dates, not in the future**, on the server (`planConversion`) and in the form
   (`DatePicker max`, inline message, submit disabled). Server slack: UTC today + 1 day.
8. **Save errors are surfaced.** `BatchMatrixEntry` shows a "Batch conversion not recorded"
   alert on the receipt when the lineage POST is refused or unreachable.
9. **Reads page through all rows** (1000 per page) ordered `created_at desc, id asc`.
   A unique-violation race now re-plans against fresh rows so the caller gets the precise reason.

### Open / for a decision

- **One conversion per lot** is kept (pending client decision); only the message is explicit.
- The eligibility check reads the whole effective ledger per save. Fine for save frequency;
  add a batch-scoped event query if it ever shows up in timings.
- The 1-day UTC slack on "not in the future" exists because the server does not know the plant's
  time zone. A configured plant time zone would let it be exact.
- No DB-level `CHECK (changed_qty > 0)` was added: existing rows may carry the legacy `0` default,
  and no migration was applied in this step.
- `components/entry/QuantityFlowBoard.tsx` is not mounted anywhere; it still prints `original.wip`
  as "Remain qty". Update it to `band.remainQty` if it is revived.
- Browser behaviour (date picker `max`, receipt alert) is covered by type checks and logic tests
  only; there is no component-test setup in this repo and it was not clicked through.

## Step A addendum: one station figure, converted-lot cap, lot existence

Live finding on lot `26H06-20`: the banner said Accepted 1,146 / Rejected 265 while the
original-lot panel said Accepted 1261 / Hold 0 / Rejected 439 for Checked 1700.

### Why the two disagreed

The banner read the **lot-level** group totals (first station in, last station out), while the
panel opened **one row** of the first station (`stages[0].rows[0]`). Neither was the station the
conversion is capped by, and the server cap used a third reading of the same group.

### Fixed

1. **One source of truth:** `stationQtyFromGroup()` in `lineage/eligible.ts` (checked / accepted /
   hold / rejected / available for ONE station, summed over every row there). The banner, the
   original-lot panel (`hydrateFromBatchGroup`, which now opens the station totals when a station
   has several rows) and the server cap (`eligibleQtyFromEvents`) all read it. A requested station
   the lot never reached is no longer swapped for the lot's first station.
2. **Converted-lot cap:** the entry panel blocks `checked` above the converted quantity
   (`checkEntry` code `exceeds-converted-quantity`, so its own *Save to Plant Ledger* is disabled),
   and `POST /api/ingest` refuses it (`converted-lot-over-cap`, writes nothing) for **every** save
   path (`lineage/cap.ts`). Before the conversion exists, the original lot's available count is
   the ceiling.
3. **Lot existence:** `planConversion` rejects a lot with no ledger entries (`unknown-lot`); the
   route supplies `lotKnown` from the ledger, never from the body. The page shows the error inline
   and the *Original batch* input has a picker (`<datalist>`) of existing, not-yet-converted lots.
   While the ledger is loading or failed, a lot is never called unknown.
4. **Order of writes:** a conversion authored on the page is validated (lineage POST) *before* the
   ledger entry is written, so a refused conversion leaves no orphan entry.

### Open

- If `batch_conversions` is missing, the ingest cap logs a `console.warn` and is not enforced
  (no conversion can exist then). Any other lineage failure answers 503 and saves nothing.
- Footer *Pending CAPA* / *Overdue Actions* are still passed as literal `0` by the dashboard
  (`statusCounts={{ capa: 0, overdue: 0 }}` in `app/page.tsx`); they were not part of the
  123/124 flip and were left alone.

## Step B: freshness / stale version

Complaint: browsers stay on an old version until site data is cleared.

### Fixed

1. **Footer counters (123/124 vs 0).** The integrity scan ran on partial data: with the ledger
   unloaded/failed/401 it read 0, and with the ledger in but `/api/schema` still loading it was
   scoped under the *default* policy (124 instead of 123). The footer now shows `…` until events
   and policy have both loaded without error.
2. **Chunk errors.** `app/error.tsx` and `app/global-error.tsx` (shared `ErrorScreen`) reload the
   page ONCE on a `ChunkLoadError` / failed dynamic import (`lib/client/chunk-reload.ts`;
   sessionStorage guard, 60 s window; if the guard cannot be saved it does not reload). Anything
   else, or a second failure, shows a retry UI.
3. **Build id + banner.** `next.config.ts` pins one id per build (`MOID_BUILD_ID` →
   `VERCEL_GIT_COMMIT_SHA` → `git rev-parse HEAD` → a timestamp pinned in the environment) as
   Next's build id and `NEXT_PUBLIC_BUILD_ID`. `GET /api/version` (no-store, public so `/login`
   works too) returns it; `BuildWatcher` polls on focus and every 5 min (not in `next dev`) and
   shows **New version – reload** when it differs from the tab's own.
4. **One storage module.** `lib/storage.ts`: `moid:<name>` keys, `{ v, buildSchemaVersion, data }`
   envelope, Zod-validated, stale/invalid values discarded, boot sweep of orphans, never throws.
   Bump `STORAGE_SCHEMA_VERSION` when a stored shape changes incompatibly. All `moid_*`,
   `rais_*` and `disposafe_*` browser values moved to it; a still-valid old value is adopted once
   (re-saved wrapped, old key removed) so nobody loses presets/layouts. Static UI prefs live in
   `lib/ui-prefs.ts`.
5. **Dead code removed:** the `rais_raw_*` / `rais_active_session_id` sessionStorage fallbacks on the
   dashboard, COPQ, defect, size, SPC and stage pages.
6. **`Cache-Control: private, no-store` on every API GET** via `withNoStore()` (`lib/http/live-cache.ts`);
   covers success and error responses. `lib/http/__tests__/no-store.test.ts` scans all route files and
   fails if a GET is exported any other way. (`/api/raw-file` used to send `max-age=3600, immutable`;
   it is no-store now too.)
7. **Auth matcher** (`proxy.ts`) no longer wraps `_next/`, favicon, manifest, `sw.js`, icons,
   robots/sitemap or static file extensions; `/api/version` is public.

### Manual step (not code): enable Vercel Skew Protection

**Vercel Skew Protection must be switched on in the Vercel dashboard** (Project → Settings →
Advanced → Skew Protection). It keeps an already-open tab talking to the deployment it was loaded
from, so the chunk reload above becomes a rare fallback instead of the main defence. It cannot be
set from this repo.

### Open / for a decision

- **Uncommitted work from another step is still in the tree** (plant documents:
  `src/lib/plant-docs/`, `src/app/api/plant-docs/`, `src/lib/client/{plant-sync,storage}.ts`,
  `supabase/migrations/20261031_plant_documents.sql`). It was not part of this step and was not
  committed. When it lands: route `lib/client/storage.ts` (raw `localStorage`, `moid_imported_v1:*`
  markers) through `lib/storage.ts`; `app/api/plant-docs/[kind]/route.ts` should export GET through
  `withNoStore` (the no-store test covers it as soon as the file is in the repo).
- A build made from uncommitted edits shares its commit's id, so the banner will not fire for
  those. Set `MOID_BUILD_ID` per deploy for plant (Docker) builds that have no `.git`.
- `workspace-presets.ts` still accepts an injected storage (its tests rely on it), defaulting to the
  browser's; reads/writes go through the slot either way.
- Behaviour in a real browser (reload-once, banner, theme pre-paint, legacy adoption) is covered by
  logic tests only; there is no component-test setup in this repo and it was not clicked through.

## Batch conversion — target lot, undo, reason, id suffix

### Fixed

1. **Target lot that already has ledger rows.** `planConversion` rejects `targetHasLedger`
   (`target-has-ledger`) after the identical-repeat check, so re-saving the same edge still
   no-ops once the converted lot has entries. The server sets the flag from the ledger
   (`lotExistsInEvents`), never from the body. The form shows the same sentence and disables Record.
2. **GM-only soft undo.** `POST /api/batch-conversions/undo` requires `write`, then role `gm`
   (403 `gm-only` otherwise). It sets `reversed_at` / `reversed_by` / `reversal_reason` and writes
   `batch_conversion_audits`. It never deletes the row. Active `list` / `chainFor` omit reversed
   rows. A repeat after undo mints `bc_…__2` because the reversed row keeps the primary key.
   Missing reversal columns → 503 naming `20261031120000_batch_conversion_reversal.sql`
   ("Nothing was changed."). If the audit insert fails after the row is marked, the response is
   200 with `auditStored: false` and a warning.
3. **Batch ID suffix follows the selected size.** `batchIdFollowingSize` rewrites a code composed
   from the same lot date (20Fr on `27A05-14` → `27A05-20`). An empty field and a different day
   are left alone. The field effect skips when the input is disabled.
4. **Reason.** A new conversion requires a category (`rework` / `regrade` / `size-reclassification`,
   text column, extensible by editing the list) and a note. The row stores both plus
   `reason` as `category: note` for older readers. An identical repeat keeps the original words.
   Missing `reason_category` / `reason_note` → 503 naming `20261031130000_batch_conversion_reason.sql`
   ("Nothing was saved."). The station picker still lists every station; an empty picker defaults
   to assembly Visual. Both lots' history names keep the origin (`from CT to` on the new lot,
   `batch (converted to …)` on the original), including report batch chips.

Migrations are new files and were not applied. Until they are, save and undo fail closed as above.

## Batch conversion — converted-lot entry gating

Converted-lot entry gating: client correct when a non-reversed conversion supplies stageId; server wrong because `src/app/api/ingest/route.ts` does not call `missingProcessStep`, so a normal lot can skip primary/secondary (NOT changed, awaiting Showmik decision).

Evidence, current behaviour only. The gate itself was not edited.

- Client waiver: `src/components/BatchMatrixEntry.tsx:751` sets `entryFromStageId` from `activeConversionFlow.stageId`. The fetch just above (chain length under 2, or the lot is the origin) leaves that null, so a normal lot and a reversed conversion do not waive the gate. An empty `stageId` also stays null (`stageId?.trim() || null`).
- Client rule: `src/lib/entry/process-sequence.ts:204-224`. With `entryFromStageId` set, stations before the change station count as already done and Visual is open. Without it, Visual on an empty lot is blocked at primary (`src/lib/entry/__tests__/process-sequence.test.ts` "jumping straight to Assembly", and `src/lib/entry/__tests__/check-entry.test.ts` "lets a converted lot save at Visual" / "blocks Assembly when Dipping has not been entered").
- Save path uses the same flag: `src/lib/entry/check-entry.ts` `EntryProcessContext.entryFromStageId`, covered by `src/lib/entry/__tests__/converted-lot-gating.test.ts`.
- Reversed rows leave active reads (`src/lib/lineage/store.ts` `activeOf` / `list`). After undo, `chainFor` is one node with `via: null`, so the client waiver does not apply.
- Server: `src/app/api/ingest/route.ts` `POST` caps converted-lot quantity and does not call `missingProcessStep`, `entryFromStageId`, or `checkEntry`. A normal lot posted at Visual returns 200. That deviates from the required rule. `src/app/api/ingest/__tests__/entry-stage-gating.test.ts` locks the 200 and leaves `test.todo` for the reject. A converted lot at its change station also returns 200, which matches the required outcome only because the server accepts every station.

## Step C: shared plant settings

Browser business data now has a server copy so a second user sees the same document. The migration `supabase/migrations/20261031140000_plant_shared_state.sql` is a new file and was not applied. Until it is, `GET` and `PUT /api/shared-state` answer **503**, `console.warn` names that file, and the shell shows "This browser is still using its own copy." Local data is not deleted. A one-time import runs only after the server confirms the document is empty (`nextSyncStep`). 401 and 403 stay quiet and do not mark the browser as imported.

### Moved

1. **Report presets and workspace presets.** User saves only. Built-ins stay in the client. Workspace pushes only when the storage handle is `window.localStorage`, so tests that inject a memory store do not post.
2. **Shift windows and custom defects.** Replace requires `configure` (GM). Operators can read. An operator browser therefore will not upload its local copy; the first GM session that still has a local copy imports it.
3. **Lot memory.** One plant pin (`write`). Writing the same pin the form just read does not post, so opening Data Entry does not clobber another browser's pin. A real change is debounced. Last write wins.
4. **Edit grants.** Approving an edit request writes the grant with `mergeGrant` **before** `patchNotification`. A missing table returns 503 and leaves the request open, so a retry is not a 409. The requester reads `edit-grants` on the next page load (`hasValidGrant` after the shared-state tick). The approver's panel caches the returned grant and does not mint a second expiry. Other entry keys are kept.
5. **Custom defects** stay a shared document, not catalog rows. Data Schema remains the only editor of the master schema.
6. **Defect remedies** already used `defect_remedies` and `/api/remedies` (legacy key `moid_defect_remedies`). A missing table was HTTP 200 `source: "unavailable"` with no page warning. It is now **503** naming `supabase/migrations/20261013_defect_remedies.sql`, and `/remedies` says the book is on this browser only. The client still imports a local book once the table exists and is empty.
7. **CAPA** was already on the server (`capa_actions`, `/api/capa`, visible warning on `/capa`). Its response stays HTTP 200 with `source: "unavailable"` when the table is missing. The client already treats a failed response as local. That contract was not changed.

Documents other than grants are last-write-wins for the whole JSON value. Two browsers importing at the same moment into an empty document can overwrite each other once; after that, import refuses to replace a non-empty document.

Converted-lot entry gating was not changed. Verdict stands: client correct when a non-reversed conversion supplies stageId (`BatchMatrixEntry.tsx:751`, `process-sequence.ts:204-224`); server wrong because `src/app/api/ingest/route.ts` does not call `missingProcessStep` (NOT changed, awaiting Showmik decision).

The shared-settings banner and the remedies warning were not clicked through in a browser. Route tests cover the 503 and the grant hand-off.

## Step E — server-side totals

The migration `supabase/migrations/20261101120000_effective_events.sql` is a file only. It has not been applied. `POST /api/analytics/totals` feature-detects `totals_daily`, `totals_stage`, and `totals_defect`. A missing function (`PGRST202`, `42883`, `42P01`, schema cache) logs `console.warn` once per process and returns the JS selectors. A present RPC whose daily, stage, or defect sums disagree with those selectors does the same (`mismatch`) and still returns the JS payload. Totals on screen are that payload. A failed request leaves the screen on its local selectors.

SQL parity is a TypeScript reference of the RPC contract (`src/lib/analytics/sql-totals.ts`) compared with `aggregate`, `byStage`, `byDefect`, and `MemoryEventStore.effective` on fixtures. There is no pg-mem run and no live Postgres check.

The SQL does not reproduce `canonicalizeEvents` (exact event-id dedupe, size-tier drop, source-file precedence) or lot dates taken from the batch id. The date filter is `occurredOn`. After the migration is applied, a ledger where those rules change a sum will fail `rpcMatchesSelectors` and stay on JS, with a server warning. That is intentional: the selectors remain the number on the screen.

`totals_stage` cascades through temp tables `moid_stage_acc` and `moid_stage_rows` (`ON COMMIT DROP`). The batch key matches the JS rule: a present `batchNo`, even null, does not fall through to `customFields.batch`.

Screens still compute locally until the totals request returns, then replace headline, stage, defect, rejection-trend, SPC-trend, and COPQ figures. Size, trust, audit, the dashboard weekly and cumulative charts, and report monthly series stay on the client. Report accepted stays the unavailable policy gap. Drill-down rows stay on the events the screen already loaded. The totals request uses that same occurred-on window, not a second 30-day default.

Browser verification of the six screens was not run. Jest covers the overlay, the totals route, and the events pager.

## Step F — live updates

`supabase/migrations/20261101130000_ledger_meta.sql` is a file only and has not been applied. It creates `ledger_meta` (one row: `version`, `updated_at`), a statement-level trigger `bump_ledger_meta()` on every business table that exists (events, ingestions, registries, company_catalog, calculation_policy, cost_config, mods, workbook_snapshots, raw_files, batch_conversions, capa_actions, defect_remedies, plant_shared_state, plant_documents, plant_roles, plant_users; missing tables are skipped), and adds `ledger_meta` to `supabase_realtime` when that publication exists. Service role only; `anon` and `authenticated` have no grant.

**Polling, not a Realtime socket.** Each signed-in tab (`LedgerWatcher`, mounted in `PlantProviders`) calls `GET /api/ledger-meta` (no-store, session required, service key stays on the server) every 60 s and when the tab returns to the foreground (15 s minimum gap, nothing while hidden). The first reading is a baseline. When the number moves, every business query key is invalidated (`"remote"` in `lib/client/invalidate.ts`, same set as clear-data); only queries on screen refetch.

Why not Realtime: the app signs in with its own cookie, not a Supabase login, so a browser subscription would run as `anon`, and Realtime applies RLS per subscriber, so `anon` would need SELECT on `ledger_meta`. Step G locks anon out of the app tables. `ledger_meta` holds no plant data, so it could be granted alone, but that adds a browser-side Supabase client and the anon key on a path the lockdown is meant to close. Only `ledger_meta` is published, not `events`: publishing the ledger would stream every row through Realtime and make it readable to any socket.

**Before the migration is applied** the endpoint answers 503 `{ version: null, code: "ledger-meta-unavailable" }` and logs one server `console.warn` naming the file. With no number to compare, the tab reloads its screens on every 60 s tick (not on the first reading after load). A 500, a network error or an offline tab changes nothing; 401/403 stops the poll.

Gaps:
- A write bumps the counter for the writer too, so their own tab does one extra refetch within a minute of saving. `invalidateAfterWrite` already refreshed it, so this is a duplicate read, not a stale one.
- Latency is up to 60 s, plus the 15 s focus gap. Not instant.
- The trigger updates one shared row, so concurrent write statements queue briefly on its lock. Statements are short, and the bump is once per statement (a 5,000-row ingest batch bumps once), so this is not expected to matter at one-plant volume; it was not load-tested.
- Not run against a database: the trigger, the publication step and the grants have not been executed anywhere. Jest covers the route (401, 200, 503, 500, no-store), the store's missing-table detection, and the poll state machine.
- Two tabs reload independently; no cross-tab coordination.

## Step G — security (code side)

**Auth fails closed.** `getAuthSecret()` (`src/lib/auth/config.ts`) throws in a production runtime when `MOID_AUTH_SECRET` is missing or under 16 characters. "Production runtime" is `NODE_ENV=production` and not `NEXT_PHASE=phase-production-build`, so `next build` still passes without the secret. `src/proxy.ts` checks this first on every request and answers 503 with the reason (JSON for `/api/*`, plain text otherwise); only `/healthz` stays up. Outside production a dev-only signing key is used with a one-time warning. This reverses the earlier "warn, never throw" decision on purpose; the 503 names the missing variable, so it is not an opaque 500.

**No credentials in code.** `DEFAULT_AUTH_SECRET` and `DEFAULT_PRESET_PASSWORDS` are gone. A preset role signs in only with `MOID_AUTH_PASSWORD_<ROLE>` or the shared `MOID_AUTH_PASSWORD`; with neither, that login is disabled (one warning per role). Named plant users are unaffected. On-prem: `deploy/scripts/gen-secrets.sh` now generates `MOID_AUTH_SECRET` and the three passwords, and `docker-compose.yml` requires the secret.

**Startup validation.** `src/instrumentation.ts` runs `productionEnvProblems()` (`src/lib/env.ts`) once per server instance and throws, after logging each problem, when `MOID_AUTH_SECRET`, a Supabase URL or `SUPABASE_SERVICE_ROLE_KEY` is missing (unless `MOID_STORE=memory`). Without this a production server with no service key would have fallen back to the in-memory store and lost every write silently.

**Server Supabase client.** `createServerClient()` requires `SUPABASE_SERVICE_ROLE_KEY`; the anon-key fallback is removed, and `shouldUseSupabase()` no longer treats the anon key as enough. `src/lib/supabase.ts` has `import "server-only"`, so a client bundle importing it fails the build. That guard found three real leaks into client bundles, now fixed: the shared-state message constant (moved to `kinds.ts`), the `getLineageStore` re-export in the lineage barrel (import it from `@/lib/lineage/store`), and `core/decision/engine.ts` (its `decide()` now requires `rules`; `/api/decide` loads them from the rule store). The unused browser `getSupabaseClient()` was deleted: nothing in `src` queries Supabase from the browser. Jest maps `server-only` to an empty stub (`jest.server-only-stub.js`).

**RLS lockdown.** `supabase/migrations/20261102000000_rls_lockdown.sql` walks the catalog instead of naming tables: RLS on for every public table, all existing policies replaced by one `<table>_service_role_all ... TO service_role`, `anon`/`authenticated` revoked on tables, views, sequences and functions, `effective_events` set `security_invoker` where supported, default privileges tightened. `plant_users` password hashes are covered (this overrides `20260819_plant_users_grants.sql`, which had opened them to anon). `supabase/APPLY_ME_2026-10-31.sql` bundles the branch's migrations (capa_actions, batch conversion reversal and reason, plant_shared_state, effective_events, ledger_meta) plus the lockdown last; a jest test keeps the bundle identical to the migration files. Instructions for a non-technical operator: `docs/APPLY_ME_INSTRUCTIONS.md`.

**Untracked.** `deploy/AUTH-CREDENTIALS.md` is removed from the index and ignored; `DATA/*.xlsx` were removed from the index (`DATA/` and `*.xlsx` were already in `.gitignore`). Local files are untouched. They remain in git history; rotate anything that was real and use `git filter-repo` if the history must be cleaned.

Gaps:
- **Deployment ordering is the main risk.** `20260819_plant_users_grants.sql` records that this deployment never set `SUPABASE_SERVICE_ROLE_KEY` and ran on the anon key. This code refuses to start without it, and the lockdown breaks any anon-only deployment, so the key and `MOID_AUTH_*` must be set in Vercel first. The old built-in passwords stop working the moment this ships.
- The lockdown SQL and the bundle were **not run against any database** (rule for this step); they were reviewed by reading only. The bundle is one script, so a failure rolls back as a whole.
- `20261031_plant_documents.sql` and `src/lib/plant-docs/`, `src/app/api/plant-docs/`, `src/lib/client/plant-sync.ts`, `src/lib/client/storage.ts` are untracked leftovers that no committed code uses (the committed design is `plant_shared_state`). They are not in the bundle. If that migration is ever applied, run the lockdown again afterwards.
- Existing sessions signed with the old public default secret stay valid only if the new `MOID_AUTH_SECRET` equals it, which it will not; everyone signs in again once.
- Sessions are still HMAC cookies with no server-side revocation; changing `MOID_AUTH_SECRET` is the only global revoke.
- `deploy/Dockerfile` and compose still pass `NEXT_PUBLIC_SUPABASE_ANON_KEY`; the app no longer reads it, so it can be dropped in a later tidy-up.
- `next build` and jest are the only checks of the `server-only` guard; jest cannot see client-bundle leaks, `npm run build` does.
