// Where a size change usually happens: assembly, Visual first.
// The picker still lists every station. This is only the initial value.

import { resolveStageId } from "@/core/ontology/plant-catalog";
import { resolveEntrySchema, stationsIn, type ResolvedEntrySchema } from "@/lib/entry/entry-schema";

export function defaultChangeStageId(schema?: ResolvedEntrySchema | null): string {
  const resolved = schema ?? resolveEntrySchema(null);
  const stations = stationsIn(resolved, "assembly");
  const visual = stations.find((s) => (resolveStageId(s.stageId) ?? s.stageId) === "visual");
  return (visual ?? stations[0])?.stageId ?? "";
}
