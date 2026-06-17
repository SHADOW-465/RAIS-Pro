# RAIS Pro — Visual Design System (revamp)

> **Pairs with:** `docs/DESIGN-UX-REVAMP.md` (features, flows, states, data contracts).
> That doc says *what the app does*; **this doc says how it looks.**
> **Aesthetic:** a blend of **Modern SaaS** (clean, neutral, one vivid accent, product-grade) and **Soft Modern** (light, airy, rounded, friendly). **Light theme is primary; a light/dark switch is built in.** Text legibility is the #1 priority.
> **Explicitly retired:** the old editorial/newspaper skin — warm paper background, serif display type (Fraunces/Lora), and the burnt-orange `#C8421C` accent are all gone. Do not reintroduce them.

---

## 1. Design principles (visual)

1. **Legibility first.** High-contrast text everywhere; never light-gray body text on white. Body text targets WCAG **AA+ (≥ 7:1 where practical)**; secondary text ≥ 4.5:1. Big, confident numerals.
2. **Calm canvas, one decisive accent.** Neutral slate surfaces do the work; a single indigo accent is reserved for **action + attention + the verify highlight**. Don't spray accent everywhere.
3. **Soft, rounded, airy.** Generous padding, rounded-2xl cards, gentle shadows in light mode; structure via borders in dark mode. Friendly, not corporate-cold.
4. **Numbers are the hero.** KPI values are large, tabular monospace, tight tracking — they read like instruments, not body copy.
5. **Trust is visible.** Deterministically-computed facts (KPIs, charts, audit) and AI-written prose (brief, insights, recommendations) get **different surfaces** so users never confuse a model sentence for a measured number. (This is a hard requirement carried over from the product invariants.)
6. **Theme-symmetric.** Every component is specified for **both** light and dark; nothing is an afterthought in dark mode.

---

## 2. Color tokens

All color flows through **CSS custom properties** with semantic names. Components reference tokens, never raw hex. Theme = `data-theme="light" | "dark"` on `<html>`.

### 2.1 Light theme (primary)

```css
:root, [data-theme="light"] {
  /* Surfaces */
  --bg:            #F7F8FB;   /* app canvas (soft off-white) */
  --surface:       #FFFFFF;   /* cards / panels */
  --surface-2:     #F1F4F9;   /* nested / subtle fills, table stripes */
  --surface-3:     #E8ECF3;   /* deeper wells, code blocks */
  --overlay:       rgba(15,23,42,0.45); /* modal scrim */

  /* Borders */
  --border:        #E3E8EF;   /* hairlines, card edges */
  --border-strong: #CBD3DF;   /* dividers that need to read */
  --ring:          #6366F1;   /* focus ring (accent) */

  /* Text (high contrast on --bg / --surface) */
  --text:          #0F172A;   /* primary — ~16:1 on white */
  --text-2:        #475569;   /* secondary — ~7:1 */
  --text-3:        #64748B;   /* muted (non-essential only) — ~4.8:1 */
  --text-invert:   #FFFFFF;   /* on accent / on dark fills */

  /* Accent (action + attention + verify highlight) */
  --accent:        #4F46E5;   /* indigo 600 — buttons, links, active */
  --accent-hover:  #4338CA;   /* indigo 700 */
  --accent-weak:   #EEF0FF;   /* tint fill (selected rows, AI surface) */
  --accent-text:   #4338CA;   /* accent text on light (passes AA) */

  /* Semantic status */
  --positive:      #047857;   /* good (e.g. falling rejection rate) */
  --positive-weak: #E7F6EF;
  --warning:       #B45309;
  --warning-weak:  #FBF1E3;
  --critical:      #C81E3A;   /* alerts, rising rejection */
  --critical-weak: #FCEBEE;

  /* Elevation (soft shadows in light mode) */
  --shadow-1: 0 1px 2px rgba(15,23,42,.06), 0 1px 3px rgba(15,23,42,.04);
  --shadow-2: 0 4px 12px -2px rgba(15,23,42,.08), 0 2px 6px -2px rgba(15,23,42,.06);
  --shadow-3: 0 12px 32px -8px rgba(15,23,42,.16);
}
```

### 2.2 Dark theme

```css
[data-theme="dark"] {
  --bg:            #0B0F1A;   /* deep slate canvas */
  --surface:       #121826;   /* cards */
  --surface-2:     #1A2233;   /* nested fills, table stripes */
  --surface-3:     #222C40;   /* wells */
  --overlay:       rgba(0,0,0,0.6);

  --border:        #243049;
  --border-strong: #32405C;
  --ring:          #818CF8;

  --text:          #F2F5FA;   /* primary — high contrast on dark */
  --text-2:        #AEB9CC;
  --text-3:        #7E8AA0;
  --text-invert:   #0B0F1A;

  --accent:        #6366F1;   /* slightly brighter for dark buttons */
  --accent-hover:  #818CF8;
  --accent-weak:   #1B2140;   /* low-alpha indigo wash */
  --accent-text:   #A5B4FC;   /* accent text on dark (bright, legible) */

  --positive:      #34D399;
  --positive-weak: #11261F;
  --warning:       #FBBF24;
  --warning-weak:  #2A2113;
  --critical:      #FB7185;
  --critical-weak: #2A1620;

  /* Dark relies on borders + surface steps, shadows are subtle */
  --shadow-1: 0 1px 2px rgba(0,0,0,.4);
  --shadow-2: 0 6px 18px -6px rgba(0,0,0,.5);
  --shadow-3: 0 16px 40px -10px rgba(0,0,0,.6);
}
```

### 2.3 Data-visualization palette (categorical)

Soft-modern, distinguishable, works in both themes. Use in order for chart series / reason bars.

```css
:root {
  --viz-1:#6366F1; --viz-2:#14B8A6; --viz-3:#F59E0B; --viz-4:#F43F5E;
  --viz-5:#A855F7; --viz-6:#0EA5E9; --viz-7:#84CC16; --viz-8:#64748B;
}
[data-theme="dark"] {
  --viz-1:#818CF8; --viz-2:#2DD4BF; --viz-3:#FBBF24; --viz-4:#FB7185;
  --viz-5:#C084FC; --viz-6:#38BDF8; --viz-7:#A3E635; --viz-8:#94A3B8;
}
```

**Metric semantics:** rejection rate is a "lower is better" metric. A **down** trend = `--positive` (green), an **up** trend = `--critical` (red). Never rely on color alone — pair with an arrow icon + label.

---

## 3. Theming mechanics

- Theme attribute lives on `<html data-theme="…">`. All tokens re-resolve instantly.
- **Initial theme:** read `localStorage.theme`; else fall back to `matchMedia('(prefers-color-scheme: dark)')`. Default to **light** if nothing matches.
- **Toggle:** a sun/moon control in the top bar; writes `localStorage.theme` and flips the attribute. Animate the icon, not the whole page (avoid a jarring full repaint).
- Set `<meta name="theme-color">` per theme. Set `color-scheme: light dark` so form controls/scrollbars match.
- No flash-of-wrong-theme: resolve and set the attribute before first paint (inline head script).

---

## 4. Typography

Sans for everything; **monospace for all numbers** (tabular). Headings get a friendly geometric sans for the soft-modern warmth; body/UI use Inter for ruthless legibility.

```css
:root {
  --font-sans:    'Inter', system-ui, -apple-system, 'Segoe UI', sans-serif;
  --font-display: 'Plus Jakarta Sans', 'Inter', system-ui, sans-serif; /* headings */
  --font-mono:    'JetBrains Mono', 'Geist Mono', ui-monospace, monospace; /* numbers */
}
body { font-family: var(--font-sans); -webkit-font-smoothing: antialiased; }
.num { font-family: var(--font-mono); font-variant-numeric: tabular-nums; }
```

**Type scale** (rem; 16px base):

| Token | Size / line-height | Weight | Use |
|---|---|---|---|
| display | 2.5rem / 1.1 | 700 (display) | page/report title |
| h1 | 2rem / 1.15 | 700 | section hero |
| h2 | 1.5rem / 1.25 | 600 | section headers ("The numbers") |
| h3 | 1.25rem / 1.3 | 600 | card titles, chart titles |
| body-lg | 1.0625rem / 1.6 | 400 | executive summary, brief |
| body | 0.9375rem / 1.55 | 400 | default text |
| small | 0.8125rem / 1.5 | 400/500 | captions, table cells |
| label | 0.75rem / 1.2 | 600, +0.04em, uppercase | eyebrows / chips |
| **kpi-value** | **3rem–3.5rem / 1** | **600, -0.02em, tabular mono** | **the KPI numerals** |

Rules: headings `--text`; secondary copy `--text-2`; only decorative/meta uses `--text-3`. Don't set body copy below 14px. Numbers always `.num`.

---

## 5. Shape, spacing, elevation

```css
:root {
  --radius-sm: 8px;   --radius-md: 12px;  --radius-lg: 16px;  /* cards */
  --radius-xl: 20px;  --radius-pill: 9999px;
  --space-1:4px; --space-2:8px; --space-3:12px; --space-4:16px;
  --space-5:24px; --space-6:32px; --space-7:48px; --space-8:64px;
  --tap: 40px; /* min interactive height */
}
```

- **Cards/panels:** `--surface`, `1px solid --border`, `--radius-lg`, `--shadow-1`, padding `--space-5`. Hover-raisable cards (archive tiles) go to `--shadow-2` + `--border-strong`.
- **Dark mode:** prefer border + `--surface-2` contrast over shadow.
- Container max-width ~1200px for the report; full-width split for Verify.

---

## 6. Core components (applied to this app)

### 6.1 App shell / top bar
Sticky, `--surface` with a bottom `--border`, height ~56px. Left: product mark "RAIS Pro" + the analysis title as a soft pill. Right (report view): **Verify data** (toggle), **Export**, **New analysis**, and the **theme toggle**. Keep it quiet; the report is the star.

### 6.2 Buttons
- **Primary:** `--accent` bg, `--text-invert`, `--radius-md`, weight 600, hover `--accent-hover`, focus → 2px `--ring` offset.
- **Secondary:** `--surface` bg, `1px --border-strong`, `--text`; hover `--surface-2`.
- **Ghost:** transparent, `--text-2`; hover `--surface-2`.
- **Danger:** `--critical` text on `--critical-weak`, or solid `--critical` for destructive confirm.
- Pills/chips: `--radius-pill`, `--surface-2`, `--text-2`, `label` type.

### 6.3 KPI card (the hero)
`--surface` card. Top row: **label** (label type, `--text-2`) + a **trend tag** (icon + word "improving/declining/stable", colored by metric semantics §2.3). Center: **kpi-value** numerals (`.num`, `--text`) + unit in `--text-3`. Bottom: a **formula/context** line in `small` `--text-3` (e.g. "Σ rejected ÷ entry-stage checked") and an optional **sparkline** (accent stroke). In **Verify mode** the card is clickable and shows an **active ring** (2px `--accent`) + a subtle `--accent-weak` fill.

### 6.4 Charts (inline SVG, no library)
Card with `h3` title + figure index. Axes/gridlines `--border`; labels `--text-3 small .num`. Series use `--viz-*`. Bars: rounded top corners (`--radius-sm`). Line/trend: 2px stroke `--viz-1`, soft area fill at ~12% alpha, dot on last point. Rate-by-stage and rejection-trend may color **good vs bad** with `--positive`/`--critical`. Always legible in dark (brightened viz tokens).

### 6.5 Trust-tier surfaces (critical)
- **Computed facts** (KPIs, charts, the merge audit): plain `--surface`, mono numerals — feel precise and "measured."
- **AI prose** (brief, insights, recommendations, chat slides): sit on a faintly tinted **`--accent-weak`** surface (or a `--surface-2` block) with a small **"AI-generated"** chip (sparkle icon, `label` type, `--accent-text`). This is how a user instantly knows "a model wrote this" vs "this was measured." Required.

### 6.6 Verify split-pane + beam
Left = report (KPIs clickable). Right = raw data table panel (`--surface`, left `--border-strong`). Clicking a KPI:
- Highlights its source **column** in the table: header cell gets `--accent` bg + `--text-invert`; body cells get `--accent-weak` fill + `--accent` left/right edges; scroll into view.
- Draws an **animated bezier beam** KPI→column-header: stroke `--accent` (light) / `--accent-hover` brightened (dark), 2px, with a soft outer glow (drop-shadow blur ~6px at low alpha) and a quick draw-in animation. Recompute on scroll/resize.
- **Reduced motion:** skip the draw animation and glow; keep a static connector + the column highlight.

### 6.7 Data table (verify)
Monospace cells (`.num small`), zebra rows via `--surface-2`, sticky header (`--surface` + bottom `--border-strong`), sticky row-number gutter `--text-3`. Sheet tabs as pill segments; active tab `--accent` underline or filled. Highlighted column as in §6.6.

### 6.8 Chat dock + insight slide
Dock: fixed bottom bar on `--surface` with top `--border` + `--shadow-2`; suggested-question chips (§6.2 pills), a rounded input (`--radius-pill`, `--surface-2`, clear focus ring), primary **Ask**. Collapses to a floating accent FAB. **Insight slide:** an AI-tier card (§6.5) with the question (quiet `--text-3`), a strong `h3` headline, 1–2 inline charts, numbered bullets, and a **Save as PNG** button. (PNG export must capture the card cleanly in the current theme.)

### 6.9 Upload zone
Large dashed drop target: `2px dashed --border-strong`, `--surface`, `--radius-lg`. Drag-over → `--accent` dashed border + `--accent-weak` fill. Queued files as compact rows (`--surface-2`) with type/size + remove. Primary "Analyze" CTA. Clear feedback for unsupported/oversized files (don't fail silently).

### 6.10 Processing / stepper
Centered. A circular progress (accent arc on `--surface-3` track) + a 5-step vertical stepper: done = filled `--accent` dot + check; active = pulsing `--accent` ring; pending = `--border-strong` outline, `--text-3`. Tie to real progress, not a timer.

### 6.11 Alerts & sources audit
- **Alert banner:** `--critical-weak` bg, `1px --critical` left bar, `--text` body, alert icon `--critical`. Warnings use the `--warning` token set.
- **Sources & merge audit:** a calm `--surface` panel; three columns (Included → group / Excluded + reason / Warnings). Included uses `--text`; excluded reasons `--text-2`; the merge strategy in a `--surface-2` code chip. Honest and scannable.

### 6.12 Archive tiles
`--surface` cards, `--radius-lg`, hover → `--shadow-2` + lift 1px; title `h3`, file chips, a 2-KPI mini-preview using `.num`.

### 6.13 Empty / error states
Friendly, centered, illustrative-but-minimal: an outline icon, a clear headline, one sentence, and a primary action. The "no usable numbers" state must explain what to check (header rows, file type) — never a blank screen.

---

## 7. Iconography & imagery
- **Line icons**, 1.5–2px stroke, rounded caps (e.g. Lucide). Size 16–20 in UI, 14 in chips. Color inherits `--text-2`, or accent/semantic when meaningful.
- No photography. Charts and the verify beam are the visual interest.

## 8. Motion
- Durations 120–240ms, easing `cubic-bezier(.2,.7,.2,1)`. Use for: card hover lift, section fade-in, theme-toggle icon, beam draw-in, stepper pulse.
- Honor `prefers-reduced-motion: reduce` — disable beam draw + nonessential transitions; keep state changes instant.

## 9. Accessibility (enforce — "clearly visible text" is the brief)
- Contrast: primary text ≥ 7:1; secondary ≥ 4.5:1; UI/icon ≥ 3:1. Verify the dark palette too.
- Visible focus ring (`--ring`, 2px, 2px offset) on every interactive element; full keyboard operability (KPIs-as-buttons in verify, chat, upload, theme toggle).
- Color never the sole signal (trend, alert, highlighted column all pair color with icon/text/shape).
- Respect reduced motion; min tap target `--tap` (40px).

## 10. Implementation notes (for Antigravity + Gemini Flash)
- Implement tokens as the **CSS variables** in §2–§5 (light in `:root`, dark in `[data-theme="dark"]`). If using Tailwind, map these variables into `theme.extend.colors` (e.g. `bg: 'var(--bg)'`, `accent: 'var(--accent)'`, etc.) and use `darkMode: ['selector', '[data-theme="dark"]']`.
- Build the **theme toggle + no-flash head script** first; verify every component in both themes before moving on.
- Keep charts as **inline SVG** bound to the `--viz-*` tokens so they recolor with theme automatically.
- Reuse the **feature spec, data contracts, states, and acceptance test** in `docs/DESIGN-UX-REVAMP.md` — this doc only changes the *look*, not the behavior, data shapes, or invariants.
- Definition of done for the skin: both themes pass the contrast targets in §9; computed vs AI surfaces are visually distinct (§6.5); the verify beam reads clearly in light and dark; nothing uses paper/serif/burnt-orange.
