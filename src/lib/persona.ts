// Interim role / environment proxy (UX philosophy F4, RP-*).
// Real auth later; until then a stored persona shapes nav chrome only.
// Does not affect APIs, analytics, routing tables, or page functionality —
// only which sidebar (and command-palette destination) items are visible.

import type { NavKey } from "@/lib/nav-keys";
export type { NavKey };

/** Dashboard role views: GM (full), Owner, Data Entry Operator. */
export type PersonaId = "gm" | "owner" | "operator";

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
}

/** Full sidebar — every key used by AppShell NAV_SECTIONS (+ clear-data for palette). */
const FULL_NAV: readonly NavKey[] = [
  "dashboard",
  "workbooks",
  "data-entry",
  "staging",
  "stage",
  "size",
  "defect",
  "spc",
  "process-flow",
  "copq",
  "reports",
  "capa",
  "ask",
  "audit",
  "schema",
  "settings",
  "clear-data",
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
  },
  owner: {
    id: "owner",
    label: "Owner",
    title: "Executive view",
    initial: "O",
    homeHref: "/",
    // Hide: Workbooks category, Data category, and under Management:
    // Audit Trail, Data Schema, Settings.
    navAllow: [
      "dashboard",
      "stage",
      "size",
      "defect",
      "spc",
      "process-flow",
      "copq",
      "reports",
      "capa",
      "ask",
      "clear-data",
    ],
  },
  operator: {
    id: "operator",
    label: "Data Entry Operator",
    title: "Entry & review",
    initial: "D",
    homeHref: "/",
    // Hide under Management: Data Schema, Settings.
    navAllow: [
      "dashboard",
      "workbooks",
      "data-entry",
      "staging",
      "stage",
      "size",
      "defect",
      "spc",
      "process-flow",
      "copq",
      "reports",
      "capa",
      "ask",
      "audit",
      "clear-data",
    ],
  },
};

export const PERSONA_ORDER: PersonaId[] = ["gm", "owner", "operator"];

/** Default: full-access GM dashboard (matches complete sidebar). */
export const DEFAULT_PERSONA: PersonaId = "gm";
export const PERSONA_STORAGE_KEY = "moid_persona";

export function isPersonaId(v: string | null | undefined): v is PersonaId {
  return !!v && v in PERSONAS;
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

export function personaAllowsNav(persona: PersonaId, key: NavKey): boolean {
  return PERSONAS[persona].navAllow.includes(key);
}

export function filterNavKeys(
  persona: PersonaId,
  keys: readonly NavKey[]
): NavKey[] {
  return keys.filter((k) => personaAllowsNav(persona, k));
}
