# Batch conversion quantity flow

**Date:** 2026-10-18  
**Status:** approved for implementation  
**Surfaces:** Data Entry Convert Batch → `/batch-conversion` flow board → Audit Trail split track

## Intent

The plant training slide (one lot, `26I0126`) is the layout spec. A batch’s quantity splits at each station:

```
CHECKED = ACCEPT + HOLD + REJECT + WIP
```

Accepted of station N becomes checked of station N+1 on the **original** stream. Remain qty / WIP can peel off into a **Convert Batch** box. That convert stream is a **new size ID** (`26I17-30` → `26I17-16`) but Audit Trail still shows **one row** for the original lot, with the process track split original | convert.

Convert Batch on Data Entry opens this board with the original lot as the only reference. Entering convert quantity also asks for the **new size**.

## Decisions (locked)

| Decision | Choice |
|---|---|
| Converted identity | New size ID, same start-date stem (today’s `proposedConvertedBatchId`) |
| Audit list | One accordion on the original ID. Converted lot is not a second row |
| Process track | Unchanged when no conversion. Splits original \| convert when a lineage row exists |
| Convert quantity | Button on the convert half showing `changedQty`; opens Batch Conversion for that original lot |
| Maths | Deterministic JS only. Ledger + lineage. No model numbers |
| Isolation | `lib/analytics`, `lib/ingest/emit`, `lib/entry/batch-id` still do not import lineage. Join lives in lineage helpers + Audit / conversion UI |

## Layout spec (slide → UI)

The conversion page is a framed board, not the current horizontal form as the primary view. Station order follows the plant schema (Production → Secondary → Visual → Balloon → …).

```
We took a batch  26I17-30          [new size ▾]  [qty]  [Record]

┌ PRODUCTION ──────────────────────────────────────────── 8000 ─┐
│ [CHECKED 8000] = [ACCEPT 6000] + [HOLD 1500] + [REJ 500]     │
└───────────────┃───────────────────────────────────────────────┘
                ▼
┌ SECONDARY ────────────────────────────────────────────────────┐
│ [CHECKED 6000] = [ACCEPT 4000] + [HOLD 600] + [REJ 200] + [WIP 1200]
└───────────────┃────────────────────────────── remain qty ───┘
                ▼                                    │
┌ VISUAL ───────┃───────────────┬ CONVERT BATCH (26I17-16) ─────┐
│ CHECKED 2800  │ ACCEPT 1600   │ CHECKED 1200  ACCEPT 600      │
│ HOLD 450      │ REJ 250  WIP  │ HOLD 200      REJ 200   WIP   │
└───────────────┃───────────────┴────────────────────────────────┘
                ▼                         ▼
┌ BALLOON ──────┃───────────────┬ CONVERT BATCH ───────────────┐
│ CHECKED 1600  │ ACCEPT 1500   │ CHECKED 600   ACCEPT 400     │
│ HOLD 40       │ REJ 10   WIP  │ HOLD 100      REJ 30    WIP  │
└────────────────────────────────┴─────────────────────────────┘
```

Rules that match the slide:

1. **One original batch ID** in the header. Convert boxes show the **derived** new ID after size is picked.
2. **Convert boxes start at the change station** and continue on every later station (Visual convert, then Balloon convert). Earlier stations have no convert box.
3. **Remain qty** is the arrow from original WIP (or from accept not sent to the next original station) into the first convert box. That quantity is `changedQty`.
4. **Downstream convert checked** = previous convert accept (same as original: accept feeds next checked).
5. **WIP** on a band = `max(0, checked − accept − hold − reject)`.
6. Colours: original bands use process colours (production peach, secondary grey, assembly yellow/orange). Convert boxes use a distinct accent fill so the split is obvious.
7. Each cell is a labelled quantity chip (`CHECKED QTY`, `ACCEPT QTY`, `HOLD QTY`, `REJ QTY`, `WORK IN PROCESS`) in Geist Mono, matching Data Entry density.

Empty / partial lots: show the bands that exist in the schema; fill chips from ledger rows; zeros render as empty chips, not fake example numbers.

## Convert Batch activation

Existing link in `BatchIdentityZone` stays. It already goes to:

`/batch-conversion?fromBatch=&date=&stageId=&checked=&accepted=&hold=&reject=`

The conversion page **hydrates the original lot** from `fromBatch` (and stage/qty query as hints for “Changes at” and the qty field). It does not invent a new ID until the operator picks a new size.

On the board, the convert box (or a compact bar above it) collects:

- **Original batch** (read-only reference)
- **New size** (required, must differ from original)
- **Quantity changed** (required, ≤ remain/WIP at the change station)
- **Changes at** (station; default from `stageId` query)
- **Reason** + converted-on date
- Submit → existing `POST /api/batch-conversions`

After a successful write, the convert boxes fill with the new ID and the operator enters that lot from the change station forward (`BatchMatrixEntry` + `hideConvertBatch`, as today).

## Quantity sources

| Chip | Source |
|---|---|
| Original CHECKED / ACCEPT / HOLD / REJ | `AuditEntryRow` for that lot+station (`rework` is HOLD) |
| Original WIP | `checked − accepted − rework − rejected` (floor 0) |
| First convert CHECKED | lineage `changedQty` (until the converted lot has its own entry at that station) |
| Later convert chips | `AuditEntryRow` for `toBatch` at that station |
| Convert WIP | same identity as original WIP on those rows |

`passedForward` remains the accepted definition. The board never adds hold into accepted.

## Audit Trail

No conversion: current `BatchProcessTrack` + entry cards (image 3).

With a conversion whose `fromBatch` is this row:

- **Closed row:** still one original ID. Process track is two groups of pills, visually split (original left, convert right). Header checked/accepted/rejected stay the original lot’s figures.
- **Open row:** two columns of the existing station cards. Left = original entries. Right = convert entries from `stageId` downward, labelled `{from} CT {to}`.
- **Convert quantity** control on the convert column: label + `changedQty`. Click → `/batch-conversion?fromBatch=<original>`.
- **`toBatch` is omitted** from the batch list so `26I17-16` does not appear as a second accordion.

`useLineage()` is already on the Audit page. Pairing is a pure helper over `AuditBatchGroup[]` + `BatchConversion[]`.

## Architecture

```
Data Entry Convert Batch
        │  query: fromBatch, stage, qty hints
        ▼
/batch-conversion
  buildQuantityFlow(originalRows, convertRows, conversion?)
        │  POST /api/batch-conversions  (unchanged contract)
        ▼
lineage store (batch_conversions / memory)
        │
        ▼
Audit page
  attachConversionHalves(groups, conversions)
        → split BatchProcessTrack
        → convert cards + Convert quantity
```

New pure module: `src/lib/lineage/quantity-flow.ts` (flow board model).  
New pure module: `src/lib/lineage/audit-halves.ts` (pair groups, hide `toBatch` rows).  
UI: `src/components/entry/QuantityFlowBoard.tsx` used by the conversion page.  
Audit: extend `BatchProcessTrack` / `BatchAccordion` in `src/app/audit/page.tsx`.

Do not change `planConversion`, batch-id generation, or ledger event shapes.

## Errors (existing codes, shown on the board)

- New size required and different from original (`same-size`)
- `changedQty` positive integer, not more than remain qty at the station (`qty-invalid`)
- One outgoing conversion per original lot (`already-converted`)
- Converted ID keeps the original start date (`stem-mismatch`)

## Tests

- `quantity-flow.test.ts`: identity `checked = accept + hold + reject + wip`; convert stream starts at `stageId`; downstream convert checked follows convert accept; empty ledger → empty chips not demo numbers.
- `audit-halves.test.ts`: original group gains convert half; `toBatch` dropped from list; lots without conversion unchanged.
- Existing lineage isolation tests still pass.
- No jsdom; logic tests only.

## Out of scope

- Multiple simultaneous conversions from one lot
- Changing the ledger or `batch-id.ts`
- AI-generated quantities
- Replacing Data Entry’s own station UI
