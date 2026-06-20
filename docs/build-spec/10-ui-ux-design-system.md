# 10 · UI / UX & Design System

Design language: **"The Rejection Report" — an editorial diagnostic for pharma GMs.** Premium Factory Intelligence Cockpit. **Not** glassmorphism, **not** stock-market charts.

## 10.1 Tokens & typography
- **Palette:** warm paper background, near-black ink, burnt-orange accent `#C8421C`, status colors (positive / warning / critical, each with a `-weak` fill). Dark + light modes.
- **Type:** **Fraunces** (display serif) for headings/reports; **Inter Tight** (UI) for controls; **JetBrains Mono** (tabular-nums) for all numbers/tables. *(The canonical spec lists IBM Plex / Newsreader as an alternate — current build uses Fraunces/Inter Tight/JetBrains Mono.)*
- **Theming via CSS variables** painted by `TweaksContext` onto `<body data-density / data-bg / data-card / data-chart-style>`: `--paper, --ink, --accent, --serif, --font-sans, --font-mono, --border, --surface, --text-2, --text-3, …`. **New components consume vars — never hardcode hex** (keeps the Tweaks panel working). Design primitives live in `src/components/editorial/` (inline `style={{}}` against vars is intentional there).
- **Charts = inline SVG** (no Chart.js). **Animations = pure CSS** (`pulse-ring, blink, fade-up, draw-line`). Removed deliberately: Chart.js, lucide-react, framer-motion.

## 10.2 Screens (`src/app/`)
| Route | Screen |
|---|---|
| `/` | **Dashboard cockpit** |
| `/staging` | Upload + editable staging/review grid |
| `/data-entry` | Manual entry with add/remove fields |
| `/stage-analysis` `/size-analysis` `/defect-analysis` | Drill-downs |
| `/spc` | X-bar control chart + Western Electric |
| `/copq` | Cost of poor quality + savings |
| `/process-flow` | Interactive line flow / FPY per gate |
| `/reports` | 3-page A4 monthly report (print) |
| `/audit` | Trust score, audit summary, export |
| `/chat` | Ask RAS |
| `/settings` | Costs, targets, theme, registry |
| `/capa` | CAPA memory / actions |

## 10.3 Cockpit layout (the landing page)
Masthead (plant/line/grain D·W·M·FY/date-range/theme/export) →
- **Row 1:** AI Executive Summary · Recommended Actions (AI) · Monthly COPQ gauge · Quality Status (ok/watch/at-risk).
- **KPI strip:** Rejection Rate (primary) · Total Rejections · First Pass Yield · COPQ (period) · Savings Opportunity — each with a sparkline + vs-previous delta + **View Source**.
- **Rejection Trend** (D/W/M/FY segmented; target line) · **Process Flow Overview** (per stage: `Checked | Rej | Yield` + colored rate badge; `yield = 1 − rejRate`).
- **Stage-wise trend** · **Defect Pareto** · **Size-wise rejection**.

## 10.4 Key interactions
- **Empty state (no events):** a clear "No data yet" block naming the exact workbooks to upload (Visual size-wise, Valve Integrity size-wise, Rejection Analysis) + a **Go to Staging & Review →** button. **No demo/seed data.**
- **Verify mode:** KPI `sourceColumn` ref → column-header DOM ref → `getBoundingClientRect()` on both → bezier "beam" recomputed on scroll/resize (client-side); proves a number's origin visually.
- **Staging grid:** every cell editable; per-cell Comment icon; swap checked↔rejected; amber/red highlight on validation fail; "Commit to Ledger".
- **Sticky** masthead and verify-panel headers (scroll-heavy screens) must remain sticky.
- **Provenance flyout** (from Ask RAS / KPI): file, sheet, cell range, hash, timestamp, ledger id, edit comments.

## 10.5 Component layers
- `src/components/editorial/` — design-system primitives (Card, Kpi, Empty, Icon, charts).
- `src/components/app/` — AppShell (sidebar nav, masthead, Export button), widgets (`ProcessFlow`, etc.).
- `src/components/` — domain components (Dashboard session view [legacy], VerifyPanel, UploadZone).
