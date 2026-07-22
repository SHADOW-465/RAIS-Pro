// Interim role / environment proxy (UX philosophy F4, RP-*).
// Real auth later; until then a stored persona shapes nav chrome.

import type { NavKey } from "@/lib/nav-keys";
export type { NavKey };

export type PersonaId = "operator" | "supervisor" | "qe" | "qa" | "gm";

export interface PersonaDef {
  id: PersonaId;
  /** Short label in the switcher */
  label: string;
  /** Subtitle under name */
  title: string;
  /** Display initial */
  initial: string;
  /** Home route for this role */
  homeHref: string;
  /** Nav keys this persona may see (deny by omission). */
  navAllow: readonly NavKey[];
}

/**
 * Allowed destinations per role. Analysis engines stay in the product;
 * chrome is filtered so operators never see schema / admin / dense tools.
 */
export const PERSONAS: Record<PersonaId, PersonaDef> = {
  operator: {
    id: "operator",
    label: "Operator",
    title: "Shop floor entry",
    initial: "O",
    homeHref: "/data-entry",
    navAllow: ["dashboard", "data-entry"],
  },
  supervisor: {
    id: "supervisor",
    label: "Supervisor",
    title: "Shift lead",
    initial: "S",
    homeHref: "/data-entry",
    navAllow: [
      "dashboard",
      "data-entry",
      "staging",
      "audit",
      "capa",
      "reports",
    ],
  },
  qe: {
    id: "qe",
    label: "Quality Eng.",
    title: "Investigation",
    initial: "Q",
    homeHref: "/",
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
      "schema",
      "settings",
    ],
  },
  qa: {
    id: "qa",
    label: "QA Manager",
    title: "Governance",
    initial: "A",
    homeHref: "/",
    navAllow: [
      "dashboard",
      "staging",
      "stage",
      "size",
      "defect",
      "spc",
      "copq",
      "reports",
      "capa",
      "ask",
      "audit",
      "settings",
    ],
  },
  gm: {
    id: "gm",
    label: "GM",
    title: "Plant head",
    initial: "G",
    homeHref: "/",
    navAllow: [
      "dashboard",
      "copq",
      "reports",
      "capa",
      "ask",
      "audit",
      "settings",
      "clear-data",
    ],
  },
};

export const PERSONA_ORDER: PersonaId[] = [
  "operator",
  "supervisor",
  "qe",
  "qa",
  "gm",
];

export const DEFAULT_PERSONA: PersonaId = "qe";
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
