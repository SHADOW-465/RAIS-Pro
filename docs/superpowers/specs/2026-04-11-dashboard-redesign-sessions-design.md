# RAIS — Dashboard Redesign + Sessions + Insight Slides
*Spec · April 11, 2026*

---

## Overview

This spec covers three interconnected upgrades to RAIS:

1. **UI Redesign** — glassmorphism visual system replacing the current light theme
2. **Session Persistence** — Supabase-backed session history, device-bound (no login), browsable from a new Home screen
3. **Insight Slides** — follow-up questions generate 1–3 visual insight slides instead of plain text answers

These are delivered in four sequential phases. Each phase is independently shippable.

---

## Visual System

### Direction
Glassmorphism: frosted translucent cards on a soft gradient background. Tactile depth through `backdrop-filter: blur`, white-tinted borders, and layered soft shadows — not the heavy inset/extrude shadows of classic neumorphism.

### Background
```css
background: linear-gradient(145deg, #dbeafe 0%, #ede9fe 50%, #fce7f3 100%);
```
Full-page gradient, fixed — does not scroll with content.

### Glass surface (standard card)
```css
background: rgba(255, 255, 255, 0.55);
backdrop-filter: blur(12px);
-webkit-backdrop-filter: blur(12px);
border: 1px solid rgba(255, 255, 255, 0.80);
border-radius: 14px;
```

### Glass surface (tinted — active/highlighted state)
```css
background: rgba(99, 102, 241, 0.08);
border: 1px solid rgba(99, 102, 241, 0.20);
border-radius: 14px;
```

### Accent system
- **Primary accent:** Indigo → Sky blue gradient `linear-gradient(135deg, #6366f1, #0ea5e9)`
  - Used on: primary CTA buttons, logo, active borders, insight slide labels
- **Positive trend:** `#10b981` (green)
- **Negative trend:** `#ef4444` (red)
- **Warning:** `#f59e0b` (amber)

### Typography
- Font: `Inter` (existing, keep)
- KPI values: 24px / weight 800
- Section headings: 13px / weight 700
- Body: 12–13px / weight 400–500
- Labels: 9–10px / weight 600 / uppercase / letter-spacing 0.06em
- Muted text: `#94a3b8`

### Decorative background blobs
Soft radial gradients positioned absolutely in corners of major surfaces to add depth:
```css
radial-gradient(circle, rgba(99,102,241,0.15), transparent 70%)
```
Pointer-events: none. Never interfere with content.

---

## Screen Map

### Screen 0 — Home / Session Library *(new)*

**Purpose:** Entry point. Shows past sessions + upload zone.

**Layout (top to bottom):**
1. **Topbar** — RAIS logo + tagline (no buttons; this is the home screen)
2. **Welcome line** — "Good morning." + brief prompt
3. **Recent Sessions grid** — 3-column responsive grid of session cards
4. **Drop zone** — dashed-border upload area always visible below sessions

**Session card contents:**
- Date (relative: "Today", "Yesterday", "Apr 7")
- AI-generated session title (from original analysis)
- Source filenames
- 2 key KPI previews (from parent analysis)
- Insight slide count badge ("◈ 3 insight slides")
- "Open →" link

**Empty state (no sessions yet):**
Sessions grid is hidden. Drop zone takes full prominence with a larger prompt: "Drop your first Excel files to get started."

**Behaviour:**
- Clicking a session card navigates to that session's Dashboard screen
- Files dropped onto the drop zone start a new session → navigate to Processing screen
- Browse button also opens file picker

---

### Screen 1 — Processing *(visual update only)*

No functional changes. Update all surfaces to glassmorphism: spinner rings, step indicators, card background. Keep the 5-step progress animation.

---

### Screen 2 — Dashboard *(updated + extended)*

**Topbar (sticky):**
- Left: `← Home` breadcrumb / `Session title` / timestamp
- Right: `⬇ Export` (ghost button) + `+ New Analysis` (primary button)

**Body (scrollable, top to bottom):**

1. **Alerts banner** (conditional) — red-tinted glass band, shown only if AI flagged anomalies
2. **Executive Summary card** — glass card with left indigo border, label + 2-sentence summary
3. **KPI grid** — 4-column glass cards. Each: label / large value / trend arrow+% / context string
4. **Charts grid** — CSS grid, charts sized full/half/third. Each chart in a glass card with title + one-line description. Chart.js rendered on canvas. Types unchanged (bar, line, area, pie, doughnut, radar, horizontal bar).
5. **Insight Slides section** — labelled "Insight Slides — from your questions". Empty until first question is asked. Slides stack chronologically as they are generated.
6. **Chat bar** (pinned at bottom of scroll, above page footer) — frosted pill input: "Ask anything about your data — get an insight slide back..." + send button

**Data sources footer** — small chips showing source filenames, at very bottom.

---

### Insight Slide (component)

Each insight slide is a distinct glass card generated from a single follow-up question.

**Structure:**
```
◈ INSIGHT SLIDE  [timestamp]
[question text in italic pill]
[headline finding — 15px bold — the one sentence that matters]
[1–2 Chart.js charts — small, focused, scoped to the question]
[3–4 bullet points with → prefix — specific numbers, direct language]
```

**AI behaviour for insight slides:**
- System prompt instructs: "Return a focused insight slide JSON for the question. Include: headline (one sentence, must contain a specific number), 1–2 charts (types and data scoped to the question only), 3–4 bullets (each must reference a specific data point)."
- Response schema:
```json
{
  "question": "string",
  "headline": "string",
  "charts": [...],
  "bullets": ["string", ...],
  "generatedAt": "ISO timestamp"
}
```
- 1 chart for simple questions, 2 charts for comparative/multi-dimensional questions, 3 charts only if the question explicitly asks for a breakdown across 3+ dimensions.

---

## Data Architecture

### Device Identity
On first visit, generate a UUID and store in `localStorage` under key `rais_device_id`. All Supabase records are associated with this ID. No login, no email, no password.

### Supabase Schema

**`sessions` table**
```sql
id           uuid primary key default gen_random_uuid()
device_id    text not null
title        text not null          -- AI-generated
files        jsonb not null         -- [{name, size, type}]
dashboard    jsonb not null         -- full AI dashboard config JSON
created_at   timestamptz default now()
```

**`insight_slides` table**
```sql
id           uuid primary key default gen_random_uuid()
session_id   uuid references sessions(id) on delete cascade
device_id    text not null
question     text not null
slide        jsonb not null         -- {headline, charts, bullets, generatedAt}
created_at   timestamptz default now()
```

### Security
No RLS needed for a single-user, device-bound app. All Supabase queries use the **service role key** (held server-side in Next.js API routes only — never exposed to the browser) and include `WHERE device_id = ?` on every read/write. The browser passes its `rais_device_id` in the request body; the API route trusts it since there is no multi-user attack surface.

### Frontend page routes (Next.js App Router)

| Route | Component | Purpose |
|---|---|---|
| `/` | `app/page.tsx` | Home screen — session library + drop zone |
| `/session/[id]` | `app/session/[id]/page.tsx` | Dashboard for a specific saved session |

After a successful analysis, the browser is navigated to `/session/[id]` using the session ID returned by `/api/analyze`. "← Home" breadcrumb navigates to `/`. `+ New Analysis` button also navigates to `/`.

### API routes (Next.js)

| Route | Method | Purpose |
|---|---|---|
| `/api/analyze` | POST | Run AI analysis, save to `sessions`, return `{ sessionId, dashboard }` |
| `/api/sessions` | GET | List all sessions for device (accepts `deviceId` query param) |
| `/api/sessions/[id]` | GET | Fetch single session + its insight slides |
| `/api/sessions/[id]` | DELETE | Delete session and cascade-delete its slides |
| `/api/chat` | POST | Accept `{ question, sessionId, deviceId }`, return insight slide JSON |
| `/api/sessions/[id]/slides` | GET | List insight slides for session |

---

## Export

**Per session:** Export the full dashboard (exec summary + KPIs + charts + all insight slides) as a PDF. Use the browser's native `window.print()` with a print-specific CSS stylesheet (white background, no glass effects, clean layout). Print button in the dashboard topbar.

**Per insight slide:** Each slide has a small "⬇" icon. Clicking exports that single slide as a PNG using `html2canvas`. Lightweight, no server needed.

---

## Phase Plan

### Phase 1 — Glassmorphism UI Redesign
*Touches all existing components. No new functionality.*

- Replace global CSS variables and background with the new visual system
- Rebuild `UploadZone`, `KPICard`, `ChartContainer`, `Dashboard`, `ProcessingLoader`, `ChatPanel` in glassmorphism
- Add gradient background to root layout
- Update `ThemeToggle` (keep but default to light-glass; dark mode is a future enhancement)
- New `Home` page (`/`) — replaces current upload-as-home-page, shows sessions grid + drop zone
- Move current upload logic to a reusable `UploadZone` component used on Home

**Deliverable:** App looks and feels like the new design. Functionality identical to today.

---

### Phase 2 — Supabase Session Persistence
*New data layer. Home screen becomes useful.*

- Add `sessions` and `insight_slides` tables with RLS
- Add `rais_device_id` localStorage init on app start
- Update `/api/analyze` to save completed analysis to `sessions`
- Build `/api/sessions` GET + `/api/sessions/[id]` GET/DELETE
- Wire Home screen to fetch and display real sessions
- Session cards show real KPI preview data from stored `dashboard` JSON
- "Open →" on a session card loads the stored dashboard config — no re-analysis needed

**Deliverable:** Sessions persist across browser closes. Home screen shows real history.

---

### Phase 3 — Insight Slides
*New AI output format for follow-up questions.*

- Update `/api/chat` route: accept `sessionId` parameter, return insight slide JSON (new schema)
- Update `ChatPanel` to send `sessionId` and render the response as an `InsightSlide` component instead of plain text
- New `InsightSlide` component (renders headline + mini Chart.js charts + bullets)
- Save each generated slide to `insight_slides` table
- On session load (`/api/sessions/[id]`), fetch and render all stored insight slides below the dashboard
- Update session card on Home to show insight slide count

**Deliverable:** Questions generate visual slides. Slides persist and reload with the session.

---

### Phase 4 — Export
*Output, no new data or AI logic.*

- Add print stylesheet to dashboard: glassmorphism → clean white on print
- Wire `⬇ Export` button to `window.print()`
- Add `html2canvas` dependency
- Add per-slide `⬇` button that calls `html2canvas` on the slide element and triggers PNG download
- File named: `rais-insight-[question-slug]-[date].png`

**Deliverable:** Full session printable as PDF. Individual slides downloadable as PNG.

---

## What Does Not Change

- Client-side Excel parsing (SheetJS) — no raw data ever sent to any server
- The 12,000 character summarisation cap before AI prompt
- Chart.js + react-chartjs-2 for all chart rendering
- Framer Motion staggered animations on dashboard mount
- The 5-step processing screen animation
- No user accounts, no email, no password

---

## Out of Scope for This Spec

- Dark mode toggle (glassmorphism dark variant)
- Multi-device sync (device UUID is browser-local by design)
- Sharing sessions with colleagues (requires auth)
- Scheduled / recurring analysis
- Mobile layout optimisation
