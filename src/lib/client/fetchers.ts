import {
  DEFAULT_POLICY,
  parsePolicy,
  type CalculationPolicyT,
} from "@/core/policy/policy";
import type { DefectAliasRef } from "@/lib/analytics/defect-alias";
import type { BatchConversion } from "@/lib/lineage";
import type { Event } from "@/lib/store/types";

export interface EventsPayload {
  events: Event[];
  unauthorized: boolean;
}

export interface BoundsPayload {
  min?: string;
  max?: string;
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

export async function fetchEvents(range: { from?: string; to?: string }): Promise<EventsPayload> {
  const qs = new URLSearchParams();
  if (range.from) qs.set("from", range.from);
  if (range.to) qs.set("to", range.to);
  const q = qs.toString();
  const res = await fetch(`/api/events${q ? `?${q}` : ""}`, {
    credentials: "same-origin",
    cache: "no-store",
    headers: { Accept: "application/json" },
  });
  if (res.status === 401) return { events: [], unauthorized: true };
  if (!res.ok) throw new Error(`events ${res.status}`);
  const data = await res.json();
  return { events: (data.events ?? []) as Event[], unauthorized: false };
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
    const data = (await res.json()) as { min?: unknown; max?: unknown; boundsUnavailable?: boolean; error?: string };
    if (data.boundsUnavailable) {
      console.warn(
        `[events] bounds read unavailable${data.error ? `: ${data.error}` : ""}; loading the ledger without a date window`,
      );
      return { unavailable: true };
    }
    return {
      min: typeof data.min === "string" ? data.min : undefined,
      max: typeof data.max === "string" ? data.max : undefined,
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
