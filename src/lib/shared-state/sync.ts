// One-time import and pull. The local slot is the cache and the fallback:
// it is never removed. The imported marker is set only after the server
// confirms (a saved document, a successful import, or both sides empty).

import { customDefects } from "@/lib/ui-prefs";
import { adoptGrants, listActiveGrants } from "@/lib/entry/edit-grants";
import { adoptLotMemory, readLotMemory } from "@/lib/entry/lot-memory";
import { adoptShiftWindowConfig, readStoredShiftWindow } from "@/lib/entry/shift-window";
import { readUserPresets, replaceUserPresets } from "@/lib/report/presets-store";
import { readUserWorkspacePresets, replaceUserWorkspacePresets } from "@/lib/report/workspace-presets";
import { importedMarker } from "@/lib/storage";
import { isEmptyRecord, SHARED_KINDS, SHARED_STATE_UNAVAILABLE_MESSAGE, type SharedKind } from "./kinds";
import { revisionOf, setSharedWarning, SHARED_STATE_EVENT } from "./push";

export type SyncStep = "apply-server" | "import-local" | "mark-empty" | "keep-local" | "keep-silent";

/**
 * What to do after one GET.
 * 503/5xx keeps the local copy and does not mark it imported.
 * 401/403 keeps it quietly (a role miss is not a missing table).
 * A confirmed import is the caller's job — this only names the step.
 */
export function nextSyncStep(input: {
  status: number;
  serverEmpty: boolean;
  localEmpty: boolean;
  imported: boolean;
}): SyncStep {
  if (input.status === 401 || input.status === 403) return "keep-silent";
  if (input.status === 503 || input.status >= 500) return "keep-local";
  if (input.status !== 200) return "keep-silent";
  if (!input.serverEmpty) return "apply-server";
  if (!input.localEmpty && !input.imported) return "import-local";
  return "mark-empty";
}

function localRecord(kind: SharedKind): unknown {
  switch (kind) {
    case "report-presets":
      return readUserPresets();
    case "workspace-presets":
      return readUserWorkspacePresets();
    case "shift-windows":
      return readStoredShiftWindow();
    case "lot-memory":
      return readLotMemory();
    case "edit-grants":
      return { grants: listActiveGrants() };
    case "custom-defects":
      return customDefects.get() ?? [];
    default:
      return null;
  }
}

/** Write a server document into the local cache. Does not push it back. */
export function adoptSharedRecord(kind: SharedKind, record: unknown): void {
  switch (kind) {
    case "report-presets":
      if (Array.isArray(record)) replaceUserPresets(record as never);
      break;
    case "workspace-presets":
      if (Array.isArray(record)) replaceUserWorkspacePresets(record as never);
      break;
    case "shift-windows":
      if (record && typeof record === "object") adoptShiftWindowConfig(record as never);
      break;
    case "lot-memory":
      adoptLotMemory(record && typeof record === "object" ? (record as never) : null);
      break;
    case "edit-grants": {
      const grants = Array.isArray(record)
        ? record
        : record && typeof record === "object" && Array.isArray((record as { grants?: unknown }).grants)
          ? (record as { grants: never[] }).grants
          : [];
      adoptGrants(grants);
      break;
    }
    case "custom-defects":
      if (Array.isArray(record)) customDefects.set(record as never);
      break;
    default:
      break;
  }
}

function dispatch(kind: SharedKind): void {
  window.dispatchEvent(new CustomEvent(SHARED_STATE_EVENT, { detail: { kind } }));
}

async function syncKind(kind: SharedKind): Promise<string | null> {
  const seen = revisionOf(kind);
  let res: Response;
  try {
    res = await fetch(`/api/shared-state?kind=${encodeURIComponent(kind)}`, {
      credentials: "same-origin",
      cache: "no-store",
    });
  } catch {
    return null;
  }
  if (res.status === 503) {
    const data = await res.json().catch(() => null);
    return typeof data?.error === "string" ? data.error : SHARED_STATE_UNAVAILABLE_MESSAGE;
  }
  if (!res.ok) return null;
  const data = await res.json().catch(() => null);
  if (!data || data.source !== "db") return null;
  if (revisionOf(kind) !== seen) return null;

  const serverRecord = data.record ?? null;
  const local = localRecord(kind);
  const step = nextSyncStep({
    status: 200,
    serverEmpty: isEmptyRecord(kind, serverRecord),
    localEmpty: isEmptyRecord(kind, local),
    imported: importedMarker(kind).get() === true,
  });

  if (step === "apply-server") {
    if (revisionOf(kind) !== seen) return null;
    adoptSharedRecord(kind, serverRecord);
    importedMarker(kind).set(true);
    dispatch(kind);
    return null;
  }
  if (step === "mark-empty") {
    importedMarker(kind).set(true);
    return null;
  }
  if (step !== "import-local") return null;

  let put: Response;
  try {
    put = await fetch("/api/shared-state", {
      method: "PUT",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind, import: true, record: local }),
    });
  } catch {
    return null;
  }
  if (put.status === 503) {
    const body = await put.json().catch(() => null);
    return typeof body?.error === "string" ? body.error : SHARED_STATE_UNAVAILABLE_MESSAGE;
  }
  // 401/403: do not mark imported, so a role that can write still gets a chance.
  if (!put.ok) return null;
  const saved = await put.json().catch(() => null);
  if (revisionOf(kind) !== seen) return null;
  if (saved && "record" in saved) adoptSharedRecord(kind, saved.record);
  importedMarker(kind).set(true);
  dispatch(kind);
  return null;
}

/** Pull every kind. Safe to call once per page load. */
export async function refreshSharedState(): Promise<void> {
  if (typeof window === "undefined") return;
  let unavailable: string | null = null;
  for (const kind of SHARED_KINDS) {
    const msg = await syncKind(kind);
    if (msg) unavailable = msg;
  }
  setSharedWarning(unavailable ? `${unavailable} This browser is still using its own copy.` : null);
}
