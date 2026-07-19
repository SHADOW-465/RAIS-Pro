# 07 — Secondary & Deferred Modules

Nav items beyond the core dashboard/entry/analytics. Each: class, what V1 ships, what's gated, data needed. Honest gating here is what prevents fake-feature bloat.

## Process Flow (`/process-flow`) — V1 overview, V1.5 full
- **V1:** the dashboard's Process Flow Overview panel (`byStage` checked/rej/yield, vertical stage cards → Finished Good) also gets a full page reusing the same selector.
- **V1.5:** an interactive flow diagram of the FBC line (from `FBC FLOW CHART.pdf`) with per-node stats on click. Build after core; uses `byStage` + a static node graph. No new metrics.

## COPQ & Savings (`/copq`) — V1.5, cost-gated
Entirely hidden/locked until `CostConfig.enabled` (Settings). When on: COPQ by stage/defect/size, COPQ trend, savings opportunity vs target, all from `cost.ts` selectors. ₹ values carry an `≈ assumed` trust badge (user-entered constants). No cost → `LockedModule` card explaining "Enter cost assumptions in Settings to unlock."

## SPC & Control Charts (`/analytics/spc`) — V1.5
Per plan 05. p/np-chart + 3σ limits; deterministic; Nelson rules later.

## Reports (`/reports`) — V1.5
The monthly GM review (MOID-SPEC §10): 3-page print/export of V1 analytics (rejection summary, stage-wise, defect Pareto) with trust marks. Browser print-to-PDF; a print writes a `source_file`/annotation for the audit trail. Audit ZIP (CSVs + SHA-256 manifest) as a secondary action.

## Ask RAS (`/` slide-over) — V1.5
LLM Q&A over the ledger. Every numeric answer ends with **View Source** → `LineagePanel` to the source cell/entry + any editing comments. Data-health on demand. Constrained to `narrativeContext`-style de-identified aggregates (MOID-SPEC §12 egress); never sends raw sensitive data to the model. Local-LLM default per the security section.

## CAPA & Actions (`/capa`) — V2, V1.5 stub
- **V1.5 stub:** a simple actions list (open recommended actions from the narrative, with owner/status/due) — enough to back "Pending CAPA" status and "View All Actions". Stored as lightweight action records.
- **V2 (deferred, spec §15):** full CAPA project management (5-Why/fishbone, effectiveness tracking). Render the advanced parts as `LockedModule`.

## Audit Trail (`/audit`) — V1
Append-only log view of events, findings, adjudications, corrections, rule applications, and outbound-LLM audit (when cloud mode). Filter by date/type/user. Read-only. Directly backs the Audit & Verification panel and ALCOA+ story. All data already exists in the store — this is a view, no new logic.

## Settings (`/settings`) — V1
- **Registry:** stages (the 5, with effectiveFrom), defect aliases, FR sizes — editable, versioned.
- **Cost config:** enable + per-stage/finished ₹/unit + rework cost (unlocks all COPQ widgets). Off by default.
- **Thresholds:** target rejection %, quality-status amber/red cutoffs (feed `qualityStatus`).
- **Users/roles + LLM mode** (local/scrubbed-cloud) + plant/line metadata.
Changing registry/thresholds/cost reactively changes analytics (selectors read current config).

## V2 dimensions (Operator / Machine / Shift correlation)
Data Entry already captures these (plan 03). They are stored on events now so history accrues. Correlation analytics + the Machine/Operator filters stay **disabled** (with "captured from new entries — enable once enough data") until a configurable minimum tagged-record count is met. This is the honest path to the mockup's "Machine M3 / Night Shift" insights without faking them today.
