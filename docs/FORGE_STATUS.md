# Forge status

## Issue 1 — integrity indicators and orphan mappings

The dashboard audit card, and the shell footer on every screen including Process Flow, now show V-004/V-014 from `qualityStatus` for the header scope. Hardcoded anomaly and alert zeros are gone. Column mappings sit in their own folder. Stage aliases match after the `STAGE:` prefix is stripped. An alias whose key names a different stage (eye punching → visual) is flagged suspicious. Ledger rows and knowledge rows were not edited. Tests 1152 passed. Production build passed.

## Issue 2 — one accepted definition

Accepted is now passed forward at each section's exit gate (`gateAccepted` / `passedForward`). Hold is excluded and shown on its own. The funnel also shows units not yet checked at the next gate. Dashboard Overall Accepted, Final good, funnel arrows, and Reports all use that helper. Reports no longer say "Needs company confirmation". Tests 1152 passed. Production build passed.

## Issue 3 — alert target matches Settings

D-001 compares the rejection rate with the saved `targetRejectionPct` and prints that same percent. A rate under the target no longer produces "exceeds the target". Watch-band rules use `watchRejectionPct`. Stored copies of those rules are rebound at evaluation time, so the database was not edited. Tests 1154 passed. Production build passed.

## Issue 4 — deltas skip empty days

Empty days stay on the chart but are marked no production and are not drawn as a 0% rate. KPI deltas compare the last two periods that have checked units, using the same buckets as the trend. Tests 1155 passed. Production build passed.

## Issue 6 — defect codes, process flow, remedies

Raw labels such as BM now resolve to a Plant Schema code when a catalog alias or a learned defect-alias matches. That happens when a screen reads the ledger and when a new entry is saved. Existing ledger rows are not rewritten. A label that matches nothing stays on the Pareto marked unresolved, and the coverage percent counts only the matches. The catheter flow includes secondary stages such as Eye Punching, and a step with no rows in the date range says so. Defect remedies have a migration file and an API. The migration is not applied. Until it is, the page keeps this browser's book and imports it once the table exists. Tests 1162 passed. Production build passed.

## Issue 7 — KPI scope and date basis

Every KPI now says which population and which date it uses. Dashboard and analysis screens say the header scope and lot date (Assembly – lot date with the default). Reports say Whole plant – entry date. Accepted on both is passed forward at each section exit and does not include hold. A station uses that station and lot date. Open lots stay unfiltered and say Dipping, Secondary, and Assembly – all dates. Workbook tiles say This workbook – all dates. Chat KPIs say Whole plant – lot date. Charts that said YTD now use the same scope phrase. Tests 1163 passed. Production build passed.
