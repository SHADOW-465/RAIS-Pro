# RAIS Pro — Component Moodboard (what to harvest from the reference)

> Distilled from an operational manufacturing dashboard reference. We keep the **component polish**, not the operational layout.
> Every component below is spec'd against the existing tokens in `docs/DESIGN-SYSTEM.md` and bound to **real RAIS data** (see `docs/FEATURES.md` §8 for the data contracts). Keep the **light-first, indigo, Modern-SaaS × Soft-Modern** system. **Indigo `--accent` is the primary/action color; red `--critical` is reserved strictly for defect/rejection severity** (do not make red the brand).

---

## ADOPT (build these)

### 1. KPI stat tile
- **From reference:** tinted icon chip · label · big number · "▲ % vs last" delta chip.
- **Binds to:** `KPI` (`label`, `value`, `unit`, `trend`, `delta`, `history`, `context`, `sourceColumn`).
- **Spec:** `--surface` card, `--radius-lg`, `--shadow-1`, `--border`. Value in `--font-mono` tabular, `kpi-value` scale, `--text`. Small icon chip in `--accent-weak`/`--accent-text`. **Delta/trend chip with domain semantics:** falling rejection rate → `--positive` + ▼; rising → `--critical` + ▲ (never color-only — include arrow + word). Optional sparkline from `history` (accent stroke). In Verify mode the tile is clickable → active ring `--accent`.

### 2. Chart card header pattern
- **From reference:** title · legend · timeframe dropdown · inline mini-stats · body · hover annotation.
- **Binds to:** `Chart` (`title`, `type`, `data`).
- **Spec:** `h3` title + figure index eyebrow; legend chips using `--viz-*`; inline mini-stat chips (e.g. checked / rejected / rate). **Omit the "Monthly" timeframe dropdown** unless multiple granularities exist (RAIS is a monthly snapshot) — it's decorative otherwise. Caption in `small`/`--text-3`.

### 3. Donut / share chart
- **From reference:** donut with center total + Defective/Non-defective legend.
- **Binds to:** accepted vs rejected vs hold split, **or** defect-reason share.
- **Spec:** `--viz-*` segments; center shows the total in `--font-mono`; legend with values + %. Reserve `--critical` for the rejected segment.

### 4. Annotated bar chart
- **From reference:** bars with one highlighted/annotated bar ("148 Unit").
- **Binds to:** `stageBreakdown` (rate by stage) or `monthlyTrend` (received per month).
- **Spec:** bars `--viz-1`, rounded tops (`--radius-sm`); **highlight the worst stage/month** in `--critical` with a small annotation label. Axis labels `--text-3` `small .num`.

### 5. Area / line trend + hover tooltip
- **From reference:** area chart with a floating value tooltip, Jan–Dec axis.
- **Binds to:** `monthlyTrend` (rejection rate per month).
- **Spec:** 2px line `--viz-1`, ~12% area fill, dot on last point; tooltip card on hover (`--surface`, `--shadow-2`) showing month + rate. Color the line by good/bad if you want (`--positive`/`--critical`).

### 6. Ranked list (Pareto)
- **From reference:** "Top Product" thumbnail + value list.
- **Binds to:** `reasonPareto` (top defect reasons).
- **Spec:** ranked rows: rank number (`--font-mono`), reason label, value, and a thin proportion bar (`--viz-*`). No thumbnails (we have none) — use the rank + bar instead.

### 7. Status pills
- **From reference:** Processing / Maintenance / Active pills.
- **Binds to:** Outlook ("Action required"/"Steady"), alert severity, Verify sheet tags ("rollup · excluded", "not data").
- **Spec:** `--radius-pill`, weak-tinted background + matching text token (`--positive-weak`/`--positive`, `--critical-weak`/`--critical`, `--warning-weak`/`--warning`, `--surface-2`/`--text-3`). Uppercase `label` type, small.

### 8. Source list (reframed status feed)
- **From reference:** "Production Line Status" vertical feed.
- **Binds to:** the Verify **month index** (already built in `VerifyPanel`) — per-month rows with quick stats (checked / rejection rate) + a status pill.
- **Spec:** rows on `--surface`, `--radius-md`, hover → `--shadow-2`; metric in `--font-mono`; **not** a live feed — it's a static, classified index (Months / Summary / Other).

### 9. AI-content surface
- **From reference:** (n/a — RAIS-specific trust requirement.)
- **Binds to:** `executiveSummary`, `insights`, `recommendations`, chat insight slides.
- **Spec:** distinct surface (`--accent-weak` tint **or** a left `--accent` rule) + a small **"AI" chip**. Apply this **consistently to every model-authored block** so computed vs AI is unmistakable. Computed blocks (KPIs/charts/audit) stay on plain `--surface`.

### 10. Sources & merge audit
- **Binds to:** `MergePlan` (groups / excludedSheets+reason / strategy / warnings).
- **Spec:** calm `--surface` panel; included sheets → group; excluded sheets + reason in `--text-2`; strategy in a `--surface-2` code chip; warnings with `--warning`.

---

## DROP (the operational-template traps — do NOT build)
- **Add-widget "+" / customizable grid** — the report is generated, not user-composed.
- **Global search bar, notification bell, profile menu** — single-report tool, not a live console. (In-table search inside Verify is the only acceptable search.)
- **"Pending Orders" table, "Top Product" live widget, live stock-vs-threshold** — no equivalent data; forcing these creates empty/fake widgets.
- **Real-time "Production Line Status" feed metaphor** — RAIS data is a historical snapshot, not a live stream.
- **Red as the primary/brand color** — keep indigo primary; red = rejection/defect severity only.

---

## Layout note (ties to `docs/UX-AUDIT.md`)
Arrange the adopted components in a **brief-led, top-down analytical report** (one centered content grid that fills the width), not an ops control-center:
`Executive brief (AI surface) → KPI tiles → trend/stage charts → defect-reason breakdown → drill-down/Verify → Sources & merge audit`.
