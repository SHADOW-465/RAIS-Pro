// CAPA store — client-side, localStorage-backed, shared between the dashboard
// composer modal and the /capa page. useSyncExternalStore so both screens stay
// in sync live (same pattern as investigation-state recents).
// ponytail: localStorage is the persistence ceiling; swap for /api/capa +
// Supabase if CAPAs need to survive across devices/users.

import { useSyncExternalStore } from "react";
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

const KEY = "moid_capa_actions";
const EVT = "moid_capa_changed";

function read(): CapaRecord[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as CapaRecord[]) : [];
  } catch {
    return [];
  }
}

function write(next: CapaRecord[]): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    /* ignore quota / private mode */
  }
  window.dispatchEvent(new Event(EVT));
}

// useSyncExternalStore needs a stable snapshot reference between renders, so we
// cache the parsed array and only rebuild it when the store actually changes.
let cache: CapaRecord[] = read();

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
  return useSyncExternalStore(subscribe, () => cache, () => cache);
}

function commit(next: CapaRecord[]): void {
  cache = next;
  write(next);
}

export function addCapa(record: CapaRecord): void {
  commit([record, ...read()]);
}

export function updateCapa(id: string, patch: Partial<CapaRecord>): void {
  commit(read().map((c) => (c.id === id ? { ...c, ...patch } : c)));
}

export function removeCapa(id: string): void {
  commit(read().filter((c) => c.id !== id));
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
