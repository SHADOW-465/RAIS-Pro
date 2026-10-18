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
