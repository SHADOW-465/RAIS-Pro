// GM defect remedies. The plant book at /api/remedies is the source of truth.
// localStorage is a last-known-server cache plus a holding area for unpublished
// pre-sync drafts — never a successful save.

import { useEffect, useSyncExternalStore } from "react";
import { DEFECTS } from "@/core/ontology/plant-catalog";
import {
  catalogLabelFor,
  isRemedyComplete,
  resolveRemedyKey,
  validatedDefects,
} from "@/lib/remedies/identity";
import type { RemedyBookRow, RemedyRow, TrendNoteRow } from "@/lib/remedies/store";

export type { RemedyRow as DefectRemedy, TrendNoteRow as TrendNote };
export type RemedyBook = RemedyBookRow;

export {
  catalogLabelFor,
  isRemedyComplete,
  resolveRemedyKey,
};

const LEGACY_KEY = "moid_defect_remedies";
const CACHE_KEY = "moid_defect_remedies_server";
const EVT = "moid_defect_remedies_changed";

const EMPTY: RemedyBook = { defects: {}, trends: [] };

export type RemedySource = "loading" | "db" | "error" | "unavailable";

export interface RemedySyncState {
  book: RemedyBook;
  source: RemedySource;
  error: string | null;
  unpublishedLocal: RemedyBook | null;
}

function emptySync(source: RemedySource = "loading"): RemedySyncState {
  return { book: EMPTY, source, error: null, unpublishedLocal: null };
}

function readJson(key: string): unknown {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function asBook(raw: unknown): RemedyBook {
  const v = (raw ?? {}) as Partial<RemedyBook>;
  return {
    defects: v.defects && typeof v.defects === "object" ? (v.defects as RemedyBook["defects"]) : {},
    trends: Array.isArray(v.trends) ? v.trends : [],
  };
}

function cacheServerBook(book: RemedyBook): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({ source: "server", book }));
  } catch {
    /* quota / private */
  }
}

function readServerCache(): RemedyBook | null {
  const parsed = readJson(CACHE_KEY) as { source?: string; book?: RemedyBook } | null;
  if (parsed && parsed.source === "server" && parsed.book) return asBook(parsed.book);
  return null;
}

function readLegacyLocal(): RemedyBook {
  return asBook(readJson(LEGACY_KEY));
}

function unpublishedFrom(local: RemedyBook, server: RemedyBook): RemedyBook | null {
  const extras = validatedDefects(local.defects);
  const novel: RemedyBook["defects"] = {};
  for (const [code, row] of Object.entries(extras)) {
    if (isRemedyComplete(server.defects[code])) continue;
    novel[code] = row;
  }
  const novelTrends = (local.trends ?? []).filter(
    (t) => t && t.description?.trim() && t.remedy?.trim() && !server.trends.some((s) => s.id === t.id),
  );
  if (Object.keys(novel).length === 0 && novelTrends.length === 0) return null;
  return { defects: novel, trends: novelTrends };
}

let snapshot: RemedySyncState = emptySync();
if (typeof window !== "undefined") {
  const cached = readServerCache();
  if (cached) snapshot = { ...emptySync("loading"), book: cached };
}

const listeners = new Set<() => void>();

function emit(next: RemedySyncState): void {
  snapshot = next;
  if (typeof window !== "undefined") window.dispatchEvent(new Event(EVT));
  for (const fn of listeners) fn();
}

function applyServer(book: RemedyBook): void {
  const unpublishedLocal = unpublishedFrom(readLegacyLocal(), book);
  cacheServerBook(book);
  emit({ book, source: "db", error: null, unpublishedLocal });
}

async function parseRead(res: Response): Promise<{ source?: string; book?: RemedyBook; error?: string; conflict?: boolean }> {
  return (await res.json().catch(() => null)) ?? {};
}

let pulling: Promise<void> | null = null;

export async function pullRemedies(): Promise<void> {
  if (typeof window === "undefined") return;
  try {
    const res = await fetch("/api/remedies", { credentials: "same-origin", cache: "no-store" });
    const data = await parseRead(res);
    if (res.status === 401) {
      emit({ ...snapshot, source: "error", error: "Sign in required to load plant remedies." });
      return;
    }
    if (res.status === 503 || data.source === "unavailable") {
      emit({
        ...snapshot,
        source: "unavailable",
        error: data.error || "Plant remedy book is not available. The tables may still need migrating.",
      });
      return;
    }
    if (!res.ok || data.source !== "db" || !data.book) {
      emit({
        ...snapshot,
        source: "error",
        error: data.error || "Could not load plant remedies.",
      });
      return;
    }
    applyServer(asBook(data.book));
  } catch {
    emit({ ...snapshot, source: "error", error: "Could not reach the plant remedy book." });
  }
}

function ensurePull(): void {
  if (typeof window === "undefined") return;
  if (!pulling) pulling = pullRemedies().finally(() => {
    pulling = null;
  });
}

async function put(body: Record<string, unknown>): Promise<RemedyBook> {
  const res = await fetch("/api/remedies", {
    method: "PUT",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await parseRead(res);
  if (res.status === 409 && data.book) {
    applyServer(asBook(data.book));
    throw new Error(data.error || "This remedy was updated by someone else. Reload and try again.");
  }
  if (res.status === 401) throw new Error("Sign in required to save remedies.");
  if (res.status === 403) throw new Error(data.error || "Your role cannot edit plant remedies.");
  if (res.status === 503 || data.source === "unavailable") {
    emit({
      ...snapshot,
      source: "unavailable",
      error: data.error || "Plant remedy book is not available.",
    });
    throw new Error(data.error || "Plant remedy book is not available. The save was not stored.");
  }
  if (!res.ok || data.source !== "db" || !data.book) {
    throw new Error(data.error || "The plant book rejected this save.");
  }
  const book = asBook(data.book);
  applyServer(book);
  return book;
}

function subscribe(cb: () => void): () => void {
  listeners.add(cb);
  const handler = () => cb();
  if (typeof window !== "undefined") {
    window.addEventListener(EVT, handler);
    window.addEventListener("storage", handler);
  }
  return () => {
    listeners.delete(cb);
    if (typeof window !== "undefined") {
      window.removeEventListener(EVT, handler);
      window.removeEventListener("storage", handler);
    }
  };
}

export function useRemedySync(): RemedySyncState {
  const state = useSyncExternalStore(subscribe, () => snapshot, () => emptySync());
  useEffect(() => {
    ensurePull();
    const refresh = () => {
      pulling = null;
      ensurePull();
    };
    const onVis = () => {
      if (document.visibilityState === "visible") refresh();
    };
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", onVis);
    return () => {
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, []);
  return state;
}

export function useRemedyBook(): RemedyBook {
  return useRemedySync().book;
}

export function catalogDefects(): { code: string; label: string; stages: string[] }[] {
  return DEFECTS.map((d) => ({
    code: d.defectCode,
    label: d.label,
    stages: d.stages,
  })).sort((a, b) => a.code.localeCompare(b.code));
}

export function lookupRemedy(book: RemedyBook, codeOrLabel: string): RemedyRow | null {
  const key = resolveRemedyKey(codeOrLabel);
  return book.defects[key] ?? book.defects[codeOrLabel] ?? null;
}

export async function saveDefectRemedy(
  code: string,
  fields: { description: string; remedy: string },
  _updatedBy?: string,
): Promise<RemedyRow> {
  const key = resolveRemedyKey(code);
  if (!key) throw new Error("Select a defect before saving.");
  const description = fields.description.trim();
  const remedy = fields.remedy.trim();
  if (!description || !remedy) {
    throw new Error("Explanatory description and remedy are both required.");
  }
  const current = snapshot.book.defects[key];
  const book = await put({
    code: key,
    description,
    remedy,
    version: current?.version ?? 0,
  });
  const saved = book.defects[key];
  if (!saved) throw new Error("The plant book did not return the saved remedy.");
  return saved;
}

export async function saveTrendNote(
  note: Omit<TrendNoteRow, "id" | "updatedAt" | "updatedBy" | "createdAt" | "createdBy" | "version"> & { id?: string },
): Promise<TrendNoteRow> {
  const book = await put({
    trend: {
      id: note.id,
      kind: note.kind,
      graph: note.graph,
      period: note.period,
      description: note.description,
      remedy: note.remedy,
    },
  });
  const saved = note.id ? book.trends.find((t) => t.id === note.id) : book.trends[0];
  if (!saved) throw new Error("The plant book did not return the saved note.");
  return saved;
}

export async function removeTrendNote(id: string): Promise<void> {
  await put({ removeTrendId: id });
}

export async function publishUnpublishedLocal(): Promise<void> {
  const unpublished = snapshot.unpublishedLocal;
  if (!unpublished) return;
  await put({ importLocal: true, book: unpublished });
  try {
    localStorage.removeItem(LEGACY_KEY);
  } catch {
    /* ignore */
  }
}

export function refreshRemedies(): void {
  pulling = null;
  ensurePull();
}

export const RANK_WORDS = ["Primary", "Secondary", "Tertiary"] as const;
