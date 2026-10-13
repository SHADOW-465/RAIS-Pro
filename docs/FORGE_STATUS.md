# Forge status

## Issue 1 — integrity indicators and orphan mappings

The dashboard audit card, and the shell footer on every screen including Process Flow, now show V-004/V-014 from `qualityStatus` for the header scope. Hardcoded anomaly and alert zeros are gone. Column mappings sit in their own folder. Stage aliases match after the `STAGE:` prefix is stripped. An alias whose key names a different stage (eye punching → visual) is flagged suspicious. Ledger rows and knowledge rows were not edited. Tests 1152 passed. Production build passed.

## Issue 2 — one accepted definition

Accepted is now passed forward at each section's exit gate (`gateAccepted` / `passedForward`). Hold is excluded and shown on its own. The funnel also shows units not yet checked at the next gate. Dashboard Overall Accepted, Final good, funnel arrows, and Reports all use that helper. Reports no longer say "Needs company confirmation". Tests 1152 passed. Production build passed.
