// What a role can be granted. The vocabulary, and nothing else.
//
// A grant is a flat string id. The folder structure a GM sees on Settings is
// derived from these ids (tree.ts), never stored — the same relationship
// `lib/schema/tree.ts` has with the flat plant catalog, and for the same
// reason: a structural rule then lives in exactly one file.
//
// ── The rule for what may appear here ──────────────────────────────────────
// Every leaf must be enforceable. AppShell already says it, about the topbar
// scope controls: "a control that sometimes does nothing teaches people that
// controls do nothing". A checkbox a GM ticks that changes nothing a
// supervisor can reach is worse than no checkbox, because it reads as a
// security decision that was made and honoured.
//
// So this file deliberately does NOT yet contain finer actions than the four
// capability bits — no "may publish a MOD" separate from "may write" — because
// `lib/auth/guard.ts` cannot enforce that distinction today. Split a bit here
// only in the same change that teaches the guard to check it.
//
// Settings sections are absent for the same reason: hiding "Administrative"
// while `configure` still opens /api/clear-data would be decoration.

import {
  NAV_ROUTES,
  NAV_SECTIONS,
  NAV_SECTION_LABELS,
  type NavKey,
  type NavSectionId,
} from "@/lib/nav-keys";
import type { PersonaCapabilities } from "@/lib/persona";

export type Capability = keyof PersonaCapabilities;

export type AccessLeafKind = "screen" | "card" | "permission";

export interface AccessLeaf {
  /** Stable grant id. Changing one silently revokes access — don't. */
  id: string;
  label: string;
  kind: AccessLeafKind;
  /** Sidebar destination this leaf opens, for screen leaves. */
  navKey?: NavKey;
  /** The capability bit this leaf IS, for permission leaves. */
  capability?: Capability;
  /** Dashboard card id — matches a `<DashItem id>` in app/page.tsx. */
  cardId?: string;
  /** Shown beside the label; say what it lets someone do, not what it is. */
  hint?: string;
}

// ── Screens ─────────────────────────────────────────────────────────────────

export const screenGrantId = (key: NavKey): string => `screen.${key}`;

const SCREEN_LEAVES: AccessLeaf[] = (Object.keys(NAV_ROUTES) as NavKey[]).map((key) => ({
  id: screenGrantId(key),
  label: NAV_ROUTES[key].label,
  kind: "screen" as const,
  navKey: key,
  hint: NAV_ROUTES[key].href ?? "opens over the current screen",
}));

/** Screens, grouped the way the sidebar groups them. */
export function screenLeavesBySection(): Record<NavSectionId, AccessLeaf[]> {
  const out = Object.fromEntries(
    NAV_SECTIONS.map((s) => [s, [] as AccessLeaf[]]),
  ) as Record<NavSectionId, AccessLeaf[]>;
  for (const leaf of SCREEN_LEAVES) out[NAV_ROUTES[leaf.navKey!].section].push(leaf);
  return out;
}

// ── Dashboard cards ─────────────────────────────────────────────────────────
// Ids match `<DashItem id="…">` in src/app/page.tsx. A card listed here that no
// longer exists on the board is harmless — DashboardBoard already drops unknown
// ids when it merges a saved order — but a card on the board that is missing
// here can never be withheld, so this list is the one to update when a card is
// added. `dashboardCardIds` is exported so a test can hold the two together.

export const DASHBOARD_CARDS: { id: string; label: string }[] = [
  { id: "kpis", label: "Headline KPIs" },
  { id: "wip", label: "Open WIP strip" },
  { id: "trend", label: "Rejection trend" },
  { id: "by-stage", label: "Rejection by stage" },
  { id: "pareto", label: "Defect Pareto" },
  { id: "stage-trend", label: "Stage trend" },
  { id: "heatmap", label: "Defect heatmap" },
  { id: "size-ytd", label: "Size year to date" },
  { id: "size-trend", label: "Size trend" },
  { id: "copq", label: "Cost of rejection" },
  { id: "audit", label: "Data trust & provenance" },
  { id: "quality", label: "Quality summary" },
  { id: "funnel", label: "Production funnel" },
  { id: "attention", label: "Needs attention" },
  { id: "ai-brief", label: "AI brief" },
];

export const cardGrantId = (cardId: string): string => `card.${cardId}`;

const CARD_LEAVES: AccessLeaf[] = DASHBOARD_CARDS.map((c) => ({
  id: cardGrantId(c.id),
  label: c.label,
  kind: "card" as const,
  cardId: c.id,
}));

export const dashboardCardIds = (): string[] => DASHBOARD_CARDS.map((c) => c.id);

// ── Permissions ─────────────────────────────────────────────────────────────
// The four bits `lib/auth/guard.ts` actually checks. Wording is deliberately
// about consequences: a GM picking a role's rights should not have to know that
// "eraseLedger" is the thing that makes plant history unrecoverable.

export const permissionGrantId = (cap: Capability): string => `permission.${cap}`;

const PERMISSION_LEAVES: AccessLeaf[] = [
  {
    id: permissionGrantId("write"),
    label: "Record plant data",
    kind: "permission",
    capability: "write",
    hint: "save entries, import workbooks, publish a mapping",
  },
  {
    id: permissionGrantId("approve"),
    label: "Approve edit requests and alerts",
    kind: "permission",
    capability: "approve",
    hint: "resolve what someone else raised",
  },
  {
    id: permissionGrantId("configure"),
    label: "Change schema, settings and logins",
    kind: "permission",
    capability: "configure",
    hint: "includes creating and editing roles",
  },
  {
    id: permissionGrantId("eraseLedger"),
    label: "Erase rows from the ledger",
    kind: "permission",
    capability: "eraseLedger",
    hint: "permanent; correcting a value is a different, safe path",
  },
];

// ── The whole vocabulary ────────────────────────────────────────────────────

export const ALL_LEAVES: AccessLeaf[] = [
  ...SCREEN_LEAVES,
  ...CARD_LEAVES,
  ...PERMISSION_LEAVES,
];

const BY_ID = new Map(ALL_LEAVES.map((l) => [l.id, l]));

export const leafById = (id: string): AccessLeaf | undefined => BY_ID.get(id);

/** Section headings, for the tree and for anything listing groups. */
export { NAV_SECTIONS, NAV_SECTION_LABELS };
export type { NavSectionId };

// ── Grants ⟷ the stored role ────────────────────────────────────────────────
// A role is stored as `navAllow` + `capabilities` (lib/auth/roles.ts). Grants
// are the same information addressed one leaf at a time, so the two convert
// both ways without a schema change — which is what lets the tree ship before
// the roles table grows a `grants` column.
//
// Card grants have nowhere to live yet, so `grantsFromRole` marks every card as
// granted: that is today's behaviour, where the board shows everyone the same
// cards. Withholding one becomes real when the column exists.

export interface StoredRoleAccess {
  navAllow: readonly NavKey[];
  capabilities: PersonaCapabilities;
  /** Present once plant_roles carries a grants column; ignored until then. */
  grants?: readonly string[];
}

export function grantsFromRole(role: StoredRoleAccess): Set<string> {
  const out = new Set<string>();
  for (const key of role.navAllow) out.add(screenGrantId(key));
  for (const leaf of PERMISSION_LEAVES) {
    if (role.capabilities[leaf.capability!]) out.add(leaf.id);
  }
  if (role.grants) {
    for (const id of role.grants) if (BY_ID.has(id)) out.add(id);
  } else {
    for (const leaf of CARD_LEAVES) out.add(leaf.id);
  }
  return out;
}

/** The inverse: what to persist for a set of ticked leaves. */
export function roleAccessFromGrants(
  granted: ReadonlySet<string>,
): { navAllow: NavKey[]; capabilities: PersonaCapabilities; grants: string[] } {
  const navAllow: NavKey[] = [];
  for (const leaf of SCREEN_LEAVES) {
    if (granted.has(leaf.id)) navAllow.push(leaf.navKey!);
  }
  const capabilities: PersonaCapabilities = {
    write: granted.has(permissionGrantId("write")),
    approve: granted.has(permissionGrantId("approve")),
    configure: granted.has(permissionGrantId("configure")),
    eraseLedger: granted.has(permissionGrantId("eraseLedger")),
  };
  const grants = ALL_LEAVES.filter((l) => granted.has(l.id)).map((l) => l.id);
  return { navAllow, capabilities, grants };
}
