# Demo fixes report

Branch `forge/demo-fixes`, based on `fix/accepted-restore` (abeceb8). Nothing pushed or deployed. No migration applied, and no real database was read or written. Tests ran on the in-memory store.

Sources read: `docs/FORGE_STATUS.md`, plus `docs/P0_INVESTIGATION.md`. That file is not in git. It exists only as an untracked file in the main checkout (`RAIS-Pro/docs/`). It was read there and not copied.

## Results

- Jest: 138 suites passed, 1 skipped. 1195 tests passed, 2 skipped. The baseline before this work was 1177 passed.
- `npx tsc --noEmit`: clean. One test fixture had a type error before this work started. It was fixed in its own commit.
- `npm run build` (Next 16): passed.
- Not checked in a browser. The UI changes are covered by type checks and the build only, because the suite has no DOM tests.

## Item by item

| # | Item | Status | Evidence / commit |
|---|------|--------|-------------------|
| 1 | Numbers consistent across screens | Already fixed for the dashboard. One gap is left for the owner (see below). | New `funnel.test.ts`: Overall Accepted = checked − rejected = 1 − rejection rate = Final good + between gates. Hold is inside accepted. The existing `report-builders.test.ts` shows report checked/rejected/rate come from the same analytics functions. |
| 2 | Integrity banner | Mostly fixed on p0. Finished here. | 2d67174 (p0) moved the audit card and footer onto V-004/V-014. **8e8f826**: the Plant Schema banner said "ledger is not OK" but only scanned the header scope. It now prints the critical count and the scope ("Assembly – lot date"). A test in `scope-label.test.ts` checks that the label and the scanned scope match. |
| 3 | Funnel reconciliation | Fixed here. | The restore in 838704c also removed the funnel's "not yet at next gate". **079ca0c** adds `funnelReconciliation()` in `lib/analytics/funnel.ts`. Each arrow still shows checked − rejected, with hold included as the owner decided. Under it, the funnel shows units passed but not yet checked at the next gate, or a "+N over (V-014)" when the next gate checked more. Final good shows the between-gates total, so Overall Accepted = Final good + between gates. Tested. |
| 4 | Hard-coded 15% target | Already fixed (8b76eba). | D-001/D-002/D-003 compare against the saved policy (`valueRef`). A grep finds no hard-coded 10%/15% target left. `decision-engine.test.ts` passes. |
| 5 | 0.00% deltas | Already fixed (e7dc34b, e544c66, abeceb8). | `analytics.test.ts`, `timeline.test.ts`, `finite-text.test.ts` and `chart-segments.test.ts` pass. Deltas compare the last two periods that had production. |
| 6 | Defect codes resolving | Already fixed (15c8a78). | `defect-alias.test.ts` and `defect-registry.test.ts` pass. Existing ledger rows are not rewritten. |
| 7 | CAPA on the server | Fixed here. | **0bfec2e**. Migration `supabase/migrations/20261021_capa_actions.sql` (**not applied**). Store `lib/capa/store.ts`: memory store in tests, Supabase otherwise, and "unavailable" when the table is missing. Route `/api/capa`: GET for any signed-in role. PUT and DELETE need `write`. Records are checked by Zod. The browser store tries the server first and falls back to localStorage until the table exists. It then imports the local list once, only if the plant register is still empty. The CAPA page says which source it is showing. `capa-api.test.ts` covers auth, validation, import-only-when-empty, and delete. |
| 8 | Admin tools hidden from GM | Fixed here. | **f229092**. `requireAdmin()` in `lib/auth/guard.ts` lets a login through only if it is named in `MOID_ADMIN_USERS` and also holds the route's capability. It now guards `/api/clear-data` and `/api/clear-schema`, so a GM gets a 403. `/api/auth/me` returns `admin`. Settings hides the Administrative section, including the `#admin` deep link, and Plant Schema hides its link to it. Tests are in `route-auth-enforcement.test.ts` and `me-role.test.ts`. The coverage test also counts `requireAdmin(req`. README is updated. |

Also: **e2ee229** fixes a test fixture whose missing `unresolved` field made `tsc` fail.

## Needs the owner's decision

1. **Reports still say accepted "Needs company confirmation".** The restore in 838704c brought back the report wording "Accepted is not derived as checked minus rejected". That contradicts the decision that Accepted = checked − rejected. I did not change it, for two reasons. Reports use whole plant, entry date, and a sum of section rates, which is P0 issue 5 and on hold. And in that scope, checked − rejected (about 95.9%) would not equal 1 − the printed rate (13.68%). Choose one: print checked − rejected on Reports with its scope label, or keep the refusal and fix the wording.
2. **`docs/FORGE_STATUS.md` issue 2 is out of date.** It still describes passed-forward with hold excluded, which 838704c reverted. I left it as written.
3. **Who counts as admin.** Admin tools now need `MOID_ADMIN_USERS`. If it is unset, nobody can purge or reset the schema from the app, the GM included. Set it on the deployment for the installer's login. Some GM powers are unchanged:
   - erasing single entries in Audit and Entry History (`eraseLedger`, `DELETE /api/manual-entries`)
   - Roles & access
   - Plant users

   Tell me if any of those also count as "admin tools".
4. **Final good with more than one section in scope.** It stays the last gate in the chain, so Final good + between gates equals Overall Accepted only when one section is in scope. That is the default, Assembly. It is tied to the on-hold P0 issue 5 definitions.
5. **CAPA table setup.**
   - Delete is a hard delete with `write`, the same as the old browser behavior. A regulated register may need void/retain instead.
   - The table is service-role only, so a deployment running only on the anon key stays on the browser fallback.
   - Apply `20261021_capa_actions.sql` to turn on the shared register.
6. **Not covered by tests.** The browser-side CAPA sync (pull, import, re-pull on 403) has no automated test, because the suite has no DOM setup. Only the server side is tested.

## Not touched

- The Accepted definition (838704c).
- P0 issue 5: scope mismatch, sum-of-section rates, and the two open-lot definitions.
- Ledger rows, `.env` files, `.impeccable/config.json`, and any remote.
