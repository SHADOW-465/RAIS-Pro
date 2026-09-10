// src/app/api/entry-template/route.ts
// Data Entry = a projection of the company catalog. Nothing more.
//
//   GET /api/entry-template → { template: { stages, sizes, source } }
//
// The catalog is AUTHORED (core/ontology/plant-catalog.ts) and edited by hand on
// Data Schema (/api/schema). It is no longer inferred from workbook layout, so
// this route has no MOD lookup, no cross-workbook union, and no precedence
// scoring — those existed only to reconcile guesses about what a column meant.
//
// Order matters and comes from the catalog: the plant reads its own defect
// columns COAG, SD, TT, … and Data Entry must render them in that sequence.

import { NextResponse } from "next/server";
import type { CompanyCatalog } from "@/core/ontology/store/catalog-store";
import { loadCatalog } from "@/core/ontology/load-catalog";
import { DEFECT_ORDER, STAGE_CATEGORIES, stageCategoryOf } from "@/core/ontology/plant-catalog";
import { resolveSections } from "@/lib/schema/sections";

const CAPTURE_COLUMNS: Record<string, { key: string; label: string }> = {
  checked:  { key: "checked",      label: "Checked Qty" },
  accepted: { key: "acceptedGood", label: "Good Qty" },
  hold:     { key: "rework",       label: "Rework Qty" },
  rejected: { key: "rejected",     label: "Rejected Qty" },
};

/** Canonical left-to-right order, regardless of the order `captures` lists them. */
const CAPTURE_ORDER = ["checked", "accepted", "hold", "rejected"];

export type EntryTemplateStage = {
  stageId: string;
  label: string;
  /** Shop-floor section — Data Entry tabs filter chips by this. */
  category: string;
  sizeWise: boolean;
  isQualityGate: boolean;
  columns: { key: string; label: string; type: "number"; required: boolean }[];
  defects: { defectCode: string; label: string }[];
};

export type EntryTemplate = {
  stages: EntryTemplateStage[];
  sizes: { sizeId: string; label: string }[];
  sections: { id: string; label: string }[];
  /** Where this schema came from, for the "From:" hint on the entry grid. */
  source: string;
};

export function templateFrom(catalog: CompanyCatalog, source = "Plant catalog"): EntryTemplate {
  const stages = catalog.stages
    // A stage with no capture columns cannot be typed into — it would render as
    // an empty station. (Old resolvers minted these from "Cummulative" sheets.)
    // It stays in the catalog so Data Schema can show and delete it.
    .filter((s) => (s.captures ?? []).length > 0)
    .map((s): EntryTemplateStage => {
      const captures = new Set(s.captures ?? []);
      // Per-stage sheet order. Shared codes (COAG, LEAK, OTH…) sit in different
      // positions in different vocabularies, so a flat list cannot order them.
      const order = DEFECT_ORDER[s.stageId] ?? [];
      const rank = (code: string) => {
        const i = order.indexOf(code);
        return i === -1 ? order.length : i; // unknown/plant-added codes go last
      };
      const category = s.category ?? stageCategoryOf(s.stageId) ?? "assembly";
      return {
        stageId: s.stageId,
        label: s.label,
        category,
        sizeWise: !!s.sizeWise,
        isQualityGate: !!s.isQualityGate,
        columns: CAPTURE_ORDER.filter((c) => captures.has(c as never)).map((c) => ({
          ...CAPTURE_COLUMNS[c],
          type: "number" as const,
          // A stage that counts rejects must state how many it checked, or the
          // rate has no denominator.
          required: c === "checked" || c === "rejected",
        })),
        defects: catalog.defects
          .filter((d) => d.stages.includes(s.stageId))
          .map((d, i) => ({ d, i }))
          .sort((a, b) => rank(a.d.defectCode) - rank(b.d.defectCode) || a.i - b.i)
          .map(({ d }) => ({ defectCode: d.defectCode, label: d.label || d.defectCode })),
      };
    });

  return {
    stages,
    sizes: catalog.sizes,
    sections: resolveSections({
      sections: catalog.sections?.length ? catalog.sections : STAGE_CATEGORIES,
      stages: catalog.stages,
    }),
    source,
  };
}

export async function GET() {
  try {
    const company = process.env.MOID_COMPANY_ID || "default";
    // Seeds from the authored plant catalog on first use, so Data Entry works on
    // day one — before anyone has opened Data Schema or imported anything.
    const catalog = await loadCatalog(company);
    const template = templateFrom(catalog, "Data Schema");

    return NextResponse.json(
      {
        template,
        meta: {
          stages: template.stages.map((s) => ({
            stageId: s.stageId,
            defectCount: s.defects.length,
            captureCount: s.columns.length,
          })),
        },
      },
      { headers: { "Cache-Control": "no-store, no-cache, must-revalidate" } },
    );
  } catch (err: unknown) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to build entry template" },
      { status: 500 },
    );
  }
}
