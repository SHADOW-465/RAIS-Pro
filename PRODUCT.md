# Product

## Register

product

## Users

Pharma/medical-device factory General Managers and QA leadership. Context: opens the dashboard once a day (morning review) after monthly/weekly inspection workbooks are ingested. Job to be done: "Is the factory healthy? If not, where, why, what does it cost, and what do I do?" — answered in under 30 seconds, then drill into detail pages (/stage-analysis, /defect-analysis, /size-analysis, /copq, /spc) only when something is wrong.

## Product Purpose

RAIS-Pro ("The Rejection Report") is an editorial diagnostic for catheter manufacturing rejection data. It ingests inspection workbooks, computes deterministic quality metrics (rejection rate, FPY, COPQ, stage/defect/size breakdowns), and narrates them. AI classifies and narrates; it never does maths. Success = a GM trusts every number (provenance/"View Source" on every figure) and acts on the top opportunity.

## Brand Personality

Editorial, exacting, calm authority. A quality report typeset like a serious publication — Fraunces display serif, Inter Tight UI, JetBrains Mono numbers, warm paper + near-black ink, burnt-orange `#C8421C` accent. Numbers feel audited, not dashboarded.

## Anti-references

- Glassmorphism / neon SaaS dashboards (explicitly removed from this codebase — do not reintroduce).
- Metric-soup BI screens where the same number appears in five widgets.
- Chart.js/lucide/framer-motion aesthetics — charts are inline SVG, motion is pure CSS.

## Design Principles

1. **One fact, one place.** Each metric has a single home on the overview; depth lives on its detail page.
2. **Verdict before evidence.** The GM sees "healthy / intervene, because X" before any chart.
3. **The model never does maths.** Every displayed number traces to computeMetrics/analytics selectors with provenance.
4. **Density is earned.** Product register: dense tables and small multiples are fine when each adds information.
5. **Theming through tokens.** All new UI consumes CSS variables (`--paper`, `--ink`, `--accent`, …) so the Tweaks panel keeps working.

## Accessibility & Inclusion

Body text ≥ 4.5:1 contrast against paper/dark surfaces (recent work already tuned `--text-2`/`--text-3`). Status is never conveyed by color alone — pair tone chips with text labels. `prefers-reduced-motion` honored for the CSS animations (pulse-ring, blink, fade-up, draw-line).
