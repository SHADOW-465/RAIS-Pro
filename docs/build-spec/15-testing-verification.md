# 15 · Testing & Verification

The app's correctness is *proven*, not asserted. Reproduce this discipline in the rebuild.

## 15.1 Test suites (Jest, 161 tests, 30 suites)
- **Schema tests** — document what the AI must produce; change a prompt ⇒ update schema + test in lockstep.
- **Analytics tests** (`analytics.test.ts`) — totals, rejection rate (Σ stage), totalChecked (entry stage), FPY (Π), byStage contribution, trends, scope filters. Golden values from the GM's real April numbers.
- **Audit-correctness tests** (`audit-correctness.test.ts`) — stage `yield = 1 − rejRate` even with partial `accepted`; `resolveDefect` separator-insensitive (90-10 == 90/10); unknown → null.
- **Parser tests** — size-wise / rejection-analysis / assembly vs fixtures.
- **Dedupe / store tests** — precedence + `effective` filters.

## 15.2 Verification harnesses (`scripts/`)
- **`diagnose-analytical.ts`** — seed `ANALYTICAL DATA/` → canonicalize → print every KPI + monthly Σ-stage trend, AND the **doubling-stability** check (`canonical(raw) == canonical(raw×2)`), AND compares to the embedded YEARLY sheet.
- **`audit-verify.ts`** — asserts `byStage.yield == 1 − rejRate` for every stage; dumps byDefect; spot-checks defect resolution.
- **`ground-truth.ts`** — an INDEPENDENT oracle (does not import `src/lib`) that re-derives checked/accepted/rejected per file; the app parser is checked against it.

## 15.3 The acceptance gates (must all pass before deploy)
1. `npx tsc --noEmit` clean.
2. `npx jest` — all green.
3. `npm run build` — compiles, all routes.
4. **Clean-month KPIs == the client's embedded YEARLY sheet, to the decimal** (Apr 14.18%, May 12.56%, Nov 10.86%, Feb 12.33%).
5. **Doubling the ledger changes no KPI** (canonicalizer stability).
6. Audit ZIP: valid CRC + every manifest SHA-256 matches.
7. `npm run check:ai` — every AI backend accepts the schemas.

## 15.4 Method
Use systematic debugging (root cause before fixes) and verification-before-completion (run the command, read the output, then claim success). The whole engine was built and corrected this way — divergences from the client's own spreadsheets were the ground truth that caught every bug (double-count, wrong funnel, yield, defect resolution).
