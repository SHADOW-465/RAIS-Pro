// One phrase for "what population is this number, and which date is it using?"
// Dashboard and analysis screens filter on the lot calendar. Reports filter on
// Date of Entry (recordedAt) for the whole plant.

import { STAGE_CATEGORIES } from "@/core/ontology/plant-catalog";

export type KpiDateBasis = "lot-date" | "entry-date";

const SECTION_LABEL: Record<string, string> = {
  primary: "Production Dipping",
  secondary: "Secondary",
  assembly: "Assembly",
};

export function kpiScopeLabel(opts: {
  sections?: readonly string[] | null;
  stageLabel?: string | null;
  dateBasis: KpiDateBasis;
  /** Overrides the section phrase when the number is not the header scope. */
  scopeText?: string | null;
}): string {
  const basis = opts.dateBasis === "entry-date" ? "entry date" : "lot date";
  if (opts.scopeText) return `${opts.scopeText} – ${basis}`;
  if (opts.stageLabel) return `${opts.stageLabel} – ${basis}`;
  const ids = STAGE_CATEGORIES.map((s) => s.id);
  const secs = opts.sections ?? [];
  const whole = secs.length === 0 || ids.every((id) => secs.includes(id));
  const scope = whole
    ? "Whole plant"
    : secs.length === 1
      ? (SECTION_LABEL[secs[0]] ?? secs[0])
      : secs.map((s) => SECTION_LABEL[s] ?? s).join(" + ");
  return `${scope} – ${basis}`;
}

/** Header scope on dashboard and analysis screens. Dates are the lot calendar. */
export function lotScopeLabel(
  t: { stageCategories?: readonly string[] | null; stageView?: string | null },
  stageLabels: Record<string, string> = {},
): string {
  const view = t.stageView && t.stageView !== "cumulative" ? t.stageView : null;
  return kpiScopeLabel({
    sections: t.stageCategories,
    stageLabel: view ? (stageLabels[view] ?? view) : null,
    dateBasis: "lot-date",
  });
}

export const REPORT_SCOPE_LABEL = kpiScopeLabel({
  sections: STAGE_CATEGORIES.map((s) => s.id),
  dateBasis: "entry-date",
});
