// Data Schema as a directory tree — the derivation, and nothing else.
//
// The catalog is stored FLAT (stages / defects / sizes / mappings). The tree is
// a projection of it, rebuilt on every render. Nothing here is persisted, so a
// structural rule can be changed by editing this file alone.
//
// Every structural decision lives here so the renderer stays dumb:
//   · the three category folders and their fixed order
//   · process order inside a category (the `upstream` cascade, not the array)
//   · a defect scoped to several stages appearing under each, badged
//   · the Production Dipping alias exception
//   · mappings that resolve to nothing collecting in one place
//
// See docs/2026-08-15-schema-tree-design.md.

import { isSectionMarker, resolveSections, type CatalogSection } from "@/lib/schema/sections";

export type SchemaNodeKind =
  | "category"
  | "stage"
  | "captures-folder"
  | "capture"
  | "defects-folder"
  | "defect"
  | "defect-scope-folder"
  | "defect-scope"
  | "aliases-folder"
  | "alias"
  | "all-defects-folder"
  | "sizes-folder"
  | "size"
  | "unmatched-folder"
  | "mapping";

export type SchemaNodeBadge = "shared" | "quality-gate" | "misspelling" | "orphan";

/** What a node points at, for the detail panel and for mutations. */
export interface SchemaNodeRef {
  stageId?: string;
  defectCode?: string;
  sizeId?: string;
  /** Mapping identity is (kind, key) — `key` alone is not unique. */
  mappingKind?: string;
  mappingKey?: string;
  /** For a defect rendered INSIDE a stage: which stage's folder it sits in.
   *  This is what turns a delete into an unscope. */
  scopedUnderStageId?: string;
  /** For a category folder. */
  categoryId?: string;
}

export interface SchemaNode {
  /** Stable path id — survives re-derivation, so expansion state sticks. */
  id: string;
  kind: SchemaNodeKind;
  label: string;
  /** Inline description sitting next to the label ("also on Final Inspection"). */
  sublabel?: string;
  /** How many items a folder holds. Rendered in a shared right-hand gutter, so
   *  it stays a scannable column instead of a ragged trail after each label. */
  count?: number;
  badge?: SchemaNodeBadge;
  /** Category folders: fixed, never editable or deletable. */
  locked?: boolean;
  ref?: SchemaNodeRef;
  children: SchemaNode[];
}

export interface SchemaTreeStage {
  stageId: string;
  label: string;
  category?: string | null;
  sectionLabel?: string | null;
  captures?: string[];
  upstream?: string[];
  isQualityGate?: boolean;
}

export interface SchemaTreeDefect {
  defectCode: string;
  label: string;
  aliases?: string[];
  stages?: string[];
}

export interface SchemaTreeSize {
  sizeId: string;
  label: string;
}

export interface SchemaTreeMapping {
  kind: string;
  key: string;
  canonicalId: string;
}

export interface SchemaTreeInput {
  stages: SchemaTreeStage[];
  defects: SchemaTreeDefect[];
  sizes: SchemaTreeSize[];
  sections?: CatalogSection[];
  mappings?: SchemaTreeMapping[];
}

/**
 * Category whose stages render without an Aliases folder.
 *
 * The mappings still exist and still resolve during Excel ingestion — this
 * only decides what the tree surfaces.
 */
const NO_ALIAS_CATEGORY = "primary";

/** A spelling that differs from the canonical id by more than case is worth
 *  flagging — that is how the plant's misspellings ("VISUAL INSEPTION") got
 *  into the catalog in the first place. */
function isMisspelling(key: string, canonicalId: string): boolean {
  const k = key.replace(/[\s_-]/g, "").toUpperCase();
  const c = canonicalId.replace(/[\s_-]/g, "").toUpperCase();
  return k !== c;
}

/**
 * Process order within a category: walk the `upstream` cascade so the tree
 * reads down the line (Visual → Balloon → Valve → Final) rather than by
 * whatever order the array happens to hold.
 *
 * Stages whose upstream sits in another category (or nowhere) are roots here.
 * Anything left over after the walk — a cycle, a dangling reference — is
 * appended rather than dropped, because a catalog that disagrees with itself
 * still has to be visible enough to fix.
 */
export function orderByCascade(stages: SchemaTreeStage[]): SchemaTreeStage[] {
  const byId = new Map(stages.map((s) => [s.stageId, s]));
  const downstream = new Map<string, string[]>();
  const roots: SchemaTreeStage[] = [];

  for (const s of stages) {
    const parents = (s.upstream ?? []).filter((u) => byId.has(u));
    if (parents.length === 0) {
      roots.push(s);
      continue;
    }
    for (const p of parents) {
      const list = downstream.get(p) ?? [];
      list.push(s.stageId);
      downstream.set(p, list);
    }
  }

  const out: SchemaTreeStage[] = [];
  const seen = new Set<string>();
  const visit = (stage: SchemaTreeStage) => {
    if (seen.has(stage.stageId)) return;
    seen.add(stage.stageId);
    out.push(stage);
    for (const childId of downstream.get(stage.stageId) ?? []) {
      const child = byId.get(childId);
      if (child) visit(child);
    }
  };
  for (const r of roots) visit(r);
  // Cycles / dangling upstreams never get visited — keep them rather than lose them.
  for (const s of stages) if (!seen.has(s.stageId)) out.push(s);
  return out;
}

function aliasFolder(
  parentId: string,
  mappings: SchemaTreeMapping[],
  canonicalId: string,
  kinds: string[],
): SchemaNode[] {
  const folderId = `${parentId}/aliases`;
  const nodes: SchemaNode[] = mappings
    .filter((m) => kinds.includes(m.kind) && m.canonicalId === canonicalId)
    .map((m) => ({
      id: `${folderId}/alias:${m.kind}:${m.key}`,
      kind: "alias" as const,
      label: m.key,
      badge: isMisspelling(m.key, m.canonicalId) ? ("misspelling" as const) : undefined,
      ref: { mappingKind: m.kind, mappingKey: m.key },
      children: [],
    }));
  if (nodes.length === 0) return [];
  return [
    {
      id: folderId,
      kind: "aliases-folder",
      label: "Aliases",
      count: nodes.length,
      children: nodes,
    },
  ];
}

/** Project the flat catalog into the directory tree the Data Schema page renders. */
export function buildSchemaTree(input: SchemaTreeInput): SchemaNode[] {
  const { defects, sizes } = input;
  const stages = input.stages.filter((s) => !isSectionMarker(s.stageId));
  const mappings = input.mappings ?? [];

  const defectsByStage = new Map<string, SchemaTreeDefect[]>();
  for (const d of defects) {
    for (const stageId of d.stages ?? []) {
      const list = defectsByStage.get(stageId) ?? [];
      list.push(d);
      defectsByStage.set(stageId, list);
    }
  }
  const stageLabel = new Map(stages.map((s) => [s.stageId, s.label]));

  const out: SchemaNode[] = [];

  // ── Section folders (catalog order, then any unrecognised category) ─────
  const sections = resolveSections(input);
  const claimed = new Set<string>();
  for (const cat of sections) {
    const inCat = stages.filter((s) => (s.category ?? "") === cat.id);
    for (const s of inCat) claimed.add(s.stageId);
    const catId = `cat:${cat.id}`;
    const showAliases = cat.id !== NO_ALIAS_CATEGORY;

    out.push({
      id: catId,
      kind: "category",
      label: cat.label,
      count: inCat.length,
      ref: { categoryId: cat.id },
      children: orderByCascade(inCat).map((s) =>
        stageNode(`${catId}/stage:${s.stageId}`, s, showAliases),
      ),
    });
  }

  const orphanStages = stages.filter((s) => !claimed.has(s.stageId));
  if (orphanStages.length > 0) {
    out.push({
      id: "cat:unassigned",
      kind: "category",
      label: "Unassigned stages",
      count: orphanStages.length,
      badge: "orphan",
      children: orderByCascade(orphanStages).map((s) =>
        stageNode(`cat:unassigned/stage:${s.stageId}`, s, true),
      ),
    });
  }

  function stageNode(id: string, s: SchemaTreeStage, showAliases: boolean): SchemaNode {
    const captures = s.captures ?? [];
    const scoped = defectsByStage.get(s.stageId) ?? [];
    const children: SchemaNode[] = [];

    children.push({
      id: `${id}/captures`,
      kind: "captures-folder",
      label: "Captures",
      count: captures.length,
      ref: { stageId: s.stageId },
      children: captures.map((c) => ({
        id: `${id}/captures/${c}`,
        kind: "capture" as const,
        label: c,
        ref: { stageId: s.stageId },
        children: [],
      })),
    });

    // Always emit the folder, even when empty — otherwise there is nowhere
    // in the tree to add the first defect to a stage.
    children.push({
      id: `${id}/defects`,
      kind: "defects-folder",
      label: "Defects",
      count: scoped.length,
      ref: { stageId: s.stageId },
      children: scoped.map((d) => {
        const others = (d.stages ?? []).filter((x) => x !== s.stageId);
        return {
          id: `${id}/defects/defect:${d.defectCode}`,
          kind: "defect" as const,
          label: d.defectCode,
          sublabel: others.length
            ? `also on ${others.map((o) => stageLabel.get(o) ?? o).join(", ")}`
            : d.label,
          badge: others.length ? ("shared" as const) : undefined,
          // scopedUnderStageId is what makes a delete here an UNSCOPE.
          ref: { defectCode: d.defectCode, scopedUnderStageId: s.stageId },
          children: [],
        };
      }),
    });

    if (showAliases) {
      children.push(...aliasFolder(id, mappings, s.stageId, ["stage-alias"]));
    }

    return {
      id,
      kind: "stage",
      label: s.label,
      sublabel: s.stageId,
      badge: s.isQualityGate ? "quality-gate" : undefined,
      ref: { stageId: s.stageId },
      children,
    };
  }

  // ── All defects — where the definitions actually live ───────────────────
  out.push({
    id: "all-defects",
    kind: "all-defects-folder",
    label: "All defects",
    count: defects.length,
    children: defects.map((d) => {
      const id = `all-defects/defect:${d.defectCode}`;
      const scopes = d.stages ?? [];
      const children: SchemaNode[] = [];
      if (scopes.length > 0) {
        children.push({
          id: `${id}/scopes`,
          kind: "defect-scope-folder",
          label: "Scoped to",
          count: scopes.length,
          ref: { defectCode: d.defectCode },
          children: scopes.map((stageId) => ({
            id: `${id}/scopes/${stageId}`,
            kind: "defect-scope" as const,
            label: stageLabel.get(stageId) ?? stageId,
            ref: { defectCode: d.defectCode, stageId },
            children: [],
          })),
        });
      }
      children.push(...aliasFolder(id, mappings, d.defectCode, ["defect-alias"]));
      return {
        id,
        kind: "defect" as const,
        label: d.defectCode,
        sublabel: d.label,
        // A defect scoped to nothing is invisible in Data Entry — say so here.
        badge: scopes.length === 0 ? ("orphan" as const) : undefined,
        ref: { defectCode: d.defectCode },
        children,
      };
    }),
  });

  // ── Sizes ───────────────────────────────────────────────────────────────
  out.push({
    id: "sizes",
    kind: "sizes-folder",
    label: "Sizes",
    count: sizes.length,
    children: sizes.map((s) => ({
      id: `sizes/size:${s.sizeId}`,
      kind: "size" as const,
      label: s.label || s.sizeId,
      sublabel: s.sizeId,
      ref: { sizeId: s.sizeId },
      children: [],
    })),
  });

  // ── Mappings that point at nothing we render ────────────────────────────
  const stageIds = new Set(stages.map((s) => s.stageId));
  const defectCodes = new Set(defects.map((d) => d.defectCode));
  const unmatched = mappings.filter((m) => {
    if (m.kind === "stage-alias" && stageIds.has(m.canonicalId)) {
      // Surfaced under its stage — unless that whole category hides aliases,
      // in which case it is deliberately hidden, not unmatched.
      return false;
    }
    if (m.kind === "defect-alias" && defectCodes.has(m.canonicalId)) return false;
    return true;
  });
  if (unmatched.length > 0) {
    out.push({
      id: "unmatched",
      kind: "unmatched-folder",
      label: "Unmatched patterns",
      count: unmatched.length,
      badge: "orphan",
      children: unmatched.map((m) => ({
        id: `unmatched/${m.kind}:${m.key}`,
        kind: "mapping" as const,
        label: m.key,
        sublabel: `${m.kind} → ${m.canonicalId}`,
        ref: { mappingKind: m.kind, mappingKey: m.key },
        children: [],
      })),
    });
  }

  return out;
}

/**
 * What a delete on this node actually means.
 *
 * Deleting a defect inside a STAGE folder removes it from that stage only —
 * the definition and its other stages survive. Deleting from All defects
 * removes it everywhere. Getting this backwards silently strips a defect
 * column off every other stage that used it.
 */
export type DeleteIntent =
  | { kind: "unscope-defect"; defectCode: string; stageId: string; remaining: string[] }
  | { kind: "delete-defect"; defectCode: string; affectedStages: string[] }
  | { kind: "delete-stage"; stageId: string; orphanedDefects: string[] }
  | { kind: "delete-section"; categoryId: string; stageCount: number }
  | { kind: "delete-size"; sizeId: string }
  | { kind: "delete-mapping"; mappingKind: string; mappingKey: string }
  | { kind: "remove-capture"; stageId: string; capture: string }
  | { kind: "not-deletable"; reason: string };

export function deleteIntentFor(
  node: SchemaNode,
  input: SchemaTreeInput,
): DeleteIntent {
  const ref = node.ref ?? {};

  if (node.kind === "category" && ref.categoryId) {
    const stageCount = input.stages.filter(
      (s) => (s.category ?? "") === ref.categoryId && !isSectionMarker(s.stageId),
    ).length;
    return { kind: "delete-section", categoryId: ref.categoryId, stageCount };
  }

  if (node.kind === "capture" && ref.stageId) {
    return { kind: "remove-capture", stageId: ref.stageId, capture: node.label };
  }

  if (node.kind === "defect" && ref.defectCode) {
    const defect = input.defects.find((d) => d.defectCode === ref.defectCode);
    const scopes = defect?.stages ?? [];
    if (ref.scopedUnderStageId) {
      return {
        kind: "unscope-defect",
        defectCode: ref.defectCode,
        stageId: ref.scopedUnderStageId,
        remaining: scopes.filter((s) => s !== ref.scopedUnderStageId),
      };
    }
    return { kind: "delete-defect", defectCode: ref.defectCode, affectedStages: scopes };
  }

  // A single scope row under All defects is the same act as unscoping.
  if (node.kind === "defect-scope" && ref.defectCode && ref.stageId) {
    const defect = input.defects.find((d) => d.defectCode === ref.defectCode);
    const scopes = defect?.stages ?? [];
    return {
      kind: "unscope-defect",
      defectCode: ref.defectCode,
      stageId: ref.stageId,
      remaining: scopes.filter((s) => s !== ref.stageId),
    };
  }

  if (node.kind === "stage" && ref.stageId) {
    // Defects that exist ONLY on this stage lose their last home with it.
    const orphaned = input.defects
      .filter((d) => (d.stages ?? []).length === 1 && d.stages![0] === ref.stageId)
      .map((d) => d.defectCode);
    return { kind: "delete-stage", stageId: ref.stageId, orphanedDefects: orphaned };
  }

  if (node.kind === "size" && ref.sizeId) {
    return { kind: "delete-size", sizeId: ref.sizeId };
  }

  if ((node.kind === "alias" || node.kind === "mapping") && ref.mappingKey) {
    return {
      kind: "delete-mapping",
      mappingKind: ref.mappingKind ?? "",
      mappingKey: ref.mappingKey,
    };
  }

  return { kind: "not-deletable", reason: "This row is derived, not stored." };
}

/** Flatten to the visible rows, given which folders are open. */
export function visibleRows<T extends { id: string; children: T[] }>(
  nodes: T[],
  expanded: Set<string>,
  depth = 0,
): { node: T; depth: number }[] {
  const out: { node: T; depth: number }[] = [];
  for (const node of nodes) {
    out.push({ node, depth });
    if (node.children.length > 0 && expanded.has(node.id)) {
      out.push(...visibleRows(node.children, expanded, depth + 1));
    }
  }
  return out;
}

/**
 * Filter the tree to nodes matching `query`, keeping ancestors of any hit so
 * the path stays walkable. Returns the ids that must be expanded to reveal them.
 */
export function filterTree<
  T extends { id: string; label: string; sublabel?: string; children: T[] },
>(nodes: T[], query: string): { nodes: T[]; expand: Set<string> } {
  const q = query.trim().toLowerCase();
  if (!q) return { nodes, expand: new Set() };
  const expand = new Set<string>();

  const walk = (list: T[]): T[] => {
    const kept: T[] = [];
    for (const node of list) {
      const self =
        node.label.toLowerCase().includes(q) ||
        (node.sublabel ?? "").toLowerCase().includes(q);
      const children = walk(node.children);
      if (self || children.length > 0) {
        if (children.length > 0) expand.add(node.id);
        kept.push({ ...node, children: self ? node.children : children });
      }
    }
    return kept;
  };

  return { nodes: walk(nodes), expand };
}
