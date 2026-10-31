// Turn a History / Audit row into the payload Data Entry hydrates the form with.
// "edit" loads the recorded quantities so a correction starts from the truth.
// "reuse-lot" only copies the lot code (next station on the same lot).

import type { AuditBatchGroup, AuditEntryRow } from "@/lib/analytics/audit-sessions";
import { toDisplaySize } from "@/lib/entry/batch-id";
import { sameStage } from "@/lib/entry/process-sequence";

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
 * Load a conversion panel from a ledger batch group.
 *
 * A requested station is matched like everywhere else (`sameStage`) and never
 * silently swapped for the lot's first station: the panel would then show a
 * different station's figures than the ones the conversion is capped by.
 * One row at the station is opened for editing. Several rows (split days,
 * sizes) cannot be edited as one, so they open as the station's TOTALS, the
 * same figures `stationQtyFromGroup` gives the banner and the server cap.
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
        ? (group.stages.find((s) => sameStage(s.stageId, stageId)) ?? null)
        : (group.stages[0] ?? null))
    : null;
  if (bucket && bucket.rows.length === 1) return hydrateFromAuditRow(bucket.rows[0], opts.mode ?? "edit");
  if (bucket && bucket.rows.length > 1) {
    const first = bucket.rows[0];
    const defects: Record<string, number> = {};
    for (const r of bucket.rows) {
      for (const [code, qty] of Object.entries(defectsFromAuditRow(r))) defects[code] = (defects[code] ?? 0) + qty;
    }
    return {
      mode: "reuse-lot",
      batchId: first.batch,
      date: first.date,
      stageId: first.stageId,
      size: first.size ? toDisplaySize(first.size) ?? first.size : null,
      productType: first.productType,
      shift: null,
      checked: bucket.checkedQty,
      accepted: bucket.acceptedQty,
      hold: bucket.holdQty,
      rejected: bucket.rejectedQty,
      defects,
      editingId: "",
    };
  }
  const batchId = (group?.batch || opts.batchId || "").trim();
  if (!batchId) return null;
  return emptyHydrate(batchId, {
    date: opts.date,
    stageId,
    size: opts.size ?? null,
  });
}
