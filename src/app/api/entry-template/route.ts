// src/app/api/entry-template/route.ts
// Data Entry = a generated view of the verified ontology (ADD §18).
//   GET /api/entry-template           → template from ALL of the company's verified MODs
//   GET /api/entry-template?modId=X   → template from one MOD lineage's verified version
//
// Columns come from the workbook that defined each stage — not a company-wide
// hardcoded defect catalog. Preference order when multiple MODs define a stage:
//   1. MOD with real sheet layout (uploaded workbook)
//   2. Non-migrated lineage over seed/migration synthetic docs
// Defects for a stage prefer verified defect *entities* on that stage's sheet
// region (the Excel columns); fall back to that document's stage-scoped catalog.

import { NextRequest, NextResponse } from "next/server";
import { getModStore } from "@/core/ontology/store/mod-store";
import type { ModRowT, ModDocumentT, ModEntityT } from "@/shared/models/ontology";

const CAPTURE_COLUMNS: Record<string, { key: string; label: string }> = {
  checked:  { key: "checked",      label: "Checked Qty" },
  accepted: { key: "acceptedGood", label: "Good Qty" },
  hold:     { key: "rework",       label: "Rework Qty" },
  rejected: { key: "rejected",     label: "Rejected Qty" },
};

export type EntryTemplateStage = {
  stageId: string;
  label: string;
  sizeWise: boolean;
  isQualityGate: boolean;
  columns: { key: string; label: string; type: "number"; required: boolean }[];
  defects: { defectCode: string; label: string }[];
  layout: {
    sheet: string;
    tableId: string;
    headerRows: (string | number | null)[][];
    merges: unknown[];
  } | null;
  /** Internal ranking — not required by clients */
  _score?: number;
};

function isMigratedDoc(doc: ModDocumentT): boolean {
  return doc.workbook.fileHash === "migrated"
    || /\(migrated\)/i.test(doc.workbook.fileName)
    || doc.workbook.fileName.startsWith("disposafe-registry")
    || doc.workbook.fileName.startsWith("preset:");
}

function regionKey(e: { original: { sheet: string; tableId?: string | null } }): string {
  return `${e.original.sheet}::${e.original.tableId ?? "t1"}`;
}

function humanize(name: string): string {
  return name.trim().replace(/\s+/g, " ").toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
}

/** Defect columns that actually appear as mapped entities on this stage's sheets. */
function defectsFromEntities(
  entities: ModEntityT[],
  stageId: string,
  stageOfRegion: Map<string, string>,
): { defectCode: string; label: string }[] {
  const out = new Map<string, { defectCode: string; label: string }>();
  for (const e of entities) {
    if (e.kind !== "defect" || !e.canonical?.startsWith("DEFECT:")) continue;
    if (stageOfRegion.get(regionKey(e)) !== stageId) continue;
    const code = e.canonical.slice("DEFECT:".length);
    if (!out.has(code)) {
      out.set(code, {
        defectCode: code,
        // Prefer the sheet header the operator will recognize
        label: e.original.header?.trim() || humanize(code),
      });
    }
  }
  return [...out.values()];
}

function stageScore(hasLayout: boolean, migrated: boolean, defectSource: "entities" | "catalog"): number {
  // Higher wins when multiple MODs claim the same stageId.
  return (hasLayout ? 4 : 0) + (migrated ? 0 : 2) + (defectSource === "entities" ? 1 : 0);
}

function templateFrom(rows: ModRowT[]) {
  const stages = new Map<string, EntryTemplateStage>();
  const sizes = new Map<string, { sizeId: string; label: string }>();
  const validation: { ruleId: string; expr: string; severity: string }[] = [];
  const seenRules = new Set<string>();

  for (const row of rows) {
    const doc = row.document;
    const migrated = isMigratedDoc(doc);

    const stageOfRegion = new Map<string, string>();
    for (const e of doc.entities) {
      if (e.kind === "stage" && e.canonical?.startsWith("STAGE:")) {
        // Published MOD: accept verified stages; migration seeds mark verified too.
        if (e.verified || e.resolvedBy === "user") {
          stageOfRegion.set(regionKey(e), e.canonical.slice("STAGE:".length));
        }
      }
    }

    for (const s of doc.stages) {
      const captures = s.captures ?? [];
      const columns = captures
        .map((c) => CAPTURE_COLUMNS[c])
        .filter(Boolean)
        .map((c) => ({ ...c, type: "number" as const, required: c.key === "checked" || c.key === "rejected" }));

      // Prefer Excel-mapped defect columns; catalog is fallback only for that doc.
      const entityDefects = defectsFromEntities(doc.entities, s.stageId, stageOfRegion);
      const catalogDefects = (doc.defects ?? [])
        .filter((d) => d.stages.includes(s.stageId))
        .map((d) => ({ defectCode: d.defectCode, label: d.label }));
      const defects = entityDefects.length > 0 ? entityDefects : catalogDefects;
      const defectSource: "entities" | "catalog" = entityDefects.length > 0 ? "entities" : "catalog";

      const regionEntry = [...stageOfRegion.entries()].find(([, id]) => id === s.stageId);
      let layout: EntryTemplateStage["layout"] = null;
      if (regionEntry) {
        const [sheet, tableId] = regionEntry[0].split("::");
        const l = doc.layout.find((x) => x.sheet === sheet && (x.tableId ?? "t1") === tableId);
        if (l && l.headerRows?.length) {
          layout = { sheet, tableId, headerRows: l.headerRows, merges: l.merges };
        }
      }
      // Migration presets sometimes store layout without stage entities.
      if (!layout) {
        const byLabel = doc.layout.find(
          (x) => x.sheet === s.label || x.sheet === s.stageId,
        );
        if (byLabel?.headerRows?.length) {
          layout = {
            sheet: byLabel.sheet,
            tableId: byLabel.tableId ?? "t1",
            headerRows: byLabel.headerRows,
            merges: byLabel.merges,
          };
        }
      }

      const score = stageScore(!!layout, migrated, defectSource);
      const existing = stages.get(s.stageId);
      if (existing && (existing._score ?? 0) >= score) continue;

      stages.set(s.stageId, {
        stageId: s.stageId,
        label: s.label,
        sizeWise: !!s.sizeWise,
        isQualityGate: !!s.isQualityGate,
        columns,
        defects,
        layout,
        _score: score,
      });
    }

    for (const sz of doc.sizes) if (!sizes.has(sz.sizeId)) sizes.set(sz.sizeId, sz);
    for (const v of doc.validation) {
      if (!seenRules.has(v.ruleId)) {
        seenRules.add(v.ruleId);
        validation.push(v);
      }
    }
  }

  // Strip internal score before shipping to the client.
  const stageList = [...stages.values()].map(({ _score, ...rest }) => rest);

  return {
    stages: stageList,
    sizes: [...sizes.values()],
    validation,
    generatedFrom: rows.map((r) => ({
      modId: r.modId,
      version: r.version,
      fileName: r.document.workbook.fileName,
    })),
  };
}

export async function GET(req: NextRequest) {
  try {
    const store = getModStore();
    const modId = req.nextUrl.searchParams.get("modId");

    let rows: ModRowT[];
    if (modId) {
      const row = await store.activeFor(modId);
      if (!row) {
        return NextResponse.json({ error: `No verified MOD for lineage ${modId}` }, { status: 404 });
      }
      rows = [row];
    } else {
      const company = process.env.MOID_COMPANY_ID || "default";
      rows = await store.verified(company);
      if (rows.length === 0) {
        return NextResponse.json(
          { error: "No verified MODs yet — upload and verify a workbook first." },
          { status: 404 },
        );
      }
    }

    return NextResponse.json({ template: templateFrom(rows) });
  } catch (err: unknown) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to build entry template" },
      { status: 500 },
    );
  }
}
