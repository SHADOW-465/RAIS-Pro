# Session handoff — RAIS-Pro (Grain + data-entry MOD rewire)

**Date range:** ~2026-07-15 → 2026-07-18  
**Repo:** https://github.com/SHADOW-465/RAIS-Pro  
**Branch:** `main`  
**Purpose:** Continuity for a new chat/session without re-reading the whole codebase.

---

## 1. What this product is

**RAIS-Pro / MO!D** = shop-floor quality analytics for Foley balloon catheter production (Disposafe client).

- Upload Excel → map columns (MOD) → **event ledger** → pure **analytics** (rejection, defect Pareto, COPQ, SPC, etc.).
- Optional AI narrative on top of numbers (AI must not invent metrics).
- Two planes: **knowledge** (MOD / mappings) vs **facts** (append-only events).

---

## 2. Why the user started this thread

1. Codebase felt too large / dual paths after many iterative changes.
2. Data entry still showed **hardcoded Disposafe defect columns** even after “MOD / standardized alias” work.
3. Client operates **batch-wise**, not only day/month — requirements incomplete but they expect strong results.
4. Needed architectural honesty + a requirements freeze (Grain Contract), then **fix** the entry grid.

---

## 3. Architecture judgment (decided, not rebuilt)

| Keep | Don’t do |
|---|---|
| Event ledger + pure analytics | Full rewrite / new stack |
| MOD as understanding (versioned) | Hardcoded company in runtime UI |
| Human verify mappings | AI inventing numbers |
| Calendar **and** batch as views | Replacing day with batch only |

**Honest take:** Spine is right; mess was **mid-migration** (registry UI vs MOD pipeline) + calendar-first product while plant thinks in **lots/batches**.

`batchNo` already exists on events; analytics/UI largely sum batches away — batch is not first-class in product yet (agreed as P0, not fully built).

---

## 4. Grain Contract (client decisions)

**Files:**
- `docs/GRAIN-CONTRACT.md` — assumptions sent to client  
- `docs/response grain.pdf` — their filled panel  
- `docs/GRAIN-CONTRACT-DECISIONS.md` — **frozen engineering rules**

### Confirmed (high level)

- **Batch** = lot number on sheet (e.g. `25A28`), optional, multi-stage, independent of size  
- Batch view = **unmerged** lines; monthly KPIs = **sum** batches  
- Keep **size split inside a batch**  
- Prefer per-size rows over whole-line totals; re-upload idempotent  
- Sheet `%` = claim only; recompute from checked/rejected  
- Home = **Factory overview**  
- Primary gates: Visual, Balloon, Valve Integrity, Final  
- Sizes 6–24 FR; FY Apr–Mar  
- Detailed Excel beats summary; conflicts between depts → flag + human  

### Client **changed** our defaults

| ID | New rule |
|---|---|
| **A9 / A19** | Manual vs Excel: **more detailed source wins**, not “always manual” |
| **A12** | Σ defects ≠ Rejected: **always show both options** — (1) set Rejected = sum(defects), or (2) keep Rejected / defects incomplete — apply **only after user confirms** (option **3**) |

Sign-off names on the PDF panel were **blank** — treat as working agreement from button answers, not formal legal sign-off.

---

## 5. Why defects looked “hardcoded” (diagnosis)

### Intended design
```
verified MOD (workbook layout + entities)
  → GET /api/entry-template
  → data-entry grid columns
```

### What was actually running (before fix)

```
merged MOD catalog (often Disposafe seed)
  → GET /api/schema  (compat “registry” shape)
  → MonthlyEntryGrid: activeDefects = all catalog defects for stage
  → + extraDefects side channel
```

**Layers of the bug:**

1. **UI never used `/api/entry-template`** — still `/api/schema`.  
2. Schema shim returns **full company catalog**, not sheet layout.  
3. **Migration seed** (`disposafe-registry`) demoted hardcoded DISPOSAFE_REGISTRY into a verified MOD → ~**22 visual** codes (COAG, SD, TT, PINH, …).  
4. First entry-template rewire still **fell back to `doc.defects` catalog** when no defect *entities* → seed still painted full list.  
5. **Staging** also used `/api/schema` for defect columns → same catalog dump.

Proof after final fix (local): seed-only MOD → **0** defect columns on entry-template; phase4 tests green.

---

## 6. What was implemented in this work

### A. Data-entry rewire (first pass)

| File | Change |
|---|---|
| `src/components/MonthlyEntryGrid.tsx` | Loads **`/api/entry-template`**; columns = stage captures + stage defects from template; removed `extraDefects` / catalog path |
| `src/app/data-entry/page.tsx` | No longer gates on `/api/schema` registry |
| `src/lib/ingest/capture-fields.ts` | **Deleted** (zero imports after rewire) |

### B. Root-cause fix after deploy still showed defects

| File | Change |
|---|---|
| `src/app/api/entry-template/route.ts` | Defects = **Excel-mapped entities only**; never pad from seed catalog; prefer non-migrated workbooks over seed; response includes **`meta`** for debug |
| `src/app/staging/page.tsx` | Defect columns from **extracted records**, not `/api/schema` |
| `scripts/migrate-presets-to-mods.ts` | Synthetic defect entities only for **`preset:*`**, not Disposafe seed |
| `src/core/__tests__/phase4.test.ts` | Asserts template does not dump full seed catalog |
| `scripts/diagnose-entry-template.ts` | Diagnose verified MODs + template |
| `scripts/prove-no-seed-pad.ts` | Proves seed → 0 defect columns |

### C. Docs created

| File | Role |
|---|---|
| `docs/GRAIN-CONTRACT.md` | Client-facing assumptions |
| `docs/GRAIN-CONTRACT-DECISIONS.md` | Frozen rules after PDF + A12 option 3 |
| `docs/SESSION-HANDOFF.md` | This file |

### D. Git / deploy notes

- Remote: `origin` → `https://github.com/SHADOW-465/RAIS-Pro.git`  
- Earlier commit on remote included first rewire: `8e1e0ea` *data entry defects correction* (entry-template UI + delete capture-fields + grain docs).  
- **Final seed-pad fix (B)** may still be **local uncommitted** at end of session — verify with `git status` before assuming production has it.  
- Git was installed via winget on the agent machine when missing from PATH.

---

## 7. Live vs legacy paths (still true)

| Live / keep | Compat / debt | Dead |
|---|---|---|
| `src/core/*` MOD pipeline | `/api/schema` + `RegistryContext` (analytics labels) | `capture-fields.ts` |
| `/api/entry-template` (data entry) | `RegistryStore` (migrate only) | family parsers (already gone) |
| `/api/workbooks`, `/api/mods/*`, ingest, events | Seed DISPOSAFE as **knowledge**, not entry columns | — |
| `lib/analytics/*`, ledger | Staging badge hardcode, etc. | — |

**Do not delete yet:** `/api/schema`, `RegistryContext` — still used by dashboard / analysis screens for stage labels.

---

## 8. How data entry works now (after all fixes)

1. Need ≥1 **verified MOD** (Staging: upload → map → verify → publish).  
2. Grid calls **`GET /api/entry-template`**.  
3. Per stage: capture columns from MOD stage captures; defect columns only if that MOD has **defect entities** (real Excel columns verified as `DEFECT:…`).  
4. Seed-only company: **captures, no invented defect codes**.  
5. Real workbook with PINH/COAG columns: only those appear.

**Debug after deploy:** open `/api/entry-template` → inspect `meta.stages[].defectCount` / `defectCodes`.

---

## 9. Explicitly NOT done (next session candidates)

| Item | Notes |
|---|---|
| **A12 dialog** (option 3) | Rule frozen; UI still only flags mismatch in `review.ts` — no “pick fix + approve” dialog yet |
| **A9/A19 detail-based conflict** | Still mostly “direct entry wins” in `canonicalizeEvents` — needs human/detail resolution |
| **Batch table / byBatch analytics** | Grain P0; `batchNo` on events but no first-class batch UI |
| Point analytics off `/api/schema` | Replace with `catalogFor` / OntologyContext |
| Delete `/api/schema` | After all consumers rewired |
| Settings **`/api/clear-schema`** | Button exists; **route missing** (broken) |
| Formal client sign-off names | Still blank on PDF |
| Commit/push final seed-pad fix | Check `git status` |

---

## 10. Commands useful next session

```bash
cd C:\projects\RAIS-Pro
git status
git log -5 --oneline

# Prove seed doesn't pad (memory store)
set MOID_STORE=memory
npx tsx scripts/prove-no-seed-pad.ts
npx tsx scripts/diagnose-entry-template.ts   # needs env for real Supabase

npx jest src/core/__tests__/phase4.test.ts --no-coverage
```

---

## 11. One-paragraph “paste into next agent”

> RAIS-Pro is a manufacturing quality app: Excel → MOD (mappings) → event ledger → analytics. We froze a Grain Contract (batch optional lot id; sum batches for monthly KPIs; unmerged batch view; A12 always ask user before fixing defect-sum≠rejected; A9/A19 more-detailed source wins). Data entry previously used `/api/schema` + full Disposafe seed catalog as columns. We rewired to `/api/entry-template`, deleted `capture-fields.ts`, then fixed residual seed-pad by using **only defect entities** (never catalog fallback), staging defects from extracted rows only, and not materializing seed catalog as entities. Verify with `/api/entry-template` meta and `scripts/prove-no-seed-pad.ts`. Still open: A12 approval UI, detail-based ingest precedence, batch analytics UI, retire schema/RegistryContext. Frozen rules: `docs/GRAIN-CONTRACT-DECISIONS.md`. Details: `docs/SESSION-HANDOFF.md`.

---

*End of handoff.*
