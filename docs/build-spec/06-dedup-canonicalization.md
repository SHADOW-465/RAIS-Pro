# 06 · De-duplication & Canonicalization (the no-double-count guarantee)

This is the single most important correctness mechanism. **Identity of a physical inspection is `stageId|date` — NOT `stageId|size|date`.** The original bug keyed on size too, so a null-size whole-line record and the per-Fr rows never collided → both survived → ~2× inflation (Visual checked 4.88M vs true ~2.5M).

Two layers enforce it (defense in depth):

## 6.1 Seed/ingest time — `dedupeByPrecedence` (`parsers/dedupe.ts`)
Input `PrecededRecord[]` ({record, family}). Algorithm:
1. `cumulative` family (precedence 0) → set aside as **claims** (never counts).
2. Group remaining by `stageId|occurredOn.start` (size ignored).
3. Per group: pick the **highest-precedence family** present, then a **single winning source file** within it (lexicographic tie-break on `record.source.file`). Keep ALL rows of the winning (family, file) — so multiple per-Fr rows and multiple batches in one file **sum**; rows from other files/families for that stage·day are **shadowed**.

```
precedence: size-wise 40 > assembly-daily 30 = rejection-analysis 30 > stage-report 20 > cumulative 0
```

## 6.2 Read time — `canonicalizeEvents` (`analytics/canonical.ts`)
Runs once at `GET /api/events` — the single chokepoint all 11 screens read. Makes correctness **independent of what's in the store** (re-seeds, overlapping files, the same file uploaded twice, mixed old+new). Steps:
1. **Exact-duplicate collapse** — dedup by `eventId` (same content hash = same fact).
2. **Size-tier collapse** — for each `stageId|date`, if any event has `size != null`, drop the `size == null` events (the redundant whole-line aggregate); per-size rows sum to the stage total. If only whole-line exists (e.g. Final stage, or months with no size-wise book), keep it.
3. **Single source file per stage·day** — among the surviving tier, keep only the highest-precedence file's events (precedence via `routeFamily(basename(provenance.file))`, lexicographic tie-break). **Source identity = `provenance.file`** (NOT `fileHash` — disk-seeded events all share `fileHash:"local"`).

Non-countable events (dispatch, annotation, correction, aggregate-claim, carryover) pass through untouched.

```ts
export function canonicalizeEvents(events: Event[]): Event[] {
  // 1. eventId dedup → deduped[]
  // 2. group countable by `${stageId}|${day}`; hasSized? keep size!=null : keep all
  // 3. per group keep only the winning provenance.file (max precedence, then min file string)
  // return [...kept, ...other]
}
```

## 6.3 Proven property
**Doubling the entire ledger (`[...events, ...events]`) produces byte-identical KPIs.** This is asserted in `scripts/diagnose-analytical.ts` (STABLE check) and is the production acceptance gate. Multiple real batches of the same size/day (distinct `eventId` + distinct cells) are preserved and summed; only true duplicates collapse.

## 6.4 Why both layers
Seed-time dedup keeps the store small and consistent; read-time canonicalization is the **guarantee** — even if ingestion writes duplicates (incremental uploads, bypassed seed dedup, future code paths), the dashboard is still correct. Build both; never rely on only one.

## 6.5 Edge cases handled
- Valve & Visual size-wise books share a basename (`1 APRIL 26.xlsx`) → distinguished by stage (different stage·day groups) and by content-detection at parse time.
- Two whole-line families covering the same stage·day → precedence + single-file selection picks one.
- Re-upload of an edited file → different `fileHash`/cells → new `eventId`s; the canonicalizer's single-file rule keeps one source per stage·day (latest by file selection), preventing additive double counts.
