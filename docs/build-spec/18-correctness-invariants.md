# 18 · Correctness Invariants (non-negotiable)

These are the rules that keep the numbers right. Violating any one re-introduces a bug that was already fixed. Enforce them with the tests in [15](15-testing-verification.md).

1. **The model never produces a KPI or chart number.** AI = column classification (with a `metricsSane` sanity gate) + narrative prose only. All arithmetic is deterministic JS over events.

2. **De-dup identity is `stageId|date`, never `stageId|size|date`.** Size-wise is authoritative; the whole-line aggregate is dropped when per-size rows exist; exactly **one source file per stage·day**. Multiple batches within one file sum.

3. **Doubling the event ledger must change no KPI.** `canonicalizeEvents` runs at the single read chokepoint (`/api/events`). Correctness is independent of store contents / ingestion order.

4. **The funnel is never summed across stages.** `totalChecked` = entry stage (Visual) only. Summing checked across gates quadruple-counts the same physical unit.

5. **Headline Rejection Rate = Σ per-stage rates** (Σ rejectedₛ/checkedₛ) — the client's "Total Rejection %" convention; it reproduces their YEARLY sheet exactly. It is **not** overall rejected÷checked.

6. **FPY = Π(1 − stageRate)** (rolled-throughput yield). FPY and the rejection rate intentionally do **not** sum to 100% (Π(1−r) ≥ 1−Σr). This is correct, not a bug.

7. **Stage yield = (checked − rejected)/checked = 1 − rejRate.** Never `good/checked` — accepted events are only partially captured and would report ~0% yield.

8. **`resolveDefect` is separator-insensitive** (collapse non-alphanumerics → `90-10` == `90/10`). Unknown codes resolve to `null` and display **verbatim** (low-confidence + Finding) — never "Unknown", never an invented category.

9. **The app starts blank.** No auto-seed/demo data in production (`MOID_AUTOSEED` off). Uploads and direct entry are the only data sources. Honest empty states (name the files to upload), never fake placeholders.

10. **Every number is traceable** to a source cell + file hash + edit comment via the append-only ledger and provenance envelope. Corrections supersede (never mutate) history.

11. **Source files are never edited.** Raw bytes archived read-only; the app reads, never writes back.

12. **Export = ZIP of CSVs + SHA-256 `manifest.json`** (ALCOA+). Validate CRC + hashes before release.

13. **`stated` values (REJ%, totals) are claims to verify, never inputs.** They become `AggregateClaimEvent`s checked against computed values (Finding on conflict).

14. **Effective-dating is respected.** `activeStageIds(date)` — Eye Punching (effective 2025-11-01) must not invalidate earlier months.
