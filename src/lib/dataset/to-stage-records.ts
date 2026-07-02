// Converts a recognized Dataset's rows into the existing StageDayRecord shape
// so they can flow through the ALREADY-TRUSTED /api/ingest reconciliation path
// (dedup, conflict Findings, corrections) — not a new emission mechanism.
import type { Dataset, DatasetRow } from "./types";
import type { StageDayRecord, SourcedValue } from "@/lib/ingest/emit";
import { toLocalISODate } from "@/lib/ingest/date";

function toNumber(v: string | number | null | undefined): number | null {
  if (v == null || v === "") return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  const n = Number(String(v).replace(/[, ]/g, ""));
  return Number.isFinite(n) ? n : null;
}

// Same measure-word families schema-extractor.ts / profile.ts already rely on.
const CHECKED_RE = /checked|quantity|qty|input|\brec\b|receiv|inspect/i;
const REJECTED_RE = /reject|\brej\b/i;
const GOOD_RE = /good|accept|acpt|\bok\b|pass/i;
const REWORK_RE = /rework|hold/i;

function sourced(
  value: number | null,
  header: string | undefined,
  sheet: string,
  rowIndex: number,
): SourcedValue | null {
  if (value === null || !header) return null;
  return { value: Math.round(value), cell: `${sheet}!r${rowIndex}`, header };
}

export function toStageRecords(dataset: Dataset, rows: DatasetRow[], ingestionId: string): StageDayRecord[] {
  if (!dataset.recognizedStageId) return [];
  const dateCol = dataset.columns.find((c) => c.role === "dimension-date");
  if (!dateCol) return [];

  const measureCols = dataset.columns.filter((c) => c.role === "measure");
  // Rejected is matched before checked: "rejection qty" must resolve to the
  // rejected slot even though "qty" is also a checked-family word.
  const rejectedCol = measureCols.find((c) => REJECTED_RE.test(c.name));
  const checkedCol = measureCols.find((c) => c !== rejectedCol && CHECKED_RE.test(c.name));
  const goodCol = measureCols.find((c) => c !== rejectedCol && c !== checkedCol && GOOD_RE.test(c.name));
  const reworkCol = measureCols.find((c) => REWORK_RE.test(c.name));
  const defectCols = dataset.columns.filter((c) => c.role === "defect");

  const out: StageDayRecord[] = [];
  for (const row of rows) {
    const iso = toLocalISODate(row.values[dateCol.name]);
    if (!iso) continue;

    // Per-size sheets name the sheet after the French size (e.g. "16FR") —
    // same extraction schema-extractor.ts's classifyWithSchema performs.
    const sizeMatch = row.sheetName.trim().match(/^(\d+)\s*FR$/i);
    const size = sizeMatch ? `Fr${sizeMatch[1]}` : null;

    const defects = defectCols
      .map((c) => ({
        raw: c.name,
        value: toNumber(row.values[c.name]) ?? 0,
        cell: `${row.sheetName}!r${row.rowIndex}`,
      }))
      .filter((d) => d.value > 0)
      .map((d) => ({ ...d, value: Math.round(d.value) }));

    out.push({
      occurredOn: { kind: "day", start: iso, end: iso },
      stageId: dataset.recognizedStageId,
      size,
      source: { file: row.fileName, fileHash: "local", sheet: row.sheetName, tableId: "t1" },
      checked: sourced(checkedCol ? toNumber(row.values[checkedCol.name]) : null, checkedCol?.name, row.sheetName, row.rowIndex),
      acceptedGood: sourced(goodCol ? toNumber(row.values[goodCol.name]) : null, goodCol?.name, row.sheetName, row.rowIndex),
      rework: sourced(reworkCol ? toNumber(row.values[reworkCol.name]) : null, reworkCol?.name, row.sheetName, row.rowIndex),
      rejected: sourced(rejectedCol ? toNumber(row.values[rejectedCol.name]) : null, rejectedCol?.name, row.sheetName, row.rowIndex),
      defects,
      statedPct: null,
      extractedBy: "heuristic",
      ingestionId,
    });
  }
  return out;
}
