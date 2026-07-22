# Navigation-First Assistant — v1 Design Spec

Date: 2026-07-22
Status: approved design → implementation
Scope: first buildable slice of the Intelligent Manufacturing Assistant
(see `AI-ARCHITECTURE.md` for the full blueprint this is the first spec of).

---

## 1. Goal

Turn a typed request ("why did rejection spike in April") into the app **opening
the right screen, scoped, with the relevant KPI/chart highlighted** — so the user
thinks "I have a problem," not "where is that graph."

This is the *navigation intelligence* slice only. It does **not** narrate figures
(that is the next spec, the answer layer).

## 2. Settled decisions (the four forks)

1. **Deterministic-first.** The existing `search-index` + rules own intent
   routing and navigation. The LLM only rescues odd phrasing. A 1B model
   (MiniCPM, primary) is never load-bearing for correctness; Groq 70B is only a
   fallback, so the design cannot depend on it.
2. **v1 = navigation-first.** No prose answers; `/chat` already answers over
   verified figures.
3. **Auto-navigate + narrated undo.** Confident interpretation → open the scoped
   screen immediately with a "because… [Undo]" banner. Ambiguous → ranked
   pick-list.
4. **Deterministic parse, LLM only on miss.** Slot-filler over live entity sets +
   a date parser handles common cases with zero LLM. Low-confidence parses get
   one MiniCPM (fast) slot-extraction pass, reconciled against real entities.
   Navigation works with AI fully offline (worst case: pick-list).

## 3. Architecture

```
typed request
   │
   ▼
resolveIntent(text, ctx)                 [NEW · pure · src/lib/analytics/intent.ts]
   • date-phrase parser  → {from,to,grain}
   • entity/metric matcher over live sets (batches/gates/sizes/defects)
   • confidence from match scores
   • LOW confidence → MiniCPM(fast) slot extraction, reconciled against real entities
   │
   ▼
IntentResult { state, navKey, highlights[], confidence, matched, alternatives[] }
   │
 confident? ─yes─► goInvestigation() [EXISTS] + carry highlight + undo banner
   │
   └─no/ambiguous─► ranked pick-list  [reuses CommandPalette list UI]
```

**Firewall unchanged:** v1 computes no metric. It only routes to screens that
already compute deterministically. The LLM is off the critical path.

## 4. Components

### 4.1 `resolveIntent(text, ctx)` — new, pure
`src/lib/analytics/intent.ts`
```
ctx = { events, currentScope, persona }
IntentResult = {
  state: InvestigationState,   // grain·from·to·stage·size·batch·metric·highlight
  navKey: NavKey,              // screen that answers this
  highlights: string[],        // KPI/chart ids to spotlight
  confidence: number,          // 0..1
  matched: { period?, metric?, stage?, size?, batch?, defect? },  // for the banner
  alternatives: SearchHit[],   // populated only when ambiguous
}
```
Internal pipeline:
1. Run each slot extractor over `text`.
2. Score (reuse `scoreMatch` scale from `search-index.ts`).
3. If total ≥ threshold → build `state`, pick `navKey` from the routing table.
4. Else → MiniCPM fast slot extraction (flat `{period,metric,stage,size,batch}`
   strings), **reconcile** every returned value against the live entity sets
   (drop hallucinated ones), re-score.
5. Still low → return `alternatives` (ranked `SearchHit[]`) for the pick-list.
6. Persona-filter `navKey` via `personaAllowsNav`. If the natural target is
   denied for the role, fall to nearest allowed screen or flag "not available
   for your role."

Threshold: start at the existing palette's `0.5` match band; tune in tests.

### 4.2 Slot extractors — new, small, pure
- **`src/lib/analytics/date-phrase.ts`** — "April" / "last quarter" / "this FY" /
  "week 2 of May" / "last 90 days" → `{from,to,grain}`. Anchors on the data's
  latest date (reuse `resolveScope` preset logic), never a hardcoded today. Its
  own file + test — highest bug risk, isolated.
- **entity + metric matcher** — reuses `scoreMatch` + live-set logic from
  `search-index.ts`, extracted into a shared helper so intent and the palette
  don't drift. Metric synonym map (glossary): reject/NC/nonconformance→`defect`,
  cost/rupees/COPQ→`copq`, yield/FPY→`fpy`, etc.

### 4.3 Metric→screen routing table — extends existing data
Add one field to each `DESTINATIONS` row in `search-index.ts`: `answersMetric`.
- `defect-analysis` → `defect`
- `copq` → `copq`
- `stage-analysis` → `stage` / `rate`
- `process-flow` → `fpy`
- `size-analysis` → `size`

That is the entire "AI knows where things live" map for v1 — one field, no new
subsystem.

### 4.4 Highlight target — minimal reuse
Add an optional `highlight` field to `InvestigationState`
(`investigation-state.ts`), serialized in the URL like every other scope field.
Screens read it and spotlight the matching KPI. v1 targets by
metric / `sourceColumn` (already on `KPI` in `types/dashboard.ts`, already used by
verify-mode's beam) — so no new component registry yet.

### 4.5 Ask bar + undo banner — new UI, thin
- **Ask bar**: reuse the `CommandPalette` shell (same ⌘K surface). On submit,
  call `resolveIntent` (not only `searchJumpTargets`). Confident → navigate;
  ambiguous → the palette's existing ranked-list render of `SearchHit[]`.
- **Undo banner**: dismissible strip after auto-nav — "Opened Defect Analysis ·
  April because 'rejection spike' · [Undo]". Undo = `router.back()` (the recents
  stack already records the jump). Pure client, lives in `AppShell`.

### 4.6 LLM footprint
One optional `tryModels(fn, { fast: true })` call for slot extraction on
low-confidence parses. No planning, no multi-tool, no nested JSON — a flat map of
strings, reconciled. Sized for MiniCPM-1B; degrades to pick-list if AI is down.

## 5. Scope boundaries

**In scope:** typed request → confident auto-navigate (scoped + highlighted) with
narrated undo; ambiguous → ranked pick-list; deterministic parse with LLM
fallback; persona-aware target filtering.

**Not in scope (later specs — keeps the boundary clean):**
- Prose answers / figure narration (next spec: the answer layer).
- Data mutation, CAPA, reports, target changes.
- New metric computation — v1 never touches selector math.
- Conversation memory beyond the existing recents stack.
- Component registry / arbitrary chart focus — highlight is
  metric/`sourceColumn`-based only.

## 6. Testing

Matches the existing `src/lib/analytics/__tests__` jest style.
- **`intent.test.ts`** (load-bearing): table of `{text, entitySets} → expected
  {navKey, state, confidence-band}`. Covers common phrasings, synonym hits,
  persona-denied targets, and the ambiguous→alternatives path.
- **`date-phrase.test.ts`**: period parser in isolation (month, quarter, FY,
  week-of-month, "last N days"), anchored on a fixed data-max for determinism.
- **LLM fallback**: not tested against a live model. A mocked-extraction test
  asserts reconciliation drops hallucinated entities. `npm run check:ai` remains
  the live smoke test.

## 7. Files

| Action | File | Why |
|---|---|---|
| New | `src/lib/analytics/intent.ts` | The resolver |
| New | `src/lib/analytics/date-phrase.ts` | Period parsing (isolated, high bug risk) |
| New | `src/lib/analytics/__tests__/intent.test.ts` | Load-bearing test |
| New | `src/lib/analytics/__tests__/date-phrase.test.ts` | Date parser test |
| Edit | `src/lib/analytics/search-index.ts` | Add `answersMetric`; extract shared score/entity helper |
| Edit | `src/lib/analytics/investigation-state.ts` | Add optional `highlight` field + serialize |
| Edit | `src/components/app/CommandPalette.tsx` | Submit → `resolveIntent`; confident nav vs pick-list |
| Edit | `src/components/app/AppShell.tsx` | Undo banner after auto-nav |
| Edit (small) | analysis screens rendering KPIs | Read `highlight` from scope, spotlight matching KPI |

No new dependencies. LLM path reuses `tryModels`.

## 8. Success criteria

- "rejection in April" / "COPQ this quarter" / "size 24Fr defects" /
  "balloon gate last month" each land on the correct screen, scoped, with the
  right KPI highlighted, in one step.
- Works with AI backends fully offline (deterministic parse or pick-list).
- An operator persona never auto-navigates to a screen their role can't see.
- `npx jest` green; no metric value ever originates from the model.
