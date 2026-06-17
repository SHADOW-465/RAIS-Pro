# RAIS — Design Language Decision
*Phase 4 output*

---

## Personality Audit

**Intelligent**
Typography is precise and utilitarian — optimised for information density, not visual flair. Spacing creates hierarchy through contrast, not decoration. The layout communicates that the person who designed it understands data. Components are sized to show maximum information without crowding. There are no rounded corners on data. Font weights do the work that colors might otherwise do. The UI feels like it was designed by someone who has stared at Bloomberg Terminal for 1,000 hours and knows exactly what to fix.

**Command**
Dark background dominates — not as a trend, but because it makes data elements pop and reduces eye fatigue during extended reading sessions. Accent color is used sparingly and consistently: one primary accent (teal), deployed only for active states, primary CTAs, and key data highlights. Layout hierarchy is immediately obvious at a glance — the most important thing (the executive summary) appears first and largest; the most detailed thing (data sources) is smallest and last. There are no competing focal points.

**Efficient**
Zero onboarding friction. No tooltips on first load, no "welcome to RAIS" modal, no progress indicators unless there is actual async work happening. Animations are purposeful — the processing screen animation communicates active AI work, the chart render animation gives the eye time to follow what is drawing. Everything else is instant. An experienced user can go from landing to informed decision in under 5 minutes without reading a single instruction.

---

## Type System

**Primary font: Barlow Semi Condensed**
Rationale: Space-efficient and authoritative. The semi-condensed width means more text fits per line — critical in a dense data dashboard. The geometric structure reads as analytical without being cold. Rejected: Inter (too generic, the default SaaS choice), Space Grotesk (overused in dashboards, 2022 aesthetic), DM Sans (too soft for this use case), Roboto (too much Google DNA). Barlow Semi Condensed is the right amount of technical without being unreadable.

**Scale:**
- Hero — 28px / weight 700 — KPI values only. The number someone reads from across the room.
- Display — 22px / weight 600 — Dashboard title in header, section titles
- Heading — 15px / weight 600 — Chart card titles, insight card titles, panel headings
- Body — 14px / weight 400 — Executive summary body, insight text, recommendation text, drop zone instructions
- Label — 11px / weight 600, letter-spacing 0.08em, UPPERCASE — Column labels, category tags, screen section markers (e.g. "EXECUTIVE SUMMARY", "KEY INSIGHTS")
- Mono — JetBrains Mono 400/500 — timestamps, filenames, KPI trend values ("+12.4%"), error codes, numeric data in non-chart contexts

---

## Color Tokens

```
--color-bg              Deep background, the floor everything sits on (#07090D)
--color-surface         Default card and panel fill — slightly above bg (#10131E)
--color-surface-raised  Hover state surfaces, active elements (#161A28)
--color-surface-high    Borders of focused/selected elements (#1D2235)
--color-border          Default subtle border — 5% white opacity
--color-border-emphasis Hover/focus border — 9% white opacity
--color-border-strong   Active/selected border — 14% white opacity

--color-text-primary    Main text, headings, values, KPI numbers (#EEF1F8)
--color-text-secondary  Supporting descriptions, chart descriptions, summary body (#8892A4)
--color-text-muted      Disabled, placeholder, inactive labels, timestamps (#4A5468)

--color-accent          Teal (#00E5CC) — the only identity color. Used for:
                        primary CTA buttons, active nav states, section label text,
                        the top accent border on the summary card, the RAIS logo.
                        Not used for general text or as a background fill on large areas.

--color-accent-dim      Teal at 8% opacity — hover backgrounds, subtle highlights
--color-accent-border   Teal at 18% opacity — borders on accent-adjacent elements

--color-success         Green (#10B981) — positive trend arrows, done step indicators,
                        data source dots, passing thresholds
--color-warning         Amber (#F59E0B) — recommendation bullet points, caution states,
                        medium-priority items
--color-danger          Red (#EF4444) — critical alerts banner, error states, negative
                        trend arrows, rejection spike indicators

--color-chart-1         #00E5CC  Teal — primary chart series
--color-chart-2         #8B5CF6  Purple — secondary series
--color-chart-3         #F59E0B  Amber — tertiary series
--color-chart-4         #10B981  Green — positive/pass series
--color-chart-5         #EF4444  Red — negative/fail series
--color-chart-6         #F97316  Orange
--color-chart-7         #3B82F6  Blue
--color-chart-8         #EC4899  Pink
```

**Palette mood:** A deep navy-to-black environment with teal as the only warm light source. Feels like a command room at night — alert but controlled. The darkness reduces eye fatigue for extended reading. The single accent color creates a clear focal point in an otherwise desaturated environment.

---

## Motion Budget

1. **Premium Elements Staggering:** Elements on the dashboard should load with a staggered fade-in effect to feel premium. Utilize Framer Motion or similar libraries to cascade the visibility of KPIs, charts, and text content sequentially (e.g. 100ms interval between items).

2. **Processing step indicators: pulse animation, 1s ease-in-out infinite** — the active step pulses its ring indicator to communicate live AI work. 

3. **Chart & Component initial render: Smooth scaling & fade-in** — charts and cards animate in smoothly. This makes the dashboard feel dynamic, alive, and modern. 

4. **Micro-interactions:** Hover effects and transitions on interactive elements should be fluid (e.g. 200ms-300ms) ensuring the UI feels responsive and high-end but never slow.

---

## What Not To Do

1. **Do not use white or light card backgrounds.** Placing a white card on a dark background is the "card in a dashboard" cliché. It creates jarring contrast that makes the data feel like a spreadsheet screenshot. Every surface must come from the dark color ramp. (Contradicts "Command.")

2. **Do not add gradient sweeps or shimmer loading skeletons on the dashboard.** The Processing screen handles the wait state explicitly and completely. Shimmer skeletons would imply the dashboard loads progressively — it does not. Showing them sets wrong expectations and adds visual noise. (Contradicts "Efficient.")

3. **Do not deploy more than two semantic colors on the same screen simultaneously.** Teal, amber, green, red, and purple all firing at once destroys hierarchy. On the Dashboard screen: teal for accent elements, green for positive trends, red for negative trends and alerts only. Purple and amber are chart series colors only — not used for UI chrome. (Contradicts "Intelligent" and "Command.")

---

## Component Philosophy

Components are containers for data first and branded UI elements second. When a chart or card layout could be resolved two ways, choose the version that makes the data easier to read — not the version that looks more distinctive or impressive. The only ornamentation permitted is ornamentation that directly serves comprehension: the top-border accent on the summary card (signals importance), the color-coded trend arrows (signals direction), the numbered insight index (signals sequence). Everything decorative that does not carry meaning should not exist.
