// Turn a History / Audit row into the payload Data Entry hydrates the form with.
// "edit" loads the recorded quantities so a correction starts from the truth.
// "reuse-lot" only copies the lot code (next station on the same lot).

import type { AuditBatchGroup, AuditEntryRow } from "@/lib/analytics/audit-sessions";
import { toDisplaySize } from "@/lib/entry/batch-id";

export type EntryHydrateMode = "edit" | "reuse-lot";

export type EntryHydrate = {
  mode: EntryHydrateMode;
  batchId: string;
  date: string;
  stageId: string;
  size: string | null;
  productType: string | null;
  shift: string | null;
  checked: number;
  accepted: number;
  hold: number;
  rejected: number;
  defects: Record<string, number>;
  editingId: string;
};

export function defectsFromAuditRow(row: Pick<AuditEntryRow, "defects">): Record<string, number> {
  const out: Record<string, number> = {};
  for (const d of row.defects) {
    if (d.qty > 0) out[d.code] = d.qty;
  }
  return out;
}

export function hydrateFromAuditRow(
  row: AuditEntryRow,
  mode: EntryHydrateMode = "edit",
): EntryHydrate {
  return {
    mode,
    batchId: row.batch,
    date: row.date,
    stageId: row.stageId,
    size: row.size ? toDisplaySize(row.size) ?? row.size : null,
    productType: row.productType,
    shift: row.shifts[0] ?? null,
    checked: row.checked,
    accepted: row.accepted,
    hold: row.rework,
    rejected: row.rejected,
    defects: defectsFromAuditRow(row),
    editingId: `ledger:${row.id}`,
  };
}

function emptyHydrate(
  batchId: string,
  opts: { date?: string; stageId?: string; size?: string | null },
): EntryHydrate {
  return {
    mode: "reuse-lot",
    batchId,
    date: opts.date ?? "",
    stageId: opts.stageId ?? "",
    size: opts.size ?? null,
    productType: null,
    shift: null,
    checked: 0,
    accepted: 0,
    hold: 0,
    rejected: 0,
    defects: {},
    editingId: "",
  };
}

/**
 * Whole-lot conversion: mirror the original lot's station onto the converted
 * lot. Quantities and defects are summed across every row at the station and
 * written as a fresh entry on the new identity — the original rows are never
 * edited. Returns null when the original has nothing at the station.
 */
export function mirrorStationToLot(
  group: AuditBatchGroup | null | undefined,
  opts: { stageId: string; batchId: string; date: string; size: string | null },
): EntryHydrate | null {
  const bucket = group?.stages.find((s) => s.stageId === opts.stageId);
  if (!bucket || bucket.rows.length === 0) return null;
  let checked = 0;
  let accepted = 0;
  let hold = 0;
  let rejected = 0;
  const defects: Record<string, number> = {};
  for (const r of bucket.rows) {
    checked += r.checked || 0;
    accepted += r.accepted || 0;
    hold += r.rework || 0;
    rejected += r.rejected || 0;
    for (const [code, qty] of Object.entries(defectsFromAuditRow(r))) {
      defects[code] = (defects[code] ?? 0) + qty;
    }
  }
  if (checked <= 0 && accepted <= 0) return null;
  const first = bucket.rows[0];
  return {
    mode: "reuse-lot",
    batchId: opts.batchId,
    date: opts.date,
    stageId: opts.stageId,
    size: opts.size,
    productType: first.productType,
    shift: first.shifts[0] ?? null,
    checked: checked > 0 ? checked : accepted,
    accepted,
    hold,
    rejected,
    defects,
    editingId: "",
  };
}

/**
 * Load a conversion panel from a ledger batch group.
 * Prefers the requested station; falls back to the first stage on the lot.
 * Lots with no ledger rows still get a reuse-lot hydrate so identity is locked.
 */
export function hydrateFromBatchGroup(
  group: AuditBatchGroup | null | undefined,
  opts: {
    batchId?: string;
    stageId?: string;
    date?: string;
    size?: string | null;
    mode?: EntryHydrateMode;
  } = {},
): EntryHydrate | null {
  const stageId = (opts.stageId ?? "").trim();
  const bucket = group
    ? (stageId
        ? (group.stages.find((s) => s.stageId === stageId) ?? group.stages[0] ?? null)
        : (group.stages[0] ?? null))
    : null;
  const row = bucket?.rows[0];
  if (row) return hydrateFromAuditRow(row, opts.mode ?? "edit");
  const batchId = (group?.batch || opts.batchId || "").trim();
  if (!batchId) return null;
  return emptyHydrate(batchId, {
    date: opts.date,
    stageId,
    size: opts.size ?? null,
  });
}
