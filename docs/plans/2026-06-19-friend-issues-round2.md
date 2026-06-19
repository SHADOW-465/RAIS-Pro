# Plan — Friend's Round-2 Issues (2026-06-19)

Branch: `feat/phase2-real-parsers`. Goal: fix the 12 reported issues by repairing the
**core scope/aggregation logic**, not symptom-patching each card. Build everything; verify later.

## Root-cause analysis (12 issues → 5 root causes)

### RC-1 — Snapshot metrics ignore the selected date range (THE core bug)
**Issues: #4, #5, #6, #10, #11 (+ feeds #2, #3).**
`src/app/page.tsx` `m` memo computes a `snapshotScope` = **the single latest period** for the
active grain, and runs rate / rejected / fpy / byStage / byDefect / copq / status on it. But:
- The date-range control feeds `scope` (used only by trends), so **changing the date range never
  touches the headline KPIs, Pareto, stage-wise, or process flow** (#6, #10, #11).
- On grain=week/day the "latest period" is one tiny window that is often empty or unrepresentative
  → empty Pareto/stage/process-flow (#4) and "random" daily/weekly analysis (#5).
- Inconsistency: `bySize` already uses `scope` while the rest use `snapshotScope`, so some widgets
  follow the range and others don't.

**Fix:** make the dashboard aggregate the headline metrics over the **selected `scope`** (the date
range), and use **grain only for trend bucketing**. Remove the latest-period snapshot.
- `snapshotScope` → `scope` everywhere in the `m` memo (dashboard, and the same pattern in
  `src/app/process-flow/page.tsx` and `src/app/copq/page.tsx`).
- Deltas (`stats.*Diff`) compute against `prevWindow(scope)` instead of the previous period.
- KPI/section labels: drop "This Period"/"latest" wording → "selected range".
- Apply the identical fix to **process-flow** (#10) and **copq** (#11) pages (they duplicate the
  snapshot pattern; copq's non-trend tiles must also recompute from `scope`).

### RC-2 — Size dropdown hardcoded, mismatches YTD
**Issues: #1, #7.**
`page.tsx:531` and `src/app/size-analysis/page.tsx` hardcode
`["Fr10","Fr12","Fr14","Fr16","Fr18","Fr20","Fr22","Fr24"]` (8) while `bySize()` returns the real
sizes present (e.g. Fr6…Fr26 → 11). **Fix:** derive the dropdown options from `m.sizes`
(`m.sizes.map(s => s.size)`), defaulting `selectedSize` to the worst/most-rejected size if the
current selection isn't present. Same on the Size Analysis page.

### RC-3 — SPC control limits computed wrong
**Issue: #9 (+ #11-control interpretation).**
`src/app/spc/page.tsx` uses `UCL = mean + 3·stdev(period rates)` — an I-chart formula applied to a
rejection **proportion**. Correct p-chart: per period the subgroup size `nᵢ` (units checked) varies,
so `σ = √(p̄(1−p̄)/n̄)` with `p̄` = total rejected / total checked over the window and `n̄` = mean
checked per period; `UCL = p̄ + 3σ`, `LCL = max(0, p̄ − 3σ)`. Recompute the centerline as the
pooled `p̄` (not the mean of period rates). Fix the Western-Electric interpretation text so heavy
oscillation across limits is reported as **out of control**, not "within limits".

### RC-4 — Pareto chart lacks per-defect % + table
**Issue: #8.**
`ParetoChart` should render each defect's **% contribution as a label on/under its bar** and the
cumulative line; below the chart add a compact table (Defect · Count · % · Cum %). Reuse
`DefectParetoTable` (already exists in widgets) beside/under the chart.

### RC-5 — Custom-field add triggers the whole form's validation
**Issue: #12.**
In `src/app/data-entry/page.tsx`, marking a freshly-added custom field "Required" immediately makes
`blockingErrors` non-empty (its value is blank) AND the Operator-required rule fires, so the user is
forced to fill unrelated fields just to add a field. **Fix:**
- A new custom field starts **not required**; the Required toggle only *flags* it.
- Required custom fields are only enforced **on Submit**, not while editing — show a subtle inline
  "required" marker but don't add to the global blocking list until a submit attempt
  (introduce `attemptedSubmit` state; gate `blockingErrors` display on it, keep submit hard-blocked).
- Adding/removing a field never depends on Operator or stage values.

### RC-6 — "Random" trends (verify after RC-1)
**Issues: #2, #3.** Size-wise / weekly / COPQ trends look random. Most likely a consequence of RC-1
(mixed scopes) + the data spanning two fiscal years (assembly 2025 vs size-wise 2026-27). After
RC-1, confirm the trend series use one consistent `scope`+grain. If still noisy, decimate/clean the
series and ensure `weeklyTrend` buckets by ISO week within the range (not week-of-month across
years).

## Task order (each independently committable)
1. **RC-1 dashboard** — scope unification in `page.tsx` `m` memo + deltas + labels.
2. **RC-1 process-flow + copq** — same fix in those pages.
3. **RC-2** — data-driven size dropdowns (dashboard + size-analysis).
4. **RC-5** — custom-field validation UX in data-entry.
5. **RC-3** — SPC p-chart limits + interpretation in `spc/page.tsx`.
6. **RC-4** — Pareto % labels + table.
7. **RC-6** — verify trends; clean if still off.

## Verify (later, per user)
`npx tsc --noEmit` + `npm run build` after each task. Live: change date range → all tiles move;
switch D/W/M/FY → trends rebucket but tiles reflect the range; weekly view shows real Pareto/stage;
size dropdown count == YTD count; SPC limits sane; Pareto shows %; add a required custom field
without being forced to fill Operator.
