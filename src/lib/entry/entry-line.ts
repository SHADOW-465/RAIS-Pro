// The plant line as Data Entry types it. One definition, so Data Entry, Batch
// Conversion and Process Flow can never show different stations.
//
//   Production Dipping → Stripping
//   Secondary          → Eye Punching, Hanging
//   Assembly           → Visual, Balloon Inspection, Valve Integrity, Final Inspection
//
// Other catalog stages (Dipping, Leaching, Gauge, …) stay in the catalog and in
// Excel history; they are just not entry stations.

import { STAGE_LABELS, resolveStageId } from "@/core/ontology/plant-catalog";

export const ENTRY_LINE: { id: string; label: string; stageIds: string[] }[] = [
  { id: "primary", label: "Production Dipping", stageIds: ["stripping"] },
  { id: "secondary", label: "Secondary", stageIds: ["eye-punching", "hanging"] },
  { id: "assembly", label: "Assembly", stageIds: ["visual", "balloon", "valve-integrity", "final"] },
];

export type EntryLineGroup<T> = {
  id: string;
  label: string;
  stations: { stageId: string; label: string; row: T | null }[];
};

/** Lay per-stage rows out on the entry line. A station with no row stays listed
 *  (row: null) so the structure matches Data Entry even before data exists. */
export function groupByEntryLine<T extends { stageId: string }>(rows: T[]): EntryLineGroup<T>[] {
  const byStage = new Map<string, T>();
  for (const r of rows) {
    const id = resolveStageId(r.stageId) ?? r.stageId;
    if (!byStage.has(id)) byStage.set(id, r);
  }
  return ENTRY_LINE.map((lane) => ({
    id: lane.id,
    label: lane.label,
    stations: lane.stageIds.map((stageId) => ({
      stageId,
      label: STAGE_LABELS[stageId] ?? stageId,
      row: byStage.get(stageId) ?? null,
    })),
  }));
}
