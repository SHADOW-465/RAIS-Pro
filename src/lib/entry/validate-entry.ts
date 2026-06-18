// Live clarification checks for direct entry (MOID-SPEC §5/§6).
//
// These are the deterministic checks that fire AS the user types (or as a sheet
// ingests) — the "company brain asks for clarification" seed. They never block;
// each issue becomes a Finding the user can answer now or later. Same logic the
// batch validation engine (B2) runs; here it runs point-in-time on one record.
//
// Tone: asking, never accusing. Messages are plain language.

import type { StageDayRecord } from "@/lib/ingest/emit";

export type ClarificationSeverity = "critical" | "warning" | "info";

export interface ClarificationIssue {
  code: string;            // maps to a V-rule (V-004/V-003/etc.)
  severity: ClarificationSeverity;
  field: string;           // which input it's about
  message: string;
  stated: number | null;
  computed: number | null;
}

const EPS = 0.005;

/** Point-in-time checks on a single stage-day record. */
export function checkRecord(rec: StageDayRecord): ClarificationIssue[] {
  const issues: ClarificationIssue[] = [];
  const checked = rec.checked?.value ?? null;
  const rejected = rec.rejected?.value ?? null;

  // negatives (impossible counts)
  for (const [field, v] of [["checked", checked], ["rejected", rejected]] as const) {
    if (v != null && v < 0) {
      issues.push({ code: "V-013", severity: "critical", field, message: `${field} is negative (${v}). Counts can't be below zero — is this a back-adjustment?`, stated: v, computed: null });
    }
  }
  for (const d of rec.defects) {
    if (d.value < 0) issues.push({ code: "V-013", severity: "critical", field: `defect:${d.raw}`, message: `${d.raw} is negative (${d.value}).`, stated: d.value, computed: null });
  }

  // rejected can't exceed checked
  if (checked != null && rejected != null && rejected > checked) {
    issues.push({ code: "V-001", severity: "critical", field: "rejected", message: `Rejected (${rejected}) is more than checked (${checked}) — more pieces rejected than inspected.`, stated: rejected, computed: checked });
  }

  // defect breakdown should reconcile to the stated reject total (V-004)
  if (rejected != null && rec.defects.length > 0) {
    const sum = rec.defects.reduce((a, d) => a + d.value, 0);
    if (sum !== rejected) {
      const dir = sum < rejected ? "fewer" : "more";
      issues.push({
        code: "V-004",
        severity: Math.abs(sum - rejected) > 0.05 * Math.max(rejected, 1) ? "critical" : "warning",
        field: "defects",
        message: `The defect reasons add up to ${sum}, ${dir} than the ${rejected} rejected. Where do the other ${Math.abs(rejected - sum)} go?`,
        stated: rejected,
        computed: sum,
      });
    }
  }

  // stated % should match checked/rejected (V-003)
  if (rec.statedPct && typeof rec.statedPct.value === "number" && checked != null && rejected != null && checked > 0) {
    const computed = (rejected / checked) * 100;
    if (Math.abs(computed - rec.statedPct.value) > EPS) {
      issues.push({ code: "V-003", severity: "warning", field: "statedPct", message: `The sheet says ${rec.statedPct.value}% but ${rejected}/${checked} works out to ${computed.toFixed(2)}%.`, stated: rec.statedPct.value, computed });
    }
  }

  return issues;
}

/**
 * Across-collection spike check: compare this record's rejection rate against a
 * baseline mean (e.g. the period-to-date mean for the same stage). `sigmaMult`
 * of 3 ≈ "3× the average" the GM cares about.
 */
export function checkSpike(
  rec: StageDayRecord,
  baseline: { mean: number; n: number },
  sigmaMult = 3
): ClarificationIssue | null {
  const checked = rec.checked?.value ?? null;
  const rejected = rec.rejected?.value ?? null;
  if (checked == null || rejected == null || checked <= 0 || baseline.n < 3) return null;
  const rate = (rejected / checked) * 100;
  if (baseline.mean > 0 && rate > baseline.mean * sigmaMult) {
    return {
      code: "V-009",
      severity: "warning",
      field: "rejected",
      message: `Rejection here is ${rate.toFixed(1)}% — about ${(rate / baseline.mean).toFixed(1)}× the running average of ${baseline.mean.toFixed(1)}%. Real process issue, or a data entry error?`,
      stated: rate,
      computed: baseline.mean,
    };
  }
  return null;
}
