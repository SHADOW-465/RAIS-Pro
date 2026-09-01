// Data Entry schema resolver.
//
// Catalog path: /api/entry-template is the only live source for stations,
// defects, and quantity columns. Builtin path: MATRIX_STAGES is projected into
// the same shape and used as a total replacement when the template is missing.
// The two never mix per-field — that silent mix is what made a station show
// the wrong defect vocabulary with a "Schema · plant" badge.
//
// `micro` (p15-visual, …) is a retired local id. Persisted drafts / shift rows
// / Ask MOID prefills may still carry it; migrateToStageId is the one reader.

import {
  MATRIX_STAGES,
  type MacroId,
  type DefectDef,
} from "@/lib/entry/disposafe-matrix";
import { STAGE_CATEGORIES, STAGE_CATEGORY, STAGES, resolveStageId, sortStageIds } from "@/core/ontology/plant-catalog";

export type QtyKey = "checked" | "accepted" | "hold" | "rejected";
export type ExtraField = "trolleys" | "bin";

export type EntryStation = {
  stageId: string;
  label: string;
  category: string;
  columns: QtyKey[];
  defects: DefectDef[];
  extras: ExtraField[];
};

export type ResolvedEntrySchema = {
  source: "catalog" | "builtin";
  stations: EntryStation[];
  sections?: { id: string; label: string }[];
};

/** Minimal template shape — avoids importing the App Router module from lib. */
export type EntryTemplateLike = {
  stages: {
    stageId: string;
    label: string;
    category?: MacroId | string;
    columns?: { key: string }[];
    defects?: { defectCode: string; label: string }[];
  }[];
  sections?: { id: string; label: string }[];
};

/**
 * Old local `micro` ids → ledger stageId. Also accepts a stageId written into
 * the micro slot (post-migration writes) and empty micros on department rows.
 */
const LEGACY_MICRO_TO_STAGE: Record<string, string> = {
  "p15-visual": "visual",
  "p16-balloon": "balloon",
  "p17-valve": "valve-integrity",
  "p18-final": "final",
  primary: "production",
  secondary: "secondary",
};

export function migrateToStageId(input: {
  stageId?: string | null;
  micro?: string | null;
  macro?: string | null;
}): string {
  const sid = (input.stageId ?? "").trim();
  if (sid) return sid;
  const micro = (input.micro ?? "").trim();
  if (micro && LEGACY_MICRO_TO_STAGE[micro]) return LEGACY_MICRO_TO_STAGE[micro];
  if (micro) return micro;
  if (input.macro === "primary") return "production";
  if (input.macro === "secondary") return "secondary";
  return "visual";
}

function extrasFor(stageId: string): ExtraField[] {
  const canon = resolveStageId(stageId) ?? stageId;
  if (canon === "production") return ["trolleys"];
  if (canon === "secondary") return ["bin"];
  return [];
}

function qtyFromTemplateKey(key: string): QtyKey | null {
  if (key === "checked") return "checked";
  if (key === "acceptedGood" || key === "accepted") return "accepted";
  if (key === "rework" || key === "hold") return "hold";
  if (key === "rejected") return "rejected";
  return null;
}

function categoryOf(stageId: string, explicit?: string): string {
  if (explicit && explicit.trim()) return explicit.trim();
  return STAGE_CATEGORY[stageId] ?? "assembly";
}

function fromTemplate(template: EntryTemplateLike): ResolvedEntrySchema {
  const stations: EntryStation[] = template.stages.map((s) => {
    const columns: QtyKey[] = [];
    for (const col of s.columns ?? []) {
      const q = qtyFromTemplateKey(col.key);
      if (q && !columns.includes(q)) columns.push(q);
    }
    return {
      stageId: s.stageId,
      label: s.label,
      category: categoryOf(s.stageId, s.category),
      columns,
      defects: (s.defects ?? []).map((d) => ({
        key: d.defectCode,
        name: d.label || d.defectCode,
      })),
      extras: extrasFor(s.stageId),
    };
  });
  return { source: "catalog", stations, sections: template.sections };
}

function fromSeed(): ResolvedEntrySchema {
  const stations: EntryStation[] = [];

  const primaryDefs = MATRIX_STAGES.primary.defects;
  stations.push({
    stageId: "production",
    label: MATRIX_STAGES.primary.name,
    category: "primary",
    columns: ["checked", "accepted", "rejected"],
    defects: Array.isArray(primaryDefs) ? primaryDefs : [],
    extras: ["trolleys"],
  });

  stations.push({
    stageId: "secondary",
    label: MATRIX_STAGES.secondary.name,
    category: "secondary",
    columns: ["checked"],
    defects: [],
    extras: ["bin"],
  });

  for (const p of MATRIX_STAGES.assembly.processes) {
    if (!p.stageId || !p.interactive) continue;
    const defs = MATRIX_STAGES.assembly.defects;
    const list = !Array.isArray(defs) ? (defs[p.id] ?? []) : [];
    stations.push({
      stageId: p.stageId,
      label: p.name,
      category: "assembly",
      columns: p.stageId === "visual"
        ? ["checked", "accepted", "hold", "rejected"]
        : ["checked", "accepted", "rejected"],
      defects: list,
      extras: [],
    });
  }

  return { source: "builtin", stations };
}

/**
 * Resolve the schema the form will render. A non-empty template wins entirely;
 * anything else is the seed. Callers must not overlay seed defects onto a
 * catalog station that happens to have an empty list.
 */
export function resolveEntrySchema(
  template: EntryTemplateLike | null | undefined,
): ResolvedEntrySchema {
  if (template?.stages?.length) return fromTemplate(template);
  return fromSeed();
}

export function stationsIn(
  schema: ResolvedEntrySchema,
  category: string,
): EntryStation[] {
  const inCat = schema.stations.filter((s) => s.category === category);
  const byId = new Map(inCat.map((s) => [s.stageId, s]));
  return sortStageIds(inCat.map((s) => s.stageId))
    .map((id) => byId.get(id))
    .filter((s): s is EntryStation => !!s);
}

export function stationById(
  schema: ResolvedEntrySchema,
  stageId: string,
): EntryStation | undefined {
  return schema.stations.find((s) => s.stageId === stageId);
}

function catalogById(stageId: string) {
  const canon = resolveStageId(stageId) ?? stageId;
  return STAGES.find((s) => s.stageId === canon);
}

function schemaStationFor(schema: ResolvedEntrySchema, catalogId: string): EntryStation | undefined {
  return schema.stations.find(
    (s) => s.stageId === catalogId || resolveStageId(s.stageId) === catalogId,
  );
}

/**
 * Previous station that records an accepted qty — used to prefill Checked
 * from upstream Accepted. Walks the plant-schema `upstream` cascade across
 * primary → secondary → assembly, skipping throughput-only stations
 * (valve-fixing, hanging, …) so Visual still prefills from Secondary /
 * production-dipping, and Valve Integrity still prefills from Balloon.
 */
export function previousAcceptedStageId(
  schema: ResolvedEntrySchema,
  stageId: string,
): string | null {
  const start = catalogById(stageId);
  if (start) {
    const seen = new Set<string>();
    const queue = [...start.upstream];
    while (queue.length > 0) {
      const upId = queue.shift()!;
      if (seen.has(upId)) continue;
      seen.add(upId);
      const hit = schemaStationFor(schema, upId);
      if (hit?.columns.includes("accepted")) return hit.stageId;
      const up = catalogById(upId);
      if (up) queue.push(...up.upstream);
    }
    return null;
  }

  // Stage not in the authored catalog: walk schema order within, then prior
  // sections, so a plant-added station still sees the process before it.
  const station = stationById(schema, stageId);
  if (!station) return null;
  const ordered = [...schema.stations];
  const idx = ordered.findIndex((s) => s.stageId === stageId);
  for (let i = idx - 1; i >= 0; i--) {
    if (ordered[i].columns.includes("accepted")) return ordered[i].stageId;
  }
  return null;
}

export function schemaCategories(
  schema: ResolvedEntrySchema,
  sections?: { id: string; label: string }[],
): {
  id: string;
  label: string;
}[] {
  const present = new Set(schema.stations.map((s) => s.category));
  const cats = sections?.length
    ? sections
    : schema.sections?.length
      ? schema.sections
      : STAGE_CATEGORIES;
  const listed = cats.filter((c) => present.has(c.id)).map((c) => ({
    id: c.id,
    label: c.label,
  }));
  for (const id of present) {
    if (!listed.some((c) => c.id === id)) listed.push({ id, label: id });
  }
  const rank = new Map<string, number>(STAGE_CATEGORIES.map((c, i) => [c.id, i]));
  listed.sort(
    (a, b) => (rank.get(a.id) ?? 99) - (rank.get(b.id) ?? 99) || a.id.localeCompare(b.id),
  );
  return listed;
}

export function seedDefectsForStage(stageId: string): DefectDef[] {
  return stationById(fromSeed(), stageId)?.defects ?? [];
}

export function seedProcessLabel(stageId: string): string {
  return stationById(fromSeed(), stageId)?.label ?? stageId;
}
