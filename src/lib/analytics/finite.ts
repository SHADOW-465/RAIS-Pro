// Finite display numbers for KPIs and diagnostic sentences.
// Empty production days are stored as NaN so charts can leave a gap. Subtracting
// one of those buckets prints "NaN%". Callers that compare periods must use the
// last two buckets that actually had checked units — the same pair as the trend.

import { lastProductivePair, type SeriesPoint } from "./rejection";

/** A real number. Rejects NaN, ±Infinity, and anything that is not a number. */
export function finiteNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/**
 * Fixed digits of a percent, without the % sign.
 * `scale` 100 treats `value` as a 0–1 ratio. `scale` 1 means it is already in percent.
 * Null when the input or the scaled result is not finite.
 */
export function formatPercentDigits(value: unknown, digits = 2, scale: 1 | 100 = 100): string | null {
  const n = finiteNumber(value);
  if (n == null) return null;
  const scaled = scale === 100 ? n * 100 : n;
  if (!Number.isFinite(scaled)) return null;
  return scaled.toFixed(digits);
}

/** "12.16%" from a 0–1 ratio. Null when the ratio is not finite. */
export function formatRatioPercent(ratio: unknown, digits = 2): string | null {
  const digitsText = formatPercentDigits(ratio, digits, 100);
  return digitsText == null ? null : `${digitsText}%`;
}

/** "12.2%" from a number that is already in percent. Null when not finite. */
export function formatPercent(percent: unknown, digits = 1): string | null {
  const digitsText = formatPercentDigits(percent, digits, 1);
  return digitsText == null ? null : `${digitsText}%`;
}

export interface RateComparison {
  /** Signed percentage points: (current − previous) × 100. */
  points: number;
  absText: string;
  direction: "increase" | "reduction";
  previousLabel: string;
  currentLabel: string;
}

/**
 * Change between the last two trend buckets that had production.
 * Null when the series is missing, has fewer than two productive buckets,
 * or either rate is not finite.
 */
export function productiveRateComparison(
  points: readonly SeriesPoint[] | null | undefined,
  digits = 2,
): RateComparison | null {
  if (!points || points.length < 2) return null;
  const pair = lastProductivePair(points as SeriesPoint[]);
  if (!pair) return null;
  const [current, previous] = pair;
  const now = finiteNumber(current.value);
  const then = finiteNumber(previous.value);
  if (now == null || then == null) return null;
  const delta = (now - then) * 100;
  if (!Number.isFinite(delta)) return null;
  return {
    points: delta,
    absText: Math.abs(delta).toFixed(digits),
    direction: delta >= 0 ? "increase" : "reduction",
    previousLabel: previous.label,
    currentLabel: current.label,
  };
}

/** ", a 2.66% pt reduction vs 03 Oct", or "" when there is nothing finite to say. */
export function rejectionComparisonPhrase(
  points: readonly SeriesPoint[] | null | undefined,
): string {
  const cmp = productiveRateComparison(points);
  if (!cmp) return "";
  return `, a ${cmp.absText}% pt ${cmp.direction} vs ${cmp.previousLabel}`;
}

/** Diagnostics headline. Omits the comparison when no productive pair exists. */
export function overallRejectionHeadline(
  rate: unknown,
  points: readonly SeriesPoint[] | null | undefined,
): string {
  const rateLabel = formatRatioPercent(rate) ?? "—";
  return `Overall rejection rate is ${rateLabel}${rejectionComparisonPhrase(points)}.`;
}

/**
 * Trend-arrow text: "↓ 2.66% vs 03 Oct".
 * Null when either rate is not finite — the caller omits the number.
 */
export function kpiRateDeltaText(
  current: unknown,
  previous: unknown,
  previousLabel: string,
  digits = 2,
): string | null {
  const now = finiteNumber(current);
  const then = finiteNumber(previous);
  if (now == null || then == null || !previousLabel) return null;
  const change = (now - then) * 100;
  if (!Number.isFinite(change)) return null;
  const sign = change >= 0 ? "↑" : "↓";
  return `${sign} ${Math.abs(change).toFixed(digits)}% vs ${previousLabel}`;
}

/**
 * Relative change. Null when the base is 0 or either value is not finite,
 * so a zero-production bucket cannot divide into Infinity.
 */
export function kpiRelativeDeltaText(
  current: unknown,
  previous: unknown,
  previousLabel: string,
  digits = 1,
): string | null {
  const now = finiteNumber(current);
  const then = finiteNumber(previous);
  if (now == null || then == null || then === 0 || !previousLabel) return null;
  const diff = ((now - then) / then) * 100;
  if (!Number.isFinite(diff)) return null;
  const sign = diff >= 0 ? "↑" : "↓";
  return `${sign} ${Math.abs(diff).toFixed(digits)}% vs ${previousLabel}`;
}

const NO_PRIOR = "vs Prior Period";

export interface KpiDeltaInput {
  ratePoints: readonly SeriesPoint[] | null | undefined;
  rejected?: unknown;
  checked?: unknown;
  fpy?: unknown;
  copqTrend?: readonly { label: string; value: unknown }[] | null;
}

export interface KpiDeltaText {
  rateDiff: string;
  rejDiff: string;
  acceptedDiff: string;
  fpyDiff: string;
  copqDiff: string;
}

/** Dashboard KPI subtitles. Same productive pair as the trend arrow. */
export function dashboardKpiDeltas(input: KpiDeltaInput | null | undefined): KpiDeltaText {
  const empty: KpiDeltaText = {
    rateDiff: NO_PRIOR,
    rejDiff: NO_PRIOR,
    acceptedDiff: NO_PRIOR,
    fpyDiff: NO_PRIOR,
    copqDiff: NO_PRIOR,
  };
  if (!input?.ratePoints) return empty;
  const pair = lastProductivePair(input.ratePoints as SeriesPoint[]);
  if (!pair) return empty;
  const [current, previous] = pair;
  const vs = `vs ${previous.label}`;
  const prevRate = finiteNumber(previous.value);
  const curRate = finiteNumber(current.value);

  const rateDiff = kpiRateDeltaText(current.value, previous.value, previous.label) ?? vs;
  const acceptedDiff =
    kpiRateDeltaText(
      curRate == null ? undefined : 1 - curRate,
      prevRate == null ? undefined : 1 - prevRate,
      previous.label,
    ) ?? vs;
  const fpyDiff =
    kpiRateDeltaText(input.fpy, prevRate == null ? undefined : 1 - prevRate, previous.label) ?? vs;

  let rejDiff = vs;
  const rejected = finiteNumber(input.rejected);
  const checked = finiteNumber(input.checked);
  if (rejected != null && prevRate != null) {
    const denom = checked != null && checked !== 0 ? checked : 1;
    const delta = rejected - prevRate * denom;
    if (Number.isFinite(delta)) rejDiff = `${delta >= 0 ? "↑" : "↓"} vs ${previous.label}`;
  }

  let copqDiff = vs;
  const trend = input.copqTrend;
  if (trend && trend.length >= 2) {
    const rel = kpiRelativeDeltaText(
      trend[trend.length - 1].value,
      trend[trend.length - 2].value,
      previous.label,
      1,
    );
    if (rel) copqDiff = rel;
  }

  return { rateDiff, rejDiff, acceptedDiff, fpyDiff, copqDiff };
}
