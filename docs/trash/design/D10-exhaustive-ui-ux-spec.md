# D10 — Exhaustive UI/UX Design Specification (MO!D / RAIS Pro)

**Status:** master design spec · supersedes the styling notes in D7/D9 (those stay valid for
strategy; D10 is the authoritative *how-it-looks-and-behaves*). **Audience:** whoever builds the
UI (human or agent). **Rule:** if a screen or component isn't covered here, it isn't done — extend
this doc, don't improvise. **North star:** *a layman (GM/owner) and a technical operator (QA) both
understand the same screen, nothing is unreadable, depth is always one click away, and any view
prints as a clean controlled document.*

---

## 0. The four design pillars (every decision traces to one)
1. **Legible-first.** Nothing essential below 14px on screen / 9.5pt in print. Numbers are the
   heroes; never sacrifice readability for density.
2. **Layered, not crammed.** Three depth layers (Glance → Read → Drill). The surface is calm; the
   depth is on demand (click/hover/expand). We never show everything at once.
3. **Dual-audience (the Explain layer).** Every technical term, metric and chart has a
   plain-language explanation reachable by a toggle or a `?`. Operators ignore it; laymen rely on
   it. Same screen serves both.
4. **Trustable & printable.** Every number carries a trust state and a path to its source cell;
   every view has a print form that is a clean, signed, A4 controlled document.

---

## 1. The Three-Layer Information Model (the core method)

| Layer | Name | Who | What shows | Trigger |
|---|---|---|---|---|
| **L0** | **Glance** | anyone across a room | 1 headline number + a plain-language verdict ("Rejection is HIGH — 12.6%, above target") + color | always visible, large |
| **L1** | **Read** | GM / manager | labelled charts, KPI cards, "what it means / why it matters" one-liners | default screen |
| **L2** | **Drill** | QA / operator / auditor | formulas, per-day rows, SPC math, defect breakdowns, **source cells** | click to expand |

**Implementation:** L0 + L1 render immediately. L2 is always behind an explicit affordance
(expand chevron, "Show detail", "Show math", "View source"). Expansions are inline drawers or
side panels — never a navigation away that loses context.

**The Explain layer (orthogonal to L0–L2):** a global **"Explain" toggle** in the top bar. When
ON, every metric label, chart, and term gains a plain-language gloss inline (or a persistent `?`
that opens a 2–3 sentence definition + "why it matters" + "good/bad direction"). Default ON for
first-time users, remembered per user. This is what lets the GM (layman) and QA (expert) share one
UI.

---

## 2. Audiences & their jobs (designs must satisfy all)
- **Plant Director / GM (primary buyer, layman on stats):** wants the verdict, the money, the
  exceptions, and a clean printout. Needs Explain layer. Reads L0/L1.
- **Quality Engineer (expert):** wants Pareto, SPC, drill to defect/day/source. Lives in L2.
- **Operator / Data Steward (writer, modest literacy, Hindi/English):** wants big simple entry
  forms and clear "is my number OK?" feedback. Calm, large, forgiving.
- **Auditor (external, decisive):** wants traceability, audit trail, immutable source. Reads L2 +
  trust/provenance UI.
- **Showmik/Admin:** configuration, ontology, rules.

---

## 3. Typography system (legibility is a hard requirement)
- **Families:** Display/headings — `Newsreader` (serif, editorial gravitas, prints beautifully).
  UI/body — `IBM Plex Sans`. All numbers/codes — `IBM Plex Mono` with `font-variant-numeric:
  tabular-nums` (columns of figures must align). Fallbacks: Georgia / system-ui / Consolas.
- **Screen scale (min sizes — never go below):**
  | Token | px | use |
  |---|---|---|
  | display | 34–48 | L0 glance headline number |
  | h1 | 24 | screen / report title |
  | h2 | 18 | section heading |
  | kpi-value | 26 | KPI card number |
  | body | 15 | default text (NEVER below 14) |
  | label | 12.5 | field labels, captions |
  | micro | 11 | legal/footer only; never load-bearing |
- **Print scale:** title 18pt, h2 12pt, body 10pt, table 9.5pt (floor), footer 8pt. Below 9.5pt is
  forbidden for data.
- **Line-height** ≥1.5 body, ≥1.3 headings. **Measure** 60–80 chars max for prose.
- **Weight** for hierarchy, not size alone: 600/700 for emphasis, 400 body. Avoid all-caps for
  anything longer than a short label (use letter-spacing on the rare caps label).

---

## 4. Color & semantic system
- **Two themes, one token set.** **Screen = dark** ("operations terminal" gravitas). **Print/report
  canvas = light** ("controlled document"). Same semantic tokens, different base.
- **Neutrals (dark):** bg `#0a0e13`, panel `#121821`, line `#202833`, ink `#e7edf3`, muted
  `#7d8a9a`. **(light/print):** paper `#fff`, ink `#14181f`, muted `#6b7682`, line `#d9dee4`.
- **Semantic (identical meaning both themes):** good/in-control `#1a9d6e`, warning `#d98a0b`,
  bad/out-of-control `#d23f55`, info/brand accent `#2563a8` (light) / `#3b9eff` (dark).
- **Zone fills** (for threshold bands): goodbg, warnbg, badbg tints — used behind trend charts so
  "good vs bad" is readable at a glance even in grayscale print.
- **Trust-state palette (always the same three):** `verified` (green outline), `assumed-by-rule`
  (blue outline), `unresolved` (amber outline). Defined once, used on every number.
- **Colorblind safety:** never rely on red/green alone — pair with **shape/label/position**
  (▲ out-of-control, ● in-control; "HIGH"/"OK" text). Verified by a deuteranopia check.
- **Print-ink discipline:** zone tints must survive grayscale; semantic colors degrade to distinct
  grays + text labels.

---

## 5. Layout, grid, spacing
- **App shell:** fixed top **scope/identity bar** (50px) + left **workspace rail** (icon nav,
  role-filtered) + main scroll area + optional right **context/drawer panel**.
- **Grid:** 12-col fluid, 12–16px gutters. Content max ~1180px on dashboard; report canvas = A4
  width (210mm) centered.
- **Spacing scale:** 4 / 8 / 12 / 16 / 24 / 32. Pick one rhythm (8) and hold it. Generous
  whitespace is part of "clarity" — don't fill every pixel.
- **Cards:** 10–12px radius, 1px line, subtle top-light gradient. Consistent internal padding
  (12–16px).

---

## 6. Component library (each: anatomy · states · interactions · print)
For every component define: default, hover, focus (keyboard ring), active/selected, loading
(skeleton), empty, error, disabled.

1. **Scope bar** — period segmented control (D/W/M/FY), Line, Stage, Product selectors; applies to
   every widget on screen (the "Minitab/few-rows" mechanism). Sticky. Shows current scope as
   breadcrumb. Print: rendered as a "Report parameters" line.
2. **KPI card (expandable)** — L1 face: label + big mono value + delta + trust badge. **Click →
   drawer (L2):** plain-language definition (Explain), the exact formula, the trend sparkline, the
   contributing breakdown, and "View source". Chevron affordance. Keyboard-openable.
3. **Glance banner (L0)** — full-width: big number + plain verdict sentence + status color +
   "as of" timestamp. The one thing a GM reads first.
4. **Chart frame** — title (serif) + one-line "what this shows" + legend + **`?` Explain** + **⤢
   expand** + **⋮ (show math / show data / export)**. Consistent across all charts.
5. **Data table (progressive)** — sticky header, tabular-num, zebra, right-aligned numbers,
   left-aligned labels. **Rows expandable** (chevron) → child detail (per-day, per-defect). Column
   show/hide. Sort. Cell → "view source". Totals row pinned. Print: expands chosen rows.
6. **Expandable row / accordion** — chevron, smooth height animation, lazy-render heavy content.
7. **Explain popover** — anchored card: term, 2–3 sentence plain definition, "why it matters",
   "higher is better/worse" arrow, optional formula. Dismiss on outside-click/Esc.
8. **Trust badge** — pill (verified/assumed/unresolved) → click = lineage trail to source cell.
9. **Finding card** — title + plain description + evidence (source ref) + 3 adjudication buttons
   (Mistake / Intentional / Not sure) + "View source". Expand for full evidence + history.
10. **Stage status chip** — name + rej% + OK/WATCH/OUT (text + color + position).
11. **Provenance / verify panel** — split view: dashboard number ↔ source cell, animated beam.
12. **Entry form field** (operator) — large label, large input, unit suffix, inline validation
    ("✓ looks normal" / "⚠ higher than usual — sure?"), autosave indicator.
13. **Print toolbar** — choose Summary (1pg) / Standard / Full (all detail expanded); page size;
    include-findings toggle.
14. **Toast / inline alert**, **skeleton loaders**, **empty-state** (explains what will appear and
    why it matters), **error-state** (what failed + retry + it never fabricates).

---

## 7. Progressive-disclosure patterns (exact rules)
- **Affordances must be visible:** a chevron, "Show detail", `?`, or "+N more" — never hidden
  click targets. Cursor + hover highlight on anything expandable.
- **Three triggers:** **hover** = quick tooltip (value/label); **click** = inline expand (drawer/
  row/popover); **expand ⤢** = full-screen focus of one chart/table.
- **Context preservation:** expansions open *in place* (drawer/accordion/side panel). Drilling does
  not navigate away and lose the parent. Breadcrumb when going deeper.
- **Lazy render** heavy detail on first expand (performance).
- **Remember state** per user (which sections they keep open).
- **"Expand all / Collapse all"** per section and globally (also drives Full print).
- **Animation:** 120–180ms ease; respect `prefers-reduced-motion`.

---

## 8. The Explain layer (dual-audience content model)
Every metric/term has an **explain record**: `{ term, plain (≤2 sentences), why (1 sentence),
direction (higher better|worse), formula?, example? }`. Sources of truth in one file so it's
consistent. UI surfaces it three ways: (a) global Explain toggle injects inline glosses; (b) `?`
icon opens the popover; (c) KPI drawer shows the full record. Tone: plain English first, technical
term in parentheses (e.g. "pass rate (yield)"). Hindi translation field for operator screens.

---

## 9. Chart specifications (encodings · interaction · a11y · print)
General chart rules: title + subtitle + legend + Explain + axis labels with units + data labels on
key points + threshold/reference lines labelled + hover crosshair w/ exact value + "show data
table" fallback (accessibility) + grayscale-safe.

1. **Daily trend (control view)** — line over days; **three zone bands** (good/watch/critical) +
   **target / warning / mean reference lines, each labelled**; points colored AND shaped by zone;
   spike values labelled; hover crosshair. Explain: "each dot = one day's rejection %; green band =
   on target." Print: full, labels on.
2. **Stage bar chart** — horizontal bars per stage vs **target marker line**; value + hold% label
   at bar end; color+text status. Click bar → stage detail (L2).
3. **Pareto** — bars desc + cumulative % line + 80% reference; top-3 highlighted; click bar →
   defect detail. Explain: the 80/20 idea in one sentence.
4. **SPC control chart** — points + CL/UCL/LCL labelled lines + shaded in-control band;
   out-of-control points flagged (▲ + color + callout); "Show math" reveals mean/σ/limit formulas.
   Explain: common-cause vs special-cause in plain words.
5. **Process funnel / flow** — the real 27-step FBC flow; each step shows checked→accepted, rej%,
   inspection marker, critical ✻; click step → that step's numbers + source. Yield cascade
   (RTY) visualized.
6. **Sparklines** — in tables/cards; hover = value.
All charts: **"Show data table"** toggle renders the underlying numbers (a11y + trust + print).

---

## 10. Screen-by-screen specs
For each: purpose · layers present · components · interactions · print form.

1. **GM Overview (dashboard)** — L0 glance banner; L1 KPI strip (expandable) + daily control chart
   + stage status grid + watchlist→focus; L2 via expansions. Scope bar governs all. Print =
   1-page executive summary.
2. **Monthly Quality Report (print-first)** — the controlled document (letterhead, doc-control,
   exec summary, control chart, stage register, FBC flow, Pareto, SPC, weekly, findings, CAPA,
   sign-off). On screen: readable + each section expandable; **Explain** glosses; **Print** →
   clean multi-page A4. Summary/Standard/Full print modes.
3. **Stage Detail** — drill target: one stage's trend, defect mix, hold ageing, day rows, source.
4. **Defect Detail** — one defect across stages/time; where it occurs; suggested causes (labelled
   AI-suggestion).
5. **Data Health / Findings queue** — steward workspace; finding cards; source split-panel;
   adjudication; "questions shrinking" indicator.
6. **Data Entry (operator)** — separate calm register; large fields; inline "normal/unusual"
   validation; autosave; per-shift prefill; Hindi labels. (Spec'd fully in a sibling doc D11 if
   needed.)
7. **Admin** — ontology/alias review, rulebook, users, report templates, ₹/unit config.

---

## 11. Interaction & motion
- Hover < 80ms feedback; expand 120–180ms; page/section transitions ≤250ms. Honor
  `prefers-reduced-motion` (cut to instant). No gratuitous motion; motion communicates state
  change only. Loading = skeletons, not spinners, for content areas.

---

## 12. Print & export system (first-class, not an afterthought)
- **Trigger:** `window.print()` + a Print toolbar. **Canvas flips to light** in print.
- **Modes:** *Summary* (1pg exec), *Standard* (the 4-page report), *Full* (everything expanded incl.
  drilled tables). The chosen expand-state drives what prints.
- **Page setup:** A4, repeating letterhead + doc-control header and page X/Y footer; `page-break`
  control so charts/tables never split awkwardly; black-on-white, ink-efficient; zone tints survive
  grayscale; legibility floor 9.5pt.
- **Export:** print-to-PDF now; native PDF/Excel export later. Every printout carries doc number,
  period, generated-timestamp, "traceable to source", CONFIDENTIAL, and the QA sign-off block.

---

## 13. Accessibility (non-negotiable, also a selling point for audits)
- **Contrast:** WCAG AA (≥4.5:1 text, ≥3:1 large/graphics) on BOTH themes — verify every token pair.
- **Font floor:** 14px screen / 9.5pt print.
- **Color independence:** every status also encoded by text + shape.
- **Keyboard:** all interactive elements tabbable, visible focus ring, Esc closes popovers/drawers,
  expandables toggle with Enter/Space.
- **Screen reader:** semantic headings, `aria-expanded`, table headers, chart "Show data table"
  fallback, alt summaries for charts.
- **Targets:** ≥40px touch (operator screens larger). **Reduced motion** honored.

---

## 14. Responsive behavior
- **Desktop-first** (their use). Breakpoints: ≥1280 full 3-pane; 1024–1280 collapse right panel to
  drawer; 768–1024 stack, rail → top tabs; <768 (operator tablet/phone for entry) single column,
  big touch. Charts reflow; tables become horizontally scrollable with a frozen first column;
  never shrink text below floor — reflow instead.

---

## 15. States (specify all — this is where "drawbacks" hide)
Empty (no data yet → explain what will appear), loading (skeleton), partial (some stages missing →
flag, don't hide), error (what failed + retry; never fabricate), no-permission (role-gated tiles
show a clean lock + reason), out-of-range/anomaly (flag as finding, never silently clamp),
print-not-ready (warn before printing incomplete data).

---

## 16. Localization
English UI default; **Hindi** labels for operator entry + finding-card option (Delhi/Faridabad
plant). Numbers in Indian grouping (lakh/crore, e.g. 2,46,011). Dates DD-MM-YYYY. Explain records
carry a Hindi field. Layout must tolerate ~30% longer strings.

---

## 17. Trust & provenance UI
Trust badge on every number (verified/assumed/unresolved). Click → **lineage trail**: metric →
calculation → source events → **source cell** (file/sheet/cell) via the verify split-panel + beam.
"Source data never modified" stated on reports. This is both the moat and the audit story —
designed to be visible, not buried.

---

## 18. Data-to-pixel determinism (governs every number rendered)
- The UI **never computes** a displayed metric from a model; all values come from the deterministic
  engine over source rows (per D1/MO!D principles). Charts read computed series only.
- Every rendered figure is addressable to its source (provenance id). No "magic" numbers.
- Rounding rules stated once (e.g. rej% to 2 dp, counts integer, ₹ to 2 dp) and applied uniformly.
- Missing/!valid data renders as an explicit marker (—, "no data", finding) — **never 0, never
  guessed.**

---

## 19. Anticipated objections → how the design answers them (the "no-drawbacks" audit)
| Possible client/board objection | Design answer |
|---|---|
| "Text is too small / cluttered" | 14px floor; layered disclosure; whitespace; Explain layer |
| "I don't understand these terms" | Explain toggle + `?` plain-language on every term |
| "Too simple for my QA team" | L2 drill: formulas, SPC math, per-day rows, source cells |
| "I can't trust the numbers" | trust badges + lineage to source cell + read-only source |
| "We need it on paper" | print-first report, 3 print modes, A4 controlled-doc, sign-off |
| "It won't match our format" | letterhead + doc-control + their stage register + their report layout |
| "Different people need different views" | role dashboards + RBAC; same data, role-scoped views |
| "Looks like a toy / not serious" | dark terminal gravitas, editorial type, disciplined data-ink |
| "Auditor will object" | ALCOA+-aligned: immutable source, audit trail, traceability, Part-11 hooks |
| "Colorblind / accessibility" | shape+text encoding, AA contrast, keyboard, data-table fallback |
| "Our data is messy/missing" | explicit no-data markers + findings, never silent fixes |
| "Hindi-speaking operators" | Hindi labels + Indian number format |

## 20. Acceptance checklist (Definition of Done for any screen)
☐ No essential text < 14px (screen) / 9.5pt (print). ☐ L0 verdict present & plain. ☐ Explain layer
on every metric/term. ☐ Every number has a trust badge + path to source. ☐ All charts have title,
units, legend, Explain, threshold labels, "show data table". ☐ Every detail reachable by a visible
affordance; context preserved on drill. ☐ All states designed (empty/loading/partial/error/
no-perm). ☐ Keyboard + AA contrast + colorblind-safe + reduced-motion. ☐ Prints clean on A4 with
doc-control + sign-off. ☐ Hindi/number-format where required. ☐ Nothing computed in the UI; all
deterministic + traceable.

---

## 21. Open items to confirm with client
Target thresholds (8%? per-stage 3%?), ₹/unit costs, exact GM report layout to clone, Hindi scope
(entry only vs whole UI), on-prem vs cloud, which screen is the "hero" for sign-off.
