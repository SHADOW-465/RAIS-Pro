# Plan: Fix defect-column parsing so the Pareto populates

## Problem (verified)
The live store has **0 `rejection` (per-defect) events** — only `production`,
`inspection`, `aggregate-claim`. `byDefect()` reads correctly but has nothing, so
the Pareto is empty. Root cause is in `src/lib/ingest/schema-extractor.ts`
(`extractSchemaFromWorkbook` role classification). For the VISUAL INSPECTION
REPORT, the 21 defect columns are mis-classified:

- `COAG, SD, TT, BL, PS, SB, PW, FP, BEP, DEC, BM, WEB, BT, SF, BIC, WK, BMP, TF, PH, BST` → `"formula"`
- `RW` → `"rework"`; `HOLD%` → `"rework"`
- Result: `classifyWithSchema` → 365 records, **withDefects: 0, totalDefectEntries: 0**.

Two bugs:
1. The branch `else if (PCT_RE.test(colName) || hasFormula) role = "formula";`
   fires for any column that contains an Excel formula. The report's defect counts
   are formula-driven, so they all become `"formula"` and never reach the
   `type === "number" → "defect"` branch.
2. `REWORK_RE = /rework|rw|hold/i` captures `RW` ("Raised Wire") and any `HOLD*`
   column as rework.

## Fix (in `src/lib/ingest/schema-extractor.ts`)
Reorder/repair role classification so a real defect column wins even when it has a
formula, and stop `RW`/`HOLD%` being mis-read:
1. **Detect defects by name first.** Before the formula catch, if the column header
   resolves to a known defect (use `resolveDefect(colName)` from
   `src/lib/registry/disposafe.ts`) OR it is a short numeric reason-code column
   (≤8 chars, numeric, not a known role) → `role = "defect"`. Reuse the
   `VISUAL_DEFECT_DICT` codes from `src/lib/ingest/from-visual-inspection.ts` as a
   recognized-code set.
2. **Restrict `"formula"`** to genuine percentage/rate columns: only
   `PCT_RE.test(colName)` → `"formula"`. Do NOT use bare `hasFormula` to force
   `"formula"`; a numeric formula-driven count is still data.
3. **Tighten `REWORK_RE`** so it doesn't match `RW`: e.g.
   `/\brework\b|hold(?!\s*%)/i` (rework word, or HOLD qty but not HOLD%), and make
   the size-2 `RW` resolve to defect (Raised Wire) instead.
4. Keep `classifyWithSchema` reading defect values from `role==="defect"` columns
   into `record.defects[]` (already implemented); confirm cell provenance is set.

## Alternative (lower-risk, recommended if #1 is fiddly)
Route the VISUAL INSPECTION REPORT through the dedicated, verified parser
`classifyVisualInspectionSheets` (`src/lib/ingest/from-visual-inspection.ts`,
which already emits ~1,997 defect events from this exact file) instead of the
generic `classifyWithSchema`. In `src/app/staging/page.tsx` fallback branch and in
`src/lib/store/seed.ts`, detect the visual-report shape (≥3 known defect-code
columns) and prefer `classifyVisualInspectionSheets`; keep `classifyWithSchema`
for truly unknown layouts.

## After the fix
- Re-ingest: Settings → Clear Data, then re-upload the workbooks (or run a reseed).
- Verify: store has `rejection` events; `byDefect(events, {grain:"month"})` returns
  rows (Black Mark, Ply Separation, Coagulum, Surface Defect, …); the dashboard
  Defect Pareto + Defect Analysis page populate; the global View scope still
  filters them per stage.

## Acceptance
- `classifyWithSchema(visualReport)` → records with `totalDefectEntries > 0`.
- After re-ingest, `eventTypes.rejection > 0`; Pareto non-empty.
- `npx tsc` clean; `npx jest` green (add a test asserting defect columns →
  `role:"defect"` and that `RW`/`HOLD%` are not rework).

## Files
`src/lib/ingest/schema-extractor.ts` (roles), optionally
`src/app/staging/page.tsx` + `src/lib/store/seed.ts` (prefer visual parser),
tests in `src/__tests__/schema-extractor.test.ts`.
