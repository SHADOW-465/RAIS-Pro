// Recompute-from-scratch review (MOID-SPEC §4 principle: never trust the
// sheet's formulas). Builds, per ingested day-row, the system-recomputed
// figures + flags where the sheet disagreed or the data is impossible.
// Feeds the verification grid; the user can edit, then save the corrected set.

import type { StageDayRecord } from "@/lib/ingest/emit";
import { DISPOSAFE_REGISTRY } from "@/lib/registry/disposafe";

export type RowStatus = "ok" | "corrected" | "invalid";

export interface ReviewRow {
  recordIndex: number;       // index into the records array (for edits)
  date: string;
  stageId: string;
  stageLabel: string;
  checked: number | null;
  rejected: number | null;
  statedPct: number | null;  // what the sheet's formula said (a claim)
  correctedPct: number | null; // recomputed = rejected / checked * 100
  status: RowStatus;
  flags: string[];           // plain-language anomalies / corrections
}

const PCT_EPS = 0.01;

function stageLabel(stageId: string, rec?: StageDayRecord): string {
  if (rec?.source?.sheet && rec.source.sheet !== "Data Entry") {
    return rec.source.sheet;
  }
  return DISPOSAFE_REGISTRY.stages.find((s) => s.stageId === stageId)?.label ?? stageId;
}

/** Recompute one record's % from its raw checked/rejected and flag anomalies. */
export function reviewRow(rec: StageDayRecord, recordIndex: number): ReviewRow {
  const checked = rec.checked?.value ?? null;
  const rejected = rec.rejected?.value ?? null;
  const statedPct = typeof rec.statedPct?.value === "number" ? (rec.statedPct.value as number) : null;
  const correctedPct = checked != null && checked > 0 && rejected != null ? (rejected / checked) * 100 : null;

  const flags: string[] = [];
  let status: RowStatus = "ok";

  if (checked != null && checked < 0) { flags.push(`Checked is negative (${checked})`); status = "invalid"; }
  if (rejected != null && rejected < 0) { flags.push(`Rejected is negative (${rejected})`); status = "invalid"; }
  if (checked != null && rejected != null && rejected > checked) {
    flags.push(`Rejected (${rejected}) exceeds checked (${checked})`); status = "invalid";
  }
  if (status !== "invalid" && statedPct != null && correctedPct != null && Math.abs(statedPct - correctedPct) > PCT_EPS) {
    flags.push(`Sheet said ${statedPct.toFixed(2)}% — recomputed ${correctedPct.toFixed(2)}%`);
    status = "corrected";
  }

  return {
    recordIndex, date: rec.occurredOn.start, stageId: rec.stageId, stageLabel: stageLabel(rec.stageId, rec),
    checked, rejected, statedPct, correctedPct, status, flags,
  };
}

export function buildReviewRows(records: StageDayRecord[]): ReviewRow[] {
  return records.map(reviewRow).sort((a, b) =>
    a.stageLabel.localeCompare(b.stageLabel) || a.date.localeCompare(b.date)
  );
}

export interface ReviewSummary {
  total: number;
  invalid: number;
  corrected: number;
  ok: number;
}
export function reviewSummary(rows: ReviewRow[]): ReviewSummary {
  return {
    total: rows.length,
    invalid: rows.filter((r) => r.status === "invalid").length,
    corrected: rows.filter((r) => r.status === "corrected").length,
    ok: rows.filter((r) => r.status === "ok").length,
  };
}

/** Apply an edit to a record's checked/rejected (returns a new records array). */
export function applyEdit(
  records: StageDayRecord[],
  index: number,
  field: "checked" | "rejected",
  value: number
): StageDayRecord[] {
  return records.map((rec, i) => {
    if (i !== index) return rec;
    const sv = rec[field] ?? { value, cell: `EDIT!${field}`, header: field };
    return { ...rec, [field]: { ...sv, value }, extractedBy: "direct-entry" };
  });
}
