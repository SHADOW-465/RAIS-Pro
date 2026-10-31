# Hardening notes

## Step E — server-side totals

The migration `supabase/migrations/20261101120000_effective_events.sql` is a file only. It has not been applied. `POST /api/analytics/totals` feature-detects `totals_daily`, `totals_stage`, and `totals_defect`. A missing function (`PGRST202`, `42883`, `42P01`, schema cache) logs `console.warn` once per process and returns the JS selectors. A present RPC whose daily, stage, or defect sums disagree with those selectors does the same (`mismatch`) and still returns the JS payload. Totals on screen are that payload. A failed request leaves the screen on its local selectors.

SQL parity is a TypeScript reference of the RPC contract (`src/lib/analytics/sql-totals.ts`) compared with `aggregate`, `byStage`, `byDefect`, and `MemoryEventStore.effective` on fixtures. There is no pg-mem run and no live Postgres check.

The SQL does not reproduce `canonicalizeEvents` (exact event-id dedupe, size-tier drop, source-file precedence) or lot dates taken from the batch id. The date filter is `occurredOn`. After the migration is applied, a ledger where those rules change a sum will fail `rpcMatchesSelectors` and stay on JS, with a server warning. That is intentional: the selectors remain the number on the screen.

`totals_stage` cascades through temp tables `moid_stage_acc` and `moid_stage_rows` (`ON COMMIT DROP`). The batch key matches the JS rule: a present `batchNo`, even null, does not fall through to `customFields.batch`.

Screens still compute locally until the totals request returns, then replace headline, stage, defect, rejection-trend, SPC-trend, and COPQ figures. Size, trust, audit, the dashboard weekly and cumulative charts, and report monthly series stay on the client. Report accepted stays the unavailable policy gap. Drill-down rows stay on the events the screen already loaded. The totals request uses that same occurred-on window, not a second 30-day default.

Browser verification of the six screens was not run. Jest covers the overlay, the totals route, and the events pager.
