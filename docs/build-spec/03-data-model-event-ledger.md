# 03 · Data Model — the Canonical Event Ledger

The heart of the system. **Append-only**, defined as a Zod **discriminated union on `eventType`** in `src/lib/contract/d1.ts`, re-exported as `Event` from `src/lib/store/types.ts`. `SCHEMA_VERSION = "1.0.0"`.

## 3.1 Why an event ledger (not relational rows)
- **Native audit trail** (ALCOA+): nothing is mutated; corrections *supersede*.
- **Idempotency:** `eventId` is a content hash → appending the same fact twice is a no-op.
- **Order-independent correctness:** the read-side canonicalizer tolerates any ingestion order / duplication.
- **Provenance on every fact:** cell refs, file hash, formula text travel with the number.

## 3.2 Shared primitives
```
CellRef        = string, 1..160 chars
PeriodKind     = "day" | "week" | "month" | "fiscal-year"
Period         = { kind: PeriodKind, start: "YYYY-MM-DD", end: "YYYY-MM-DD" }   // end inclusive; ==start for day
Disposition    = "accepted" | "rejected" | "rework" | "hold" | "downgrade"
Unit           = "pcs" | "trolleys"
ConfidenceBasis= "exact" | "heuristic" | "llm" | "external-cached"
Confidence     = { score: 0..1, basis }   // refine: external-cached ⇒ score ≤ 0.5
```

### Provenance (travels on every event)
```
file, fileHash (sha256 of bytes), sheet (verbatim), tableId ("t1"/"t2"),
cells: CellRef[] (≥1), headerPath: string[] (top row first),
rowLabel: string|null, formulaText: string|null,
cachedValue: string|number|null, externalRef: string|null,
// flattened mirrors for SQL/RLS:
provenance_file?, provenance_coordinate?, provenance_hash?, is_direct_entry?
```

## 3.3 Envelope — spread into EVERY event
```
eventId        string   // content hash, 32 hex chars (see §3.6)
schemaVersion  string
ingestionId    string
occurredOn     Period
provenance     Provenance
confidence     Confidence
extractedBy    string   // "heuristic" | "llm:<model-id>" | "direct-entry"
recordedAt     ISO datetime
supersededBy   string|null   // set ONLY via a CorrectionEvent
```

## 3.4 The 8 event variants (discriminator `eventType`)
| eventType | payload fields |
|---|---|
| **production** | stageId, quantity (int ≥0), unit, batchNo \|null, size \|null |
| **inspection** | stageId, **disposition** (Disposition), quantity, unit, batchNo, size |
| **rejection** | stageId, **defectCode** \|null (registry id; null ⇒ Finding), **defectCodeRaw** (verbatim, e.g. "Overlaping"), quantity, unit, batchNo, size |
| **carryover** | carryoverKind ("hold-resolution"\|"period-bridge"\|"stage-handoff"), fromRef, toRef, quantity, unit |
| **aggregate-claim** | claimKind ("sum"\|"percentage"\|"external-pull"\|"derived"), **statedValue** (number\|string — keeps `"#DIV/0!"` verbatim), aggregation ("daily"\|"weekly"\|"monthly"\|"fiscal-year"), aboutStageId \|null, aboutDefectCode \|null |
| **correction** | supersedesEventId, replacementEventId \|null, reason, authorisedBy (adjudication ref; never system) |
| **annotation** | targetEventIds[], targetCells[], text, author ("steward"\|"gm"\|"system"), findingId \|null, verdict ("mistake"\|"intentional"\|"unsure") \|null |
| **dispatch** | quantity, unit |

```ts
CanonicalEvent = z.discriminatedUnion("eventType", [
  ProductionEvent, InspectionEvent, RejectionEvent, CarryoverEvent,
  AggregateClaimEvent, CorrectionEvent, AnnotationEvent, DispatchEvent,
]);
```

## 3.5 How a stage·day record becomes events (`emit.ts`)
One `StageDayRecord` → up to several events:
- `checked` (≥0 int) → **ProductionEvent**
- `rejected` → **InspectionEvent(disposition="rejected")**; `acceptedGood` → `accepted`; `rework` → `rework`
- each `defects[]` entry → **RejectionEvent** (`defectCode = resolveDefect(raw)`, `defectCodeRaw = raw`)
- `statedPct` → **AggregateClaimEvent(percentage)** — a claim to verify, **never** summed into a metric

Negative / non-integer values are dropped at emit (guarded).

## 3.6 Identity hashing (`src/lib/contract/hash.ts`)
```
canonicalize(v) = JSON.stringify(sortDeep(v))      // arrays keep order; object keys sorted
sha256(s)       = crypto sha256 hex
hashEvent({eventType, occurredOn, provenance, payload}) = sha256(canonicalize(...)).slice(0,32)
   // EXCLUDES eventId, recordedAt, ingestionId, supersededBy, extractedBy, confidence (non-identity)
hashFinding({ruleId, subtype, evidenceEventIds}) = sha256(canonicalize({ruleId, subtype, evidenceEventIds:[...].sort()})).slice(0,32)
```
Two emits of the same physical fact → identical `eventId` → store dedups automatically.

## 3.7 LLM-facing candidate schemas (classification only — never numbers)
`CandidateSheetGraph` { sheet, isTemplate (e.g. VISUAL "FORMATE" ⇒ true ⇒ skipped), tables[] }; `CandidateTable` { tableId, sheet, topLeftCell, bottomRightCell, grain ("day"\|"batch"\|"month"), columns[], rowClasses[] }; `CandidateColumn.role ∈ {date, batch-no, size, quantity-in, quantity-accepted, quantity-rejected, quantity-hold, quantity-downgrade, defect-count, percentage, remarks, ignore}`; `CandidateRowClass ∈ {data, subtotal-weekly, total-monthly, percentage, marker, legend, header, doc-meta, unknown}`. The model proposes structure; deterministic code reads the values.
