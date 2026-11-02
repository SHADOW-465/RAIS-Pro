// CAPA store — shared between the dashboard composer modal, the /capa page and
// reports. The plant register lives on the server (/api/capa, table
// capa_actions). localStorage is the cache and the fallback: until the
// migration is applied the server answers "unavailable" and this browser keeps
// its own list, then imports it once into the empty plant register.
// Same pattern as remedy-store.ts.

import { useEffect, useSyncExternalStore } from "react";
import { z } from "zod";
import { invalidateAfterWrite } from "@/lib/client/invalidate";
import { slot } from "@/lib/storage";
import type { RecommendationT } from "@/shared/models/decision";

export type CapaPriority = "High" | "Medium" | "Low";
export type CapaStatus = "Open" | "In Progress" | "Completed";
export type CapaSeverity = "critical" | "warning" | "info";

export interface CapaRecord {
  id: string;
  title: string;
  /** What's wrong — seeded from the recommendation text. */
  problem: string;
  rootCause: string;
  /** Corrective / preventive action. */
  action: string;
  owner: string;
  dueDate: string; // yyyy-mm-dd
  priority: CapaPriority;
  status: CapaStatus;
  stage: string;
  severity?: CapaSeverity;
  source: "engine" | "manual";
  ruleId?: string | null;
  ruleVersion?: number | null;
  /** Canonical vars snapshot for audit lineage. */
  vars?: Record<string, number>;
  createdAt: string;
}

const EVT = "moid_capa_changed";

// The fields every reader needs are checked; the rest passes through.
const localCapas = slot({
  name: "capa-actions",
  schema: z.array(
    z.looseObject({
      id: z.string().min(1),
      title: z.string(),
      priority: z.enum(["High", "Medium", "Low"]),
      status: z.enum(["Open", "In Progress", "Completed"]),
      createdAt: z.string(),
    }),
  ) as unknown as z.ZodType<CapaRecord[]>,
  legacyKeys: ["moid_capa_actions"],
});

function read(): CapaRecord[] {
  return localCapas.get() ?? [];
}

function write(next: CapaRecord[]): void {
  if (typeof window === "undefined") return;
  localCapas.set(next); // quota / private mode: the server copy is the record
  window.dispatchEvent(new Event(EVT));
}

// useSyncExternalStore needs a stable snapshot reference between renders, so we
// cache the parsed array and only rebuild it when the store actually changes.
let cache: CapaRecord[] = read();

/** Where the list on screen comes from. "unknown" until the first server answer. */
export type CapaSource = "unknown" | "db" | "local";
let source: CapaSource = "unknown";
let revision = 0;

function setSource(next: CapaSource): void {
  if (source === next) return;
  source = next;
  if (typeof window !== "undefined") window.dispatchEvent(new Event(EVT));
}

async function send(method: "PUT" | "DELETE", body?: unknown, query = ""): Promise<void> {
  if (typeof window === "undefined" || source === "local") return;
  try {
    const res = await fetch(`/api/capa${query}`, {
      method,
      credentials: "same-origin",
      headers: body === undefined ? undefined : { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    if (res.status === 401 || res.status === 403) {
      // The plant register refused this role's change. Show the register as it is.
      pulling = null;
      ensurePull();
      return;
    }
    const data = await res.json().catch(() => null);
    if (!res.ok || !data || data.source !== "db") {
      setSource("local");
      return;
    }
    setSource("db");
  } catch {
    setSource("local");
  }
}

let pulling: Promise<void> | null = null;

async function pull(): Promise<void> {
  const seen = revision;
  try {
    const res = await fetch("/api/capa", { credentials: "same-origin", cache: "no-store" });
    const data = res.ok ? await res.json() : null;
    if (revision !== seen) return;
    if (!data || data.source !== "db" || !Array.isArray(data.capas)) {
      setSource("local");
      return;
    }
    setSource("db");
    const local = read();
    if (data.capas.length === 0 && local.length > 0) {
      await send("PUT", { importLocal: true, capas: local });
      return;
    }
    commit(data.capas as CapaRecord[]);
  } catch {
    setSource("local");
  }
}

function ensurePull(): void {
  if (typeof window === "undefined") return;
  pulling ??= pull();
}

function subscribe(cb: () => void): () => void {
  const handler = () => {
    cache = read();
    cb();
  };
  window.addEventListener(EVT, handler);
  window.addEventListener("storage", handler); // cross-tab
  return () => {
    window.removeEventListener(EVT, handler);
    window.removeEventListener("storage", handler);
  };
}

export function useCapas(): CapaRecord[] {
  const list = useSyncExternalStore(subscribe, () => cache, () => cache);
  useEffect(() => {
    ensurePull();
  }, []);
  return list;
}

/** "db" = plant register on the server; "local" = this browser only. */
export function useCapaSource(): CapaSource {
  return useSyncExternalStore(subscribe, () => source, () => "unknown" as CapaSource);
}

function commit(next: CapaRecord[]): void {
  revision += 1;
  cache = next;
  write(next);
}

export function addCapa(record: CapaRecord): void {
  commit([record, ...read()]);
  void send("PUT", { capa: record });
  void invalidateAfterWrite("capa");
}

export function updateCapa(id: string, patch: Partial<CapaRecord>): void {
  const next = read().map((c) => (c.id === id ? { ...c, ...patch } : c));
  commit(next);
  const updated = next.find((c) => c.id === id);
  if (updated) void send("PUT", { capa: updated });
  void invalidateAfterWrite("capa");
}

export function removeCapa(id: string): void {
  commit(read().filter((c) => c.id !== id));
  void send("DELETE", undefined, `?id=${encodeURIComponent(id)}`);
  void invalidateAfterWrite("capa");
}

/** True if a CAPA already tracks this exact rule + problem (dedupe). */
export function hasCapaForRule(ruleId: string, problem: string): boolean {
  return read().some((c) => c.ruleId === ruleId && c.problem === problem);
}

function severityToPriority(s: CapaSeverity): CapaPriority {
  if (s === "critical") return "High";
  if (s === "warning") return "Medium";
  return "Low";
}

function daysAhead(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

function ownerFromRole(role: string | null | undefined): string {
  if (role === "gm") return "GM";
  if (role === "qm") return "Quality Manager";
  if (role === "steward") return "Steward";
  return "";
}

/** Build an editable draft from a decision-engine recommendation (not yet saved). */
export function draftFromRecommendation(r: RecommendationT): CapaRecord {
  return {
    id: `capa-${r.ruleId}-v${r.ruleVersion}-${Date.now()}`,
    title: titleFromText(r.text),
    problem: r.text,
    rootCause: "",
    action: "",
    owner: ownerFromRole(r.ownerRole),
    dueDate: daysAhead(r.severity === "critical" ? 7 : 14),
    priority: severityToPriority(r.severity),
    status: "Open",
    stage: "All Stages",
    severity: r.severity,
    source: "engine",
    ruleId: r.ruleId,
    ruleVersion: r.ruleVersion,
    vars: r.vars,
    createdAt: new Date().toISOString(),
  };
}

/** Blank manual draft. */
export function blankDraft(): CapaRecord {
  return {
    id: `capa-${Date.now()}`,
    title: "",
    problem: "",
    rootCause: "",
    action: "",
    owner: "",
    dueDate: daysAhead(14),
    priority: "Medium",
    status: "Open",
    stage: "All Stages",
    source: "manual",
    ruleId: null,
    ruleVersion: null,
    createdAt: new Date().toISOString(),
  };
}

/** First clause of the recommendation, trimmed to a short title. */
export function titleFromText(text: string): string {
  const firstSentence = text.split(/[.—]/)[0].trim();
  return firstSentence.length > 64 ? `${firstSentence.slice(0, 61)}…` : firstSentence;
}

export function isOverdue(c: CapaRecord): boolean {
  if (c.status === "Completed") return false;
  return c.dueDate < new Date().toISOString().slice(0, 10);
}
