# 05 · Ingestion Pipeline

Two tracks, one intermediate type (`StageDayRecord`), one emit step. Both tracks feed the same store.

## 5.1 StageDayRecord (intermediate, `src/lib/ingest/emit.ts`)
```
occurredOn: Period
stageId: string
size: string | null
source: { file, fileHash, sheet, tableId }
checked | acceptedGood | rework | rejected : SourcedValue | null   // {value, cell, header}
defects: { raw, value, cell }[]
statedPct: { value, cell, formula } | null
extractedBy: "heuristic" | "llm:<m>" | "direct-entry"
ingestionId: string
comment?: string | null
```

## 5.2 Track A — Excel (`src/lib/ingest/parsers/`)
**`recordsFromBuffer(buf, fileName)`** (pure, fs-free → runs in browser AND server; used by both `/staging` upload and disk seeding):
1. `routeFamily(basename)` → family.
2. dispatch to the family parser, passing the **basename** to rejection/assembly (their cell provenance embeds the name, length-capped) but the **full path** to size-wise (needs the folder hint as a fallback).

### Family parsers
- **parse-size-wise** — per-FR size sheets (`6FR`…`26FR`).
  - **Valve vs Visual detection from sheet CONTENT** (not just filename, because uploads are basename-only): scan first FR/COMMULATIVE sheet → `"VALVE INTEGRITY" | "STRUCK BALLOON" | "BALLOM BRUST"` ⇒ valve book; `"REASON FOR REJECTION" | "REC. QTY"` ⇒ visual book; default visual.
  - **Valve book** emits two records per data row: `stageId:"balloon"` (CHECKED col 3, REJ col 6, defects 8–11 = Struck Balloon/Balloon Burst/Leakage/Others) and `stageId:"valve-integrity"` (CHECKED col 15, REJ col 18, defects 20–24 = Leakage/90-10/Bubble/Thin Spot/Others).
  - **Visual book** emits `stageId:"visual"`: dynamic header (REC. QTY / REJ. QTY), defect cols after "REASON FOR REJECTION".
- **parse-rejection-analysis** → `classifyRejectionSheets` — monthly books, sheet name → stage (`visual|balloon|valve|final` regex). Reads DATE / CHECKED-QTY / REJECTION. No defects. `statedPct` captured as claim.
- **parse-assembly-daily** — fixed-column daily activity (A=date,B=vChk,C=vAcc,D=vRej,F=bChk,…). Emits 4 stage records/row. *(Currently unused — DAILY ACTIVITY routed to null.)*

### Header detection (shared, in `src/lib/parser.ts`)
`detectHeaderRow` (score = distinct non-empty string cells; must have a HEADER_HINT word like qty/date/rej; followed within 4 rows by a numeric row) + `buildHeaderBlock` (merges a 2–3 row header: main + "1 2 …" ordinal + "COAG SD …" code row → per-column names). Guards: a reason-legend row must not out-score the real header; blank spacer rows between header and data are skipped.

## 5.3 Track B — Direct entry (`/data-entry`)
Manual form → `StageDayRecord` with `extractedBy:"direct-entry"`, synthetic cells (`"ENTRY!checked"`). Supports custom add/remove fields (`addField`/`removeField`). Same emit path. Manual `good` IS reliable here (operator types it), unlike parsed sheets.

## 5.4 Generic fallback (unknown layouts, `schema-extractor.ts`)
`extractSchemaFromWorkbook(wb, fileName)` → per-sheet role classification by header regex (date/checked/good/rework/rejected/defect/formula/other) + Excel formula translation. `classifyWithSchema(rawSheets, schema, ingestionId)` maps rows → records (matches the sheet-name **suffix** against `"file - sheet"` names). Used only when a family parser yields nothing.

## 5.5 Staging flow (`/staging`)
1. Upload **all** files (UploadZone passes the whole array — do not process only `files[0]`).
2. Per file: archive → `fileHash`; `recordsFromBuffer`; else generic fallback.
3. Accumulate all records → `dedupeByPrecedence` (cross-file) → editable **review grid**.
4. Grid: per-cell edit, swap checked↔rejected, per-row comment, validation highlights.
5. **Publish** → `POST /api/ingest` → `checkRecord` (validation) → `reconcileConflicts` vs existing → `emitMany` → `store.append` → Findings for conflicts.

## 5.6 `/api/ingest` responsibilities
Validation issues (non-blocking, surfaced), conflict detection (`V-010` value-conflict Finding when same stage·size·date has a different rejected count), idempotent append, per-stage rollup for the success summary. Active registry pulled from `registries` table (fallback to static).
