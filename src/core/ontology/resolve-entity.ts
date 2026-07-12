// src/core/ontology/resolve-entity.ts
// Catalog-driven entity resolution for the ingest/analytics runtime — the
// successor of registry/disposafe.ts's resolveDefect/activeStageIds. The
// registry argument is REQUIRED (the caller's MOD catalog); null/undefined
// simply resolves nothing — never a hardcoded company fallback.

import type { ClientRegistry } from "@/lib/contract/d1";
import type { z } from "zod";
import { collapseKey } from "./normalize";

type Registry = Pick<z.infer<typeof ClientRegistry>, "defects" | "stages">;

/** Case/separator-insensitive alias resolution. Collapses ALL non-alphanumeric
 *  characters so "90-10", "90/10" and "90 10" (the same defect written three
 *  ways across sheets) all resolve to one code. Returns null when unknown
 *  (→ low-confidence event + Finding), never an invented category. */
export function resolveDefect(raw: string, reg?: Registry | null): string | null {
  if (!reg) return null;
  const norm = collapseKey(raw);
  if (!norm) return null;
  for (const d of reg.defects) {
    if (d.aliases.some((a) => collapseKey(a) === norm)) return d.defectCode;
  }
  return null;
}

/** The stage ids active on a given ISO date (respects effectiveFrom/To drift). */
export function activeStageIds(isoDate: string, reg: Registry): string[] {
  return reg.stages
    .filter((s) => (s.effectiveFrom == null || s.effectiveFrom <= isoDate) &&
                   (s.effectiveTo == null || isoDate <= s.effectiveTo))
    .map((s) => s.stageId);
}
