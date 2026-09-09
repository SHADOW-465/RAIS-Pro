// Named report presets — built-in catalogue + user-saved (localStorage).
//
// Phase 2: the Reports page is an editor. Built-ins seed the shelf (including
// the full forensic book as one preset). User saves land next to them.

import type { ReportSpec } from "./blocks";
import {
  cloneSpec,
  presetFor,
  REPORT_PRESETS,
} from "./blocks";
import type { NavKey } from "@/lib/nav-keys";

export type NamedReportPreset = {
  id: string;
  name: string;
  /** System catalogue — cannot delete; Save-as creates a user copy. */
  builtIn: boolean;
  /** Optional badge in the UI. */
  description?: string;
  spec: ReportSpec;
  updatedAt: string;
};

export const NAMED_PRESETS_STORAGE_KEY = "moid_report_presets";

/** Built-in named presets always available on /reports (and loadable elsewhere). */
export function builtInNamedPresets(): NamedReportPreset[] {
  const now = new Date(0).toISOString();
  const gm = cloneSpec(presetFor("reports")!);
  const plant = cloneSpec(presetFor("dashboard")!);
  plant.origin = "reports";
  plant.title = "Plant Quality Review";

  return [
    {
      id: "builtin:gm-monthly",
      name: "GM monthly summary",
      builtIn: true,
      description: "Short management review — KPIs, trend, stage table, defects.",
      spec: gm,
      updatedAt: now,
    },
    {
      id: "builtin:plant-review",
      name: "Plant quality review",
      builtIn: true,
      description: "Dashboard-shaped executive pack.",
      spec: plant,
      updatedAt: now,
    },
    {
      id: "builtin:defect",
      name: "Defect analysis pack",
      builtIn: true,
      description: "Pareto + defect trend.",
      spec: (() => {
        const s = cloneSpec(presetFor("defect")!);
        s.origin = "reports";
        return s;
      })(),
      updatedAt: now,
    },
    {
      id: "builtin:cost",
      name: "Cost of rejection",
      builtIn: true,
      description: "COPQ-led pack.",
      spec: (() => {
        const s = cloneSpec(presetFor("copq")!);
        s.origin = "reports";
        return s;
      })(),
      updatedAt: now,
    },
  ];
}

function loadUserPresets(): NamedReportPreset[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(NAMED_PRESETS_STORAGE_KEY);
    if (!raw) return [];
    const list = JSON.parse(raw) as NamedReportPreset[];
    return Array.isArray(list) ? list.filter((p) => p && p.id && p.spec && !p.builtIn) : [];
  } catch {
    return [];
  }
}

function saveUserPresets(list: NamedReportPreset[]): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(NAMED_PRESETS_STORAGE_KEY, JSON.stringify(list));
  } catch {
    /* ignore */
  }
}

/** Built-ins first, then user saves (newest first). */
export function listNamedPresets(): NamedReportPreset[] {
  const users = loadUserPresets().sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  return [...builtInNamedPresets(), ...users];
}

export function getNamedPreset(id: string): NamedReportPreset | null {
  return listNamedPresets().find((p) => p.id === id) ?? null;
}

/** Save current editor state as a named preset (always a user preset). */
export function saveNamedPreset(name: string, spec: ReportSpec, existingId?: string): NamedReportPreset {
  const users = loadUserPresets();
  const now = new Date().toISOString();
  const id =
    existingId && !existingId.startsWith("builtin:")
      ? existingId
      : `user:${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
  const next: NamedReportPreset = {
    id,
    name: name.trim() || "Untitled report",
    builtIn: false,
    spec: cloneSpec(spec),
    updatedAt: now,
  };
  const rest = users.filter((p) => p.id !== id);
  saveUserPresets([next, ...rest]);
  return next;
}

export function deleteNamedPreset(id: string): boolean {
  if (id.startsWith("builtin:")) return false;
  const users = loadUserPresets();
  const next = users.filter((p) => p.id !== id);
  if (next.length === users.length) return false;
  saveUserPresets(next);
  return true;
}

/** Page-shaped default for ReportPanel (Export on analysis screens). */
export function defaultSpecForPage(page: NavKey): ReportSpec | null {
  if (page in REPORT_PRESETS) return cloneSpec(presetFor(page)!);
  return null;
}
