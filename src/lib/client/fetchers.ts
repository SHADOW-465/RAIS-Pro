import {
  DEFAULT_POLICY,
  parsePolicy,
  type CalculationPolicyT,
} from "@/core/policy/policy";
import type { DefectAliasRef } from "@/lib/analytics/defect-alias";
import type { BatchConversion } from "@/lib/lineage";
import type { PlantTotals } from "@/lib/analytics/plant-totals";
import type { Event } from "@/lib/store/types";

export interface EventsPayload {
  events: Event[];
  unauthorized: boolean;
}

export interface BoundsPayload {
  min?: string;
  max?: string;
  /** Latest occurredOn.end. "All data" uses this so a span past the last start is kept. */
  maxEnd?: string;
  /** The server could not answer with dates. The caller reads the ledger unscoped. */
  unavailable?: boolean;
}

export interface SchemaPayload {
  registry: any | null;
  policy: CalculationPolicyT;
  schemaRev: string | null;
  configured: boolean;
  unauthorized: boolean;
}

export interface ConversionsPayload {
  conversions: BatchConversion[];
  error: string | null;
  unauthorized: boolean;
}

function defectAliasesFrom(mappings: unknown): DefectAliasRef[] {
  if (!Array.isArray(mappings)) return [];
  const out: DefectAliasRef[] = [];
  for (const row of mappings) {
    if (!row || typeof row !== "object") continue;
    const m = row as { kind?: string; key?: string; canonicalId?: string };
    if (m.kind !== "defect-alias" || !m.key || !m.canonicalId) continue;
    out.push({ key: String(m.key), canonicalId: String(m.canonicalId) });
  }
  return out;
}

/** Body for POST /api/analytics/totals. Same fields the route's zod schema accepts. */
export interface PlantTotalsRequest {
  dateBasis?: "lot" | "entry";
  grain?: "day" | "week" | "month" | "fy";
  datePreset?: import("@/lib/analytics/scope").ScopeTweaks["datePreset"];
  dateFrom?: string | null;
  dateTo?: string | null;
  stageView?: string | null;
  stageCategories?: ("primary" | "secondary" | "assembly")[] | null;
  includeExcel?: boolean;
  includeDirectEntry?: boolean;
  excelFiles?: string[] | null;
  batchIds?: string[] | null;
  from?: string | null;
  to?: string | null;
  span?: "all" | null;
  entryFrom?: string | null;
  entryTo?: string | null;
}

/** A non-OK response throws so the screen keeps its local selectors. */
export async function fetchPlantTotals(body: PlantTotalsRequest): Promise<PlantTotals> {
  const res = await fetch("/api/analytics/totals", {
    method: "POST",
    credentials: "same-origin",
    cache: "no-store",
    headers: { Accept: "application/json", "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (res.status === 401) throw new Error("totals 401");
  if (!res.ok) throw new Error(`totals ${res.status}`);
  return (await res.json()) as PlantTotals;
}

/** Rows per ledger page. The server caps a page at 2500 (~2.8 MB). */
const EVENT_PAGE = 2500;
/** Parallel page reads after the first one. Each read re-runs the effective
 *  ledger query on the server, so keep this small. */
const EVENT_PAGE_PARALLEL = 4;

type EventsPage = { events?: Event[]; nextCursor?: unknown; total?: unknown; offset?: unknown };

function eventsUrl(range: { from?: string; to?: string; span?: "all" }, extra: Record<string, string>): string {
  const qs = new URLSearchParams();
  if (range.from) qs.set("from", range.from);
  if (range.to) qs.set("to", range.to);
  if (range.span === "all" && !range.from && !range.to) qs.set("span", "all");
  for (const [k, v] of Object.entries(extra)) qs.set(k, v);
  const q = qs.toString();
  return `/api/events${q ? `?${q}` : ""}`;
}

async function readEventsPage(url: string): Promise<{ status: number; data?: EventsPage }> {
  const res = await fetch(url, {
    credentials: "same-origin",
    cache: "no-store",
    headers: { Accept: "application/json" },
  });
  if (res.status === 401) return { status: 401 };
  if (!res.ok) throw new Error(`events ${res.status}`);
  return { status: res.status, data: (await res.json()) as EventsPage };
}

/**
 * The whole ledger window. Page one reports the total; when the server
 * understands `offset` (it echoes it back) the remaining pages are read in
 * parallel instead of one after another, which was the 30-40 s first load.
 * If any page disagrees on the total (a write landed mid-read) or the server
 * is older, it falls back to the sequential cursor walk. Rows are de-duplicated
 * by eventId either way.
 */
export async function fetchEvents(range: { from?: string; to?: string; span?: "all" }): Promise<EventsPayload> {
  const first = await readEventsPage(eventsUrl(range, { limit: String(EVENT_PAGE), offset: "0" }));
  if (first.status === 401) return { events: [], unauthorized: true };
  const head = first.data!;
  const firstRows = head.events ?? [];
  const nextCursor = typeof head.nextCursor === "string" && head.nextCursor ? head.nextCursor : null;
  if (!nextCursor) return { events: firstRows, unauthorized: false };

  const total = typeof head.total === "number" ? head.total : null;
  if (total != null && head.offset === 0) {
    const offsets: number[] = [];
    for (let o = firstRows.length; o < total; o += EVENT_PAGE) offsets.push(o);
    const pages: EventsPage[] = new Array(offsets.length);
    let consistent = true;
    let next = 0;
    const worker = async () => {
      while (next < offsets.length) {
        const i = next++;
        const r = await readEventsPage(eventsUrl(range, { limit: String(EVENT_PAGE), offset: String(offsets[i]) }));
        if (r.status === 401) throw new Error("events 401");
        pages[i] = r.data!;
        if (r.data!.total !== total) consistent = false;
      }
    };
    await Promise.all(Array.from({ length: Math.min(EVENT_PAGE_PARALLEL, offsets.length) }, worker));
    if (consistent) {
      const seen = new Set<string>();
      const events: Event[] = [];
      for (const e of [firstRows, ...pages.map((p) => p.events ?? [])].flat()) {
        if (seen.has(e.eventId)) continue;
        seen.add(e.eventId);
        events.push(e);
      }
      if (events.length === total) return { events, unauthorized: false };
    }
  }

  // Sequential cursor walk. An older server (no offset echo) continues from
  // page one; a ledger that changed mid-read starts over.
  const resume = head.offset !== 0;
  const events: Event[] = resume ? [...firstRows] : [];
  let cursor: string | null = resume ? nextCursor : null;
  for (let page = 0; page < 10000; page++) {
    const r = await readEventsPage(eventsUrl(range, cursor ? { limit: String(EVENT_PAGE), cursor } : { limit: String(EVENT_PAGE) }));
    if (r.status === 401) {
      if (events.length === 0) return { events: [], unauthorized: true };
      throw new Error("events 401");
    }
    const data = r.data!;
    events.push(...(data.events ?? []));
    cursor = typeof data.nextCursor === "string" && data.nextCursor ? data.nextCursor : null;
    if (!cursor) break;
  }
  return { events, unauthorized: false };
}

/** Latest event day, without the row bodies. A missing or failed bounds read
 *  is reported (`unavailable`) so the screen can fall back to an unscoped read
 *  instead of showing an empty plant. */
export async function fetchLedgerBounds(): Promise<BoundsPayload> {
  try {
    const res = await fetch("/api/events?bounds=1", {
      credentials: "same-origin",
      cache: "no-store",
      headers: { Accept: "application/json" },
    });
    if (res.status === 401) return {};
    if (res.status === 404) {
      console.warn("[events] bounds read is not on this server; loading the ledger without a date window");
      return { unavailable: true };
    }
    if (!res.ok) {
      console.warn(`[events] bounds read failed (${res.status}); loading the ledger without a date window`);
      return { unavailable: true };
    }
    const data = (await res.json()) as {
      min?: unknown;
      max?: unknown;
      maxEnd?: unknown;
      boundsUnavailable?: boolean;
      error?: string;
    };
    if (data.boundsUnavailable) {
      console.warn(
        `[events] bounds read unavailable${data.error ? `: ${data.error}` : ""}; loading the ledger without a date window`,
      );
      return { unavailable: true };
    }
    return {
      min: typeof data.min === "string" ? data.min : undefined,
      max: typeof data.max === "string" ? data.max : undefined,
      maxEnd: typeof data.maxEnd === "string" ? data.maxEnd : undefined,
    };
  } catch (err) {
    console.warn("[events] bounds request failed; loading the ledger without a date window", err);
    return { unavailable: true };
  }
}

export async function fetchSchema(): Promise<SchemaPayload> {
  const res = await fetch("/api/schema", { credentials: "same-origin", cache: "no-store" });
  if (res.status === 401) {
    return {
      registry: null,
      policy: DEFAULT_POLICY,
      schemaRev: null,
      configured: false,
      unauthorized: true,
    };
  }
  if (!res.ok) throw new Error(`schema ${res.status}`);
  const data = await res.json();
  const defectAliases = defectAliasesFrom(data.mappings);
  return {
    registry: data.registry ? { ...data.registry, defectAliases } : null,
    policy: parsePolicy(data.policy),
    schemaRev: data.catalog?.updatedAt ?? data.catalog?.lastMergedFrom ?? null,
    configured: !!data.configured,
    unauthorized: false,
  };
}

export async function fetchConversions(): Promise<ConversionsPayload> {
  const res = await fetch("/api/batch-conversions", {
    credentials: "same-origin",
    cache: "no-store",
  });
  if (res.status === 401) return { conversions: [], error: null, unauthorized: true };
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: string } | null;
    return {
      conversions: [],
      error: res.status === 503 && body?.error ? body.error : "Could not load conversions.",
      unauthorized: false,
    };
  }
  const data = (await res.json()) as { conversions?: BatchConversion[] };
  return { conversions: data.conversions ?? [], error: null, unauthorized: false };
}
