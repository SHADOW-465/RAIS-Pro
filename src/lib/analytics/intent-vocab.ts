// Shared matching vocabulary for intent + command palette. Pure.
import type { Event } from "@/lib/store/types";
import type { NavKey } from "@/lib/nav-keys";

export interface EntitySets {
  batches: Set<string>;
  stages: Set<string>;
  sizes: Set<string>;
  defects: Set<string>;
}

function batchOf(e: Event): string {
  const cf = (e as { customFields?: Record<string, unknown> }).customFields;
  const b = cf?.batch ?? cf?.batchId ?? (e as { batchNo?: string | null }).batchNo;
  return typeof b === "string" ? b.trim() : "";
}
function stageOf(e: Event): string | null {
  return "stageId" in e ? ((e as { stageId?: string }).stageId ?? null) : null;
}
function sizeOf(e: Event): string | null {
  return "size" in e ? ((e as { size?: string | null }).size ?? null) : null;
}
function defectOf(e: Event): string | null {
  if (e.eventType !== "rejection") return null;
  const raw =
    (e as { defectCodeRaw?: string }).defectCodeRaw ||
    (e as { defectCode?: string }).defectCode;
  return raw ? String(raw) : null;
}

export function buildEntitySets(events: Event[]): EntitySets {
  const sets: EntitySets = { batches: new Set(), stages: new Set(), sizes: new Set(), defects: new Set() };
  for (const e of events) {
    const b = batchOf(e); if (b) sets.batches.add(b);
    const st = stageOf(e); if (st) sets.stages.add(st);
    const sz = sizeOf(e); if (sz) sets.sizes.add(sz);
    const df = defectOf(e); if (df) sets.defects.add(df);
  }
  return sets;
}

function norm(s: string): string {
  return s.toLowerCase().trim();
}

/** Exact 1 > prefix 0.9 > substring 0.7 > all-words 0.55 > 0.5 empty query. */
export function scoreMatch(query: string, ...fields: string[]): number {
  if (!query) return 0.5;
  const q = norm(query);
  let best = 0;
  for (const f of fields) {
    const t = norm(f);
    if (!t) continue;
    if (t === q) best = Math.max(best, 1);
    else if (t.startsWith(q)) best = Math.max(best, 0.9);
    else if (t.includes(q)) best = Math.max(best, 0.7);
    else if (q.split(/\s+/).every((w) => w && t.includes(w))) best = Math.max(best, 0.55);
  }
  return best;
}

// Metric synonym glossary. Order matters: "rate" must be checked before the
// generic "rejection" → defect fallback so "rejection rate" resolves to rate.
const METRIC_SYNONYMS: Array<[string, RegExp]> = [
  ["rate", /\b(rejection rate|reject rate|\brate\b)\b/],
  ["copq", /\b(copq|cost of poor quality|\bcost\b|rupees?|savings)\b/],
  ["fpy", /\b(fpy|first pass yield|\byield\b)\b/],
  ["size", /\b(size|french|\bfr\b)\b/],
  ["stage", /\b(stage|gate|checkpoint|inspection point)\b/],
  ["defect", /\b(defect|reject|rejection|nonconformance|non-conformance|\bnc\b|scrap)\b/],
];

export function matchMetric(text: string): string | null {
  const t = text.toLowerCase();
  for (const [metric, re] of METRIC_SYNONYMS) {
    if (re.test(t)) return metric;
  }
  return null;
}

export const METRIC_SCREEN: Record<string, NavKey> = {
  defect: "defect",
  copq: "copq",
  fpy: "process-flow",
  size: "size",
  stage: "stage",
  rate: "stage",
};

export function screenForMetric(metric: string): NavKey | null {
  return METRIC_SCREEN[metric] ?? null;
}
