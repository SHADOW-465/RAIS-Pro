# RAIS Pro — UX/UI Audit & Recommendations

> Senior UX review of the current build (post-Antigravity restyle). Scored by severity:
> **P0** = breaks usability/credibility, fix first · **P1** = significant friction · **P2** = polish.
> Method: live review of the landing + loader (light & dark), code review of the dashboard/verify/sidebar
> (the dashboard couldn't be rendered live — the AI provider chain was down — so those findings are from
> code + earlier live captures and are marked accordingly).

---

## TL;DR — the five things that matter most

1. **P0 · Layout is parked in a narrow left-of-center column.** On a normal desktop, ~half the screen is empty and the page looks broken/unfinished. The single biggest visual problem.
2. **P0 · The loading experience is a *fake* timed spinner** that claims "Done" while the AI is still running (it sat "done" for ~5 minutes on a stalled provider). In a trust-first product this is corrosive. Replace it (see §6).
3. **P0 · The executive summary — the whole "30-second read" — is hidden on a secondary "AI Insights" tab.** Users land on raw KPIs with no orienting narrative. The brief must lead.
4. **P1 · Three overlapping navigation surfaces** (sidebar tabs, masthead actions, back arrow) with duplicated controls (Verify appears twice; Back ≈ New analysis). Consolidate to one model.
5. **P1 · Header and body don't share a left edge / grid.** Small but constant "things don't line up" feeling.

The color system (light + dark) is genuinely good — high contrast, legible, clean. **The problems are composition, hierarchy, and flow — not the palette.**

---

## 1. Layout, alignment & use of space

**L1 · Narrow, left-shifted content column (P0).**
The landing (and the report body) render as a ~600–700px column anchored left-of-center. On a 1440–1790px screen the right ~50–60% is dead space, and the page reads as misaligned/unfinished.
*Fix:* pick one intentional strategy and commit:
- Landing: **center** the column (and the upload zone is the hero — see L4), or
- Report: **use the width** — KPIs in a 3–4-up grid, charts 2-up, all within a single centered max-width (~1200–1320px) container that actually fills the space.

**L2 · Header and body don't align to the same left edge (P1).**
The masthead brand sits at one left margin; the body content starts further right. They're in different containers (`.shell` 1200 vs `.shell-wide` 1280, plus the landing's own narrower column).
*Fix:* define **one** content container (one max-width, one horizontal padding) and use it for header, body, and footer so every left edge lines up. Kill the second shell width.

**L3 · Competing max-widths (P1).** `.shell` (1200) and `.shell-wide` (1280) are used inconsistently. Standardize on a single `--content-max` token.

**L4 · Landing is top-loaded; primary action is weak (P1/P2).**
The page is ~30% content, ~70% empty below. "Good morning." dominates while the actual job (upload) is a quiet dashed box mid-page. The archive/recent-sessions that used to fill the lower area isn't showing.
*Fix:* make the **upload zone the clear focal point** (larger, centered, primary-accent affordance), vertically balance the page, and bring back "Recent diagnostics" (or a proper empty state) so the lower half isn't barren.

**L5 · Floating chrome noise (P2).** The Next dev-tools FAB (dev only) and the unlabeled theme circle add clutter near the corners. Ensure dev tools are stripped in prod; label/representation for the theme toggle (see N4).

**L6 · Responsive story undefined (P1).** Sidebar + masthead + (in verify) split-pane is desktop-first. Define <1024px behavior beyond the current "verify is desktop-only" warning — the report itself should reflow to one column and the sidebar should collapse to a top bar or drawer.

---

## 2. Navigation & information architecture

**N1 · Three navigation surfaces, with duplication (P1).**
There's now a **sidebar** (Overview / AI Insights / Verify Mode), a **masthead** (Verify data / Export / New analysis), and a **back arrow**. "Verify" exists in *both* sidebar and masthead. "Back" and "New analysis" both reset to upload.
*Fix:* one model. Recommended: sidebar owns **view switching** (Overview / Insights / Verify), masthead owns **document actions** (Export, New analysis). Remove the duplicate Verify button and the redundant Back arrow (New analysis covers it).

**N2 · The brief is buried (P0).**
Splitting "computed" (Overview) from "AI" (Insights) into tabs sounds principled but it **hides the executive summary**, which is the product's headline value. A GM lands on a wall of KPIs with no story.
*Fix:* the **executive summary leads the Overview** (top of the first view), clearly tagged as AI-generated. Keep the deeper insights/recommendations on a second view if you like, but the one-paragraph brief must be the first thing seen. (The trust-tier distinction is about *surface/labelling*, not *hiding on another tab*.)

**N3 · Section numbering breaks across tabs (P1).** Overview shows "01 · The Numbers / 02 · The Picture"; Insights shows "03 / 04" with no 01–02 in view. The numbering implies one continuous document but the tabs fragment it. Either drop the numbers or make it a single scroll (see §7).

**N4 · Unlabeled, low-discoverability controls (P2).** The theme toggle is a bare circle; the sidebar collapse persists nothing. Add tooltips/labels and persist sidebar + theme state.

**N5 · Redundant masthead meta (P2).** "Report Briefing" (static) + the title Pill + "RAIS Pro · date · N kpis · figures · compiled just now" is a lot of low-value chrome competing with the actual title. Trim to: title + date + one status line.

---

## 3. Clarity, visibility & eye strain

**C1 · The verify table is hard on the eyes (P1).**
11px monospace, tight padding — and it's the screen for the most important task (proving numbers). 
*Fix:* 12–13px, more cell padding, **right-align numeric columns**, row hover, and stronger zebra. Keep mono for numbers but consider sans for text cells.

**C2 · Date/meta in tiny mono uppercase (P2).** "Wednesday, June 3, 2026" rendered as small monospace caps is harder to scan than it should be. Use sans, sentence case, `--text-2`.

**C3 · Trust-tier treatment is inconsistent (P1).** The executive summary gets a tinted surface + "AI" chip (good), but insights/recommendations only get a small sub-line. Apply the **same AI surface treatment** consistently to all model-authored blocks so the computed/AI boundary is unambiguous everywhere.

**C4 · Uppercase letter-spaced labels everywhere (P2).** Eyebrows are used heavily ("MORNING BRIEFING", "01 · THE NUMBERS", section subs). Overused, they add visual noise and reduce scannability. Reserve for true section markers.

**C5 · Dark mode verified — good (✓).** Contrast and surfaces hold up; the token system is solid. No action.

---

## 4. Typography & hierarchy

**T1 · Strong foundation (✓).** Display headings + tabular mono numbers + a clean sans is the right system and reads well.

**T2 · Landing hierarchy points at the wrong thing (P1).** "Good morning." is the largest element; the upload action is secondary. The eye should be pulled to **upload first**. Rebalance sizes/weights so the task wins.

**T3 · Line length & rhythm (P2).** Exec summary capped at ~820px is fine; ensure body copy stays in the 60–80ch range and vertical spacing between sections is consistent (there's a mix of 48/56px section gaps and ad-hoc margins).

---

## 5. The workflow — is "upload → render dashboard" the right shape?

**Yes — keep it.** For a low-frequency, executive, single-shot analysis, a wizard or multi-step flow would be *worse*. The job is "drop files, get the read." Don't redesign the workflow.

The problem isn't the workflow — it's that **the wait is dead time and the result is treated as a static page.** Two reframes fix that:

1. **Make the wait productive** (progressive render — §6).
2. **Treat the result as a living document**, which it already half-is (follow-up chat → insight slides). Lean into that: the dashboard is a starting point you interrogate, not a dead end.

---

## 6. The loader — replacing the spinner with "watch it build live"

You disliked the top spinner and want the dashboard to build visibly. **You're right, and the architecture makes this *easy and less complex*, not more** — here's why.

The pipeline is **graph → compute → narrative**. Crucially:
- **The numbers (KPIs, charts) come from deterministic `compute` and are ready in ~seconds.**
- **Only the AI `narrative` (summary/insights/recommendations) is slow** — and right now it *blocks the entire screen* (that's why it hangs for minutes when a provider stalls).

### Recommended design (best fit, removes complexity): progressive reveal
1. The moment `compute` finishes, **render the real dashboard** — KPI cards and charts populated with actual numbers. No spinner; the report just appears, mostly done.
2. The **AI prose blocks** (executive summary, insights, recommendations) render as **shimmer skeletons** that fill in when `narrative` returns (or stream in token-by-token).
3. If `narrative` fails or is slow, the dashboard is **already fully usable** with verified numbers — the prose just never blocks anything.

This literally *is* "watching the magic happen": the numbers snap in, then the story writes itself onto them. And it **deletes** the fake 5-step timer instead of adding logic — sections simply appear when their data exists.

**Does it add complexity?** Modest and bounded. It requires `compute` and `narrative` to arrive independently. Two clean options:
- **Split the endpoint:** `/api/analyze/compute` (fast → KPIs/charts/mergePlan/dataSummary) and `/api/analyze/narrative` (slow → prose). Front-end shows the dashboard after compute; fills prose when narrative resolves.
- **Stream one endpoint:** emit compute first, then stream narrative.
Either is a few hours of work and **also fixes the P0 hang** (numbers show in seconds regardless of AI health).

### Lower-effort interim (if you don't want to touch the API yet)
- Replace the centered spinner with a **full dashboard skeleton** (greyed KPI cards + chart blocks shimmering in the real layout) so the wait previews the result.
- Drive the existing stepper from **real phases** (parse done → analyzing → done) — the `ProcessingLoader` already accepts a controlled `activeStep` prop; it's just not being fed real progress. **Stop showing "Done" before the response returns.**

**Recommendation:** do the interim skeleton now (cheap), then the endpoint split (the real win). Avoid: keeping any *simulated* timing — that's the part that hurts credibility.

---

## 7. Should the report be tabs or one scroll? (related to N2/N3)

The pre-restyle design was **one scrolling editorial document** with a side "In this issue" table of contents. The restyle split it into sidebar tabs. For a report meant to be *read top-to-bottom by an executive*, **one continuous scroll with a sticky in-page nav** is usually better than tabs — it preserves narrative order (brief → numbers → picture → insights → actions → sources), keeps section numbering coherent, and supports print/export as one document. Tabs make sense only if a section is heavy enough to be its own workspace — **Verify is that** (it earns a mode), but "AI Insights" probably doesn't (it just hides the brief). Suggest: **Overview = the full scrolling report (brief-led); Verify = a mode.** Drop the "AI Insights" tab.

---

## 8. Prioritized action list

**P0 (do first)**
- Fix the layout: one centered content grid; fill the width on the report; align header/body edges. (§1 L1–L3)
- Lead with the executive summary; drop the "AI Insights" tab / make Overview the full report. (§2 N2, §7)
- Kill the fake/blocking loader; render numbers immediately + skeleton the AI prose. (§6)

**P1**
- Consolidate the three nav surfaces; remove duplicate Verify + redundant Back. (§2 N1, N3)
- Verify table legibility: bigger type, padding, right-aligned numbers, hover. (§3 C1)
- Consistent AI-vs-computed surface treatment across all prose blocks. (§3 C3)
- Define responsive behavior <1024px. (§1 L6)
- Strengthen the upload focal point on landing; restore recent sessions. (§1 L4, §4 T2)

**P2**
- Label/persist theme + sidebar state; reduce masthead meta; tame uppercase-label overuse; date in sans. (§2 N4–N5, §3 C2/C4)
- Strip dev-only chrome from production. (§1 L5)

---

## 9. What's already good (keep)
- The light/dark token system: legible, high-contrast, clean in both modes.
- Display + tabular-mono type pairing; numbers read like instruments.
- The trust-tier *concept* (computed vs AI) — just apply it consistently and don't hide content behind it.
- The Verify "drill-in by month" model (file → month → table, with KPI deep-link) is the right structure for the data.
- Treating chat answers as saveable insight artifacts — lean into the "living document" idea.
