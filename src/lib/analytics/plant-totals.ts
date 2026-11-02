// Screen totals from the existing selectors. This is the number the API returns.
// The SQL functions are a second implementation of the daily / stage / defect
// sums; they never replace a headline, because rejectionRate, totalChecked,
// and COPQ are not those sums.

import type { Event } from "@/lib/store/types";
import { scopeEvents, type Scope } from "./scope";
import {
  byStage,
  fpy,
  rejectionRate,
  stageAnalysis,
  stagesFor,
  stageTrend,
  totalChecked,
  totalRejected,
  trend,
  type Registry,
} from "./rejection";
import { byDefect, defectAnalysis, defectTrend } from "./defect";
import { copq, copqTrend, savingsOpportunity } from "./cost";
import { totalsDaily, totalsDefect, totalsStage, type SqlAlias } from "./sql-totals";
import { defectAliasesOf } from "./defect-alias";
import { partitionByEntryDate } from "@/lib/report/date-basis";

export type TotalsBasis = "lot" | "entry";

export function selectTotalsEvents(
  events: Event[],
  opts: { basis: TotalsBasis; scope: Scope; entryFrom?: string | null; entryTo?: string | null },
): { events: Event[]; scope: Scope } {
  if (opts.basis === "lot") return { events, scope: opts.scope };
  const scope: Scope = { ...opts.scope, dateFrom: undefined, dateTo: undefined };
  const population = scopeEvents(events, scope);
  if (opts.entryFrom && opts.entryTo) {
    return { events: partitionByEntryDate(population, opts.entryFrom, opts.entryTo).included, scope };
  }
  return { events: population, scope };
}

function jsonValue(n: number): number | null {
  return Number.isFinite(n) ? n : null;
}

export interface PlantTotals {
  headlines: {
    rejectionRate: number;
    totalRejected: number;
    totalChecked: number;
    fpy: number;
    copq: number | null;
    savings: number | null;
  };
  stages: ReturnType<typeof byStage>;
  defects: ReturnType<typeof byDefect>;
  /** Null value means the selector returned NaN (a period with no production). */
  rejectionTrend: { period: string; label: string; value: number | null; rejected?: number; checked?: number; noProduction?: boolean }[];
  spcTrend: { period: string; label: string; value: number | null; rejected?: number; checked?: number; noProduction?: boolean }[];
  stageTrend: ReturnType<typeof stageTrend>;
  defectTrend: ReturnType<typeof defectTrend>;
  defectTrendAll: ReturnType<typeof defectTrend>;
  copqTrend: ReturnType<typeof copqTrend>;
  stageAnalysis: ReturnType<typeof stageAnalysis>;
  defectAnalysis: ReturnType<typeof defectAnalysis>;
  daily: ReturnType<typeof totalsDaily>;
}

function packTrend(points: ReturnType<typeof trend>): PlantTotals["rejectionTrend"] {
  return points.map((p) => ({ ...p, value: jsonValue(p.value) }));
}

/** Selectors over `events` and `scope`. Call selectTotalsEvents first for entry basis. */
export function plantTotalsFromEvents(events: Event[], scope: Scope, registry: Registry): PlantTotals {
  const defects = byDefect(events, scope, registry);
  const scoped = scopeEvents(events, scope);
  const aliases: SqlAlias[] = defectAliasesOf(registry).map((a) => ({
    ...a,
    label: registry.defects.find((d) => d.defectCode === a.canonicalId || d.defectCode === a.key)?.label,
  }));
  return {
    headlines: {
      rejectionRate: rejectionRate(events, scope, registry).value,
      totalRejected: totalRejected(events, scope).value,
      totalChecked: totalChecked(events, scope, registry).value,
      fpy: fpy(events, scope, registry).value,
      copq: copq(events, scope)?.value ?? null,
      savings: savingsOpportunity(events, scope),
    },
    stages: byStage(events, scope, registry),
    defects,
    rejectionTrend: packTrend(trend(events, scope, "rejectionRate", registry)),
    spcTrend: packTrend(trend(events, scope)),
    stageTrend: stageTrend(events, scope, registry),
    defectTrend: defectTrend(events, scope, 5, registry),
    defectTrendAll: defectTrend(events, scope, Math.max(defects.length, 1), registry),
    copqTrend: copqTrend(events, scope),
    stageAnalysis: stageAnalysis(events, scope, registry),
    defectAnalysis: defectAnalysis(events, scope, registry),
    daily: totalsDaily(scoped, { reworkCountsAs: scope.policy?.reworkCountsAs ?? "excluded" }),
  };
}

export interface RpcTotalRows {
  daily: { day: string; checked: number; good: number; rework: number; rejected: number }[];
  stages: { stageId: string; checked: number; good: number; rework: number; rejected: number }[];
  defects: { defectCode: string | null; rejected: number }[];
}

/** True when the RPC rows are the same sums the selectors just produced. */
export function rpcMatchesSelectors(totals: PlantTotals, rpc: RpcTotalRows, events: Event[], scope: Scope, registry: Registry): boolean {
  const dailyByDay = new Map(totals.daily.map((r) => [r.day, r]));
  if (rpc.daily.length !== totals.daily.length) return false;
  for (const row of rpc.daily) {
    const js = dailyByDay.get(String(row.day).slice(0, 10));
    if (!js) return false;
    if (num(js.checked) !== num(row.checked) || num(js.good) !== num(row.good) || num(js.rework) !== num(row.rework) || num(js.rejected) !== num(row.rejected)) {
      return false;
    }
  }

  const stageOrder = stagesFor(scopeEvents(events, scope), registry).map((s) => s.stageId);
  const jsStages = totalsStage(scopeEvents(events, scope), {
    reworkCountsAs: scope.policy?.reworkCountsAs ?? "excluded",
    stageOrder,
  });
  if (rpc.stages.length !== jsStages.length) return false;
  const stageById = new Map(jsStages.map((s) => [s.stageId, s]));
  for (const row of rpc.stages) {
    const js = stageById.get(row.stageId);
    if (!js) return false;
    if (num(js.checked) !== num(row.checked) || num(js.good) !== num(row.good) || num(js.rework) !== num(row.rework) || num(js.rejected) !== num(row.rejected)) {
      return false;
    }
  }

  const jsDefects = totalsDefect(scopeEvents(events, scope), {
    aliases: defectAliasesOf(registry),
    reworkCountsAs: scope.policy?.reworkCountsAs,
  });
  if (rpc.defects.length !== jsDefects.length) return false;
  const defectByCode = new Map(jsDefects.map((d) => [d.defectCode ?? "", d.rejected]));
  for (const row of rpc.defects) {
    if (num(defectByCode.get(row.defectCode ?? "") ?? NaN) !== num(row.rejected)) return false;
  }
  return true;
}

function num(n: number): number {
  return Math.round(n * 1e6) / 1e6;
}
