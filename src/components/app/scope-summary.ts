export const GRAIN_LABEL = { day: "Day", week: "Week", month: "Month", fy: "FY" } as const;

/** One-line text for the Scope chip: only the controls the page consumes. */
export function scopeSummary(p: {
  range?: string | null;
  grain?: keyof typeof GRAIN_LABEL | null;
  view?: string | null;
  sources?: string | null;
}): string {
  const parts = [
    p.range,
    p.grain ? GRAIN_LABEL[p.grain] : null,
    p.view === "Factory Overview" ? "All lines" : p.view,
    p.sources,
  ].filter((x): x is string => !!x);
  return parts.length ? parts.join(" · ") : "Scope";
}
