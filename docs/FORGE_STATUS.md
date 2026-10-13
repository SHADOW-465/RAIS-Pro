# Forge status

## Issue 1 — integrity indicators and orphan mappings

The dashboard audit card, and the shell footer on every screen including Process Flow, now show V-004/V-014 from `qualityStatus` for the header scope. Hardcoded anomaly and alert zeros are gone. Column mappings sit in their own folder. Stage aliases match after the `STAGE:` prefix is stripped. An alias whose key names a different stage (eye punching → visual) is flagged suspicious. Ledger rows and knowledge rows were not edited. Tests 1152 passed. Production build passed.

## Issue 2 — one accepted definition

Accepted is now passed forward at each section's exit gate (`gateAccepted` / `passedForward`). Hold is excluded and shown on its own. The funnel also shows units not yet checked at the next gate. Dashboard Overall Accepted, Final good, funnel arrows, and Reports all use that helper. Reports no longer say "Needs company confirmation". Tests 1152 passed. Production build passed.

## Issue 3 — alert target matches Settings

D-001 compares the rejection rate with the saved `targetRejectionPct` and prints that same percent. A rate under the target no longer produces "exceeds the target". Watch-band rules use `watchRejectionPct`. Stored copies of those rules are rebound at evaluation time, so the database was not edited. Tests 1154 passed. Production build passed.
