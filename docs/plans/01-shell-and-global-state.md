# 01 — App Shell, Navigation & Global State

The frame every screen lives in (all 5 mockups share it). Build once; screens slot into the content area.

## Layout (matches mockup)
```
┌ TopBar: logo+wordmark · Plant ▾ · Line ▾ · Date Range ▾ · [Shift ▾ on entry/staging] ····· 🔔n · ☾/☀ · User ▾ · Export ▾
├ LeftNav (fixed)                                    │ Content (route)                         │ [optional RightRail per screen]
│  Dashboard / Data Entry / Staging&Review(badge)    │                                         │
│  Analytics ▾ (Stage/Size/Defect/SPC) / Process     │                                         │
│  Flow / COPQ&Savings / Reports / CAPA&Actions /     │                                         │
│  Ask RAS / Audit Trail / Settings                   │                                         │
│  [bottom] Data Trust Score 98.4%                    │                                         │
└ StatusBar: Active Alerts · Pending CAPA · Overdue · Data Anomalies ········· Ask RAS launcher
```

## Routing (Next.js App Router)
`/` Dashboard · `/data-entry` · `/staging` · `/analytics/stage` `/analytics/size` `/analytics/defect` `/analytics/spc` · `/process-flow` · `/copq` · `/reports` · `/capa` · `/audit` · `/settings`. Ask RAS is a global slide-over, not a route. **Dashboard is the index** (MOID-SPEC: dashboard-first). The current `/ingest` page folds into `/staging` (plan 03).

## Global filter state (Scope)
A single React context `ScopeProvider` holds `{ plant, line, dateFrom, dateTo, shift, grain, stageIds, sizes, productIds, machineIds, operatorIds }`, persisted to URL query + localStorage. TopBar controls write to it; every screen reads it and passes it to analytics selectors (plan 02). Changing scope re-renders all data via selectors — one source, no per-screen filter logic.
- Plant/Line: single real option for the pilot (Disposafe / FBC Line 1); render as dropdowns ready for multi-line.
- Date Range: presets (This month, FYTD, Last 12m) + custom; default FYTD (01 Apr–31 Mar).
- Shift: shown only on Data Entry & Staging (entry granularity); analytics shift filter is V2 (disabled until shift captured).
- Machine/Operator filters live in screen right-rails (plan 05), disabled with a note until captured.

## Theming (light + dark, mockup is dark)
Reuse existing CSS-variable system + `data-bg`/theme toggle already in the app (`globals.css`, `TweaksContext`). The mockup palette (deep navy bg, blue accent, green/amber/red status) maps to the dark theme tokens; light theme keeps editorial paper. **No hardcoded hex in components** — only tokens, so the toggle works. Status colors strictly via `--status-good/warn/bad` (added in globals).

## Shared shell pieces (build in plan 06, placed here)
- `TopBar` (scope controls + export + theme + user + notifications=open-alerts count from findings).
- `LeftNav` (active route, Analytics expandable, Staging badge = pending staging count).
- `DataTrustScore` (footer of nav) = `analytics.trustScore(scope).pct` + last-validated time.
- `StatusBar` = live counts: Active Alerts (critical findings), Pending CAPA (V1.5 stub: open actions), Overdue, Data Anomalies (open findings), Ask RAS launcher.
- `AskRasLauncher` → opens the global chat slide-over (plan 07).

## State management
No heavy store; React context for Scope + a thin data hook `useAnalytics(selector)` that memoizes `selector(events, scope)`. Events fetched once per scope window via `/api/events?…` (server reads store) and cached with SWR-style stale-while-revalidate keyed by scope. Screens never fetch raw events directly — they call `useAnalytics`.

## Empty/loading/error (every screen)
Skeletons while events load; if ledger empty → cockpit shows a centered "Ingest rejection data → /staging" CTA (dashboard-first, never an upload gate); errors render inline, never a raw stack.
