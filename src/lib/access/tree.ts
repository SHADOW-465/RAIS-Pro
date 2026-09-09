// The access catalog as a directory tree — the derivation, and nothing else.
//
// Grants are stored FLAT (a set of leaf ids). The tree is a projection of them,
// rebuilt on every render, exactly as `lib/schema/tree.ts` projects the flat
// plant catalog. Nothing here is persisted, so the shape a GM sees can change
// by editing this file alone.
//
// Structural decisions all live here so the renderer stays dumb:
//   · the sidebar's own grouping supplies the top-level folders
//   · Dashboard carries its cards as a sub-folder, because withholding a card
//     is a narrower version of withholding the screen
//   · Permissions sit in their own folder rather than under a screen: `write`
//     is not a property of one page, and pretending otherwise would suggest
//     that un-ticking it somewhere else leaves it in force
//
// Folder check state is DERIVED from leaves, never stored. A folder is only
// "on" when every leaf under it is on; anything else is mixed or off. That is
// what makes "tick the folder" mean "tick everything in it" without inventing
// a second source of truth about what a role may do.

import {
  ALL_LEAVES,
  DASHBOARD_CARDS,
  NAV_SECTIONS,
  NAV_SECTION_LABELS,
  cardGrantId,
  screenGrantId,
  screenLeavesBySection,
  type AccessLeaf,
} from "./catalog";

export type CheckState = "on" | "off" | "mixed";

/** Node kinds. `category` is shared with the schema tree on purpose — the
 *  renderer keys section typography off that exact string. */
export type AccessNodeKind = "category" | "screen" | "cards-folder" | "card" | "permission";

export interface AccessNode {
  /** Stable path id, so expansion survives a re-derivation. */
  id: string;
  kind: AccessNodeKind;
  label: string;
  /** Sits next to the label — the route, or what the permission allows. */
  sublabel?: string;
  /** Granted leaves out of total, rendered in the shared right-hand gutter. */
  count?: number;
  /** The grant this row toggles. Absent on pure folders. */
  grantId?: string;
  children: AccessNode[];
}

const PERMISSIONS_FOLDER_ID = "folder.permissions";
const CARDS_FOLDER_ID = "folder.cards";

const leafNode = (leaf: AccessLeaf, kind: AccessNodeKind): AccessNode => ({
  id: leaf.id,
  kind,
  label: leaf.label,
  sublabel: leaf.hint,
  grantId: leaf.id,
  children: [],
});

/**
 * The full tree. Independent of who is looking — check state is computed
 * separately (`checkState`) so the same derived tree can be rendered for any
 * role without rebuilding it.
 */
export function buildAccessTree(): AccessNode[] {
  const bySection = screenLeavesBySection();
  const permissionLeaves = ALL_LEAVES.filter((l) => l.kind === "permission");

  const sections: AccessNode[] = NAV_SECTIONS.map((sectionId) => ({
    id: `section.${sectionId}`,
    kind: "category" as const,
    label: NAV_SECTION_LABELS[sectionId],
    children: bySection[sectionId].map((leaf) => {
      const node = leafNode(leaf, "screen");
      // Only the dashboard has anything below it today. Cards hang off the
      // screen they appear on so that un-ticking Dashboard visibly takes its
      // cards with it, rather than leaving orphaned checkboxes ticked.
      if (leaf.navKey === "dashboard") {
        node.children = [
          {
            id: CARDS_FOLDER_ID,
            kind: "cards-folder",
            label: "Cards",
            children: DASHBOARD_CARDS.map((c) => ({
              id: cardGrantId(c.id),
              kind: "card" as const,
              label: c.label,
              grantId: cardGrantId(c.id),
              children: [],
            })),
          },
        ];
      }
      return node;
    }),
  })).filter((s) => s.children.length > 0);

  return [
    ...sections,
    {
      id: PERMISSIONS_FOLDER_ID,
      kind: "category",
      label: "Permissions",
      children: permissionLeaves.map((l) => leafNode(l, "permission")),
    },
  ];
}

/** Every grant id under `node`, itself included. */
export function grantIdsUnder(node: AccessNode): string[] {
  const out: string[] = [];
  const walk = (n: AccessNode) => {
    if (n.grantId) out.push(n.grantId);
    n.children.forEach(walk);
  };
  walk(node);
  return out;
}

/**
 * Tri-state for a row.
 *
 * A screen that is itself granted but whose cards are partly withheld reads as
 * mixed, which is the honest answer: something under it is off.
 */
export function checkState(node: AccessNode, granted: ReadonlySet<string>): CheckState {
  const ids = grantIdsUnder(node);
  if (ids.length === 0) return "off";
  let on = 0;
  for (const id of ids) if (granted.has(id)) on++;
  if (on === 0) return "off";
  return on === ids.length ? "on" : "mixed";
}

/**
 * Ticking a row grants everything under it; un-ticking revokes the same set.
 * A mixed row fills in — the only reading where clicking twice is a no-op.
 *
 * Returns a new set; callers hold grants as immutable state.
 */
export function toggleNode(
  node: AccessNode,
  granted: ReadonlySet<string>,
): Set<string> {
  const next = new Set(granted);
  const ids = grantIdsUnder(node);
  const turnOn = checkState(node, granted) !== "on";
  for (const id of ids) {
    if (turnOn) next.add(id);
    else next.delete(id);
  }
  // A card cannot be reachable while the screen carrying it is not.
  if (turnOn && node.kind !== "category") {
    if (ids.some((id) => id.startsWith("card."))) next.add(screenGrantId("dashboard"));
  }
  if (!turnOn && ids.includes(screenGrantId("dashboard"))) {
    for (const c of DASHBOARD_CARDS) next.delete(cardGrantId(c.id));
  }
  return next;
}

/** `3/9` style counts for the gutter, folders only. */
export function withCounts(nodes: AccessNode[], granted: ReadonlySet<string>): AccessNode[] {
  return nodes.map((n) => {
    if (n.children.length === 0) return n;
    const ids = grantIdsUnder(n);
    return {
      ...n,
      count: ids.filter((id) => granted.has(id)).length,
      children: withCounts(n.children, granted),
    };
  });
}
