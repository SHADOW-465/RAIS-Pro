// Try the totals RPCs. Until the migration is applied — and whenever the rows
// disagree with the selectors — the screen numbers stay on the JS path.
// A miss is a console.warn, once per reason per process, never a made-up total.

import type { Event } from "@/lib/store/types";
import { shouldUseSupabase } from "@/lib/store";
import type { Scope } from "./scope";
import type { Registry } from "./rejection";
import { defectAliasesOf } from "./defect-alias";
import { stagesFor } from "./rejection";
import { scopeEvents } from "./scope";
import {
  plantTotalsFromEvents,
  rpcMatchesSelectors,
  type PlantTotals,
  type RpcTotalRows,
} from "./plant-totals";

export type TotalsSource = "js" | "rpc";

export interface ServerTotals extends PlantTotals {
  source: TotalsSource;
}

const warned = new Set<string>();

export function __resetTotalsWarnForTests(): void {
  warned.clear();
}

function warnOnce(reason: string, message: string, detail?: unknown): void {
  if (warned.has(reason)) return;
  warned.add(reason);
  if (detail === undefined) console.warn(message);
  else console.warn(message, detail);
}

export function rpcMissing(err: unknown): boolean {
  const row = err as { code?: string; message?: string } | null;
  const code = row?.code ?? "";
  const msg = row?.message ?? (err instanceof Error ? err.message : String(err ?? ""));
  return (
    code === "42P01" ||
    code === "42883" ||
    code === "PGRST202" ||
    /does not exist|schema cache|could not find the function/i.test(msg)
  );
}

function num(v: unknown): number {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}

function asRows(data: unknown): Record<string, unknown>[] {
  return Array.isArray(data) ? (data as Record<string, unknown>[]) : [];
}

async function readRpc(events: Event[], scope: Scope, registry: Registry): Promise<RpcTotalRows> {
  const { createServerClient } = await import("@/lib/supabase");
  const db = createServerClient();
  const scoped = scopeEvents(events, scope);
  const stageIds = [...new Set(scoped.map((e) => ("stageId" in e ? (e as { stageId?: string | null }).stageId : null)).filter((id): id is string => !!id))];
  const args = {
    p_from: scope.dateFrom ?? null,
    p_to: scope.dateTo ?? null,
    p_stage_ids: stageIds.length ? stageIds : null,
    p_rework_counts_as: scope.policy?.reworkCountsAs ?? "excluded",
  };
  const [daily, stages, defects] = await Promise.all([
    db.rpc("totals_daily", args),
    db.rpc("totals_stage", {
      ...args,
      p_stage_order: stagesFor(scoped, registry).map((s) => s.stageId),
    }),
    db.rpc("totals_defect", {
      p_from: args.p_from,
      p_to: args.p_to,
      p_stage_ids: args.p_stage_ids,
      p_aliases: defectAliasesOf(registry),
    }),
  ]);
  if (daily.error) throw daily.error;
  if (stages.error) throw stages.error;
  if (defects.error) throw defects.error;
  return {
    daily: asRows(daily.data).map((r) => ({
      day: String(r.day).slice(0, 10),
      checked: num(r.checked),
      good: num(r.good),
      rework: num(r.rework),
      rejected: num(r.rejected),
    })),
    stages: asRows(stages.data).map((r) => ({
      stageId: String(r.stage_id),
      checked: num(r.checked),
      good: num(r.good),
      rework: num(r.rework),
      rejected: num(r.rejected),
    })),
    defects: asRows(defects.data).map((r) => ({
      defectCode: r.defect_code == null ? null : String(r.defect_code),
      rejected: num(r.rejected),
    })),
  };
}

export async function resolveServerTotals(events: Event[], scope: Scope, registry: Registry): Promise<ServerTotals> {
  const js = plantTotalsFromEvents(events, scope, registry);
  if (!shouldUseSupabase()) {
    warnOnce(
      "memory",
      "[totals] RPC totals are unavailable on the memory store; using JS aggregation",
    );
    return { ...js, source: "js" };
  }
  try {
    const rpc = await readRpc(events, scope, registry);
    if (!rpcMatchesSelectors(js, rpc, events, scope, registry)) {
      warnOnce(
        "mismatch",
        "[totals] RPC totals disagree with JS aggregation; using JS so the screen totals stay the same",
      );
      return { ...js, source: "js" };
    }
    return { ...js, source: "rpc" };
  } catch (err) {
    if (rpcMissing(err)) {
      warnOnce(
        "missing",
        "[totals] totals RPC is not installed (apply supabase/migrations/20261101120000_effective_events.sql); using JS aggregation",
      );
    } else {
      warnOnce("error", "[totals] RPC totals failed; using JS aggregation", err);
    }
    return { ...js, source: "js" };
  }
}
