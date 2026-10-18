// Single place that answers "what is this company's catalog right now?".
//
// Both /api/schema and /api/entry-template read through here, so the schema you
// edit and the grid you type into can never disagree.
//
// TRANSITIONAL: the authored plant catalog is the base; anything already-verified
// workbooks taught is merged on top so nothing that used to appear vanishes
// mid-migration. When the MOD pipeline is deleted this collapses to:
//
//     const c = await store.get(company);
//     return c.stages.length ? c : store.put(company, plantCatalog());

import { getCatalogStore, type CompanyCatalog } from "@/core/ontology/store/catalog-store";
import { getModStore } from "@/core/ontology/store/mod-store";
import {
  plantCatalog,
  mergePlantCatalog,
  canonicalDefectCode,
  STAGE_CATEGORIES,
  STAGE_CATEGORY,
  type StageCategory,
} from "@/core/ontology/plant-catalog";
import { resolveSections } from "@/lib/schema/sections";

/**
 * Bump when the authored catalog gains (or repairs) a stage that already-seeded
 * plants must pick up. The backfill runs ONCE per tag, so a stage deleted on
 * Data Schema after that stays deleted — the catalog still outlives the code.
 */
export const SEED_TAG = "plant-catalog@stripping-stage";

/**
 * `mergePlantCatalog` writes this instead of SEED_TAG. It is a full authored
 * merge — missing stages after that are user deletions, not "never seeded".
 */
const MERGE_TAG = "plant-catalog";

/**
 * Stages authored AFTER some plants were fully merged. A catalog tagged MERGE_TAG
 * or an older SEED_TAG never saw these, so they are inserted once (with their
 * defect membership) even though the rest of the floor is not re-inserted.
 */
const NEWLY_AUTHORED = new Set(["stripping"]);

/** True once the authored floor has been applied; do not re-insert missing stages. */
export function authoredFloorApplied(tag: string | null | undefined): boolean {
  return tag === SEED_TAG || tag === MERGE_TAG;
}

/** Authored label the tree used to show under a folder of the same name. */
const OLD_PRODUCTION_LABELS = new Set(["Production (Dipping)", "Production Dipping"]);

/**
 * Stages whose authored `category` changed after plants were already seeded.
 * Realigned once (see SEED_TAG), because a stored catalog otherwise keeps the
 * old section forever — the repair below never overwrites a populated field.
 * Stage category stays user-editable afterwards; this is a correction, not an
 * ongoing override, so entries are removed once the fleet has rolled past them.
 */
const RECATEGORISED: Record<string, StageCategory> = {
  "eye-punching": "secondary",
  hanging: "secondary",
};

/** Tags that already applied RECATEGORISED. A later SEED_TAG bump must not
 *  move those stages again — the plant may have edited category since. */
const RECATEGORISED_ALREADY = new Set([
  "plant-catalog@eye-punching-hanging-secondary",
  SEED_TAG,
]);

/**
 * Teach a stored catalog the authored stages it has never seen.
 *
 * `loadCatalog` seeds only when the catalog is completely empty, so a plant
 * that configured its schema before a stage was authored never gained it — and
 * a stage stored with no `captures` is filtered out of /api/entry-template
 * (it would render as an untypeable station). Between them, Secondary
 * Production existed in the plant config but was absent from Data Entry.
 *
 * Conservative on purpose: existing stages keep their label, capture columns
 * and order; only genuinely missing stages are inserted (in authored process
 * order) and only empty `captures` / `category` are repaired.
 */
async function backfillAuthoredStages(
  company: string,
  catalog: CompanyCatalog,
): Promise<CompanyCatalog> {
  if (catalog.lastMergedFrom === SEED_TAG) {
    if (catalog.sections?.length) return catalog;
    return getCatalogStore().put(company, {
      ...catalog,
      sections: resolveSections({
        sections: STAGE_CATEGORIES,
        stages: catalog.stages,
      }),
    });
  }

  // mergePlantCatalog stamps MERGE_TAG. That catalog already has the authored
  // floor — skip the insert loop so a Data Schema delete is not undone on the
  // next GET. Still run the one-time repairs below, then stamp SEED_TAG.
  const skipInsert = authoredFloorApplied(catalog.lastMergedFrom);

  const authoredCatalog = plantCatalog();
  const authored = authoredCatalog.stages;
  const authoredDefects = new Map(authoredCatalog.defects.map((d) => [d.defectCode, d]));
  const authoredById = new Map(authored.map((s) => [s.stageId, s]));
  const stored = new Map(catalog.stages.map((s) => [s.stageId, s]));

  let changed = false;
  const repaired = catalog.stages.map((s) => {
    const a = authoredById.get(s.stageId);
    if (!a) return s;
    const needsCaptures = (s.captures ?? []).length === 0 && (a.captures ?? []).length > 0;
    const needsCategory = !s.category && !!(a.category ?? STAGE_CATEGORY[s.stageId]);
    const recategorised = RECATEGORISED[s.stageId];
    const needsMove =
      !!recategorised &&
      s.category !== recategorised &&
      !RECATEGORISED_ALREADY.has(catalog.lastMergedFrom ?? "");
    const needsDippingLabel =
      s.stageId === "production" && OLD_PRODUCTION_LABELS.has(s.label);
    if (!needsCaptures && !needsCategory && !needsMove && !needsDippingLabel) return s;
    changed = true;
    return {
      ...s,
      label: needsDippingLabel ? a.label : s.label,
      captures: needsCaptures ? a.captures : s.captures,
      category: needsMove
        ? recategorised
        : needsCategory
          ? (a.category ?? STAGE_CATEGORY[s.stageId])
          : s.category,
    };
  });

  if (!catalog.sections?.length) changed = true;

  // Insert missing authored stages at their authored position, so Data Entry
  // tabs still read down the process line instead of appending to the end.
  // Never do this after a full authored merge or the current seed — that is
  // how a deleted stage used to reappear on the next /api/schema GET.
  const out: CompanyCatalog["stages"] = [];
  for (const a of authored) {
    if (stored.has(a.stageId)) continue;
    if (skipInsert && !NEWLY_AUTHORED.has(a.stageId)) continue;
    out.push(a);
    changed = true;
  }

  // A newly inserted stage is only enterable with its defects: membership lives
  // on the defect (`stages`), so teach the stored defects about the new stage.
  let defects = catalog.defects;
  if (out.length > 0) {
    const added = new Set(out.map((s) => s.stageId));
    defects = catalog.defects.map((d) => {
      const code = canonicalDefectCode(d.defectCode) ?? d.defectCode;
      const authoredDef = authoredDefects.get(code);
      const extra = (authoredDef?.stages ?? []).filter(
        (id) => added.has(id) && !d.stages.includes(id),
      );
      return extra.length ? { ...d, stages: [...d.stages, ...extra] } : d;
    });
  }
  const merged = changed
    ? [...repaired, ...out].sort((x, y) => {
        const ix = authored.findIndex((a) => a.stageId === x.stageId);
        const iy = authored.findIndex((a) => a.stageId === y.stageId);
        // Hand-added stages (not authored) keep their relative place at the end.
        return (ix === -1 ? authored.length : ix) - (iy === -1 ? authored.length : iy);
      })
    : catalog.stages;

  const sections = resolveSections({
    sections: catalog.sections?.length ? catalog.sections : STAGE_CATEGORIES,
    stages: merged,
  });

  return getCatalogStore().put(company, {
    ...catalog,
    stages: merged,
    defects,
    sections,
    lastMergedFrom: SEED_TAG,
  });
}

/** Load the catalog, seeding it on first use. Persists the seed. */
export async function loadCatalog(company: string): Promise<CompanyCatalog> {
  const store = getCatalogStore();
  const catalog = await store.get(company);
  if (catalog.stages.length > 0 || catalog.defects.length > 0 || catalog.sizes.length > 0) {
    return backfillAuthoredStages(company, catalog);
  }

  const verified = await getModStore().verified(company).catch(() => []);
  const stages = new Map<string, CompanyCatalog["stages"][number]>();
  const defects = new Map<string, CompanyCatalog["defects"][number]>();
  const sizes = new Map<string, CompanyCatalog["sizes"][number]>();
  for (const mod of verified) {
    for (const s of mod.document.stages ?? []) if (!stages.has(s.stageId)) stages.set(s.stageId, s);
    for (const d of mod.document.defects ?? []) if (!defects.has(d.defectCode)) defects.set(d.defectCode, d);
    for (const s of mod.document.sizes ?? []) if (!sizes.has(s.sizeId)) sizes.set(s.sizeId, s);
  }

  return store.put(company, {
    ...mergePlantCatalog({
      ...catalog,
      stages: [...stages.values()],
      defects: [...defects.values()],
      sizes: [...sizes.values()],
    }),
    // A fresh seed is already at the authored floor — tag it so the backfill
    // above never second-guesses a later deletion on Data Schema.
    lastMergedFrom: SEED_TAG,
  });
}

/** Read-only variant for surfaces that must not write (never persists a seed). */
export async function peekCatalog(company: string): Promise<{ catalog: CompanyCatalog; configured: boolean }> {
  const stored = await getCatalogStore()
    .get(company)
    .catch(() => null);
  const configured = !!stored && stored.stages.length > 0;
  return { catalog: configured ? stored! : plantCatalog(), configured };
}
