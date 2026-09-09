// Interim role / environment proxy (UX philosophy F4, RP-*).
// Real auth later; until then a stored persona shapes nav chrome only.
// Does not affect APIs, analytics, routing tables, or page functionality —
// only which sidebar (and command-palette destination) items are visible.

import type { NavKey } from "@/lib/nav-keys";
export type { NavKey };

/** Built-in role views: GM (full), Owner, Data Entry Operator. */
export type PersonaId = "gm" | "owner" | "operator";

/**
 * A role id in general — built-in or one the plant created.
 *
 * Roles moved into the database (`plant_roles`, lib/auth/roles.ts), so the id
 * of the role on a session is no longer drawn from a closed union. The three
 * built-ins below stay in code as the seed AND as the anti-lockout fallback:
 * if the roles table is missing or unreadable, a GM is still a GM.
 *
 * Anything that indexes role definitions must go through `personaDef()`, which
 * denies by omission for an id it does not know. `PERSONAS[id]` on a RoleId is
 * a crash waiting for the first custom role.
 */
export type RoleId = string;

/** Capability bits beyond chrome nav. Interim until real auth. */
export interface PersonaCapabilities {
  /** May mutate plant data (save entry, ingest, verify, CAPA create, …). */
  write: boolean;
  /** May approve edit requests / ack operational notifications (GM). */
  approve: boolean;
  /** May change schema, settings, clear data. */
  configure: boolean;
  /**
   * May permanently erase a row that is already in the ledger.
   *
   * Deliberately separate from `write` and `configure`: an operator must be
   * able to save entries (write) and must NOT be able to erase them once
   * saved, and erasing plant history is a governance act, not a settings
   * change. Correcting a saved value is a different, non-destructive path
   * (CorrectionEvent) and is not gated by this bit.
   */
  eraseLedger: boolean;
}

export interface PersonaDef {
  id: PersonaId;
  /** Short label in the switcher */
  label: string;
  /** Subtitle under name */
  title: string;
  /** Display initial */
  initial: string;
  /** Home route for this role (navigate here on role switch) */
  homeHref: string;
  /** Nav keys this persona may see (deny by omission). */
  navAllow: readonly NavKey[];
  capabilities: PersonaCapabilities;
}

/** Full sidebar — every key used by AppShell NAV_SECTIONS. */
const FULL_NAV: readonly NavKey[] = [
  "dashboard",
  "workbooks",
  "data-entry",
  "staging",
  "stage",
  "size",
  "defect",
  "hold",
  "open-lots",
  "spc",
  "process-flow",
  "copq",
  "reports",
  "capa",
  "remedies",
  "alerts",
  "ask",
  "audit",
  "schema",
  "settings",
];

/**
 * Allowed destinations per role. Analysis engines stay in the product;
 * chrome is filtered so each role only sees its sidebar items.
 */
export const PERSONAS: Record<PersonaId, PersonaDef> = {
  gm: {
    id: "gm",
    label: "General Manager (GM)",
    title: "Full access",
    initial: "G",
    homeHref: "/",
    navAllow: FULL_NAV,
    capabilities: { write: true, approve: true, configure: true, eraseLedger: true },
  },
  owner: {
    id: "owner",
    label: "Owner",
    title: "View only",
    initial: "O",
    homeHref: "/",
    // Hide: Workbooks category, Data category, and under Management:
    // Audit Trail, Data Schema, Settings. Analysis + reports only.
    navAllow: [
      "dashboard",
      "stage",
      "size",
      "defect",
      "hold",
      "open-lots",
      "spc",
      "process-flow",
      "copq",
      "reports",
      "capa",
      "remedies",
      "alerts",
      "ask",
    ],
    // View-only: no mutations, no approvals, no config.
    capabilities: { write: false, approve: false, configure: false, eraseLedger: false },
  },
  operator: {
    id: "operator",
    label: "Data Entry Operator",
    title: "Entry & review",
    initial: "D",
    // Lands where the work is. A GM opens the plant's state; an operator opens
    // the form they are about to fill.
    homeHref: "/data-entry",
    // Hide under Management: Data Schema, Settings.
    navAllow: [
      "data-entry",
      "staging",
      "workbooks",
      "dashboard",
      "stage",
      "size",
      "defect",
      "hold",
      "open-lots",
      "spc",
      "process-flow",
      "copq",
      "reports",
      "capa",
      "remedies",
      "alerts",
      "ask",
      "audit",
    ],
    capabilities: { write: true, approve: false, configure: false, eraseLedger: false },
  },
};

export const PERSONA_ORDER: PersonaId[] = ["gm", "owner", "operator"];

/** Default: full-access GM dashboard (matches complete sidebar). */
export const DEFAULT_PERSONA: PersonaId = "gm";
export const PERSONA_STORAGE_KEY = "moid_persona";

export function isPersonaId(v: string | null | undefined): v is PersonaId {
  return !!v && v in PERSONAS;
}

/**
 * Definition for a role id, or a zero-access stand-in for one we do not know.
 *
 * Deny by omission, same rule as `navAllow`: an unrecognised role sees no
 * sidebar and holds no capability, rather than throwing on `.label` somewhere
 * deep in the chrome. The API boundary resolves the real definition from the
 * roles store (lib/auth/roles.ts); this is what the client falls back to while
 * it only knows the built-ins.
 */
export function personaDef(id: RoleId): PersonaDef {
  const known = PERSONAS[id as PersonaId];
  if (known) return known;
  return {
    id: id as PersonaId,
    label: id || "Unknown role",
    title: "No access configured",
    initial: (id || "?").charAt(0).toUpperCase(),
    homeHref: "/",
    navAllow: [],
    capabilities: { write: false, approve: false, configure: false, eraseLedger: false },
  };
}

export function readStoredPersona(): PersonaId {
  if (typeof window === "undefined") return DEFAULT_PERSONA;
  try {
    const v = localStorage.getItem(PERSONA_STORAGE_KEY);
    return isPersonaId(v) ? v : DEFAULT_PERSONA;
  } catch {
    return DEFAULT_PERSONA;
  }
}

export function writeStoredPersona(id: PersonaId): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(PERSONA_STORAGE_KEY, id);
  } catch {
    /* ignore */
  }
}

export function personaAllowsNav(persona: RoleId, key: NavKey): boolean {
  return personaDef(persona).navAllow.includes(key);
}

export function filterNavKeys(
  persona: RoleId,
  keys: readonly NavKey[]
): NavKey[] {
  return keys.filter((k) => personaAllowsNav(persona, k));
}

export function personaCapabilities(persona: RoleId): PersonaCapabilities {
  return personaDef(persona).capabilities;
}

export function canWrite(persona: RoleId): boolean {
  return personaDef(persona).capabilities.write;
}

export function canApprove(persona: RoleId): boolean {
  return personaDef(persona).capabilities.approve;
}

export function canConfigure(persona: RoleId): boolean {
  return personaDef(persona).capabilities.configure;
}

export function canEraseLedger(persona: RoleId): boolean {
  return personaDef(persona).capabilities.eraseLedger;
}
