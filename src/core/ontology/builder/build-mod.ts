// src/core/ontology/builder/build-mod.ts
// Verified (or proposed) mappings + profile + snapshot → ModDocument.
// deriveCatalogs is pure over entities so /api/mods/verify can re-derive the
// stage/defect/size catalogs after every user decision without re-profiling.

import type { ModDocumentT, ModEntityT } from "@/shared/models/ontology";
import type { MappingProposalT } from "@/shared/models/entities";
import type { ProfilingTable, ColumnProfile } from "@/core/profiler/types";
import type { WorkbookSnapshotT } from "@/shared/models/workbook";
import type { StageCapture } from "@/lib/contract/d1";
import type { z } from "zod";

const CAPTURE_BY_CONCEPT: Record<string, z.infer<typeof StageCapture>> = {
  CHECKED_QTY: "checked", ACCEPTED_QTY: "accepted", REWORK_QTY: "hold", REJECTED_QTY: "rejected",
};

function humanize(name: string): string {
  return name.trim().replace(/\s+/g, " ").toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
}

export function proposalToEntity(p: MappingProposalT, verified: boolean): ModEntityT {
  return {
    entityId: p.entityId, kind: p.kind, original: p.original, canonical: p.canonical,
    subcategory: p.subcategory, confidence: p.confidence, resolvedBy: p.resolvedBy,
    reason: p.reason, verified,
  };
}

/** Derive the canonical stage/defect/size catalogs from entities. Pure. */
export function deriveCatalogs(entities: ModEntityT[]): Pick<ModDocumentT, "stages" | "defects" | "sizes" | "relationships"> {
  // sheet → stage id resolved for that sheet
  const stageOfSheet = new Map<string, string>();
  for (const e of entities) {
    if (e.kind === "stage" && e.canonical?.startsWith("STAGE:")) {
      stageOfSheet.set(e.original.sheet, e.canonical.slice("STAGE:".length));
    }
  }
  const sizeSheets = new Set(entities.filter((e) => e.kind === "size" && e.canonical).map((e) => e.original.sheet));

  const stages = new Map<string, ModDocumentT["stages"][number]>();
  for (const e of entities) {
    if (e.kind !== "stage" || !e.canonical?.startsWith("STAGE:")) continue;
    const stageId = e.canonical.slice("STAGE:".length);
    const existing = stages.get(stageId);
    const sizeWise = sizeSheets.has(e.original.sheet);
    if (existing) {
      if (sizeWise) existing.sizeWise = true;
      continue;
    }
    stages.set(stageId, {
      stageId,
      // A size tab ("16FR") is a poor stage label — prefer the stage id itself.
      label: sizeSheets.has(e.original.sheet) ? humanize(stageId.replace(/-/g, " ")) : humanize(e.original.header),
      effectiveFrom: null, effectiveTo: null, upstream: [],
      sizeWise, captures: [], isQualityGate: false,
    });
  }

  // Captures per stage: which measure concepts appear on that stage's sheets.
  for (const e of entities) {
    if (e.kind !== "measure" || !e.canonical) continue;
    const capture = CAPTURE_BY_CONCEPT[e.canonical];
    if (!capture) continue;
    const stageId = stageOfSheet.get(e.original.sheet);
    const stage = stageId ? stages.get(stageId) : undefined;
    if (stage && !stage.captures!.includes(capture)) stage.captures!.push(capture);
  }
  for (const s of stages.values()) {
    s.isQualityGate = !!s.captures?.includes("rejected");
  }

  const defects = new Map<string, ModDocumentT["defects"][number]>();
  for (const e of entities) {
    if (e.kind !== "defect" || !e.canonical?.startsWith("DEFECT:")) continue;
    const code = e.canonical.slice("DEFECT:".length);
    const stageId = stageOfSheet.get(e.original.sheet);
    const existing = defects.get(code);
    if (existing) {
      if (!existing.aliases.includes(e.original.header)) existing.aliases.push(e.original.header);
      if (stageId && !existing.stages.includes(stageId)) existing.stages.push(stageId);
      continue;
    }
    defects.set(code, {
      defectCode: code,
      label: humanize(e.original.header),
      aliases: [e.original.header],
      stages: stageId ? [stageId] : [],
    });
  }

  const sizes = new Map<string, ModDocumentT["sizes"][number]>();
  for (const e of entities) {
    if (e.kind !== "size" || !e.canonical?.startsWith("SIZE:")) continue;
    const sizeId = e.canonical.slice("SIZE:".length);
    if (!sizes.has(sizeId)) sizes.set(sizeId, { sizeId, label: `${sizeId.replace(/^Fr/, "")} FR` });
  }

  const relationships: ModDocumentT["relationships"] = [];
  for (const e of entities) {
    if (e.kind === "stage" && e.canonical) relationships.push({ kind: "sheet-represents-stage", from: e.original.sheet, to: e.canonical });
    if (e.kind === "size" && e.canonical) relationships.push({ kind: "size-of-sheet", from: e.original.sheet, to: e.canonical });
    if (e.kind === "measure" && e.canonical) relationships.push({ kind: "column-measures", from: e.entityId, to: e.canonical });
    if (e.kind === "defect" && e.canonical) {
      const stageId = stageOfSheet.get(e.original.sheet);
      if (stageId) relationships.push({ kind: "defect-of-stage", from: e.entityId, to: `STAGE:${stageId}` });
    }
  }

  return {
    stages: [...stages.values()],
    defects: [...defects.values()],
    sizes: [...sizes.values()].sort((a, b) => Number(a.sizeId.slice(2)) - Number(b.sizeId.slice(2))),
    relationships,
  };
}

export interface ProfiledSheet {
  table: ProfilingTable;
  columns: ColumnProfile[];
}

/** Assemble the full draft ModDocument for one workbook. */
export function buildModDocument(args: {
  companyId: string;
  snapshot: WorkbookSnapshotT;
  sheets: ProfiledSheet[];
  proposals: MappingProposalT[];
  fiscalYearStartMonth?: number;
}): ModDocumentT {
  const { companyId, snapshot, sheets, proposals } = args;
  const entities = proposals.map((p) => proposalToEntity(p, false));
  const catalogs = deriveCatalogs(entities);

  const formulas: ModDocumentT["formulas"] = [];
  for (const s of sheets) {
    for (const col of s.columns) {
      if (col.formula && col.formula.kind !== "none") {
        formulas.push({
          sheet: s.table.sheetName,
          colLetter: col.colLetter,
          class: col.formula.kind,
          refs: "refs" in col.formula ? col.formula.refs : "ref" in col.formula ? [col.formula.ref] : "range" in col.formula ? [col.formula.range] : [],
          translated: null,
        });
      }
    }
  }

  const layout: ModDocumentT["layout"] = sheets.map((s) => {
    const snapSheet = snapshot.sheets.find((x) => x.name === s.table.sheetName);
    const headerEnd = s.table.firstDataRow - 1; // 1-based first data row → 0-based header rows [0, headerEnd)
    const headerRows: (string | number | null)[][] = [];
    if (snapSheet) {
      const width = s.table.header.length;
      for (let r = 0; r < headerEnd; r++) {
        const row: (string | number | null)[] = Array(width).fill(null);
        for (const cell of snapSheet.cells) {
          if (cell.r === r && cell.c < width && (typeof cell.v === "string" || typeof cell.v === "number")) row[cell.c] = cell.v;
        }
        headerRows.push(row);
      }
    }
    return {
      sheet: s.table.sheetName,
      headerRows,
      merges: (snapSheet?.merges ?? []).filter((m) => m.e.r < headerEnd),
      columnOrder: s.columns.map((c) => `col:${s.table.sheetName}:${c.colLetter}`),
    };
  });

  // Default validation rules — only where the measures to check actually exist.
  const canonicals = new Set(entities.map((e) => e.canonical));
  const validation: ModDocumentT["validation"] = [];
  if (canonicals.has("CHECKED_QTY") && canonicals.has("REJECTED_QTY")) {
    validation.push({ ruleId: "V-BAL-1", expr: "CHECKED_QTY >= REJECTED_QTY", severity: "warning" });
  }
  if (canonicals.has("REJECTED_QTY") && entities.some((e) => e.kind === "defect")) {
    validation.push({ ruleId: "V-BAL-2", expr: "SUM(DEFECT:*) == REJECTED_QTY", severity: "warning" });
  }

  return {
    companyId,
    workbook: { fileName: snapshot.fileName, fileHash: snapshot.snapshotId, sheetNames: snapshot.sheets.map((s) => s.name) },
    entities,
    ...catalogs,
    sizes: catalogs.sizes,
    fiscalYearStartMonth: args.fiscalYearStartMonth ?? 4,
    formulas,
    layout,
    validation,
  };
}
