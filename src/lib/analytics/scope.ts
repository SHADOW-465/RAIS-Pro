// Analytics scope: filter the event set + bucket by period (plan 02).
// FY = April–March. Pure functions; no I/O.
//
// Source channel filter (excel vs data-entry) is applied BEFORE
// canonicalizeEvents so "Excel only" can still see uploaded rows that
// would otherwise lose to a same-day direct entry under full-scope rules.

import type { Event } from "@/lib/store/types";
import { canonicalBatchId, parseBatchId } from "@/lib/entry/batch-id";
import { canonicalizeEvents } from "./canonical";
import { DEFAULT_POLICY, type CalculationPolicyT } from "@/core/policy/policy";
import {
  STAGE_CATEGORY,
  STAGE_CATEGORIES,
  DEFAULT_STAGE_CATEGORIES,
  type StageCategory,
} from "@/core/ontology/plant-catalog";

export type { StageCategory };
export { STAGE_CATEGORIES, DEFAULT_STAGE_CATEGORIES, STAGE_CATEGORY };

export type Grain = "day" | "week" | "month" | "fy";

/** Intake channel that produced a ledger event. */
export type SourceChannel = "excel" | "direct-entry";

export interface Scope {
  dateFrom?: string; // ISO yyyy-mm-dd (inclusive)
  dateTo?: string;   // ISO yyyy-mm-dd (inclusive)
  stageIds?: string[];
  sizes?: string[];
  grain: Grain;
  /**
   * Which intake channels contribute. Omit / empty / both = all channels.
   * `["excel"]` = uploaded workbooks only; `["direct-entry"]` = Data Entry only.
   */
  sourceChannels?: SourceChannel[];
  /**
   * When Excel is included: restrict to these provenance file labels
   * (basename of provenance.file). Omit / empty = every Excel file.
   * Ignored when excel is not in sourceChannels.
   */
  sourceFiles?: string[];
  /**
   * Restrict to these batch IDs (`batchNo` / customFields.batch*).
   * Omit / empty = every batch (and events with no batch).
   * Non-empty = only matching batches; events without a batch are dropped.
   */
  batchIds?: string[];
  /**
   * The plant's calculation conventions. Rides on Scope because Scope already
   * reaches every selector — no new parameter on 20+ call sites, and no global
   * mutable state to leak between server requests. Omitted = shipped defaults,
   * so every existing caller and test keeps its current behaviour.
   */
  policy?: CalculationPolicyT;
  // V2 dimensions — ignored by selectors until events carry them.
  shift?: string;
  productIds?: string[];
  machineIds?: string[];
  operatorIds?: string[];
}

export const DEFAULT_SCOPE: Scope = { grain: "month" };

/** The policy in force for a scope. One accessor so no selector has to remember
 *  the fallback. */
export function policyOf(scope: Scope): CalculationPolicyT {
  return scope.policy ?? DEFAULT_POLICY;
}

function stageOf(e: Event): string | null {
  return "stageId" in e ? (e.stageId as string) : null;
}
function sizeOf(e: Event): string | null {
  return "size" in e ? ((e.size as string | null) ?? null) : null;
}

/** Manual Data Entry / batch matrix (not an uploaded workbook). */
export function isDirectEntryEvent(e: Event): boolean {
  const any = e as Event & { extractedBy?: string; isDirectEntry?: boolean };
  if (any.extractedBy === "direct-entry" || any.isDirectEntry === true) return true;
  const file = any.provenance?.file ?? "";
  return file === "Manual Entry" || /^Batch Entry /i.test(file);
}

export function eventSourceChannel(e: Event): SourceChannel {
  return isDirectEntryEvent(e) ? "direct-entry" : "excel";
}

/** Stable label for an Excel file (basename). Empty for direct-entry. */
export function eventSourceFileLabel(e: Event): string {
  if (isDirectEntryEvent(e)) return "";
  const file = (e as Event & { provenance?: { file?: string } }).provenance?.file ?? "";
  if (!file || file === "Manual Entry") return "";
  return file.split(/[/\\]/).pop() ?? file;
}

/** Distinct Excel file labels present in a raw event list (for the Sources picker). */
export function listExcelSourceFiles(events: Event[]): string[] {
  const set = new Set<string>();
  for (const e of events) {
    const label = eventSourceFileLabel(e);
    if (label) set.add(label);
  }
  return [...set].sort((a, b) => a.localeCompare(b));
}

/**
 * Batch ID on a ledger event — same fields Data Entry + Audit trail use.
 * Uppercases for stable compare / picker keys.
 */
export function eventBatchId(e: Event): string | null {
  const any = e as Event & {
    batchNo?: string | null;
    customFields?: Record<string, unknown>;
  };
  const raw =
    any.batchNo ??
    (typeof any.customFields?.batch === "string" ? any.customFields.batch : null) ??
    (typeof any.customFields?.batchId === "string" ? any.customFields.batchId : null) ??
    null;
  // Canonical, not just uppercase: the ledger holds `26G0816` and `26G08-16`
  // as separate rows for one physical lot. Folding them here merges the split
  // in every view without mutating the append-only ledger.
  return canonicalBatchId(raw);
}

/**
 * Event types that carry live plant quantities. Corrections / annotations may
 * still reference a batch after a purge path failed — they must not keep a
 * deleted batch in the Sources picker.
 */
const BATCH_LIST_TYPES = new Set(["production", "inspection", "rejection"]);

/**
 * Calendar day a lot belongs to for the Sources picker and date range.
 * Prefer the date encoded in the batch ID (H = August); fall back to
 * occurredOn when the code cannot be parsed.
 */
export function eventLotDate(e: Event): string | null {
  const batch = eventBatchId(e);
  if (batch) {
    const parsed = parseBatchId(batch);
    if (parsed?.date) return parsed.date;
  }
  return e.occurredOn?.start ?? null;
}

/** Distinct batch IDs in a raw event list (for the Sources picker), newest-looking first.
 *  Pass `{ from, to }` (ISO yyyy-mm-dd, inclusive) to keep only lots whose lot-date
 *  falls in that custom range. Omit / empty = every batch. */
export function listBatchIds(events: Event[], range?: { from?: string; to?: string }): string[] {
  const from = range?.from || undefined;
  const to = range?.to || undefined;
  const bounded = !!(from || to);
  const set = new Set<string>();
  for (const e of events) {
    if (!BATCH_LIST_TYPES.has(e.eventType)) continue;
    const b = eventBatchId(e);
    if (!b) continue;
    if (bounded) {
      const day = eventLotDate(e);
      if (!day) continue;
      if (from && day < from) continue;
      if (to && day > to) continue;
    }
    set.add(b);
  }
  // Lexicographic desc tends to put newer plant batch codes (yy letter day-size) near top
  return [...set].sort((a, b) => b.localeCompare(a));
}

export function countBySourceChannel(events: Event[]): { excel: number; directEntry: number } {
  let excel = 0;
  let directEntry = 0;
  for (const e of events) {
    if (isDirectEntryEvent(e)) directEntry++;
    else excel++;
  }
  return { excel, directEntry };
}

/** Reverse stageIds → shop-floor section labels (for Active / report summaries). */
export function describeSectionsFromStageIds(stageIds?: string[]): string | null {
  if (stageIds === undefined) return null; // no section restriction
  if (stageIds.length === 0) return "No sections";
  const cats = new Set<StageCategory>();
  for (const id of stageIds) {
    const c = STAGE_CATEGORY[id];
    if (c) cats.add(c);
  }
  if (cats.size === 0) return null;
  if (cats.size === STAGE_CATEGORIES.length) return "All sections";
  if (cats.size === 1 && cats.has("assembly")) return "Assembly";
  return STAGE_CATEGORIES.filter((c) => cats.has(c.id))
    .map((c) => c.label.replace(/\s*\(.*\)$/, ""))
    .join(" + ");
}

/**
 * True when tweaks match plant default scope: both channels, assembly only,
 * no batch/file restriction, cumulative stage view.
 */
export function isPlantDefaultTweaks(t: {
  includeExcel?: boolean;
  includeDirectEntry?: boolean;
  excelFiles?: string[] | null;
  batchIds?: string[] | null;
  stageCategories?: StageCategory[] | null;
  stageView?: string;
}): boolean {
  const ex = t.includeExcel !== false;
  const de = t.includeDirectEntry !== false;
  const files = !t.excelFiles || t.excelFiles.length === 0;
  const batches = !t.batchIds || t.batchIds.length === 0;
  const cats =
    t.stageCategories === undefined || t.stageCategories === null
      ? DEFAULT_STAGE_CATEGORIES
      : t.stageCategories;
  const assemblyOnly = cats.length === 1 && cats[0] === "assembly";
  const view = !t.stageView || t.stageView === "cumulative";
  return ex && de && files && batches && assemblyOnly && view;
}

/**
 * Full human summary from live header controls (channels, sections, stage pin,
 * batches, files). Prefer this in the Sources panel Active line.
 */
export function describeActiveScope(t: {
  includeExcel?: boolean;
  includeDirectEntry?: boolean;
  excelFiles?: string[] | null;
  batchIds?: string[] | null;
  stageCategories?: StageCategory[] | null;
  stageView?: string;
}): string {
  if (isPlantDefaultTweaks(t)) return "Plant default · Assembly · full plant";

  const parts: string[] = [];
  const ex = t.includeExcel !== false;
  const de = t.includeDirectEntry !== false;
  if (ex && de) parts.push("Excel + Data entry");
  else if (ex) parts.push("Excel only");
  else if (de) parts.push("Data entry only");
  else parts.push("No channels");

  const cats =
    t.stageCategories === undefined || t.stageCategories === null
      ? DEFAULT_STAGE_CATEGORIES
      : t.stageCategories;
  if (cats.length === 0) parts.push("no sections");
  else if (cats.length === STAGE_CATEGORIES.length) parts.push("all sections");
  else if (cats.length === 1 && cats[0] === "assembly") parts.push("Assembly");
  else {
    parts.push(
      STAGE_CATEGORIES.filter((c) => cats.includes(c.id))
        .map((c) => c.label.replace(/\s*\(.*\)$/, ""))
        .join(" + "),
    );
  }

  if (t.stageView && t.stageView !== "cumulative") {
    parts.push(`station ${t.stageView}`);
  }

  const batches = t.batchIds ?? [];
  if (batches.length === 1) parts.push(`batch ${batches[0]}`);
  else if (batches.length > 1) parts.push(`${batches.length} batches`);
  else parts.push("full plant");

  const files = t.excelFiles ?? [];
  if (ex && files.length === 1) parts.push(files[0]);
  else if (ex && files.length > 1) parts.push(`${files.length} Excel files`);

  return parts.join(" · ");
}

/** Human label for the Sources filter — used in report headers / cover. */
export function describeSourceFilter(scope: Scope): string {
  const channels = scope.sourceChannels;
  const files = scope.sourceFiles;
  const batches = scope.batchIds;
  const excelOn = !channels || channels.includes("excel");
  const deOn = !channels || channels.includes("direct-entry");
  const sections = describeSectionsFromStageIds(scope.stageIds);

  const bits: string[] = [];

  if (channels && channels.length === 0) {
    bits.push("No sources");
  } else if (excelOn && deOn && (!files || files.length === 0)) {
    bits.push("Excel + Data entry");
  } else if (excelOn && deOn && files?.length) {
    bits.push(
      files.length === 1
        ? `Data entry + Excel: ${files[0]}`
        : `Data entry + ${files.length} Excel files`,
    );
  } else if (excelOn && !deOn) {
    if (!files || files.length === 0) bits.push("Excel only");
    else if (files.length === 1) bits.push(`Excel: ${files[0]}`);
    else bits.push(`${files.length} Excel files`);
  } else if (!excelOn && deOn) {
    bits.push("Data entry only");
  } else {
    bits.push("All sources");
  }

  if (sections) bits.push(sections);

  if (batches && batches.length === 1) bits.push(`batch ${batches[0]}`);
  else if (batches && batches.length > 1) bits.push(`${batches.length} batches`);
  else bits.push("full plant");

  return bits.join(" · ");
}

/** The week-of-month bucket containing `day` in `month`/`year`. Buckets are
 *  fixed 7-day chunks counted from the 1st (1-7, 8-14, 15-21, 22-28, 29-31+)
 *  — NOT real Monday-Sunday weeks. This is the one place that definition
 *  lives; `periodKey`'s "week" case and Data Entry's week picker both call
 *  this instead of re-deriving the math. */
export function weekOfMonthBounds(year: number, month: number, day: number): { week: number; startDay: number; endDay: number } {
  const week = Math.floor((day - 1) / 7) + 1;
  const startDay = (week - 1) * 7 + 1;
  const lastDayOfMonth = new Date(year, month, 0).getDate();
  const endDay = Math.min(week * 7, lastDayOfMonth);
  return { week, startDay, endDay };
}

/** The Apr-Mar fiscal year containing `dateIso`, with its label (matching
 *  periodKey's "fy" format) and calendar bounds. */
export function fyContaining(dateIso: string): { startYear: number; label: string; from: string; to: string } {
  const [y, m] = dateIso.split("-").map(Number);
  const startYear = m >= 4 ? y : y - 1;
  return {
    startYear,
    label: periodKey(dateIso, "fy"),
    from: `${startYear}-04-01`,
    to: `${startYear + 1}-03-31`,
  };
}

/** Per-events-array cache of scope → canonicalized result.
 *  Dashboard runs rejectionRate/fpy/byStage/… each calling scopeEvents with the
 *  same scope; without this we re-filter + re-canonicalize N times per render. */
const scopeEventsCache = new WeakMap<Event[], Map<string, Event[]>>();

function scopeCacheKey(scope: Scope): string {
  return [
    scope.grain ?? "",
    scope.dateFrom ?? "",
    scope.dateTo ?? "",
    scope.stageIds ? scope.stageIds.join(",") : "*",
    (scope.sizes ?? []).join(","),
    scope.sourceChannels ? scope.sourceChannels.join(",") : "*", // "" (none) ≠ "*" (all)
    (scope.sourceFiles ?? []).join("\u001f"),
    (scope.batchIds ?? []).join(","),
    scope.shift ?? "",
  ].join("|");
}

/**
 * Apply date / stage / size / **source** filters, then canonicalize so the
 * remaining set never double-counts. Source filter runs first so channel
 * selection is meaningful (Excel-only keeps upload rows even when a same-day
 * direct entry would win under an unscoped full ledger).
 */
export function scopeEvents(events: Event[], scope: Scope): Event[] {
  const key = scopeCacheKey(scope);
  let byScope = scopeEventsCache.get(events);
  if (!byScope) {
    byScope = new Map();
    scopeEventsCache.set(events, byScope);
  } else {
    const hit = byScope.get(key);
    if (hit) return hit;
  }

  // `undefined` = no channel restriction. `[]` = the user switched BOTH channels
  // off, which must yield nothing — not "all". (Was `?.length`, so [] read as
  // "unfiltered" and every KPI kept showing the full plant.)
  const channels = scope.sourceChannels ? new Set(scope.sourceChannels) : null;
  const files =
    scope.sourceFiles?.length && (!channels || channels.has("excel"))
      ? new Set(scope.sourceFiles)
      : null;
  const batches = scope.batchIds?.length
    ? new Set(scope.batchIds.map((b) => b.toUpperCase()))
    : null;

  const filtered = events.filter((e) => {
    // Custom range is the lot calendar encoded in the batch ID (H = August),
    // not the day the row was recorded. View Source and every KPI share this
    // filter, so the drill-down cannot show 26G lots inside an August window.
    // Rows with no parseable lot code still use occurredOn.
    if (scope.dateFrom || scope.dateTo) {
      const day = eventLotDate(e);
      if (!day) return false;
      if (scope.dateFrom && day < scope.dateFrom) return false;
      if (scope.dateTo && day > scope.dateTo) return false;
    }
    // Same rule as channels: `undefined` = no restriction, `[]` = the user
    // deselected every section, so nothing qualifies.
    if (scope.stageIds) {
      const s = stageOf(e);
      if (s != null && !scope.stageIds.includes(s)) return false;
    }
    if (scope.sizes?.length) {
      const s = sizeOf(e);
      if (s != null && !scope.sizes.includes(s)) return false;
    }

    const channel = eventSourceChannel(e);
    if (channels && !channels.has(channel)) return false;

    if (channel === "excel" && files) {
      const label = eventSourceFileLabel(e);
      if (!label || !files.has(label)) return false;
    }

    if (batches) {
      const batch = eventBatchId(e);
      if (!batch || !batches.has(batch)) return false;
    }

    return true;
  });

  const result = canonicalizeEvents(filtered);
  byScope.set(key, result);
  // Cap map size so long sessions with many scope tweaks don't grow unbounded.
  if (byScope.size > 24) {
    const first = byScope.keys().next().value;
    if (first != null) byScope.delete(first);
  }
  return result;
}

/** Bucket key for a date under a grain. FY runs Apr(4)–Mar(3).
 *
 *  Called once per event per period by the trend selectors, so it slices the ISO
 *  string rather than `split("-").map(Number)` — the two throwaway arrays per
 *  call dominated the dashboard's render cost. */
export function periodKey(iso: string, grain: Grain): string {
  switch (grain) {
    case "day":
      return iso;
    case "month":
      return iso.slice(0, 7);
    case "fy": {
      const y = +iso.slice(0, 4);
      const fy = +iso.slice(5, 7) >= 4 ? y : y - 1;
      return `FY${fy}-${String((fy + 1) % 100).padStart(2, "0")}`;
    }
    case "week": {
      // Same fixed 7-day chunks weekOfMonthBounds defines; only the week number
      // is needed here, and that part needs no Date allocation.
      const week = Math.floor((+iso.slice(8, 10) - 1) / 7) + 1;
      return `${iso.slice(0, 7)}-W${week}`;
    }
  }
}

/** Per-array cache of grain → period → events.
 *
 *  Every trend selector used to rebuild its buckets by scanning the FULL event
 *  list once per period — O(periods × events), which on a 233k-event ledger over
 *  68 weeks was ~16M periodKey calls per selector and made the dashboard take
 *  minutes. One pass builds every bucket, and the four selectors share it. */
const periodBucketCache = new WeakMap<Event[], Map<Grain, Map<string, Event[]>>>();

export function bucketByPeriod(events: Event[], grain: Grain): Map<string, Event[]> {
  let byGrain = periodBucketCache.get(events);
  if (!byGrain) periodBucketCache.set(events, (byGrain = new Map()));
  const hit = byGrain.get(grain);
  if (hit) return hit;

  const buckets = new Map<string, Event[]>();
  for (const e of events) {
    const day = eventLotDate(e) ?? e.occurredOn.start;
    const key = periodKey(day, grain);
    const list = buckets.get(key);
    if (list) list.push(e);
    else buckets.set(key, [e]);
  }
  byGrain.set(grain, buckets);
  return buckets;
}

/** The bucket for one period — a stable [] so callers keep array identity (and
 *  therefore the downstream aggregate caches) across selectors. */
const EMPTY_BUCKET: Event[] = [];
export function periodBucket(events: Event[], grain: Grain, period: string): Event[] {
  return bucketByPeriod(events, grain).get(period) ?? EMPTY_BUCKET;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** Human label for a period key (e.g. "2025-04" → "Apr-25"). */
export function periodLabel(key: string): string {
  const d = key.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (d) return `${d[3]} ${MONTHS[Number(d[2]) - 1]}`;
  const m = key.match(/^(\d{4})-(\d{2})$/);
  if (m) return `${MONTHS[Number(m[2]) - 1]}-${m[1].slice(2)}`;
  const w = key.match(/^(\d{4})-(\d{2})-W(\d)$/);
  if (w) return `W${w[3]} (${MONTHS[Number(w[2]) - 1]})`;
  if (key.startsWith("FY")) {
    return key.replace("FY20", "FY");
  }
  return key;
}

/** Every calendar period key between two ISO dates (inclusive), in order —
 *  the shared timeline builder. Walks day by day so day/week/month/FY all fall
 *  out of periodKey with no per-grain arithmetic. */
export function calendarPeriods(fromIso: string, toIso: string, grain: Grain): string[] {
  const out: string[] = [];
  let last: string | null = null;
  const end = Date.parse(`${toIso}T00:00:00Z`);
  if (!Number.isFinite(end)) return out;
  for (let t = Date.parse(`${fromIso}T00:00:00Z`); Number.isFinite(t) && t <= end; t += 86400000) {
    const key = periodKey(new Date(t).toISOString().slice(0, 10), grain);
    if (key !== last) {
      out.push(key);
      last = key;
    }
  }
  return out;
}

/** Chronological period keys spanning the COMPLETE calendar range — never just
 *  the periods that happen to have records, so charts keep uniform spacing and
 *  empty periods stay visible. Bounds come from `range` (the selected date
 *  window) when given, else from the events' min/max dates. */
export function periodsIn(events: Event[], grain: Grain, range?: { from?: string; to?: string }): string[] {
  let from = range?.from;
  let to = range?.to;
  // Only scan when a bound is actually missing — the callers that pass a full
  // window were paying an O(n log n) sort over the whole ledger for nothing.
  if (!from || !to) {
    const { min, max } = dateBounds(events);
    from = from ?? min;
    to = to ?? max;
  }
  if (!from || !to) return [];
  return calendarPeriods(from, to, grain);
}

/** Min/max occurredOn.start in one pass — the ledger is large enough that
 *  sorting a copy of every date just to read its ends is measurable. */
export function dateBounds(events: Event[]): { min?: string; max?: string } {
  let min: string | undefined;
  let max: string | undefined;
  for (const e of events) {
    const d = e.occurredOn.start;
    if (!d) continue;
    if (min === undefined || d < min) min = d;
    if (max === undefined || d > max) max = d;
  }
  return { min, max };
}

export interface ScopeTweaks {
  grain: Grain;
  datePreset: "all" | "last-90-days" | "last-12-months" | "this-fy" | "custom";
  dateFrom: string;
  dateTo: string;
  stageView?: string;
  /** Default true — include uploaded Excel events. */
  includeExcel?: boolean;
  /** Default true — include Data Entry / batch matrix events. */
  includeDirectEntry?: boolean;
  /**
   * When includeExcel: null/undefined/empty = all Excel files;
   * non-empty = only these basenames.
   */
  excelFiles?: string[] | null;
  /**
   * Empty / null = all batches. Non-empty = only these batch IDs
   * (matches eventBatchId — case-insensitive).
   */
  batchIds?: string[] | null;
  /**
   * Shop-floor sections to include. Undefined = the default (assembly only) —
   * the plant's own reports mean assembly when they say "rejection %", so
   * primary/secondary are opt-in rather than silently inflating every KPI.
   * Empty array = explicitly none.
   */
  stageCategories?: StageCategory[] | null;
}

/** Stages belonging to the selected sections. Stages with no category (added by
 *  hand on Data Schema) are always kept — never hide data we can't classify. */
export function stagesInCategories(cats: StageCategory[], known: Record<string, StageCategory>): string[] {
  const want = new Set(cats);
  return Object.entries(known)
    .filter(([, c]) => want.has(c))
    .map(([id]) => id);
}

/**
 * The single source of truth for turning the header controls into a Scope.
 * Date presets anchor on the DATA's latest date (never a hardcoded "today"), so
 * "Last 90 days" actually lands on real data. `stageView !== "cumulative"` scopes
 * the WHOLE screen to one stage — the universal per-stage separation.
 */
export function resolveScope(
  events: Event[],
  t: ScopeTweaks,
  policy: CalculationPolicyT = DEFAULT_POLICY,
): Scope {
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  const { min: dataMin, max: dataMax } = dateBounds(events);
  const anchor = dataMax ? new Date(`${dataMax}T00:00:00Z`) : new Date();

  let from: string | undefined = t.dateFrom || undefined;
  let to: string | undefined = t.dateTo || undefined;

  if (t.datePreset === "custom") {
    /* keep typed from/to */
  } else if (t.datePreset === "last-90-days") {
    from = iso(new Date(anchor.getTime() - 90 * 86400000));
    to = iso(anchor);
  } else if (t.datePreset === "last-12-months") {
    const p = new Date(anchor);
    p.setUTCFullYear(p.getUTCFullYear() - 1);
    from = iso(p);
    to = iso(anchor);
  } else if (t.datePreset === "this-fy") {
    const m = anchor.getUTCMonth();
    const y = anchor.getUTCFullYear();
    const fy = m >= 3 ? y : y - 1; // fiscal year Apr–Mar
    from = `${fy}-04-01`;
    to = `${fy + 1}-03-31`;
  } else {
    from = dataMin; // "all"
    to = dataMax;
  }

  // A station view pins one stage; otherwise the section filter decides. Both
  // land in `stageIds`, so scopeEvents needs no new filter.
  // B1 — the user's explicit pick wins; policy only supplies the default.
  const cats = t.stageCategories === undefined || t.stageCategories === null
    ? policy.defaultSections
    : t.stageCategories;
  const categoryStages =
    cats.length === STAGE_CATEGORIES.length
      ? undefined // every section selected — no restriction
      : stagesInCategories(cats, STAGE_CATEGORY);
  const stageIds =
    t.stageView && t.stageView !== "cumulative" ? [t.stageView] : categoryStages;

  const includeExcel = t.includeExcel !== false;
  const includeDirectEntry = t.includeDirectEntry !== false;
  const sourceChannels: SourceChannel[] = [];
  if (includeExcel) sourceChannels.push("excel");
  if (includeDirectEntry) sourceChannels.push("direct-entry");
  // Neither selected → empty result set (explicit "no sources")
  const channelsProp =
    sourceChannels.length === 2 ? undefined : sourceChannels.length === 0 ? ([] as SourceChannel[]) : sourceChannels;

  const sourceFiles =
    includeExcel && t.excelFiles && t.excelFiles.length > 0 ? t.excelFiles : undefined;

  const batchIds =
    t.batchIds && t.batchIds.length > 0
      ? t.batchIds.map((b) => b.toUpperCase())
      : undefined;

  return {
    grain: t.grain,
    dateFrom: from,
    dateTo: to,
    stageIds,
    sourceChannels: channelsProp,
    sourceFiles,
    batchIds,
    policy,
  };
}

/** The immediately-prior equal-length window, for "vs previous period" deltas. */
export function prevWindow(scope: Scope): Scope {
  if (!scope.dateFrom || !scope.dateTo) return scope;
  const from = new Date(scope.dateFrom + "T00:00:00Z").getTime();
  const to = new Date(scope.dateTo + "T00:00:00Z").getTime();
  const day = 86_400_000;
  const len = to - from + day;
  const pTo = from - day;
  const pFrom = pTo - len + day;
  const iso = (ms: number) => new Date(ms).toISOString().slice(0, 10);
  return { ...scope, dateFrom: iso(pFrom), dateTo: iso(pTo) };
}
