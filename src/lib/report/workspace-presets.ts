// Layout presets for the Reports workspace.
//
// Contract: a preset stores report type + period mode + optional notes.
// It does NOT freeze an absolute custom date range unless persistCustomDates
// is explicitly true. Financial Year mode stores the mode, not a past FY.
// User layouts are plant-wide (plant_shared_state). Built-ins stay in this file.
// Tests inject `storage`; only window.localStorage is pushed to the server.

import { z } from "zod";
import { slot } from "@/lib/storage";
import { pushShared } from "@/lib/shared-state/push";
import { invalidateAfterWrite } from "@/lib/client/invalidate";
import type { ReportPeriodMode, ReportType } from "./report-scope";

/** The key the pre-wrapper code used; adopted once by the slot below. */
export const WORKSPACE_PRESETS_KEY = "moid_report_workspace_presets";

const userPresets = (store: PresetStorage | null) =>
  slot({
    name: "report-workspace-presets",
    schema: z.array(
      z.looseObject({ id: z.string(), name: z.string(), reportType: z.string(), periodMode: z.string() }),
    ) as unknown as z.ZodType<WorkspacePreset[]>,
    legacyKeys: [WORKSPACE_PRESETS_KEY],
    store,
  });

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
  // Stale or damaged saves are discarded by the slot and read as "none saved".
  const list = userPresets(storage).get() ?? [];
  return { ok: true, value: list.filter((p) => p.reportType && !p.builtIn) };
}

function writeUser(storage: PresetStorage | null, list: WorkspacePreset[]): PresetStoreResult<true> {
  if (!storage) {
    return { ok: false, error: "Browser storage is not available. Layout presets stay in this session only." };
  }
  return userPresets(storage).set(list)
    ? { ok: true, value: true }
    : { ok: false, error: "Could not write layout presets to browser storage." };
}

function usesBrowser(storage: PresetStorage | null): boolean {
  if (typeof window === "undefined" || storage == null) return false;
  try {
    return storage === window.localStorage;
  } catch {
    return false;
  }
}

export function readUserWorkspacePresets(
  storage: PresetStorage | null = defaultStorage(),
): WorkspacePreset[] {
  const users = readUser(storage);
  return users.ok ? users.value : [];
}

/** Cache the plant's user layouts. Does not push them back. */
export function replaceUserWorkspacePresets(
  list: WorkspacePreset[],
  storage: PresetStorage | null = defaultStorage(),
): void {
  const users = list.filter((p) => p.reportType && !p.builtIn && !p.id.startsWith("builtin:"));
  writeUser(storage, users);
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
  const saved = [next, ...rest];
  const written = writeUser(storage, saved);
  if (!written.ok) return written;
  if (usesBrowser(storage)) {
    pushShared("workspace-presets", { kind: "workspace-presets", record: saved });
  }
  void invalidateAfterWrite("presets");
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
  if (usesBrowser(storage)) {
    pushShared("workspace-presets", { kind: "workspace-presets", record: next });
  }
  void invalidateAfterWrite("presets");
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
