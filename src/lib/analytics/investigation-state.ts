// Investigation / Understand scope — addressable work-object shape (UX philosophy F8).
// Phase 2: href builders + recents. Tweaks apply via useApplyInvestigationFromUrl.

export type InvestigationGrain = "day" | "week" | "month" | "fy";

export type InvestigationMetric =
  | "rate"
  | "fpy"
  | "copq"
  | "defect"
  | "size"
  | "stage"
  | string;

/** Continuable investigation scope (period · gate · size · batch · metric). */
export interface InvestigationState {
  grain: InvestigationGrain;
  /** Inclusive ISO yyyy-mm-dd; omit = app latest-period heuristic */
  from?: string;
  to?: string;
  /** Quality gate stageId; omit or "cumulative" = all gates */
  stage?: string;
  size?: string;
  batch?: string;
  metric?: InvestigationMetric;
  /** KPI/chart id to spotlight on arrival (v1: a metric key). */
  highlight?: string;
  /** Optional label for recents / pins */
  label?: string;
}

/** Fields that map onto TweaksContext when applying a deep link. */
export type InvestigationTweaksPatch = {
  grain?: InvestigationGrain;
  datePreset?: "custom";
  dateFrom?: string;
  dateTo?: string;
  stageView?: string;
};

const RECENTS_KEY = "moid_investigation_recents";
const RECENTS_MAX = 8;

const GRAINS = new Set<InvestigationGrain>(["day", "week", "month", "fy"]);

function clean(s: string | null | undefined): string | undefined {
  if (s == null) return undefined;
  const t = s.trim();
  return t.length > 0 ? t : undefined;
}

/** Parse from URLSearchParams or a plain query record. */
export function parseInvestigationState(
  input: URLSearchParams | Record<string, string | string[] | undefined | null>
): InvestigationState {
  const get = (key: string): string | undefined => {
    if (input instanceof URLSearchParams) return clean(input.get(key));
    const v = input[key];
    if (Array.isArray(v)) return clean(v[0]);
    return clean(v ?? undefined);
  };

  const grainRaw = get("grain") ?? "month";
  const grain: InvestigationGrain = GRAINS.has(grainRaw as InvestigationGrain)
    ? (grainRaw as InvestigationGrain)
    : "month";

  const stage = get("stage");
  return {
    grain,
    from: get("from"),
    to: get("to"),
    stage: stage && stage !== "cumulative" ? stage : undefined,
    size: get("size"),
    batch: get("batch"),
    metric: get("metric"),
    highlight: get("highlight"),
    label: get("label"),
  };
}

/** Serialize to query params (omits empty fields). */
export function serializeInvestigationState(
  state: InvestigationState
): URLSearchParams {
  const q = new URLSearchParams();
  q.set("grain", state.grain);
  if (state.from) q.set("from", state.from);
  if (state.to) q.set("to", state.to);
  if (state.stage) q.set("stage", state.stage);
  if (state.size) q.set("size", state.size);
  if (state.batch) q.set("batch", state.batch);
  if (state.metric) q.set("metric", state.metric);
  if (state.highlight) q.set("highlight", state.highlight);
  if (state.label) q.set("label", state.label);
  return q;
}

/** Stable string key for recents / pins (not for display). */
export function investigationKey(state: InvestigationState): string {
  return [
    state.grain,
    state.from ?? "",
    state.to ?? "",
    state.stage ?? "",
    state.size ?? "",
    state.batch ?? "",
    state.metric ?? "",
  ].join("|");
}

/**
 * Build a mid-path URL: `/stage-analysis?grain=month&stage=visual&from=…`
 * Path should start with `/`. Empty optional fields are omitted.
 */
export function investigationHref(
  path: string,
  state: InvestigationState
): string {
  const base = path.startsWith("/") ? path : `/${path}`;
  const q = serializeInvestigationState(state).toString();
  return q ? `${base}?${q}` : base;
}

/** Tweaks patch derived from investigation state (for global header chrome). */
export function investigationToTweaksPatch(
  state: InvestigationState
): InvestigationTweaksPatch {
  const patch: InvestigationTweaksPatch = {};
  if (state.grain) patch.grain = state.grain;
  if (state.from || state.to) {
    patch.datePreset = "custom";
    if (state.from) patch.dateFrom = state.from;
    if (state.to) patch.dateTo = state.to;
  }
  if (state.stage) patch.stageView = state.stage;
  return patch;
}

export interface InvestigationRecent {
  href: string;
  state: InvestigationState;
  savedAt: string; // ISO
}

/** Push a navigated investigation onto the recents stack (localStorage). */
export function pushInvestigationRecent(
  href: string,
  state: InvestigationState
): void {
  if (typeof window === "undefined") return;
  try {
    const raw = localStorage.getItem(RECENTS_KEY);
    const prev: InvestigationRecent[] = raw ? JSON.parse(raw) : [];
    const key = investigationKey(state);
    const next: InvestigationRecent[] = [
      { href, state, savedAt: new Date().toISOString() },
      ...prev.filter((r) => investigationKey(r.state) !== key),
    ].slice(0, RECENTS_MAX);
    localStorage.setItem(RECENTS_KEY, JSON.stringify(next));
  } catch {
    /* ignore quota / private mode */
  }
}

export function listInvestigationRecents(): InvestigationRecent[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(RECENTS_KEY);
    return raw ? (JSON.parse(raw) as InvestigationRecent[]) : [];
  } catch {
    return [];
  }
}

/**
 * Navigate with carried investigation scope and record a recent.
 * Prefer this over bare `router.push("/stage-analysis")`.
 */
export function goInvestigation(
  push: (href: string) => void,
  path: string,
  state: InvestigationState
): void {
  const href = investigationHref(path, state);
  pushInvestigationRecent(href, state);
  push(href);
}
