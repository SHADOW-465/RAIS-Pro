# D6 — GM-Format Report Template Spec

**Status:** v1.0 (2026-06-11) · **Depends on:** D3 (lineage), D5 · **Builds in:** B5
**Blocked input:** sample of the GM's current report (Showmik → PA). Per plan, this spec defines the template *system* with a placeholder default; **the GM-clone template is an explicitly marked fill-in task** once the sample arrives. Nothing here blocks build phases.

---

## 1. Template model

A report template is data, not code:

```ts
ReportTemplate = {
  templateId: string; name: string; version: number;
  page: { size: "A4"; orientation: "portrait" | "landscape"; marginsMm: [n,n,n,n] };
  header: { title: string; clientName: boolean; period: boolean; docMeta: boolean };
        // docMeta mirrors the client's own QA header block (Doc. No / Supersedes /
        // Effective Date / Page) — their sheets carry it, the GM expects it (D1 evidence)
  sections: ReportSection[];
  footer: { generatedBy: boolean; lineageLegend: boolean; pageNumbers: boolean };
}
ReportSection =
  | { kind: "kpi-row";      metrics: MetricRef[] }
  | { kind: "trend-chart";  metric: MetricRef; period: "monthly" | "weekly" }
  | { kind: "pareto";       stageId: string | null; topN: number }
  | { kind: "stage-table";  columns: MetricRef[]; rows: "days" | "weeks" | "months" }
  | { kind: "findings-summary"; states: FindingState[] }   // "what we questioned"
  | { kind: "free-text";    source: "narrative" | "static"; content: string | null };
```
`MetricRef` resolves against `analytics/` outputs; every resolved value carries its `MetricLineage`.

## 2. Trust marks in print

- Inline mark after every number: `✓` verified · `≈` assumed · `?` unresolved (Unicode, prints reliably, no color dependency).
- `lineageLegend` footer explains the three marks in one line.
- `assumed`/`unresolved` numbers also render a superscript index → endnote table "Notes on data" listing the rulebook rationale or open question. This is the printed analogue of the badge-click lineage trail, and the demo's "doubt is a feature" moment on paper.

## 3. Print stylesheet requirements

- Dedicated `@media print` sheet for `/session/[id]/report`; screen chrome (sidebar, masthead actions, chat) `display:none`.
- A4 portrait default; `@page { size: A4; margin: 14mm 12mm }`; `break-inside: avoid` on section cards; tables repeat `<thead>` per page.
- Ink-friendly: paper backgrounds drop to white, charts switch to the print palette (ink lines, accent only for the Pareto cumulative line); no shadows.
- Charts are inline SVG already (AGENTS.md) → print crisply; fix chart width to content box (no viewport units).
- Fonts: same stacks with system fallbacks; numbers stay JetBrains Mono for column alignment.

## 4. Export behavior

- **v1: print-to-PDF via the browser** (`window.print()` from a Print button; the stylesheet does the work). No server-side PDF dependency — AGENTS.md forbids casual dependency adds, and the PA's workflow is literally printing.
- The print button also writes an `Annotation` event (`author: "system"`, "report {templateId} v{n} printed for {period}") — reports become part of the audit trail.
- Server-side PDF (e.g. for email automation) is explicitly out of scope for v1; the template model doesn't preclude it.

## 5. Default template (placeholder until GM sample arrives)

`disposafe-monthly-v1`: header (title "Monthly Rejection Report", client, period, docMeta on) → kpi-row (total checked ✓, total rejected ✓, rejection % ✓, dispatch ≈) → trend-chart (rejection % monthly) → pareto (all stages, top 8) → stage-table (per stage: checked / accepted / rejected / rej%) → findings-summary (adjudicated + open) → free-text (narrative). Mirrors the structure their own YEARLY sheets reach for, with the arithmetic done right.

## 6. Fill-in task (when the sample arrives)

1. Photograph/scan → enumerate sections, field order, terminology (their column names, not ours).
2. Encode as `disposafe-gm-clone-v1` template JSON; map each field to a MetricRef.
3. Anything their report computes that we consider invalid (e.g. summed percentages, V-005) renders the *correct* figure with an endnote explaining the discrepancy — never silently reproduces the error. If the GM insists on his arithmetic, that's a GM-authority adjudication which the template then honors with an `≈` mark and rationale endnote.
