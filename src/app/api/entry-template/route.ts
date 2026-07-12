// src/app/api/entry-template/route.ts
// Data Entry = a generated view of the verified ontology (ADD §18).
//   GET /api/entry-template           → template from ALL of the company's verified MODs
//   GET /api/entry-template?modId=X   → template from one MOD lineage's verified version
// The grid definition is derived entirely from MOD catalogs + layout — no
// presets, no DEFAULT_FIELDS, no hardcoded capture templates.

import { NextRequest, NextResponse } from "next/server";
import { getModStore } from "@/core/ontology/store/mod-store";
import type { ModRowT } from "@/shared/models/ontology";

const CAPTURE_COLUMNS: Record<string, { key: string; label: string }> = {
  checked:  { key: "checked",      label: "Checked Qty" },
  accepted: { key: "acceptedGood", label: "Good Qty" },
  hold:     { key: "rework",       label: "Rework Qty" },
  rejected: { key: "rejected",     label: "Rejected Qty" },
};

function templateFrom(rows: ModRowT[]) {
  const stages = new Map<string, {
    stageId: string; label: string; sizeWise: boolean; isQualityGate: boolean;
    columns: { key: string; label: string; type: "number"; required: boolean }[];
    defects: { defectCode: string; label: string }[];
    layout: { sheet: string; tableId: string; headerRows: (string | number | null)[][]; merges: unknown[] } | null;
  }>();
  const sizes = new Map<string, { sizeId: string; label: string }>();
  const validation: { ruleId: string; expr: string; severity: string }[] = [];
  const seenRules = new Set<string>();

  for (const row of rows) {
    const doc = row.document;
    // region → stage id, to attach each stage's source layout
    const stageOfRegion = new Map<string, string>();
    for (const e of doc.entities) {
      if (e.kind === "stage" && e.verified && e.canonical?.startsWith("STAGE:")) {
        stageOfRegion.set(`${e.original.sheet}::${e.original.tableId ?? "t1"}`, e.canonical.slice("STAGE:".length));
      }
    }

    for (const s of doc.stages) {
      if (stages.has(s.stageId)) continue;
      const captures = s.captures ?? [];
      const columns = captures
        .map((c) => CAPTURE_COLUMNS[c])
        .filter(Boolean)
        .map((c) => ({ ...c, type: "number" as const, required: c.key === "checked" || c.key === "rejected" }));
      const defects = doc.defects
        .filter((d) => d.stages.includes(s.stageId))
        .map((d) => ({ defectCode: d.defectCode, label: d.label }));
      // The first sheet-region verified as this stage supplies the layout the
      // company's own workbook used — headers and merges reproduce their sheet.
      const regionEntry = [...stageOfRegion.entries()].find(([, id]) => id === s.stageId);
      let layout = null;
      if (regionEntry) {
        const [sheet, tableId] = regionEntry[0].split("::");
        const l = doc.layout.find((x) => x.sheet === sheet && (x.tableId ?? "t1") === tableId);
        if (l) layout = { sheet, tableId, headerRows: l.headerRows, merges: l.merges };
      }
      stages.set(s.stageId, {
        stageId: s.stageId, label: s.label,
        sizeWise: !!s.sizeWise, isQualityGate: !!s.isQualityGate,
        columns, defects, layout,
      });
    }
    for (const sz of doc.sizes) if (!sizes.has(sz.sizeId)) sizes.set(sz.sizeId, sz);
    for (const v of doc.validation) {
      if (!seenRules.has(v.ruleId)) { seenRules.add(v.ruleId); validation.push(v); }
    }
  }

  return {
    stages: [...stages.values()],
    sizes: [...sizes.values()],
    validation,
    generatedFrom: rows.map((r) => ({ modId: r.modId, version: r.version, fileName: r.document.workbook.fileName })),
  };
}

export async function GET(req: NextRequest) {
  try {
    const store = getModStore();
    const modId = req.nextUrl.searchParams.get("modId");

    let rows: ModRowT[];
    if (modId) {
      const row = await store.activeFor(modId);
      if (!row) return NextResponse.json({ error: `No verified MOD for lineage ${modId}` }, { status: 404 });
      rows = [row];
    } else {
      const company = process.env.MOID_COMPANY_ID || "default";
      rows = await store.verified(company);
      if (rows.length === 0) {
        return NextResponse.json({ error: "No verified MODs yet — upload and verify a workbook first." }, { status: 404 });
      }
    }

    return NextResponse.json({ template: templateFrom(rows) });
  } catch (err: unknown) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Failed to build entry template" }, { status: 500 });
  }
}
