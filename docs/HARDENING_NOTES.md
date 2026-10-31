# Hardening notes

## Step A: batch conversion correctness

What changed, and what is still open.

### Fixed

1. **No in-memory fallback.** If `batch_conversions` (or its `changed_qty` / `stage_id`
   columns) is missing, `GET` and `POST /api/batch-conversions` answer **503** with
   `code: "storage-unavailable"` and log a server `console.warn`. Nothing is kept in memory.
   (`MOID_STORE=memory` dev/test mode still uses the memory store by design.)
2. **Server-side quantity bounds.** `changedQty` must be a whole number > 0 and no larger than
   the eligible quantity, which the server computes from the ledger
   (`lineage/eligible.ts`, same grouping as the form). The request body cannot supply it.
3. **Remaining at the change station** is `passedForward(original) - converted`, floored at 0
   (`buildQuantityFlow`).
4. **Eligible = accepted.** `eligibleTransferQty` returns the station's passed-forward quantity
   and no longer falls back to *checked*, so a station that accepted nothing cannot convert.
5. **Converted lot is no longer prefilled as 100% accepted.** Checked is seeded with the moved
   quantity; accepted is left for the operator (page and `BatchMatrixEntry`).
6. **Repeat save of a lot.** Same lot, same target, same quantity is idempotent. A different
   quantity, or a different target, is refused with an explicit "a lot can only be converted
   once" message. A legacy row with `changed_qty = 0` (quantity unknown) still accepts a repeat.
7. **Real calendar dates, not in the future**, on the server (`planConversion`) and in the form
   (`DatePicker max`, inline message, submit disabled). Server slack: UTC today + 1 day.
8. **Save errors are surfaced.** `BatchMatrixEntry` shows a "Batch conversion not recorded"
   alert on the receipt when the lineage POST is refused or unreachable.
9. **Reads page through all rows** (1000 per page) ordered `created_at desc, id asc`.
   A unique-violation race now re-plans against fresh rows so the caller gets the precise reason.

### Open / for a decision

- **One conversion per lot** is kept (pending client decision); only the message is explicit.
- The eligibility check reads the whole effective ledger per save. Fine for save frequency;
  add a batch-scoped event query if it ever shows up in timings.
- The 1-day UTC slack on "not in the future" exists because the server does not know the plant's
  time zone. A configured plant time zone would let it be exact.
- No DB-level `CHECK (changed_qty > 0)` was added: existing rows may carry the legacy `0` default,
  and no migration was applied in this step.
- `components/entry/QuantityFlowBoard.tsx` is not mounted anywhere; it still prints `original.wip`
  as "Remain qty". Update it to `band.remainQty` if it is revived.
- Browser behaviour (date picker `max`, receipt alert) is covered by type checks and logic tests
  only; there is no component-test setup in this repo and it was not clicked through.
