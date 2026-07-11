// src/core/ingest/extract-from-mod.ts
// Verified MOD + lossless snapshot → StageDayRecord[] (Phase 3, TDD §1).
// The single successor of the family parsers, classifyWithSchema, and
// dataset/to-stage-records: extraction is driven entirely by the MOD's
// verified entities — no filename routing, no header regexes, no fallbacks.
// Records flow into the ALREADY-TRUSTED emit + ingest reconciliation path.

import type { ModDocumentT, ModEntityT } from "@/shared/models/ontology";
import type { WorkbookSnapshotT, SnapshotSheetT } from "@/shared/models/workbook";
import type { StageDayRecord, SourcedValue, DefectValue } from "@/lib/ingest/emit";
import { toLocalISODate } from "@/lib/ingest/date";

function colLabelToIndex(label: string): number {
  let idx = 0;
  for (let i = 0; i < label.length; i++) idx = idx * 26 + (label.charCodeAt(i) - 64);
  return idx - 1;
}

/** Parse the "A1:N50" used-range origin so profiler-relative column letters and
 *  row indices line up with the snapshot's absolute coordinates. */
function rangeOrigin(ref: string | null): { r: number; c: number } {
  const m = ref?.match(/^([A-Z]+)(\d+)/);
  if (!m) return { r: 0, c: 0 };
  return { r: Number(m[2]) - 1, c: colLabelToIndex(m[1]) };
}

function toNumber(v: unknown): number | null {
  if (v == null || v === "") return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  const n = Number(String(v).replace(/[, ]/g, ""));
  return Number.isFinite(n) ? n : null;
}

/** Dense relative grid over a snapshot sheet's used range. Excel ERROR cells
 *  (t === "e") carry the error CODE in v (e.g. #VALUE! = 15) — the snapshot
 *  keeps them (lossless), but extraction must never read one as a quantity,
 *  so their value is nulled here. */
function grid(sheet: SnapshotSheetT): Map<string, { v: unknown; f: string | null }> {
  const origin = rangeOrigin(sheet.ref);
  const map = new Map<string, { v: unknown; f: string | null }>();
  for (const cell of sheet.cells) {
    map.set(`${cell.r - origin.r},${cell.c - origin.c}`, { v: cell.t === "e" ? null : cell.v, f: cell.f });
  }
  return map;
}

interface SheetPlan {
  stageId: string;
  size: string | null;
  dateCol: ModEntityT | null;
  checked: ModEntityT | null;
  accepted: ModEntityT | null;
  rework: ModEntityT | null;
  rejected: ModEntityT | null;
  statedPct: ModEntityT | null;
  defects: ModEntityT[];
}

function planFor(sheet: string, entities: ModEntityT[]): SheetPlan | null {
  const here = entities.filter((e) => e.original.sheet === sheet && e.verified && e.canonical);
  const stage = here.find((e) => e.kind === "stage" && e.canonical!.startsWith("STAGE:"));
  if (!stage) return null; // a sheet with no verified stage never reaches the ledger

  const size = here.find((e) => e.kind === "size" && e.canonical!.startsWith("SIZE:"));
  const byCanonical = (c: string) => here.find((e) => e.original.colLetter !== null && e.canonical === c) ?? null;

  return {
    stageId: stage.canonical!.slice("STAGE:".length),
    size: size ? size.canonical!.slice("SIZE:".length) : null,
    dateCol: byCanonical("DATE"),
    checked: byCanonical("CHECKED_QTY"),
    accepted: byCanonical("ACCEPTED_QTY"),
    rework: byCanonical("REWORK_QTY"),
    rejected: byCanonical("REJECTED_QTY"),
    statedPct: byCanonical("STATED_PCT"),
    defects: here.filter((e) => e.kind === "defect" && e.original.colLetter !== null && e.canonical!.startsWith("DEFECT:")),
  };
}

export function extractFromMod(
  doc: ModDocumentT,
  snapshot: WorkbookSnapshotT,
  ingestionId: string,
  modRef?: { modId: string; modVersion: number },
): StageDayRecord[] {
  const records: StageDayRecord[] = [];

  for (const layout of doc.layout) {
    const plan = planFor(layout.sheet, doc.entities);
    if (!plan || !plan.dateCol) continue; // no stage or no time axis → nothing day-level to extract

    const snapSheet = snapshot.sheets.find((s) => s.name === layout.sheet);
    if (!snapSheet) continue;
    const origin = rangeOrigin(snapSheet.ref);
    const cells = grid(snapSheet);
    const dataStart = layout.headerRows.length; // relative row index of the first data row

    // Highest populated relative row.
    const maxRel = snapSheet.cells.reduce((m, c) => Math.max(m, c.r - origin.r), -1);

    const at = (rel: number, entity: ModEntityT | null) =>
      entity?.original.colLetter != null ? cells.get(`${rel},${colLabelToIndex(entity.original.colLetter)}`) : undefined;
    const cellRef = (rel: number, entity: ModEntityT) =>
      `${layout.sheet}!${entity.original.colLetter}${origin.r + rel + 1}`;
    const sourced = (rel: number, entity: ModEntityT | null): SourcedValue | null => {
      if (!entity) return null;
      const n = toNumber(at(rel, entity)?.v);
      return n === null ? null : { value: Math.round(n), cell: cellRef(rel, entity), header: entity.original.header };
    };

    for (let rel = dataStart; rel <= maxRel; rel++) {
      const iso = toLocalISODate(at(rel, plan.dateCol)?.v);
      if (!iso) continue; // subtotal rows, "SUNDAY" markers, trailing padding

      const defects: DefectValue[] = [];
      for (const d of plan.defects) {
        const n = toNumber(at(rel, d)?.v);
        if (n !== null && n > 0) defects.push({ raw: d.original.header, value: Math.round(n), cell: cellRef(rel, d) });
      }

      let statedPct: StageDayRecord["statedPct"] = null;
      if (plan.statedPct) {
        const c = at(rel, plan.statedPct);
        const n = toNumber(c?.v);
        if (n !== null) statedPct = { value: n, cell: cellRef(rel, plan.statedPct), formula: c?.f ?? null };
      }

      records.push({
        occurredOn: { kind: "day", start: iso, end: iso },
        stageId: plan.stageId,
        size: plan.size,
        source: { file: snapshot.fileName, fileHash: snapshot.snapshotId, sheet: layout.sheet, tableId: "t1" },
        checked: sourced(rel, plan.checked),
        acceptedGood: sourced(rel, plan.accepted),
        rework: sourced(rel, plan.rework),
        rejected: sourced(rel, plan.rejected),
        defects,
        statedPct,
        extractedBy: "mod",
        ingestionId,
        modId: modRef?.modId ?? null,
        modVersion: modRef?.modVersion ?? null,
      });
    }
  }

  return records;
}
