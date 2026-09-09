// Layout presets for the Reports workspace.
//
// Contract: a preset stores report type + period mode + optional notes.
// It does NOT freeze an absolute custom date range unless persistCustomDates
// is explicitly true. Financial Year mode stores the mode, not a past FY.
// Persistence is browser-local (localStorage) — not a governed plant template.

import type { ReportPeriodMode, ReportType } from "./report-scope";

export const WORKSPACE_PRESETS_KEY = "moid_report_workspace_presets";

export type WorkspacePreset = {
  id: string;
  name: string;
  builtIn: boolean;
  reportType: ReportType;
  periodMode: ReportPeriodMode;
  notes?: string;
  persistCustomDates?: boolean;
  dateFrom?: string;
  dateTo?: string;
  updatedAt: string;
};

export type PresetStoreResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: string };

export type PresetStorage = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem?(key: string): void;
};

function memoryStorage(): PresetStorage {
  const m = new Map<string, string>();
  return {
    getItem: (k) => m.get(k) ?? null,
    setItem: (k, v) => {
      m.set(k, v);
    },
    removeItem: (k) => {
      m.delete(k);
    },
  };
}

function defaultStorage(): PresetStorage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function builtInWorkspacePresets(): WorkspacePreset[] {
  const now = new Date(0).toISOString();
  const mk = (
    id: string,
    name: string,
    reportType: ReportType,
    periodMode: ReportPeriodMode,
  ): WorkspacePreset => ({
    id,
    name,
    builtIn: true,
    reportType,
    periodMode,
    updatedAt: now,
  });
  return [
    mk("builtin:fy-audit-pack", "Financial Year Audit Pack", "fy-audit-pack", "financial-year"),
    mk("builtin:fundamentals", "Fundamentals", "fundamentals", "financial-year"),
    mk("builtin:stage", "Stage-wise", "stage", "financial-year"),
    mk("builtin:defect", "Defect-wise", "defect", "financial-year"),
    mk("builtin:size", "Size-wise", "size", "financial-year"),
  ];
}

function readUser(storage: PresetStorage | null): PresetStoreResult<WorkspacePreset[]> {
  if (!storage) return { ok: true, value: [] };
  try {
    const raw = storage.getItem(WORKSPACE_PRESETS_KEY);
    if (!raw) return { ok: true, value: [] };
    const list = JSON.parse(raw) as WorkspacePreset[];
    if (!Array.isArray(list)) return { ok: false, error: "Saved layout presets are unreadable." };
    return { ok: true, value: list.filter((p) => p && p.id && p.reportType && !p.builtIn) };
  } catch {
    return { ok: false, error: "Could not read layout presets from browser storage." };
  }
}

function writeUser(storage: PresetStorage | null, list: WorkspacePreset[]): PresetStoreResult<true> {
  if (!storage) {
    return { ok: false, error: "Browser storage is not available. Layout presets stay in this session only." };
  }
  try {
    storage.setItem(WORKSPACE_PRESETS_KEY, JSON.stringify(list));
    return { ok: true, value: true };
  } catch {
    return { ok: false, error: "Could not write layout presets to browser storage." };
  }
}

export function listWorkspacePresets(storage: PresetStorage | null = defaultStorage()): PresetStoreResult<WorkspacePreset[]> {
  const users = readUser(storage);
  if (!users.ok) return users;
  const sorted = [...users.value].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  return { ok: true, value: [...builtInWorkspacePresets(), ...sorted] };
}

export function saveWorkspacePreset(
  preset: Omit<WorkspacePreset, "id" | "builtIn" | "updatedAt"> & { id?: string },
  storage: PresetStorage | null = defaultStorage(),
): PresetStoreResult<WorkspacePreset> {
  const users = readUser(storage);
  if (!users.ok) return users;
  if (preset.id?.startsWith("builtin:")) {
    return { ok: false, error: "Built-in layout presets cannot be overwritten. Save as a copy." };
  }
  const id =
    preset.id && !preset.id.startsWith("builtin:")
      ? preset.id
      : `user:${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
  const next: WorkspacePreset = {
    id,
    name: preset.name.trim() || "Untitled layout",
    builtIn: false,
    reportType: preset.reportType,
    periodMode: preset.periodMode,
    notes: preset.notes,
    persistCustomDates: preset.persistCustomDates === true,
    dateFrom: preset.persistCustomDates ? preset.dateFrom : undefined,
    dateTo: preset.persistCustomDates ? preset.dateTo : undefined,
    updatedAt: new Date().toISOString(),
  };
  const rest = users.value.filter((p) => p.id !== id);
  const written = writeUser(storage, [next, ...rest]);
  if (!written.ok) return written;
  return { ok: true, value: next };
}

export function deleteWorkspacePreset(
  id: string,
  storage: PresetStorage | null = defaultStorage(),
): PresetStoreResult<boolean> {
  if (id.startsWith("builtin:")) return { ok: false, error: "Built-in layout presets cannot be deleted." };
  const users = readUser(storage);
  if (!users.ok) return users;
  const next = users.value.filter((p) => p.id !== id);
  if (next.length === users.value.length) return { ok: true, value: false };
  const written = writeUser(storage, next);
  if (!written.ok) return written;
  return { ok: true, value: true };
}

export function workspacePresetFingerprint(p: {
  reportType: ReportType;
  periodMode: ReportPeriodMode;
  notes?: string;
}): string {
  return JSON.stringify({
    reportType: p.reportType,
    periodMode: p.periodMode,
    notes: p.notes ?? "",
  });
}

export { memoryStorage };
