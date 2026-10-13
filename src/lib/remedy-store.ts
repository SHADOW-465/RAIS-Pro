// GM defect remedies — description + action per defect code, plus notes on
// graph spikes and dips. Client localStorage, same pattern as capa-store.

import { useEffect, useSyncExternalStore } from "react";
import { DEFECTS, canonicalDefectCode } from "@/core/ontology/plant-catalog";

export interface DefectRemedy {
  code: string;
  description: string;
  remedy: string;
  updatedAt: string;
  updatedBy: string;
}

export interface TrendNote {
  id: string;
  kind: "spike" | "dip";
  graph: string;
  period: string;
  description: string;
  remedy: string;
  updatedAt: string;
  updatedBy: string;
}

export interface RemedyBook {
  defects: Record<string, DefectRemedy>;
  trends: TrendNote[];
}

const KEY = "moid_defect_remedies";
const EVT = "moid_defect_remedies_changed";

const EMPTY: RemedyBook = { defects: {}, trends: [] };

function read(): RemedyBook {
  if (typeof window === "undefined") return EMPTY;
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return EMPTY;
    const v = JSON.parse(raw) as Partial<RemedyBook>;
    return {
      defects: v.defects && typeof v.defects === "object" ? v.defects : {},
      trends: Array.isArray(v.trends) ? v.trends : [],
    };
  } catch {
    return EMPTY;
  }
}

function write(next: RemedyBook): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    /* quota / private */
  }
  window.dispatchEvent(new Event(EVT));
}

let cache: RemedyBook = read();
let serverMode: "unknown" | "db" | "local" = "unknown";
let revision = 0;

function publish(next: RemedyBook): void {
  revision += 1;
  write(next);
  cache = read();
}

async function push(body: Record<string, unknown>): Promise<void> {
  if (typeof window === "undefined") return;
  if (serverMode === "local") return;
  try {
    const res = await fetch("/api/remedies", {
      method: "PUT",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (res.status === 401 || res.status === 403) return;
    const data = await res.json().catch(() => null);
    if (!res.ok || !data || data.source !== "db") {
      serverMode = "local";
      return;
    }
    serverMode = "db";
  } catch {
    serverMode = "local";
  }
}

let pulling: Promise<void> | null = null;

async function pull(): Promise<void> {
  if (typeof window === "undefined") return;
  const seen = revision;
  try {
    const res = await fetch("/api/remedies", { credentials: "same-origin", cache: "no-store" });
    if (!res.ok) {
      serverMode = "local";
      return;
    }
    const data = await res.json();
    if (revision !== seen) return;
    if (!data || data.source !== "db" || !data.book) {
      serverMode = "local";
      return;
    }
    serverMode = "db";
    const remote = data.book as RemedyBook;
    const local = read();
    const remoteEmpty = Object.keys(remote.defects ?? {}).length === 0 && (remote.trends ?? []).length === 0;
    const localHas = Object.keys(local.defects).length > 0 || local.trends.length > 0;
    if (remoteEmpty && localHas) {
      await push({ importLocal: true, book: local });
      return;
    }
    publish({
      defects: remote.defects && typeof remote.defects === "object" ? remote.defects : {},
      trends: Array.isArray(remote.trends) ? remote.trends : [],
    });
  } catch {
    serverMode = "local";
  }
}

function ensurePull(): void {
  if (typeof window === "undefined") return;
  if (!pulling) pulling = pull();
}

function subscribe(cb: () => void): () => void {
  const handler = () => {
    cache = read();
    cb();
  };
  window.addEventListener(EVT, handler);
  window.addEventListener("storage", handler);
  return () => {
    window.removeEventListener(EVT, handler);
    window.removeEventListener("storage", handler);
  };
}

export function useRemedyBook(): RemedyBook {
  const book = useSyncExternalStore(subscribe, () => cache, () => EMPTY);
  useEffect(() => {
    ensurePull();
  }, []);
  return book;
}

export function catalogDefects(): { code: string; label: string; stages: string[] }[] {
  return DEFECTS.map((d) => ({
    code: d.defectCode,
    label: d.label,
    stages: d.stages,
  })).sort((a, b) => a.code.localeCompare(b.code));
}

export function resolveRemedyKey(codeOrLabel: string): string {
  const raw = codeOrLabel.trim();
  return canonicalDefectCode(raw) ?? raw.toUpperCase();
}

export function isRemedyComplete(r: DefectRemedy | undefined | null): boolean {
  return Boolean(r && r.description.trim() && r.remedy.trim());
}

export function lookupRemedy(book: RemedyBook, codeOrLabel: string): DefectRemedy | null {
  const key = resolveRemedyKey(codeOrLabel);
  const hit = book.defects[key];
  return hit ?? null;
}

export function saveDefectRemedy(
  code: string,
  fields: { description: string; remedy: string },
  updatedBy: string,
): DefectRemedy {
  const key = resolveRemedyKey(code);
  const rec: DefectRemedy = {
    code: key,
    description: fields.description.trim(),
    remedy: fields.remedy.trim(),
    updatedAt: new Date().toISOString(),
    updatedBy: updatedBy.trim() || "GM",
  };
  const book = read();
  publish({ ...book, defects: { ...book.defects, [key]: rec } });
  void push({ code: key, description: rec.description, remedy: rec.remedy });
  return rec;
}

export function saveTrendNote(
  note: Omit<TrendNote, "id" | "updatedAt"> & { id?: string },
): TrendNote {
  const book = read();
  const rec: TrendNote = {
    id: note.id ?? `tn-${Date.now().toString(36)}`,
    kind: note.kind,
    graph: note.graph.trim(),
    period: note.period.trim(),
    description: note.description.trim(),
    remedy: note.remedy.trim(),
    updatedAt: new Date().toISOString(),
    updatedBy: note.updatedBy.trim() || "GM",
  };
  const rest = book.trends.filter((t) => t.id !== rec.id);
  publish({ ...book, trends: [rec, ...rest] });
  void push({ trend: rec });
  return rec;
}

export function removeTrendNote(id: string): void {
  const book = read();
  publish({ ...book, trends: book.trends.filter((t) => t.id !== id) });
  void push({ removeTrendId: id });
}

export const RANK_WORDS = ["Primary", "Secondary", "Tertiary"] as const;
