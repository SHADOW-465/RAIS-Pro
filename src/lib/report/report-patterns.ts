import type { MonthMetricPoint, DeterministicPattern } from "./report-model";
import type { StageAnalysisRow } from "@/lib/analytics/rejection";
import type { DefectAnalysisRow } from "@/lib/analytics/defect";
import type { SizeAnalysisRow } from "@/lib/analytics/size";

function pct(n: number): string {
  return `${(n * 100).toFixed(2)}%`;
}

function num(n: number): string {
  return n.toLocaleString("en-IN");
}

/** Months that have a defined rejection rate (records exist and rate is computable). */
function ratedMonths(monthly: MonthMetricPoint[]): MonthMetricPoint[] {
  return monthly.filter((m) => m.status !== "no-qualifying-records" && m.rejectionRate != null);
}

export function fundamentalsPatterns(
  monthly: MonthMetricPoint[],
  stages: StageAnalysisRow[],
  defects: DefectAnalysisRow[],
  sizes: SizeAnalysisRow[],
): DeterministicPattern[] {
  const out: DeterministicPattern[] = [];
  const rated = ratedMonths(monthly);

  if (rated.length > 0) {
    const high = rated.reduce((a, b) => ((b.rejectionRate ?? -1) > (a.rejectionRate ?? -1) ? b : a));
    const low = rated.reduce((a, b) => ((b.rejectionRate ?? 1) < (a.rejectionRate ?? 1) ? b : a));
    out.push({
      id: "highest-rejection-month",
      title: "Highest-rejection month",
      value: pct(high.rejectionRate ?? 0),
      period: high.label,
      rule: "Month with the maximum headline rejection rate among months that have qualifying records and a defined rate.",
    });
    if (low.key !== high.key || rated.length === 1) {
      out.push({
        id: "lowest-rejection-month",
        title: "Lowest-rejection month",
        value: pct(low.rejectionRate ?? 0),
        period: low.label,
        rule: "Month with the minimum headline rejection rate among months that have qualifying records and a defined rate.",
      });
    }
  }

  const activeStages = stages.filter((s) => s.status === "has-records" && !s.unmapped);
  if (activeStages.length > 0) {
    const top = [...activeStages].sort((a, b) => b.rejected - a.rejected)[0];
    out.push({
      id: "top-stage",
      title: "Top contributing stage",
      value: `${top.label}: ${num(top.rejected)} rejected` +
        (top.contributionPct != null ? ` (${top.contributionPct.toFixed(1)}%)` : ""),
      rule: "Stage with the largest rejected quantity. Contribution is stage rejected ÷ cumulative rejected × 100.",
    });
  }

  if (defects.length > 0) {
    const top = defects[0];
    out.push({
      id: "top-defect",
      title: "Top contributing defect",
      value: `${top.label}: ${num(top.rejected)} (${top.pct.toFixed(1)}%)`,
      rule: "Defect with the largest rejected quantity. Share is defect rejected ÷ rejected quantity in the defect analysis.",
    });
  }

  const sizeRows = sizes.filter((s) => !s.unclassified && s.status === "has-records");
  if (sizeRows.length > 0) {
    const top = [...sizeRows].sort((a, b) => b.rejected - a.rejected)[0];
    out.push({
      id: "top-size",
      title: "Top contributing size",
      value: `${top.size}: ${num(top.rejected)} rejected` +
        (top.rejectedContributionPct != null ? ` (${top.rejectedContributionPct.toFixed(1)}%)` : ""),
      rule: "Size with the largest rejected quantity among size-tagged rows. Share is size rejected ÷ rejected in the size-analysis population.",
    });
  }

  if (rated.length >= 2) {
    const prev = rated[rated.length - 2];
    const last = rated[rated.length - 1];
    const delta = (last.rejectionRate ?? 0) - (prev.rejectionRate ?? 0);
    const direction = delta > 0 ? "up" : delta < 0 ? "down" : "unchanged";
    out.push({
      id: "mom-direction",
      title: "Month-over-month direction",
      value: `${direction} (${pct(prev.rejectionRate ?? 0)} → ${pct(last.rejectionRate ?? 0)})`,
      period: `${prev.shortLabel} to ${last.shortLabel}`,
      rule: "Sign of the change in headline rejection rate between the last two months that have a defined rate. Not a test of statistical significance.",
    });
  }

  const gaps = monthly.filter((m) => m.status === "no-qualifying-records");
  if (gaps.length > 0) {
    out.push({
      id: "coverage-gaps",
      title: "Months without qualifying records",
      value: `${gaps.length} of ${monthly.length}: ${gaps.map((g) => g.shortLabel).join(", ")}`,
      rule: "Calendar months in the selected range with zero events whose Date of Entry falls in that month. Absence of records is not proof that the plant produced nothing.",
    });
  }

  return out;
}
