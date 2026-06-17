# RAIS Pro — Dynamic Dashboard Engine: Workflow & Roadmap

> **Vision:** evolve RAIS from a *rejection-report generator* into an **automated dashboard engine** that, from any uploaded tabular data, builds an accurate dashboard — KPIs, charts, per-sheet sections — **with productive, data-derived suggestions**, and lets the user **verify every number in real time**.
>
> **The moat (state it plainly):** the dashboards are **automated** (no manual field-dragging like Tableau/Power BI/Excel), come with **productive suggestions to improve efficiency**, and every figure is **verifiable against its source in real time**.
>
> **Invariants that must never break** (carried from `AGENTS.md`): the **model never does maths** — all numbers come from deterministic JS; AI only **classifies, narrates, ranks**; outputs are **schema-validated** and **sanity-gated**; **every number carries provenance**.

---

## 1. Why this is a re-architecture, not a tweak

Today the pipeline is **rejection-specific and static**:
- the column-role graph hardcodes `stage_checked / stage_rejected / reason_count`;
- `computeMetrics` hardcodes the rejection funnel;
- `DashboardConfig` is a fixed shape (rejection_rate leads, etc.).

To serve "any data, dynamic, with suggestions", the engine must become **domain-agnostic and data-driven**: it profiles whatever arrives, *decides* what to measure and chart, and emits a **variable** set of blocks. The rejection logic becomes **one optional "lens,"** not the whole engine.

---

## 2. The generalized pipeline (7 stages)

Replace `graph → compute → narrative` with:

1. **Parse** → sheets. *(have)*
2. **Profile** — generalize `inferSheetGraph` into a domain-agnostic profiler. Classify each column into generic roles: `temporal | dimension (categorical) | measure (numeric) | ratio/percent | identifier | text`. Attach per-column stats (count, distinct, min/max/sum/mean, null-rate, cardinality, samples) and detected **relations** (e.g. measure A ⊂ total B ⇒ a ratio is meaningful). Deterministic, with an optional LLM pass for *semantic* labels ("REC. QTY = units received"), sanity-gated.
3. **Plan** — the automation core. From the profile, emit candidate **blocks** by rules (this replaces manual field-dragging):
   - each `measure` → KPI (sum/avg), + trend if a `temporal` column exists;
   - `measure × temporal` → line/area trend;
   - `measure × low-cardinality dimension` → bar (top-N when high-cardinality);
   - a measure that is a *component* of a total → donut/part-to-whole **+ a derived ratio KPI** (this is how "rejected ÷ received = rate" emerges *generically*, not hardcoded);
   - two correlated measures → scatter; single measure → distribution/box.
   This is the proven "Show Me / Explore" heuristic (Tableau Show Me, Google Sheets Explore, Power BI auto-viz) — our edge is it runs **automatically, end-to-end, with verification**.
4. **Compute** — deterministic evaluation of every block's formula/series over the raw rows; attach **provenance** (sheet, column(s), row filter, formula string).
5. **Mine** — the suggestion source. Deterministic analyzers over the computed series produce candidate **findings with evidence**: trend direction/magnitude, anomalies (z-score / IQR outliers), Pareto/top contributors (80-20), period-over-period deltas, threshold breaches, correlations, seasonality. These are *facts*, not opinions.
6. **Narrate + suggest** — AI **ranks and phrases** the mined findings into productive, actionable recommendations and writes section prose, **only from the evidence refs** (no invented numbers), sanity-checked. An optional **domain lens** (manufacturing / sales / inventory / QA…), inferred by the model from the profile, sharpens the advice.
7. **Render + verify** — a **generic block renderer** draws whatever blocks were emitted; every block keeps provenance, so **verify works for any dataset**, and recomputes when the data changes (path to real-time).

---

## 3. The data model becomes dynamic (not static)

Replace the fixed `DashboardConfig` with a **block-list spec** so the number/kind of blocks is data-driven:

```ts
DatasetProfile {            // per sheet
  columns: { name; role: 'temporal'|'dimension'|'measure'|'ratio'|'identifier'|'text';
             dtype; stats: { count; distinct; min; max; sum; mean; nullRate }; samples; semantic? }[]
  grain: string             // "one row = one day"
  timeColumn?: string
  measures: string[]; dimensions: string[]
  relations: { measureA; measureB; kind: 'ratio'|'component' }[]
}

DashboardSpec {
  sections: Section[]       // a combined overview + one per data sheet
}
Section { id; title; sourceSheet | 'combined'; blocks: Block[] }
Block =
  | { type:'kpi';   title; value; unit?; formula; trend?; sparkline?; provenance }
  | { type:'chart'; chartType; title; encoding:{x;y;series}; data; provenance; rationale }
  | { type:'table'; ...; provenance }
  | { type:'suggestion'; severity; title; body; action; evidence: MetricRef[] }
Provenance { sheet; columns: string[]; rowFilter?; formula }
```

The renderer is generic; the engine emits 3 blocks for a tiny sheet or 30 for a rich one. **That is "dynamic, not static."**

---

## 4. How the moat is realized (map to features)

- **Automated** → the **Profile + Plan** stages do what an analyst does by hand in Excel/Tableau/Power BI. Drop a file; it builds itself.
- **Productive suggestions** → the **Mine** stage finds the facts; the AI ranks/phrases them into "do X" — grounded, never hallucinated.
- **Real-time verify** → **provenance on every block**; click any number → exact rows + formula; recompute on data change. Literal real-time arrives with a **live data connector** (DB / Sheet / API source) feeding the same engine.

---

## 5. Per-sheet sectioning — Phase 1 (IMPLEMENTED)

The near-term, high-value piece (and the first concrete step toward §2). Status: **done** in the current build.

- `/api/analyze` now computes, in addition to the combined metrics, a **per-sheet section** for every non-summary sheet: `computeMetrics([sheet], [graph]) → metricsToKpis/metricsToCharts`. Sections are month-labelled (`parseMonth`) and chronologically ordered, and ride along in `DashboardConfig.sections`.
- The dashboard shows a **scope selector** (`All Data` + one chip per sheet). Selecting a sheet swaps the KPI grid + charts to that sheet's **deterministic** numbers; the brief/observations/sources stay combined.
- This directly fixes "hard to verify/understand all at once": a user opens **April** and sees April's dashboard — one sheet, one column, trivially verifiable (April reconciles to 7.78% / 19,271 / 247,767 …, matching the source sheet's own totals).
- No extra AI cost: sections are numbers-only (the narrative stays combined).

---

## 6. Phased roadmap

| Phase | Scope | Status / risk |
|---|---|---|
| **1** | Per-sheet sections + combined overview + scope selector (reuse rejection engine + verify) | **done** |
| **2** | Generic **Profile** stage (domain-agnostic roles + stats); rejection becomes a lens behind a flag | medium |
| **3** | **Plan** stage + chart/metric auto-selection → generic `DashboardSpec` block emission | medium-high |
| **4** | **Mine** stage (deterministic analyzers) + AI ranking → productive suggestions | medium |
| **5** | Live data sources + true real-time verify/recompute | high |

Phases 2–4 deliver "any data" + "suggestions"; Phase 5 delivers literal real-time.

---

## 7. Build sequence for Phase 2–4 (when ready)

1. **`src/lib/profile.ts`** — `profileSheet(summary): DatasetProfile` (generic roles + stats + relations). Golden-test it like `metrics.ts`. Keep `inferSheetGraph` as the "rejection lens" that consumes/refines the profile.
2. **`src/lib/planner.ts`** — `planDashboard(profiles): DashboardSpec` (the chart/metric rules). Pure + tested.
3. **`src/lib/evaluate.ts`** — execute each block's binding over rows → values + provenance. Pure + tested (this is the "never lies" core).
4. **`src/lib/insights.ts`** — the deterministic analyzers (trend/anomaly/Pareto/correlation) → findings with evidence.
5. **Schemas** — widen `schemas.ts` for the generic block + suggestion shapes (cross-provider rules still apply).
6. **Renderer** — a generic `<Block>` switch; the existing KPI/Chart/Table/Suggestion components become block renderers.
7. **AI** — narrative/suggestion prompt builds from the *evidence*, sanity-gated against the deterministic findings.

Keep every stage **pure + unit-tested** so the "numbers are always correct and verifiable" guarantee holds as the engine generalizes.
