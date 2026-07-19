# Auto-Extend the Registry from Uploaded Excel Structure

**Status:** Draft — written directly per user request, not yet walked through interactive brainstorming Q&A. Review before planning implementation.
**Author:** RAIS-Pro / MO!D engineering session.
**Relationship to prior work:** Follow-up to `2026-07-07-data-entry-unify-design.md` (item C, deferred). That spec unified the Data Entry UI and fixed a dashboard-sync bug; this spec covers the remaining piece of the original ask — new columns/stages/sizes/defects appearing in an uploaded Excel workbook should automatically become available in the Data Entry spreadsheet, not just be silently dropped or require a manual "Manage Schema" edit.

---

## 1. Problem

Data Entry's spreadsheet columns (captures + defect codes) are driven by one shared, global `DISPOSAFE_REGISTRY` (`src/lib/registry/disposafe.ts`, optionally overridden by a single Supabase `registries` row). That registry is a fixed vocabulary: 13 stages, 28 defects, 10 sizes, edited only by hand through the "Manage Schema" modal.

There is already code that parses an uploaded workbook's structure — `extractSchemaFromWorkbook()` in `src/lib/ingest/schema-extractor.ts` detects header rows, classifies columns by role (checked/good/rework/rejected/defect/other), and maps sheets to stages/sizes. But it only runs as a one-time "Master Schema" bootstrap on `/staging` when no registry exists yet. On every upload *after* that, columns/defect codes/sizes/stages the workbook contains but the registry doesn't are effectively invisible: the ingest pipeline maps what it recognizes and has no path for surfacing what it doesn't. A defect code added to next month's Excel template, for example, never reaches Data Entry, Dashboard, or Reports until someone manually adds it via "Manage Schema."

### Goal

When an uploaded workbook contains a stage, size, capture column, or defect code the current registry doesn't have, detect it and offer to add it to the registry — so Data Entry (and everything downstream that reads the registry) reflects the latest known structure without manual schema editing for routine template changes.

---

## 2. Proposed decisions (unreviewed — flag for discussion)

| Decision | Choice | Rationale |
|---|---|---|
| Single registry vs. per-upload registry | **Keep the single global registry.** Extend it; don't fork a new registry per upload. | The rest of the app (Dashboard, canonical events, `metricsSane()` gating) assumes one shared vocabulary. A per-upload registry would fragment that and contradicts the existing "Dashboard must never distinguish sources" invariant. |
| When the diff runs | **On every `/staging` upload**, not just the first ("Master Schema" bootstrap) upload. | The bootstrap-only path is why this gap exists — routine template changes after the first upload go unnoticed. |
| What happens on a detected gap | **Surface a review step, not silent auto-merge.** Show "this workbook has N columns/stages/sizes/defects not in the registry" with a diff, operator picks which to add (or rejects a spurious match, e.g. a stray column that's actually a typo of an existing one). | Matches this codebase's existing philosophy (`metricsSane()` gate, `reconcileGraph()` dropping hallucinated columns) — never silently trust an automated classifier for something that changes shared state. |
| Where the UI lives | **Extend the existing `/staging` upload-review flow**, not a new page. | `/staging` already does schema extraction and registry bootstrap; this is additive to a flow that exists, not a new surface. |
| Confidence / matching | **Reuse `STAGE_PATTERNS`/column-role regexes already in `schema-extractor.ts`** for suggesting what a new column probably is (e.g. suggest "defect" role, pre-fill a defect code) — but require explicit operator confirmation before writing to the registry. | Consistent with the LLM-graph-vs-heuristic-fallback pattern already used for the AI pipeline: automation proposes, a gate decides. |

---

## 3. Open questions (need a real answer before planning)

These need actual user input — the "proposed decisions" above are placeholders, not settled:

1. **Granularity of the diff.** Does "new column" mean any column not matching an existing capture/defect/dimension by exact or fuzzy name, or should it be scoped tighter (e.g. only flag defect-looking columns, since those are what changes most often in practice)?
2. **Stage/size additions vs. column additions.** A brand new *stage* (an entire new inspection sheet) is architecturally heavier than a new *defect code* on an existing stage — does this spec need to support both, or just column/defect-level additions to existing stages?
3. **Who can approve additions?** Is this gated the same way "Manage Schema" already is (any user with access to `/data-entry`), or does it need a stricter permission model since it mutates the one shared registry?
4. **Multi-user race.** The registry is a single global Supabase row (`onConflict: "client_id"`). If two uploads propose different additions concurrently, what's the merge behavior?

---

## 4. Architecture sketch (subject to the open questions above)

```
Upload workbook (/staging)
        ↓
extractSchemaFromWorkbook()   [already exists — src/lib/ingest/schema-extractor.ts]
        ↓
NEW: diffAgainstRegistry(extractedSchema, activeRegistry)
        → { newStages[], newSizes[], newCaptureColumns[], newDefectCodes[] }
        ↓
NEW: review UI — operator confirms/edits/rejects each proposed addition
        ↓
NEW: POST /api/schema with the merged registry (extends, not replaces —
     existing stages/defects/sizes untouched, proposed additions appended)
        ↓
Existing /api/schema GET path already used by Data Entry (`MonthlyEntryGrid`,
data-entry/page.tsx) picks up the extended registry on next load — no
changes needed downstream, since both grids already render whatever
`activeRegistry.stages[].captures` / `.defects` / `.sizes` contain.
```

The last step is the payoff: since Data Entry's columns already come from the registry dynamically (confirmed during the prior spec's investigation — captures/defects are never hardcoded in the grid components), extending the registry is sufficient to make new columns "just appear" in Data Entry. No changes needed to `MonthlyEntryGrid.tsx` or `data-entry/page.tsx` for this spec.

---

## 5. Out of scope (this spec)

- Per-upload / per-report registries (see §2 — deliberately rejected in favor of extending the single shared registry).
- Automatic, no-confirmation merging (see §2 — a review/approval step is assumed necessary).
- Removing or renaming existing registry entries based on an upload (this spec only proposes *additions*; deletions/renames stay a manual "Manage Schema" action).

---

## 6. Next step

This draft has unresolved open questions (§3) that materially change scope and architecture. Before writing an implementation plan, walk through those questions with the user (the normal brainstorming flow this spec skipped per explicit request) and get the design section approved.
