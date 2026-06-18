import { type Scope } from "./scope";
import { byStage, rejectionRate, totalChecked, totalRejected } from "./rejection";
import { byDefect, bySize } from "./defect";
import type { Event } from "@/lib/store/types";

export interface NarrativeContextResult {
  rejectionRate: number;
  totalChecked: number;
  totalRejected: number;
  worstStage: { stageId: string; label: string; rate: number } | null;
  topDefects: { label: string; pct: number }[];
  topSizes: { size: string; rate: number }[];
}

export function narrativeContext(events: Event[], scope: Scope): NarrativeContextResult {
  const rate = rejectionRate(events, scope).value;
  const checked = totalChecked(events, scope).value;
  const rejected = totalRejected(events, scope).value;

  const stages = byStage(events, scope);
  const sortedStages = [...stages].sort((a, b) => b.rejRate - a.rejRate);
  const worstStage = sortedStages[0]
    ? { stageId: sortedStages[0].stageId, label: sortedStages[0].label, rate: sortedStages[0].rejRate }
    : null;

  const defects = byDefect(events, scope);
  const topDefects = defects.slice(0, 3).map(d => ({ label: d.label, pct: d.pct }));

  const sizes = bySize(events, scope);
  const sortedSizes = [...sizes].sort((a, b) => b.rejRate - a.rejRate);
  const topSizes = sortedSizes.slice(0, 3).map(s => ({ size: s.size, rate: s.rejRate }));

  return {
    rejectionRate: rate,
    totalChecked: checked,
    totalRejected: rejected,
    worstStage,
    topDefects,
    topSizes,
  };
}
