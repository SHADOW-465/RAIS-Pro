// src/lib/analytics/pareto.ts
// Pareto (80/20) analysis over defect series — extracted verbatim from the
// legacy dashboard-builder before its deletion (the one piece still consumed
// by the cockpit / defect-analysis screens).

export interface SeriesPoint { label: string; value: number }
export interface ParetoItem {
  rank: number; label: string; value: number;
  contribution: number; cumulative: number; isVitalFew: boolean;
}
export interface ParetoAnalysis {
  items: ParetoItem[]; totalDefects: number;
  vitalFewCount: number; vitalFewContribution: number; criticalAreaText: string;
}

function prettyLabel(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .trim();
}

export function calculatePareto(data: SeriesPoint[]): ParetoAnalysis | null {
  const sorted = data
    .filter((p) => p.value > 0)
    .sort((a, b) => b.value - a.value);
  if (sorted.length === 0) return null;

  const totalDefects = sorted.reduce((sum, p) => sum + p.value, 0);
  if (totalDefects <= 0) return null;

  let cumulative = 0;
  let prevCumulative = 0; // cumulative % of the element BEFORE this one
  const items: ParetoItem[] = sorted.map((p, i) => {
    const contribution = (p.value / totalDefects) * 100;
    cumulative += contribution;
    // Vital few = every element up to and including the first one that pushes
    // the running total past 80%. Gated on the PREVIOUS cumulative so the
    // crossing element is itself included.
    const isVitalFew = prevCumulative < 80;
    prevCumulative = cumulative;
    return { rank: i + 1, label: p.label, value: p.value, contribution, cumulative, isVitalFew };
  });

  const vitalFew = items.filter((it) => it.isVitalFew);
  const vitalFewCount = vitalFew.length;
  const vitalFewContribution = vitalFew.reduce((sum, it) => sum + it.contribution, 0);

  const names = vitalFew.map((v) => prettyLabel(v.label));
  const nameList =
    names.length <= 3 ? names.join(", ") : `${names.slice(0, 3).join(", ")}, +${names.length - 3} more`;
  const noun = vitalFewCount === 1 ? "category" : "categories";
  const criticalAreaText =
    `The top ${vitalFewCount} defect ${noun} (${nameList}) account for ` +
    `${vitalFewContribution.toFixed(1)}% of total quality rejects.`;

  return { items, totalDefects, vitalFewCount, vitalFewContribution, criticalAreaText };
}
