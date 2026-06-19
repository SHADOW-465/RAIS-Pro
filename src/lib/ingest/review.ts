// src/lib/ingest/review.ts
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
  acceptedGood: number | null;
  rework: number | null;
  rejected: number | null;
  statedPct: number | null;  // what the sheet's formula said (a claim)
  correctedPct: number | null; // recomputed = rejected / checked * 100
  status: RowStatus;
  flags: string[];           // plain-language anomalies / corrections
  defects: { raw: string; value: number; cell: string }[];
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
  const acceptedGood = rec.acceptedGood?.value ?? null;
  const rework = rec.rework?.value ?? null;
  const rejected = rec.rejected?.value ?? null;
  const statedPct = typeof rec.statedPct?.value === "number" ? (rec.statedPct.value as number) : null;
  const correctedPct = checked != null && checked > 0 && rejected != null ? (rejected / checked) * 100 : null;
  const defects = rec.defects;

  const flags: string[] = [];
  let status: RowStatus = "ok";

  if (checked != null && checked < 0) { flags.push(`Checked is negative (${checked})`); status = "invalid"; }
  if (acceptedGood != null && acceptedGood < 0) { flags.push(`Good is negative (${acceptedGood})`); status = "invalid"; }
  if (rework != null && rework < 0) { flags.push(`Rework is negative (${rework})`); status = "invalid"; }
  if (rejected != null && rejected < 0) { flags.push(`Rejected is negative (${rejected})`); status = "invalid"; }
  
  if (checked != null && rejected != null && rejected > checked) {
    flags.push(`Rejected (${rejected}) exceeds checked (${checked})`); status = "invalid";
  }
  if (checked != null && acceptedGood != null && acceptedGood > checked) {
    flags.push(`Good (${acceptedGood}) exceeds checked (${checked})`); status = "invalid";
  }

  // Real-time balance rule check: Checked = Good + Rework + Rejected
  if (checked != null && acceptedGood != null) {
    const sum = acceptedGood + (rework ?? 0) + (rejected ?? 0);
    if (checked !== sum) {
      flags.push(`Balance Violation: Checked (${checked}) does not equal Good (${acceptedGood}) + Rework (${rework ?? 0}) + Rejected (${rejected ?? 0}) (Sum: ${sum})`);
      status = "invalid";
    }
  }

  // Defect sum validation vs Stated Rejected
  if (defects.length > 0 && rejected != null) {
    const defectSum = defects.reduce((s, d) => s + d.value, 0);
    if (defectSum !== rejected) {
      flags.push(`Defect Mismatch: Defect counts sum (${defectSum}) does not equal Rejected total (${rejected})`);
      status = "invalid";
    }
  }

  if (status !== "invalid" && statedPct != null && correctedPct != null && Math.abs(statedPct - correctedPct) > PCT_EPS) {
    flags.push(`Sheet said ${statedPct.toFixed(2)}% — recomputed ${correctedPct.toFixed(2)}%`);
    status = "corrected";
  }

  return {
    recordIndex,
    date: rec.occurredOn.start,
    stageId: rec.stageId,
    stageLabel: stageLabel(rec.stageId, rec),
    checked,
    acceptedGood,
    rework,
    rejected,
    statedPct,
    correctedPct,
    status,
    flags,
    defects,
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

/** Apply an edit to any record field or defect (returns a new records array). */
export function applyEdit(
  records: StageDayRecord[],
  index: number,
  field: "checked" | "rejected" | "acceptedGood" | "rework" | string,
  value: number
): StageDayRecord[] {
  return records.map((rec, i) => {
    if (i !== index) return rec;

    // Direct core fields
    if (field === "checked" || field === "rejected" || field === "acceptedGood" || field === "rework") {
      const sv = rec[field] ?? { value, cell: `EDIT!${field}`, header: field };
      return { ...rec, [field]: { ...sv, value }, extractedBy: "direct-entry" };
    }

    // Otherwise treat as a defect count edit
    const defectName = field;
    const existingIdx = rec.defects.findIndex((d) => d.raw === defectName);
    const newDefects = [...rec.defects];

    if (existingIdx >= 0) {
      if (value === 0) {
        newDefects.splice(existingIdx, 1);
      } else {
        newDefects[existingIdx] = {
          ...newDefects[existingIdx],
          value: value,
        };
      }
    } else if (value > 0) {
      newDefects.push({
        raw: defectName,
        value: value,
        cell: `EDIT!defect!${defectName}`,
      });
    }

    // Auto-calculate total rejected if defects exist
    let newRejected = rec.rejected;
    if (newDefects.length > 0) {
      const sum = newDefects.reduce((s, d) => s + d.value, 0);
      newRejected = rec.rejected
        ? { ...rec.rejected, value: sum }
        : { value: sum, cell: "EDIT!rejected", header: "Rejected" };
    }

    return {
      ...rec,
      defects: newDefects,
      rejected: newRejected,
      extractedBy: "direct-entry",
    };
  });
}
