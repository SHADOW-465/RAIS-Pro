# RAIS Pro Audit And GM Review Report

Date: 2026-07-01  
Reviewer stance: Senior Product Architect, Senior Full Stack Engineer, Manufacturing Software Consultant, UX Designer, Solution Architect  
Scope: Documentation-only audit. No application code changes were made.

## 1. Executive Summary

RAIS Pro, branded in the app as MO!D, is no longer just a rejection dashboard. The current codebase is already a serious manufacturing quality intelligence pilot with an append-only event ledger, deterministic analytics, Excel ingestion, manual entry, schema extraction, provenance, audit export, SPC, COPQ, reports, and AI-assisted narrative/chat. The strongest product idea is correct: the application treats AI as a classifier and narrator, while all arithmetic comes from deterministic code. That is the right architecture for a regulated manufacturing context.

The GM review document dated 27.06.26 asks for nine practical improvements: graph quantities and trends, defect and size splits, stage trends, better UX, automatic data refresh, role-based rights, standardized sheet formats, rejection-vs-cost analysis, and multi-sheet integrity with audit trails. Many of these are already partly present in the current repo. The gap is not mostly "build a dashboard"; the gap is "turn a technically impressive pilot into a governed plant system that operators, quality engineers, and management can trust every day."

The most important finding is that the app has two generations of architecture coexisting:

- The older upload/analyze/session pipeline: `src/app/api/analyze/route.ts`, `src/app/api/narrative/route.ts`, `src/app/api/chat/route.ts`, session pages, dashboard config schemas, and raw sheet verification.
- The newer MOID ledger pipeline: `src/app/api/ingest/route.ts`, `src/app/api/events/route.ts`, `src/lib/contract/d1.ts`, `src/lib/ingest/*`, `src/lib/store/*`, and `src/lib/analytics/*`.

Both paths are valuable, but the product experience should converge around the ledger pipeline. The ledger is the right long-term system of record. The older session pipeline is useful for ad hoc workbook diagnostics but should not remain a parallel truth source for enterprise use.

Verification status:

- `npx jest`: 35 suites passed, 190 tests passed.
- `npx tsc --noEmit`: passed.
- `npm run build`: passed with Next.js 16.2.2 and Turbopack.
- Runtime smoke: 16 app routes loaded on `http://localhost:3001` with no Next error overlays.

## 2. Current Architecture

### Stack

- Frontend: Next.js 16 App Router, React 19, TypeScript 5, Tailwind 4, mostly inline style objects driven by CSS variables.
- Backend: Next.js route handlers under `src/app/api/*`.
- AI: AI SDK v6 with `generateObject` and `generateText`, routed through `tryModels()` in `src/lib/ai.ts`.
- Persistence: Supabase/Postgres when env is configured, otherwise a process-level memory store.
- File parsing: SheetJS via `xlsx`.
- Validation: Zod schemas in `src/lib/schemas.ts` and domain contracts in `src/lib/contract/*`.
- Analytics: deterministic selectors in `src/lib/analytics/*` plus older workbook metrics in `src/lib/metrics.ts`.
- Design system: CSS variables in `src/app/globals.css`, shell and widgets in `src/components/app/*`, editorial primitives in `src/components/editorial/*`.

### Runtime shape

The app is a client-heavy Next.js App Router application. `src/app/layout.tsx` wraps the app in `TweaksProvider` and `EventsProvider`. `EventsProvider` fetches `/api/events` once on mount and keeps the canonical event array in React context. Most analytics pages consume this full event array and run selectors client-side.

This is pleasant for a pilot because each page can compose its own charts quickly. It is not ideal for enterprise scale because every major page receives the full ledger, re-canonicalizes server-side per request, then recomputes client-side. The known performance note in `docs/known-issues-and-optimizations.md` correctly identifies this as a future server-side view-model boundary.

### Backend boundary

The backend currently does four main jobs:

- Workbook/session analysis: `/api/analyze`, `/api/narrative`, `/api/chat`, `/api/sessions`.
- Ledger ingestion and reads: `/api/ingest`, `/api/events`, `/api/manual-entries`.
- Registry/schema configuration: `/api/schema`, `/api/clear-schema`.
- Administration and archive: `/api/archive-upload`, `/api/clear-data`, `/api/hard-reset`.

There is no separate backend framework today. The canonical spec still describes a future FastAPI layer, but the repo implementation is currently Next route handlers plus Supabase.

### Database and file storage

Supabase migrations define:

- `raw_files`: uploaded workbook archive by SHA-256 hash.
- `ingestions`: ingestion envelope.
- `events`: append-only canonical ledger.
- `findings`, `adjudications`, `rulebook_rules`, `rule_applications`: validation/adjudication loop.
- `registries`: per-client stages, defects, fiscal year config, and sizes.
- `cost_config`: planned durable costing.
- Legacy `sessions`/`dashboards`/`insight_slides` support for saved workbook diagnostics and chat slides.

`/api/archive-upload` stores uploaded files in Supabase `raw_files` and best-effort local disk under `Uploads/Original`, with read-only chmod where supported. This is a good pilot mechanism, but enterprise document custody should make retrieval, retention policy, backup, and read-only mount behavior explicit.

### Authentication and authorization

There is no real authentication layer in the app. The shell shows a hard-coded user profile ("Rajesh Kumar", Quality Manager). The database migration enables RLS but grants broad public select/insert policies, while server route handlers use a service role client. Destructive routes exist for clearing data and resetting schema. The UI adds typed confirmations, but the backend does not enforce role-based authority.

This is the biggest enterprise gap relative to the GM request for "authority-wise reserved rights."

## 3. Folder Structure

- `src/app`: App Router pages and API routes. This is the main product surface.
- `src/app/api`: Next route handlers for AI analysis, chat, sessions, event ledger, ingest, schema, manual entries, clearing, archive.
- `src/components`: Domain components and older editorial dashboard pieces.
- `src/components/app`: Current cockpit widgets, app shell, event context, loaders.
- `src/components/editorial`: Design tokens, icons, charts, pills, and tweak context.
- `src/lib/analytics`: Current deterministic ledger selectors for rejection, defect, size, cost, SPC status, trust, and narrative context.
- `src/lib/ingest`: Staging review, schema extraction, event emission, date handling, and parser orchestration.
- `src/lib/ingest/parsers`: Specific Excel family parsers and dedupe/reconcile logic.
- `src/lib/contract`: Canonical event, registry, finding, hash contracts.
- `src/lib/store`: Memory and Supabase store adapters behind a common event/finding/rulebook interface.
- `src/lib/schema`: Workbook schema profiler and signature utilities.
- `src/types`: Shared dashboard, analysis, and metric types.
- `src/__tests__`: Unit and golden tests for schemas, parsers, metrics, ingestion, store, device ID, and dashboard builder.
- `supabase/migrations`: Database schema history.
- `docs/build-spec`: Code-accurate MOID build spec.
- `docs`: Product specs, design plans, known issues, PRDs, and this audit.
- `ANALYTICAL DATA` and `DATA`: Local plant sample workbooks/SOPs used by parsers and tests.
- `scripts` and `scratch`: Diagnostics, seeding, AI checks, golden derivation, and local investigation utilities.

## 4. Major Modules

### App shell and global state

Files: `src/components/app/AppShell.tsx`, `src/components/app/EventsContext.tsx`, `src/components/editorial/TweaksContext.tsx`

Purpose:

- Provide sidebar navigation, top filters, stage view, date range, grain selector, status bar, export action, theme toggle, and global event data.

Strengths:

- The shell makes MOID feel like a real cockpit instead of a single report page.
- Global stage/date/grain controls match the GM desire for period-wise filters.
- Export is visible and tied to the ledger audit package.

Risks:

- Plant, line, user, notifications, and staging badge are hard-coded.
- Date and grain behavior is client-side and not yet tied to saved user preferences or backend roles.
- The shell can become dense for operators; a plant-head cockpit and an operator data-entry station probably need different chrome.

Improvements:

- Move user/role/plant/line to a durable identity and configuration model.
- Split executive cockpit navigation from operator navigation through roles.
- Replace fixed notification counts and staging badge with ledger-derived counts.

### Ledger and persistence

Files: `src/lib/contract/d1.ts`, `src/lib/store/*`, `src/app/api/events/route.ts`, `src/app/api/ingest/route.ts`

Purpose:

- Normalize every production, inspection, rejection, aggregate claim, correction, annotation, and dispatch fact into an event ledger.

Strengths:

- This is the right architecture for auditability.
- Event IDs are content-hashed.
- Corrections supersede prior events instead of mutating history.
- The store interface allows Supabase and memory implementations.

Risks:

- Some direct-entry workflows delete previous direct-entry events for a date/shift rather than expressing all replacement behavior as correction events.
- Canonicalization is done on every `/api/events` read.
- Backend role enforcement is absent.

Improvements:

- Treat all user edits/deletions as correction or void events, not physical deletion, except for admin purge in non-production.
- Cache canonicalized event views by ledger version.
- Add role-gated APIs before plant rollout.

### Ingestion and staging

Files: `src/app/staging/page.tsx`, `src/lib/ingest/*`, `src/lib/ingest/parsers/*`, `src/lib/parser.ts`

Purpose:

- Upload workbooks, extract schema, classify sheets, dedupe overlapping sources, allow cell edits/comments, and publish to ledger.

Strengths:

- Handles multi-file upload.
- Uses verified family parsers before generic schema fallback.
- Captures raw sheets in session storage for verification.
- Has row-level comments and invalid-row navigation.
- Can auto-establish a master schema when unconfigured.

Risks:

- It is powerful but cognitively heavy. Operators may not understand schema modes, mapping, dedupe, registry mutation, and validation flags in one screen.
- Raw sheet cache in `sessionStorage` means verification continuity can be lost across browsers/devices.
- Schema update actions need stronger authority control.

Improvements:

- Split "Master Schema Setup" from "Daily/Monthly Data Staging."
- Make the validation findings workflow explicit: issue, suggested fix, operator explanation, supervisor sign-off.
- Persist raw sheet view references server-side, not only in session storage.

### Manual data entry

File: `src/app/data-entry/page.tsx`

Purpose:

- Enter daily stage/size quantities directly, manage ledger records, and edit schema registry fields/stages.

Strengths:

- Good fit for shop-floor usage where Excel files are late or absent.
- Size-wise stages are supported.
- Live validation prevents rejected quantity exceeding checked quantity.
- Manual entries flow through the same `/api/ingest` path.

Risks:

- It combines operator entry, ledger editing, and schema administration in one page.
- Edit/delete operations rely on backend deletes for manual groups.
- The page is large and likely hard to use on a busy factory terminal.

Improvements:

- Create a simplified operator entry mode.
- Move schema administration to a supervisor/admin page.
- Convert delete/edit flows into correction-event flows with approver identity.

### Analytics engine

Files: `src/lib/analytics/*`, `src/app/page.tsx`, analysis pages

Purpose:

- Compute rejection rate, total checked/rejected, FPY, stage trends, size trends, defect Pareto, COPQ, trust score, audit summaries, SPC status.

Strengths:

- Deterministic arithmetic.
- Clear rejection-rate convention: sum of per-stage rates for the funnel-loss figure.
- Good domain-specific charts: stage trend, size trend, defect Pareto, SPC, COPQ.

Risks:

- Most analytics run client-side over the full event array.
- Cost settings are read from localStorage, not durable governed configuration.
- Some charts include explanatory text that is not always directly tied to a live finding.

Improvements:

- Create `/api/view-models/*` endpoints that return page-specific aggregated data.
- Move cost settings into `cost_config`.
- Add drilldown state and issue cards that link metrics to findings and CAPA.

### AI layer

Files: `src/lib/ai.ts`, `src/lib/schemas.ts`, `src/lib/analysis-utils.ts`, `src/app/api/analyze/route.ts`, `src/app/api/narrative/route.ts`, `src/app/api/chat/route.ts`

Purpose:

- Route AI calls through backend fallback chain, classify workbook columns, produce narrative, and answer chat questions against verified dashboard context.

Strengths:

- Uses schemas and `tryModels`.
- Keeps math outside the model.
- Fallback chain gives resilience.
- Chat is grounded in verified metrics.

Risks:

- Chat is non-streaming and can be slow.
- Chat context stuffing can grow with dataset size.
- The AI backend chain includes cloud providers, while the canonical deployment vision favors on-prem/local LLM.

Improvements:

- Make chat text-first and streaming.
- Use deterministic retrieval of scoped metrics for questions.
- Add local LLM primary mode for plant deployment.

### Verification and provenance

Files: `src/components/FloatingDetailModal.tsx`, `src/components/VerifyPanel.tsx`, `src/components/BeamOverlay.tsx`, `src/lib/verify-nav.ts`, `src/lib/audit-package.ts`, `src/lib/ingest/emit.ts`

Purpose:

- Let a user open source rows from KPIs/charts and trace values to source file, sheet, and cell.

Strengths:

- This is the product moat.
- Provenance fields carry file, hash, sheet, table, cells, header path, formulas, direct-entry flags, and coordinates.
- Audit package export includes ledger and manifest hashes.

Risks:

- Some provenance display depends on session storage raw sheets.
- Direct-entry synthetic refs are useful but not the same as physical workbook coordinates.
- Enterprise audit needs explicit user identity, signature, approval status, and immutable correction story.

Improvements:

- Store raw workbook render/sheet extracts server-side by file hash.
- Add source-flyout links from chat answers and CAPA.
- Add signed audit events for publish, approve, correct, export.

## 5. User Workflow Review

### 1. User logs in

Current state:

- No real login. The shell displays a hard-coded user.

Why it matters:

- Manufacturing systems need operator/supervisor/QA/GM authority boundaries. Without identity, comments and corrections are not fully attributable.

UX problem:

- Users see a profile, but it is decorative.

Recommendation:

- Add authentication before enterprise rollout. Start with local plant users and roles: Operator, Supervisor, QA Manager, GM, Admin.

### 2. Uploads Excel

Current state:

- Upload happens on Staging & Review. Multiple files are accepted. Excel locked-file errors are handled.

What works:

- Multi-file upload, family parsers, generic schema fallback, raw-sheet caching, file archive hashing.

UX problem:

- The screen mixes upload, schema extraction, validation, comments, mapping, and publish. It is powerful but dense.

Recommendation:

- Use a wizard-like flow: upload, parse result, validation issues, corrections/comments, supervisor publish.

### 3. Mapping

Current state:

- Schema extraction and role mapping are shown in staging schema modal. Data Entry also has schema editor.

What works:

- Roles are concrete: checked, accepted, hold, rejected, defect mode, formula, ignore.

UX problem:

- Schema management is exposed to general staging/data-entry contexts, which can be dangerous.

Recommendation:

- Lock mapping changes behind Admin/Supervisor authority. Provide a "layout changed" alert with approve/reject.

### 4. Validation

Current state:

- `checkRecord()` validates arithmetic balance, negative values, rejected vs checked, defect sum mismatch, and formula mismatch.
- `ingest` checks conflicts against existing events and creates findings.

What works:

- Validation is deterministic and non-blocking where appropriate.

UX problem:

- Findings are not yet a full review queue with ownership, status, and resolution history.

Recommendation:

- Promote validation findings to a first-class screen: open, assigned, requires GM authority, resolved, converted to rule.

### 5. Dashboard

Current state:

- Dashboard gives executive summary, recommendations, KPI strip, rejection trend, stage trend, Pareto, stage donut, process flow, size cards, COPQ, and audit verification.

What works:

- It is close to the GM expectation and decision-oriented.

UX problem:

- It is dense and assumes the user understands every widget. Operators may need a simpler "what needs attention today" view.

Recommendation:

- Create role-based dashboard variants: GM cockpit, QA investigation, operator entry.

### 6. Drilldown

Current state:

- Cards open `FloatingDetailModal`, often with chart and source rows.

What works:

- Good direction: every number can be inspected.

UX problem:

- Drilldowns are modal-based, not a durable URL state. Sharing a specific investigation is difficult.

Recommendation:

- Add route-backed drilldowns with stable filters and source table.

### 7. Verification

Current state:

- Legacy session view can show raw sheets and verify panels; ledger pages show source rows through modal.

What works:

- The source-row pattern is excellent.

UX problem:

- The best visual beam verification exists mainly in older dashboard components, while newer ledger pages use modal rows.

Recommendation:

- Unify verification across both pipelines. The ledger should own source verification.

### 8. Reports

Current state:

- Reports page generates a 24-page forensic quality review compiler with print styles, fingerprints, stage pages, matrices, custody, overrides, CAPA matrix, sign-off vault.

What works:

- Very strong audit ambition.

UX problem:

- It may be too large for the GM's requested management review. The canonical spec mentions a 3-page monthly summary; the current page is more forensic book than executive report.

Recommendation:

- Offer two outputs: 3-page GM monthly report and full 24-page audit package.

### 9. Logout

Current state:

- Not implemented because auth is not implemented.

Recommendation:

- Add logout and session timeout with role model.

## 6. Page-By-Page UI Review

Runtime smoke covered the main routes and found no error overlays.

| Page | Purpose | Score | What is excellent | Problems | Redesign direction |
|---|---:|---:|---|---|---|
| `/` Dashboard | Executive cockpit | 8 | Strong KPI, trend, stage, defect, size, COPQ, audit coverage | Dense, not role-specific, hard-coded profile/status, empty state dominates when no data | Keep as GM cockpit, add issue priority rail and route-backed drilldowns |
| `/staging` | Upload, validate, schema, publish | 7 | Powerful ingestion and validation workflow | Too much responsibility in one page, schema authority unclear | Split master schema setup from routine staging |
| `/data-entry` | Manual shop-floor entry and ledger | 7 | Direct entry flows into canonical ingest | Combines operator entry, ledger edit, schema admin | Make operator-first mode and supervisor/admin mode |
| `/stage-analysis` | Stage trends and process view | 8 | Directly satisfies GM stage trend request | Some static phrasing in modal insights | Add root-cause and CAPA linkage per stage |
| `/size-analysis` | Size-wise rejection and heatmap | 8 | Strong fit for catheter manufacturing | Needs clearer "which size requires action" ranking | Add outlier explanation and material/batch drilldown |
| `/defect-analysis` | Defect Pareto and trends | 8 | Pareto and heatmap are plant-useful | Needs owner/action conversion | Add "create CAPA from defect driver" |
| `/spc` | Control chart and Western Electric rules | 8 | Moves beyond display into process control | Needs training cues and rule severity workflow | Link violations to findings and CAPA |
| `/process-flow` | Manufacturing flow overview | 7 | Good mental model for stages | Process graph is not yet operationally interactive enough | Make each stage node a live gateway to trends, defects, cost, source |
| `/copq` | Cost of poor quality | 7 | Satisfies cost-analysis request | Cost assumptions are localStorage-driven | Move costing to governed DB settings |
| `/reports` | Forensic print book | 7 | Audit ambition is high | 24-page output may overwhelm monthly review | Add concise GM report and keep forensic package separate |
| `/capa` | Corrective actions | 6 | UI exists for action registry | Appears less integrated with live findings | Connect CAPA creation to defects, SPC, findings |
| `/chat` | Ask RAIS | 7 | Grounded in verified metrics, useful workspace | Non-streaming, session/context split, source flyout incomplete | Stream answers and always attach source/provenance |
| `/audit` | Ledger audit trail | 7 | Chronological ledger and source metrics | Needs filters, identity, diff/correction chain | Add audit query tools and approver signatures |
| `/schema` | Registry viewer | 7 | Clear stages and defect catalog | Mostly read-only display, not full governance | Make it authoritative schema control panel |
| `/settings` | Thresholds, cost, registry, admin | 6 | Has key configuration controls | Critical settings stored locally; destructive actions need RBAC | Move settings to DB and role-gate admin actions |
| `/clear-data` | Dedicated purge screen | 5 | Clear warnings and typed confirmation | Dangerous without authentication | Keep only for admin/dev or replace with governed retention |
| `/session/[id]` | Saved workbook diagnostic | 6 | Preserves legacy session review | Parallel truth path next to ledger | Fold useful parts into ledger-based investigations |

## 7. Dashboard Widget Decision Review

### AI Executive Summary

Information:

- Bulleted summary of rejection rate, stage contribution, defect drivers, and savings opportunity.

Decision supported:

- Helps GM orient quickly.

Gap:

- Some bullets are generated from deterministic values, but not yet tied to a formal finding, owner, or action.

Improve:

- Add "why this matters" and "action owner" metadata per bullet.

### Recommended Actions

Information:

- Suggested audits/investigations for worst stage, top defect, bad size.

Decision supported:

- Turns dashboard from display into action.

Gap:

- Recommendations are generated client-side heuristics, not a managed CAPA workflow.

Improve:

- Convert each recommendation into "create CAPA", "assign owner", "due date", "evidence".

### KPI Strip

Information:

- Rejection rate, total rejections, FPY, COPQ, savings opportunity.

Decision supported:

- Tells the GM how bad the current quality loss is.

Gap:

- Rejection-rate convention is domain-specific and needs UI labeling: sum of stage rates, not rejected divided by line input.

Improve:

- Add tooltip/formula source and show target status clearly.

### Rejection Trend

Information:

- Trend over active grain with target and mean.

Decision supported:

- Detects deterioration or improvement.

Gap:

- Does not yet annotate major events, workbook uploads, corrections, or CAPA changes.

Improve:

- Add event annotations and control-limit overlays.

### Stage-wise Rejection Trend

Information:

- Multi-line per-stage rejection rates plus total.

Decision supported:

- Shows where in the process the loss is moving.

Gap:

- Needs quick stage comparison table: latest, previous, delta, contribution, action.

Improve:

- Add "stage requiring attention" callout.

### Defect Pareto

Information:

- Vital few defect modes.

Decision supported:

- Root-cause prioritization.

Gap:

- Needs linkage to SOP, machine, size, batch, operator, and CAPA.

Improve:

- Add drilldown dimensions and "open investigation."

### Size-wise Rejection

Information:

- Rejection by French size and selected size trend.

Decision supported:

- Finds product-size sensitivity.

Gap:

- Size-specific root cause is not surfaced.

Improve:

- Add size x defect x stage x period matrix as primary drilldown.

### Process Flow

Information:

- Stage-level flow and yields.

Decision supported:

- Helps plant heads understand where the line is leaking quality.

Gap:

- Current graph is more descriptive than diagnostic.

Improve:

- Turn nodes into interactive "stage health" cards: FPY, rejection, COPQ, top defect, latest finding.

### SPC Control Chart

Information:

- Mean, UCL, LCL, out-of-control points, Western Electric rules.

Decision supported:

- Distinguishes normal variation from special cause.

Gap:

- Rule violations should become findings with review status.

Improve:

- Generate finding events for control-rule breaches.

### COPQ

Information:

- Financial impact of rejected units using cost assumptions.

Decision supported:

- Helps management prioritize savings.

Gap:

- Cost assumptions are not governed or signed off.

Improve:

- Move cost config to DB, version it, and show effective date.

### Audit Verification

Information:

- Source files, validation, formula integrity, overrides, completeness.

Decision supported:

- Builds trust before decisions are made.

Gap:

- Needs user identity and immutable approval status.

Improve:

- Add sign-off workflow and export manifest drilldown.

## 8. Data Pipeline Review

### Current flow

1. User uploads Excel files in staging.
2. Browser reads files with SheetJS.
3. Specific family parsers attempt known source layouts.
4. Generic schema extractor profiles unknown layouts.
5. Staging builds editable `StageDayRecord` rows.
6. User edits values/comments and publishes.
7. `/api/ingest` validates, reconciles conflicts, emits canonical events, appends to store.
8. `/api/events` returns effective canonical events after canonicalization.
9. Client analytics selectors compute KPIs/charts.
10. UI modals show source rows and provenance.
11. Reports and audit package export ledger-derived artifacts.

### Weak points

- Client does too much ingestion and analytics work.
- Full ledger is shipped to most screens.
- Raw sheet verification cache is session-local.
- Settings and costs are not centrally governed.
- Role/identity is absent.
- Destructive operations are available via unauthenticated API routes.
- Findings/adjudication exist in schema and store but are not yet a mature daily workflow.

### Performance concerns

- `/api/events` canonicalizes on every read.
- Every screen receives the whole event set.
- `sourceEventIds` can grow large.
- Chat uses non-streaming calls and can walk multiple providers.

### Scalability recommendations

- Add server-side view models for each page.
- Cache canonicalized ledger by store version.
- Fetch source/provenance on demand.
- Move chat to streaming text-first mode.
- Prepare local Postgres and local LLM deployment for plant network constraints.

## 9. Traceability System Review

Traceability is the product's strongest differentiator. The current design captures:

- File name.
- File hash.
- Sheet.
- Table ID.
- Cell refs.
- Header path.
- Row label.
- Formula text and cached value for aggregate claims.
- Extractor confidence.
- Direct-entry flag.
- Synthetic entry coordinates for manual values.
- Annotation events for comments.

The system is mostly deterministic because numeric values are read from source rows and emitted into canonical events. AI classification can help identify structure, but sanity gates and heuristics protect arithmetic.

Enterprise-grade traceability still needs:

- Durable raw workbook/sheet rendering by file hash.
- User identity on every publish, edit, annotation, approval, export.
- Immutable correction events for all edits/deletes.
- Finding/adjudication UI tied to source cells.
- Signature and authority model for GM-required changes.
- Retention and backup policy for `raw_files`.

## 10. GM Review Interpretation

| # | GM observation | What GM is actually asking for | Current state | Difficulty | Effort |
|---:|---|---|---|---|---|
| 1 | Quantity display on graphs/trends | Show production and rejection volumes, not only rates | Present in KPI, trends, modals; can improve quantity overlays | Medium | 1-2 weeks |
| 2 | Defect-wise and size-wise split-up | Root cause by defect and product size with drilldown | Defect, size, heatmap, Pareto exist | Medium | 2-4 weeks for enterprise drilldowns |
| 3 | Stage-wise rejection trend | Monthly process-performance monitoring | Stage trend exists with grain controls | Low/Medium | 1-2 weeks for polish |
| 4 | User-friendly UI/UX | Simpler hierarchy for operators and managers | Strong but dense shell | Medium | 3-6 weeks |
| 5 | Automatic data update | Dashboard refreshes after cleaning/validation | Context refresh after ingest exists; no real-time/subscription | Medium | 2-4 weeks |
| 6 | Authority-wise reserved rights | Role-based access, prevent unauthorized changes | Not implemented | High | 4-8 weeks |
| 7 | Standardize data sheet formats | Templates, validation rules, controlled layouts | Schema extraction/registry exists; templates not formalized | Medium | 3-6 weeks |
| 8 | Rejection vs cost analysis | Financial impact of rejection | COPQ exists, settings local | Medium | 2-5 weeks |
| 9 | Multiple sheet integration and integrity | Cross-sheet validation, dedupe, audit trail | Multi-file ingest, dedupe, canonical ledger exist | Medium/High | 4-8 weeks for robust enterprise integrity |

Priority recommendations from the PDF align with the correct order:

1. Automatic validation and refresh.
2. Graphical trend analysis.
3. Standardized sheets.
4. RBAC.
5. Multi-sheet data integrity.
6. Simpler dashboard layout.

My adjustment: RBAC should move earlier before any destructive or schema-changing workflows are used outside a controlled pilot.

## 11. Current App Vs GM Expectation

| Current feature | GM expectation | Gap | Implementation needed | Priority |
|---|---|---|---|---|
| Dashboard KPI cards | Quick monitor of quality performance | Good, but dense | Role-based cockpit and clearer formula labels | High |
| Rejection trend chart | Production/rejection trends with filters | Rates shown; quantity overlays incomplete | Dual-axis or paired quantity/rate chart | High |
| Stage trend page | Monthly stage-wise graphical analysis | Exists | Add monthly preset and action callouts | High |
| Defect analysis page | Defect drilldown | Exists | Add stage/size/batch/source drilldown | High |
| Size analysis page | Product-size split | Exists | Add outlier and size x defect root cause workflow | High |
| Staging validation | Data cleaning and validation | Exists | Promote findings/adjudication workflow | Critical |
| Events context refresh | Auto refresh after publish | Partial | Server-side invalidation, subscriptions, post-commit refresh across tabs | High |
| Settings/profile | Authority rights | Not real | Auth, roles, route/API guards, DB policies | Critical |
| Schema extraction | Standard sheets | Partial | Locked templates, import templates, versioned registry, change approvals | Critical |
| COPQ page | Cost impact | Exists | Durable cost config and finance approval | High |
| Audit trail | Integrity/audit trails | Partial | Full correction chain, identity, export logs, signatures | Critical |
| Reports page | Management reporting | Overbuilt forensic report | Add concise GM monthly report | Medium |
| Chat | Ask operational questions | Useful but not source-complete | Streaming, source flyout, scoped retrieval | Medium |

## 12. Manufacturing Domain Fit

### Production Engineers

Would they use it?

- Yes, if the staging and data-entry screens are simplified.

Would they trust it?

- They will trust it if source cells and validation errors are visible.

What would confuse them?

- Schema registry language, multiple analysis screens, and dense topbar controls.

Expected additions:

- Shift, machine, batch, operator, downtime, line stoppage, rework loop, handoff quantities.

### Quality Engineers

Would they use it?

- Yes. The defect, size, SPC, and audit features are directly useful.

Would they trust it?

- Mostly, because deterministic math and provenance are strong.

What would confuse them?

- Whether rejection totals come from inspection rejected events or defect rejection events in every case.

Expected additions:

- CAPA linkage, SOP linkage, defect taxonomy governance, adjudication queue.

### QA Managers

Would they use it?

- Yes, especially for audit preparation and trend review.

Would they trust it?

- Only after role-based sign-off and immutable correction history.

Expected additions:

- Approval workflow, monthly review pack, deviation/CAPA status, audit export logs.

### Plant Heads and GMs

Would they use it?

- Yes, if the default cockpit is simpler and decision-first.

Would they trust it?

- They will trust it if every red metric answers "what happened, why, source, owner, next action."

Expected additions:

- Top 3 losses, INR impact, responsible department, due date, repeat issue count, progress since last review.

### Factory Owners

Would they use it?

- Yes for cost, yield, recurring defect, and management review.

Expected additions:

- Multi-plant comparison, monthly savings, audit readiness, risk exposure, inventory/dispatch impact.

## 13. UI Redesign Strategy

No redesign should be implemented until RBAC and workflow decisions are clear. The strategy should be:

### Keep

- Editorial paper/ink/orange brand direction.
- Deterministic KPI cards.
- Stage, size, defect, SPC, COPQ modules.
- Source/provenance modal idea.
- App shell with persistent navigation.

### Improve

- Dashboard hierarchy: top row should answer "What needs attention today?"
- Filter clarity: separate date range, grain, stage scope, plant/line.
- KPI formulas: show concise formula/source on hover.
- Drilldowns: make them route-backed and shareable.
- Empty states: show exact next action and required data source.

### Merge

- Ledger source verification from older session view and newer event source rows.
- Staging validation and audit findings into one review queue.
- Cost settings and COPQ assumptions into governed config.

### Remove or hide by role

- Schema edit controls from operator screens.
- Destructive clear/reset actions from non-admin views.
- Fixed demo badges and hard-coded user identity.

### Replace

- LocalStorage financial settings with DB-backed, versioned cost config.
- SessionStorage raw sheet verification with server-side file-hash retrieval.
- Static CAPA cards with live findings-to-CAPA workflow.

## 14. Product Evolution Path

### Stage 1: Current Dashboard

Modules:

- Upload/staging, dashboard, analysis pages, reports, chat, audit.

Business value:

- Faster quality review and fewer manual Excel summaries.

Engineering focus:

- Stabilize ingestion, source verification, and UX.

### Stage 2: Quality Intelligence Platform

New modules:

- Role-based auth, findings queue, CAPA integration, governed schema templates, monthly GM report.

New entities:

- Users, roles, approvals, template versions, report runs, export logs.

Business value:

- Daily quality decision support and audit readiness.

Engineering effort:

- 2-3 months.

### Stage 3: Manufacturing Diagnostic Engine

New modules:

- SPC findings, root-cause explorer, machine/batch/operator dimensions, SOP/CAPA memory, repeat issue detection.

New APIs:

- Server-side view models, findings lifecycle, CAPA creation, source retrieval.

Business value:

- Moves from "what happened" to "why and what to do."

Engineering effort:

- 3-6 months.

### Stage 4: Operational Intelligence Platform

New modules:

- Production planning, downtime, maintenance, dispatch, inventory, cross-plant benchmarking.

New integrations:

- ERP, MES, QMS, equipment logs, local file watch folders.

Business value:

- Links quality loss to operations and finance.

Engineering effort:

- 6-12 months.

### Stage 5: Manufacturing Operating System

New modules:

- Work orders, electronic batch records, digital SOP execution, approvals, training, full deviation/CAPA system.

Business value:

- Becomes the plant operating layer.

Engineering effort:

- 12+ months and requires validation/compliance program.

## 15. Prioritized Roadmap

### Quick Wins: 1 week

Frontend:

- Add clear formula/tooltips for rejection rate, FPY, COPQ.
- Replace fixed staging badge and notification count with real counts or remove them.
- Add "what to upload next" guidance to empty analytics pages.
- Add monthly preset shortcuts for GM review.

Backend:

- Add cache headers or simple in-memory cache for canonicalized `/api/events`.
- Log export events when audit package is generated.

Database:

- Verify all current Supabase migrations match route handler assumptions.

Analytics:

- Add quantity overlays to trend modals: checked, rejected, rejection percent.

Testing:

- Add smoke tests for `/api/events`, `/api/schema`, `/api/ingest` error cases.

### Short Term: 1 month

Frontend:

- Split staging into clear steps: upload, validate, correct/comment, publish.
- Create GM monthly summary report separate from forensic book.
- Add findings queue page or enhance audit page to show unresolved findings.
- Make source/provenance drilldowns consistent across dashboard and analysis pages.

Backend:

- Add server-side view-model endpoints for dashboard, stage, size, defect, SPC, COPQ.
- Add post-ingest invalidation and cross-tab refresh strategy.
- Make all manual edits emit correction events.

Database:

- Add users, roles, audit logs, report runs, export logs.
- Move cost settings from localStorage into `cost_config`.

Analytics:

- Add stage x size x defect x period drilldown.
- Generate findings for SPC rule violations.

Testing:

- Add integration tests for multi-file ingest, conflict findings, correction chains, and cost config.

### Medium Term: 3 months

Frontend:

- Implement role-based UI: Operator, Supervisor, QA Manager, GM, Admin.
- Build route-backed investigation pages for a metric, stage, defect, size, and finding.
- Add CAPA creation directly from defect/SPC/finding screens.

Backend:

- Add auth middleware and API guards.
- Implement governed registry/template versioning.
- Add durable raw workbook/sheet retrieval by file hash.
- Add streaming chat.

Database:

- Harden RLS policies.
- Add approval/signature tables.
- Add immutable correction/void model for all edit/delete workflows.

Analytics:

- Server-side aggregate materialized views or cached view models.
- Add repeat-defect and recurring-stage-loss analytics.

Deployment:

- Prepare on-prem deployment: persistent Next server, local Postgres, backup, local object/file storage, local LLM option.

### Long Term: 6-12 months

Product:

- Multi-plant support.
- ERP/MES/QMS integration.
- SOP and CAPA knowledge base.
- Predictive quality risk and production planning linkage.

Engineering:

- Dedicated backend service if Next route handlers become overloaded.
- Event-sourced audit model with retention and replay tooling.
- Formal validation package for regulated plant use.

UX:

- Separate executive cockpit, QA investigation workbench, operator terminal, admin console.

AI:

- Local LLM primary deployment.
- Hybrid retrieval: deterministic ledger retrieval for numbers, vector search for SOPs/CAPA/comments.

## 16. Risk Register

| Risk | Severity | Why it matters | Mitigation |
|---|---|---|---|
| No real RBAC | Critical | Unauthorized schema/data/admin changes are possible | Add auth, roles, API guards, RLS hardening |
| Destructive routes | Critical | Data can be cleared without enterprise approval model | Restrict to admin/dev and log/export before purge |
| Parallel truth paths | High | Users may confuse session analysis vs ledger analytics | Consolidate around ledger |
| Client-side full ledger | High | Slow at scale and exposes more data than needed | Server-side view models |
| LocalStorage settings | High | Cost and thresholds are not governed | DB config with effective dates |
| SessionStorage raw sheet cache | Medium | Verification can disappear between sessions | Server-side raw sheet retrieval |
| Dense UX | Medium | Operators may avoid the app | Role-based task flows |
| Non-streaming chat | Medium | Perceived slowness | Stream text-first answers |

## 17. Final Assessment

RAIS Pro has the right technical instincts: deterministic numbers, event ledger, schema contracts, provenance, and source verification. The GM review is not asking for a different product; it is asking for this product to become simpler, safer, more graphical, and more governed.

The best next move is not a visual redesign alone. The next move is to harden the operating model:

1. Make the ledger the single source of truth.
2. Add identity and role-based authority.
3. Convert validation findings into a daily review workflow.
4. Make all drilldowns source-backed and shareable.
5. Move performance-critical analytics server-side.
6. Produce a concise GM monthly report while preserving the full forensic audit package.

If those steps are done, the product can credibly evolve from "The Rejection Report" into a Manufacturing Operational Intelligence Platform.

## 18. Verification Performed

- Extracted and reviewed `MOID REVIEW POINTS (27.06.26)(1).pdf`.
- Reviewed repo instructions and existing MOID specs.
- Inspected source for pages, API routes, shell, event context, ingestion, analytics, AI, store, Supabase migrations, provenance, reports, and settings.
- Ran `npx jest`: 35 test suites passed, 190 tests passed.
- Ran `npx tsc --noEmit`: passed.
- Ran `npm run build`: passed.
- Started local dev server on port 3001 and smoke-loaded `/`, `/staging`, `/data-entry`, `/stage-analysis`, `/size-analysis`, `/defect-analysis`, `/spc`, `/process-flow`, `/copq`, `/reports`, `/capa`, `/chat`, `/audit`, `/schema`, `/settings`, and `/clear-data`.

