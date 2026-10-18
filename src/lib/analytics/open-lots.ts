// Open-lot management: which lots have cleared Dipping, Secondary, and
// Assembly, and which station they are waiting on. Derived from the ledger.

import { STAGES, STAGE_LABELS, STAGE_CATEGORIES, resolveStageId } from "@/core/ontology/plant-catalog";
import type { StageCategory } from "@/core/ontology/plant-catalog";
import { batchOf, type AuditEventLike } from "./audit-sessions";
import {
  periodsIn,
  periodKey,
  periodLabel,
  type Grain,
} from "./scope";
import type { SeriesPoint } from "./rejection";

export type ProcessId = "primary" | "secondary" | "assembly";

export const PROCESS_ORDER: ProcessId[] = ["primary", "secondary", "assembly"];

export function processLabel(id: ProcessId): string {
  return STAGE_CATEGORIES.find((c) => c.id === id)?.label.replace(/\s*\(.*\)$/, "") ?? id;
}

/**
 * Stations that define process completion on the line.
<<<<<<< Updated upstream
 * Primary / Secondary: stations that record accepted qty (Dipping, Eye Punching,
 * Secondary). Assembly: the four quality gates. Conveyance-only steps skipped.
=======
 *
 * Primary: Dipping (accepted qty). Conveyance steps and Stripping are skipped.
 * Secondary: every qty station in the P10–P14 department — Eye Punching,
 * Hanging, and the lumped Data Entry "Secondary Production" row. Those are
 * the same process recorded three ways, not three sequential gates.
 * Assembly: the four quality gates.
>>>>>>> Stashed changes
 */
export function requiredStations(): { stageId: string; label: string; process: ProcessId }[] {
  return STAGES.filter((s) => {
    if (!s.category) return false;
    if (s.stageId === "balloon-production") return false;
    // Entered by hand after Dipping; no workbook or earlier lot carries it, so
    // requiring it would reopen every historical lot.
    if (s.stageId === "stripping") return false;
    if (s.category === "assembly") return !!s.isQualityGate;
    return Array.isArray(s.captures) && s.captures.includes("accepted");
  }).map((s) => ({
    stageId: s.stageId,
    label: STAGE_LABELS[s.stageId] ?? s.label,
    process: s.category as ProcessId,
  }));
}

const QTY_TYPES = new Set(["production", "inspection", "rejection"]);

function daysBetween(a: string, b: string): number {
  const ms = Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`);
  return Number.isNaN(ms) ? 0 : Math.round(ms / 86_400_000);
}

function canonStage(id: string): string {
  return resolveStageId(id) ?? id;
}

export interface ProcessClearance {
  process: ProcessId;
  done: number;
  total: number;
  complete: boolean;
  nextStageId: string | null;
  nextStageLabel: string | null;
}

export interface OpenLotRow {
  batch: string;
  firstDate: string | null;
  lastDate: string | null;
  completedOn: string | null;
  daysIdle: number;
  stalled: boolean;
  lineComplete: boolean;
  open: boolean;
  waitingOn: ProcessId | null;
  processes: Record<ProcessId, ProcessClearance>;
  occupied: string[];
  lastAccepted: number;
}

export interface StageClearance {
  stageId: string;
  label: string;
  process: ProcessId;
  lotsDone: number;
  lotsTotal: number;
}

export interface OpenLotsReport {
  lots: OpenLotRow[];
  lineCompleteCount: number;
  openCount: number;
  stalledCount: number;
  startedCount: number;
  unitsWaiting: number;
  processMix: { process: ProcessId; label: string; complete: number; incomplete: number }[];
  stageClearance: StageClearance[];
  /** Cumulative count of line-complete lots by period. */
  completedTrend: SeriesPoint[];
}

export function buildOpenLots(
  events: AuditEventLike[],
  opts: { today?: string; stalledAfterDays?: number; grain?: Grain; dateFrom?: string; dateTo?: string } = {},
): OpenLotsReport {
  const today = opts.today ?? new Date().toISOString().slice(0, 10);
  const stalledAfterDays = opts.stalledAfterDays ?? 3;
  const stations = requiredStations();
  const byProcess = new Map<ProcessId, typeof stations>();
  for (const p of PROCESS_ORDER) byProcess.set(p, stations.filter((s) => s.process === p));

  type Acc = {
    occupied: Map<string, { date: string | null; accepted: number; checked: number }>;
  };
  const acc = new Map<string, Acc>();

  for (const e of events) {
    if (!e.eventType || !QTY_TYPES.has(e.eventType)) continue;
    const batch = batchOf(e);
    if (!batch) continue;
    const sid = canonStage(e.stageId || "");
    if (!sid) continue;
    let a = acc.get(batch);
    if (!a) {
      a = { occupied: new Map() };
      acc.set(batch, a);
    }
    const day = e.occurredOn?.start ?? e.recordedAt?.slice(0, 10) ?? null;
    const cur = a.occupied.get(sid) ?? { date: null, accepted: 0, checked: 0 };
    if (day && (!cur.date || day < cur.date)) cur.date = day;
    const q = Number(e.quantity ?? 0);
    if (e.eventType === "production") cur.checked += q;
    else if (e.eventType === "inspection" && (e.disposition === "accepted" || e.disposition === "good")) {
      cur.accepted += q;
    }
    a.occupied.set(sid, cur);
  }

  const lots: OpenLotRow[] = [];
  for (const [batch, a] of acc) {
    const processes = {} as Record<ProcessId, ProcessClearance>;
    const occupiedIds = [...a.occupied.keys()];
    let firstDate: string | null = null;
    let lastDate: string | null = null;
    let completedOn: string | null = null;
    let allRequiredDates: string[] = [];

    for (const p of PROCESS_ORDER) {
      const req = byProcess.get(p) ?? [];
      let done = 0;
      let nextStageId: string | null = null;
      let nextStageLabel: string | null = null;
      const processDates: string[] = [];
      for (const st of req) {
        const hit = a.occupied.get(st.stageId);
        if (hit && (hit.checked > 0 || hit.accepted > 0)) {
          done += 1;
          if (hit.date) {
            processDates.push(hit.date);
            allRequiredDates.push(hit.date);
          }
        } else if (!nextStageId) {
          nextStageId = st.stageId;
          nextStageLabel = st.label;
        }
      }
      const complete = req.length > 0 && done === req.length;
      if (complete && processDates.length) {
        const last = [...processDates].sort().at(-1)!;
        if (!completedOn || last > completedOn) completedOn = last;
      }
      processes[p] = {
        process: p,
        done,
        total: req.length,
        complete,
        nextStageId,
        nextStageLabel,
      };
    }

    const dates = [...a.occupied.values()].map((v) => v.date).filter((d): d is string => !!d).sort();
    firstDate = dates[0] ?? null;
    lastDate = dates[dates.length - 1] ?? null;
    const lineComplete = PROCESS_ORDER.every((p) => processes[p].complete);
    if (lineComplete && allRequiredDates.length) {
      completedOn = [...allRequiredDates].sort().at(-1)!;
    } else {
      completedOn = null;
    }
    const started = PROCESS_ORDER.some((p) => processes[p].done > 0);
    const waitingOn = lineComplete ? null : PROCESS_ORDER.find((p) => !processes[p].complete) ?? null;
    const daysIdle = lastDate ? Math.max(0, daysBetween(lastDate, today)) : 0;
    const open = started && !lineComplete;

    let lastAccepted = 0;
    for (const st of [...stations].reverse()) {
      const hit = a.occupied.get(st.stageId);
      if (hit && (hit.accepted > 0 || hit.checked > 0)) {
        lastAccepted = hit.accepted > 0 ? hit.accepted : hit.checked;
        break;
      }
    }

    lots.push({
      batch,
      firstDate,
      lastDate,
      completedOn,
      daysIdle,
      stalled: open && daysIdle > stalledAfterDays,
      lineComplete,
      open,
      waitingOn,
      processes,
      occupied: occupiedIds.sort(),
      lastAccepted,
    });
  }

  lots.sort((a, b) => b.daysIdle - a.daysIdle || a.batch.localeCompare(b.batch));

  const startedLots = lots.filter((l) => PROCESS_ORDER.some((p) => l.processes[p].done > 0));
  const lineCompleteCount = lots.filter((l) => l.lineComplete).length;
  const openLots = lots.filter((l) => l.open);
  const processMix = PROCESS_ORDER.map((p) => ({
    process: p,
    label: processLabel(p),
    complete: startedLots.filter((l) => l.processes[p].complete).length,
    incomplete: startedLots.filter((l) => !l.processes[p].complete).length,
  }));

  const stageClearance: StageClearance[] = requiredStations().map((st) => ({
    stageId: st.stageId,
    label: st.label,
    process: st.process,
    lotsDone: startedLots.filter((l) => l.occupied.includes(st.stageId)).length,
    lotsTotal: startedLots.length,
  }));

  const grain: Grain = opts.grain ?? "day";
  const periods = periodsIn(events as never, grain, { from: opts.dateFrom, to: opts.dateTo });
  // periodsIn expects Event[]; AuditEventLike is close enough if we pass through
  // a date list from completion dates when events aren't CanonicalEvent.
  const periodList =
    periods.length > 0
      ? periods
      : [...new Set(lots.map((l) => l.completedOn).filter((d): d is string => !!d))]
          .sort()
          .map((d) => periodKey(d, grain));
  const uniquePeriods = [...new Set(periodList)].sort();

  let running = 0;
  const completedByPeriod = new Map<string, number>();
  const completeLots = lots
    .filter((l) => l.lineComplete && l.completedOn)
    .sort((a, b) => (a.completedOn ?? "").localeCompare(b.completedOn ?? ""));
  for (const p of uniquePeriods) completedByPeriod.set(p, 0);
  for (const l of completeLots) {
    const pk = periodKey(l.completedOn!, grain);
    completedByPeriod.set(pk, (completedByPeriod.get(pk) ?? 0) + 1);
  }
  const completedTrend: SeriesPoint[] = uniquePeriods.map((p) => {
    running += completedByPeriod.get(p) ?? 0;
    return { period: p, label: periodLabel(p), value: running };
  });

  return {
    lots,
    lineCompleteCount,
    openCount: openLots.length,
    stalledCount: openLots.filter((l) => l.stalled).length,
    startedCount: startedLots.length,
    unitsWaiting: openLots.reduce((a, l) => a + l.lastAccepted, 0),
    processMix,
    stageClearance,
    completedTrend,
  };
}
