// Defect selectors (plan 02). Pareto + trend over per-defect rejection events.
// Returns [] (→ empty-state) when no per-defect data is present.

import type { Event } from "@/lib/store/types";
import { type Scope, scopeEvents, periodBucket, periodLabel, periodsIn } from "./scope";
import type { SeriesPoint } from "./rejection";

import { DERIVED_REGISTRY, type Registry } from "./rejection";

function defectLabel(code: string | null, raw: string, registry: Registry = DERIVED_REGISTRY): string {
  if (!code) return raw; // unresolved label shown verbatim (→ V-007 finding elsewhere)
  return registry.defects.find((d) => d.defectCode === code)?.label ?? code;
}

export interface DefectRow {
  defectCode: string | null;
  label: string;
  rejected: number;
  pct: number;
  cumPct: number;
}

/** Defect Pareto: rejected qty by defect, desc, with cumulative %. */
export function byDefect(events: Event[], scope: Scope, registry: Registry = DERIVED_REGISTRY): DefectRow[] {
  const ev = scopeEvents(events, scope).filter((e) => e.eventType === "rejection");
  if (ev.length === 0) return [];
  const sums = new Map<string, { code: string | null; raw: string; qty: number }>();
  for (const e of ev) {
    const code = (e as any).defectCode as string | null;
    const raw = (e as any).defectCodeRaw as string;
    const key = code ?? `raw:${raw}`;
    const cur = sums.get(key) ?? { code, raw, qty: 0 };
    cur.qty += (e as any).quantity as number;
    sums.set(key, cur);
  }
  const total = [...sums.values()].reduce((a, s) => a + s.qty, 0);
  let cum = 0;
  return [...sums.values()]
    .sort((a, b) => b.qty - a.qty)
    .map((s) => {
      const pct = total > 0 ? (s.qty / total) * 100 : 0;
      cum += pct;
      return { defectCode: s.code, label: defectLabel(s.code, s.raw, registry), rejected: s.qty, pct, cumPct: cum };
    });
}

export interface DefectTrendPoint { period: string; label: string; perDefect: Record<string, number> }

/** Top-N defects' qty over time. */
export function defectTrend(events: Event[], scope: Scope, topN = 5, registry: Registry = DERIVED_REGISTRY): DefectTrendPoint[] {
  const ev = scopeEvents(events, scope).filter((e) => e.eventType === "rejection");
  if (ev.length === 0) return [];
  const top = byDefect(events, scope, registry).slice(0, topN).map((d) => d.label);
  const periods = periodsIn(ev, scope.grain, { from: scope.dateFrom, to: scope.dateTo });
  return periods.map((p) => {
    const bucket = periodBucket(ev, scope.grain, p);
    const perDefect: Record<string, number> = {};
    for (const lbl of top) perDefect[lbl] = 0;
    for (const e of bucket) {
      const lbl = defectLabel((e as any).defectCode, (e as any).defectCodeRaw, registry);
      if (lbl in perDefect) perDefect[lbl] += (e as any).quantity as number;
    }
    return { period: p, label: periodLabel(p), perDefect };
  });
}

export type DefectKind = "resolved" | "unresolved-raw" | "unclassified";

export interface DefectAnalysisRow {
  defectCode: string | null;
  label: string;
  rejected: number;
  pct: number;
  cumPct: number;
  rank: number;
  kind: DefectKind;
}

export interface DefectAnalysis {
  rows: DefectAnalysisRow[];
  /** Rejected quantity included in this analysis (all rejection events in scope). */
  rejectedDenominator: number;
  denominatorNote: "defect rejected quantity / total rejected quantity included in the defect analysis × 100";
  resolvedRejected: number;
  unresolvedRawRejected: number;
  unclassifiedRejected: number;
}

/**
 * Defect Pareto over rejection events. Unresolved raw codes stay verbatim.
 * Missing code and raw become an explicit Unclassified row — no fallback code.
 */
export function defectAnalysis(
  events: Event[],
  scope: Scope,
  registry: Registry = DERIVED_REGISTRY,
): DefectAnalysis {
  const ev = scopeEvents(events, scope).filter((e) => e.eventType === "rejection");
  const sums = new Map<string, { code: string | null; raw: string; qty: number; kind: DefectKind }>();
  for (const e of ev) {
    const code = (e as { defectCode?: string | null }).defectCode ?? null;
    const raw = String((e as { defectCodeRaw?: string }).defectCodeRaw ?? "").trim();
    let key: string;
    let kind: DefectKind;
    if (code) {
      key = `code:${code}`;
      kind = "resolved";
    } else if (raw) {
      key = `raw:${raw}`;
      kind = "unresolved-raw";
    } else {
      key = "unclassified";
      kind = "unclassified";
    }
    const cur = sums.get(key) ?? { code, raw, qty: 0, kind };
    cur.qty += (e as { quantity?: number }).quantity ?? 0;
    sums.set(key, cur);
  }
  const total = [...sums.values()].reduce((a, s) => a + s.qty, 0);
  let cum = 0;
  const rows: DefectAnalysisRow[] = [...sums.values()]
    .sort((a, b) => b.qty - a.qty)
    .map((s, i) => {
      const pct = total > 0 ? (s.qty / total) * 100 : 0;
      cum += pct;
      const label =
        s.kind === "unclassified"
          ? "Unclassified"
          : defectLabel(s.code, s.raw, registry);
      return {
        defectCode: s.code,
        label,
        rejected: s.qty,
        pct,
        cumPct: cum,
        rank: i + 1,
        kind: s.kind,
      };
    });
  return {
    rows,
    rejectedDenominator: total,
    denominatorNote:
      "defect rejected quantity / total rejected quantity included in the defect analysis × 100",
    resolvedRejected: rows.filter((r) => r.kind === "resolved").reduce((a, r) => a + r.rejected, 0),
    unresolvedRawRejected: rows.filter((r) => r.kind === "unresolved-raw").reduce((a, r) => a + r.rejected, 0),
    unclassifiedRejected: rows.filter((r) => r.kind === "unclassified").reduce((a, r) => a + r.rejected, 0),
  };
}

export interface SizeRow { size: string; checked: number; rejected: number; rejRate: number }

/** Per-FR-size rejection. [] when no size-tagged events. */
export function bySize(events: Event[], scope: Scope): SizeRow[] {
  const ev = scopeEvents(events, scope).filter((e) => "size" in e && (e as any).size);
  if (ev.length === 0) return [];
  const map = new Map<string, { checked: number; rejected: number }>();
  for (const e of ev) {
    const size = (e as any).size as string;
    const cur = map.get(size) ?? { checked: 0, rejected: 0 };
    if (e.eventType === "production") cur.checked += (e as any).quantity;
    else if (e.eventType === "inspection" && (e as any).disposition === "rejected") cur.rejected += (e as any).quantity;
    map.set(size, cur);
  }
  return [...map.entries()]
    .map(([size, v]) => ({ size, ...v, rejRate: v.checked > 0 ? v.rejected / v.checked : 0 }))
    .sort((a, b) => a.size.localeCompare(b.size));
}

export type { SeriesPoint };
