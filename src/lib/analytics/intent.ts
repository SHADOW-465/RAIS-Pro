// Deterministic-first intent resolver. Pure. Turns a request into a scoped
// navigation target. The LLM fallback is added in Task 4 (resolveIntent).
import type { Event } from "@/lib/store/types";
import type { NavKey } from "@/lib/nav-keys";
import { type PersonaId, personaAllowsNav } from "@/lib/persona";
import type { InvestigationState } from "./investigation-state";
import { type SearchHit, searchJumpTargets } from "./search-index";
import { PERSONAS } from "@/lib/persona";
import { parseDatePhrase } from "./date-phrase";
import {
  buildEntitySets,
  scoreMatch,
  matchMetric,
  screenForMetric,
} from "./intent-vocab";

export const CONFIDENT = 0.5;

export interface IntentCtx {
  events: Event[];
  currentScope: InvestigationState;
  persona: PersonaId;
  dataMaxIso: string;
}

export interface IntentResult {
  state: InvestigationState;
  navKey: NavKey;
  highlights: string[];
  confidence: number;
  matched: { period?: string; metric?: string; stage?: string; size?: string; batch?: string; defect?: string };
  alternatives: SearchHit[];
}

const NAV_HREF: Record<NavKey, string> = {
  dashboard: "/", workbooks: "/workbooks", "data-entry": "/data-entry",
  staging: "/staging", stage: "/stage-analysis", size: "/size-analysis",
  defect: "/defect-analysis", spc: "/spc", "process-flow": "/process-flow",
  copq: "/copq", reports: "/reports", capa: "/capa", ask: "/chat",
  audit: "/audit", schema: "/schema", settings: "/settings", "clear-data": "/clear-data",
};

/** Best fuzzy match of the query against a live entity set (>= 0.7 to count). */
function bestEntity(text: string, set: Set<string>): { value: string; score: number } | null {
  let best: { value: string; score: number } | null = null;
  for (const v of set) {
    const s = scoreMatch(text, v);
    if (s >= 0.7 && (!best || s > best.score)) best = { value: v, score: s };
  }
  // also try each whitespace token so "24Fr issues" matches "24Fr"
  for (const tok of text.split(/\s+/)) {
    for (const v of set) {
      const s = scoreMatch(tok, v);
      if (s >= 0.9 && (!best || s > best.score)) best = { value: v, score: s };
    }
  }
  return best;
}

export function resolveIntentDeterministic(text: string, ctx: IntentCtx): IntentResult {
  const sets = buildEntitySets(ctx.events);
  const matched: IntentResult["matched"] = {};

  const state: InvestigationState = { grain: ctx.currentScope.grain ?? "month" };
  let score = 0;

  // Period
  const period = parseDatePhrase(text, ctx.dataMaxIso);
  if (period) {
    state.grain = period.grain;
    state.from = period.from;
    state.to = period.to;
    matched.period = period.matchedText;
    score += 0.3;
  }

  // Specific entities take routing priority over a generic metric.
  const stage = bestEntity(text, sets.stages);
  const size = bestEntity(text, sets.sizes);
  const defect = bestEntity(text, sets.defects);
  const batch = bestEntity(text, sets.batches);

  let navKey: NavKey | null = null;
  const highlights: string[] = [];

  const metric = matchMetric(text);
  if (metric) { matched.metric = metric; state.metric = metric; highlights.push(metric); score += 0.4; }

  if (defect) { matched.defect = defect.value; navKey = "defect"; state.metric = "defect"; score = Math.max(score, defect.score); }
  else if (stage) { matched.stage = stage.value; state.stage = stage.value; navKey = "stage"; score = Math.max(score, stage.score); }
  else if (size) { matched.size = size.value; state.size = size.value; navKey = "size"; score = Math.max(score, size.score); }
  else if (batch) { matched.batch = batch.value; state.batch = batch.value; navKey = "data-entry"; score = Math.max(score, batch.score); }
  else if (metric) { navKey = screenForMetric(metric); }
  else if (period) { navKey = "dashboard"; }

  // Persona gate: if the natural target is denied, drop confidence and fall to
  // the persona's home so we never auto-open a forbidden screen.
  if (navKey && !personaAllowsNav(ctx.persona, navKey)) {
    navKey = null;
    score = Math.min(score, CONFIDENT - 0.01);
  }
  if (!navKey) {
    navKey = personaAllowsNav(ctx.persona, "dashboard") ? "dashboard" : "data-entry";
    score = Math.min(score, CONFIDENT - 0.01);
  }

  if (state.metric && !highlights.includes(state.metric)) highlights.push(state.metric);

  const confident = score >= CONFIDENT;
  const searchOpts = { events: ctx.events, allowedNavKeys: PERSONAS[ctx.persona].navAllow };
  let alternatives: SearchHit[] = [];
  if (!confident) {
    alternatives = searchJumpTargets(text, searchOpts);
    // Fall back to the default destination list when the free-text query
    // scores no hits at all (e.g. "what should I look at").
    if (alternatives.length === 0) alternatives = searchJumpTargets("", searchOpts);
  }

  return { state, navKey, highlights, confidence: Math.min(score, 1), matched, alternatives };
}

export type SlotExtractor = (
  text: string,
) => Promise<Partial<Record<"period" | "metric" | "stage" | "size" | "batch", string>>>;

/** Rebuild the request text with reconciled slots, then re-run the deterministic
 *  resolver. Only slots that exist in the real entity sets survive. */
export async function resolveIntent(
  text: string,
  ctx: IntentCtx,
  extract?: SlotExtractor,
): Promise<IntentResult> {
  const first = resolveIntentDeterministic(text, ctx);
  if (first.confidence >= CONFIDENT || !extract) return first;

  let slots: Awaited<ReturnType<SlotExtractor>>;
  try {
    slots = await extract(text);
  } catch {
    return first; // AI down → deterministic result (pick-list)
  }

  const sets = buildEntitySets(ctx.events);
  const inSet = (v: string | undefined, set: Set<string>) =>
    v && [...set].some((x) => x.toLowerCase() === v.toLowerCase())
      ? [...set].find((x) => x.toLowerCase() === v!.toLowerCase())
      : undefined;

  // Reconcile: keep only real values; re-inject them as plain words so the
  // deterministic resolver scores them normally.
  const parts: string[] = [text];
  const stage = inSet(slots.stage, sets.stages); if (stage) parts.push(stage);
  const size = inSet(slots.size, sets.sizes); if (size) parts.push(size);
  const batch = inSet(slots.batch, sets.batches); if (batch) parts.push(batch);
  if (slots.metric) parts.push(slots.metric);
  if (slots.period) parts.push(slots.period);

  const second = resolveIntentDeterministic(parts.join(" "), ctx);
  return second.confidence >= first.confidence ? second : first;
}

/** Href for a resolved result (scope carried as query params — see Task 5). */
export function hrefForNav(navKey: NavKey): string {
  return NAV_HREF[navKey];
}
