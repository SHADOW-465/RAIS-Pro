// Quantity flow board for Batch Conversion.
//
// The training slide identity at every station:
//   CHECKED = ACCEPT + HOLD + REJECT + WIP
// Convert boxes start at the change station and continue downstream.
// Numbers come from ledger rows + the lineage row. Nothing is invented
// for empty lots.

import { resolveStageId, stageSortKey, STAGES } from "@/core/ontology/plant-catalog";
import { ENTRY_LINE } from "@/lib/entry/entry-line";
import type { AuditEntryRow, AuditBatchGroup } from "@/lib/analytics/audit-sessions";

export type StationQty = {
  checked: number;
  accepted: number;
  hold: number;
  rejected: number;
};

export type FlowChip = StationQty & { wip: number };

export type FlowStation = {
  stageId: string;
  label: string;
  laneId: string;
};

export type ConversionAnchor = {
  stageId: string;
  changedQty: number;
  toBatch: string;
};

export type FlowBand = {
  stageId: string;
  label: string;
  laneId: string;
  original: FlowChip;
  convert: FlowChip | null;
  toBatch: string | null;
  remainQty: number;
  isChangeStation: boolean;
};

/** Eligible pieces at the change station: accepted when present, else checked. */
export function eligibleTransferQty(
  stage: { acceptedQty: number; checkedQty: number } | null | undefined,
): number | null {
  if (!stage) return null;
  return stage.acceptedQty > 0 ? stage.acceptedQty : stage.checkedQty;
}

export function transferQtyError(
  qty: number,
  eligible: number | null,
  stageLabel: string,
): string | null {
  if (qty < 0) return "Quantity cannot be negative.";
  if (eligible === 0 && qty > 0) {
    return `The original lot has no quantity at ${stageLabel}. Pick a station it has already reached.`;
  }
  if (eligible != null && eligible > 0 && qty > eligible) {
    return `Only ${eligible.toLocaleString()} can change size at ${stageLabel}.`;
  }
  return null;
}

export function chipFromQty(q: Partial<StationQty> | null | undefined): FlowChip {
  const checked = Math.max(0, q?.checked ?? 0);
  const accepted = Math.max(0, q?.accepted ?? 0);
  const hold = Math.max(0, q?.hold ?? 0);
  const rejected = Math.max(0, q?.rejected ?? 0);
  return {
    checked,
    accepted,
    hold,
    rejected,
    wip: Math.max(0, checked - accepted - hold - rejected),
  };
}

export function qtyFromRows(rows: Pick<AuditEntryRow, "checked" | "accepted" | "rework" | "rejected">[]): StationQty {
  if (!rows.length) return { checked: 0, accepted: 0, hold: 0, rejected: 0 };
  return rows.reduce(
    (acc, r) => ({
      checked: acc.checked + (r.checked || 0),
      accepted: acc.accepted + (r.accepted || 0),
      hold: acc.hold + (r.rework || 0),
      rejected: acc.rejected + (r.rejected || 0),
    }),
    { checked: 0, accepted: 0, hold: 0, rejected: 0 },
  );
}

export function stageShowsConvert(stageId: string, changeStageId: string | null | undefined): boolean {
  if (!changeStageId) return false;
  const here = resolveStageId(stageId) ?? stageId;
  const change = resolveStageId(changeStageId) ?? changeStageId;
  return stageSortKey(here) >= stageSortKey(change);
}

export function qtyMapFromGroup(group: AuditBatchGroup | null | undefined): Record<string, StationQty> {
  const out: Record<string, StationQty> = {};
  if (!group) return out;
  for (const s of group.stages) {
    out[s.stageId] = qtyFromRows(s.rows);
  }
  return out;
}

/** The plant entry line, one band per station (see lib/entry/entry-line.ts). */
export function defaultFlowStations(): FlowStation[] {
  const out: FlowStation[] = [];
  for (const lane of ENTRY_LINE) {
    for (const stageId of lane.stageIds) {
      const stage = STAGES.find((s) => s.stageId === stageId);
      if (!stage) continue;
      out.push({ stageId, label: stage.label.replace(/\s*\(.*\)$/, ""), laneId: lane.id });
    }
  }
  return out;
}

export function buildQuantityFlow(opts: {
  stations: FlowStation[];
  original: Record<string, Partial<StationQty>>;
  convert: Record<string, Partial<StationQty>>;
  conversion: ConversionAnchor | null;
}): FlowBand[] {
  const changeId = opts.conversion
    ? (resolveStageId(opts.conversion.stageId) ?? opts.conversion.stageId)
    : null;

  return opts.stations.map((station) => {
    const sid = resolveStageId(station.stageId) ?? station.stageId;
    const original = chipFromQty(opts.original[station.stageId] ?? opts.original[sid]);
    const showsConvert = stageShowsConvert(sid, changeId);
    const isChangeStation = Boolean(changeId && (resolveStageId(sid) ?? sid) === changeId);

    let convert: FlowChip | null = null;
    if (showsConvert && opts.conversion) {
      const raw = opts.convert[station.stageId] ?? opts.convert[sid] ?? {};
      const seeded =
        isChangeStation && !(raw.checked && raw.checked > 0)
          ? { ...raw, checked: opts.conversion.changedQty }
          : raw;
      convert = chipFromQty(seeded);
    }

    return {
      stageId: sid,
      label: station.label,
      laneId: station.laneId,
      original,
      convert,
      toBatch: showsConvert ? opts.conversion?.toBatch ?? null : null,
      remainQty: isChangeStation ? (opts.conversion?.changedQty ?? original.wip) : original.wip,
      isChangeStation,
    };
  });
}
