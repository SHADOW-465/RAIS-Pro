"use client";

import { useEffect, useMemo, useState, type CSSProperties } from "react";
import type { Event } from "@/lib/store/types";
import type { Grain, Registry, Scope, SeriesPoint } from "@/lib/analytics";
import { formatRatioPercent } from "@/lib/analytics/finite";
import {
  COMPARE_LABELS,
  defaultOffset,
  offsetsForGrain,
  overlaySeries,
  parseCompareEnabled,
  parseCompareOffset,
  parseTrendVizMode,
  windowComparison,
  type CompareOffset,
  type PeriodComparison,
  type TrendVizMode,
} from "@/lib/analytics/trend-compare";
import { Card, num, pct } from "@/components/app/widgets";
import {
  COMPARE_SHORT,
  OVERLAY_COLORS,
  RejectionTrendChart,
} from "@/components/app/RejectionTrendChart";

const MODE_KEY = "moid_rejection_trend_mode";
const COMPARE_KEY = "moid_rejection_trend_compare";
const COMPARE_ON_KEY = "moid_rejection_trend_compare_on";

const MODES: { id: TrendVizMode; label: string }[] = [
  { id: "line", label: "Line" },
  { id: "bar", label: "Bar" },
];

type TrendPrefs = { mode: TrendVizMode; compareOffset: CompareOffset; compareOn: boolean };

let prefsMemory: TrendPrefs | null = null;
const prefsListeners = new Set<() => void>();

function notifyPrefs() {
  for (const fn of prefsListeners) fn();
}

function readPrefs(grain: Grain): TrendPrefs {
  const fallback: TrendPrefs = {
    mode: "line",
    compareOffset: defaultOffset(grain),
    compareOn: false,
  };
  try {
    const rawMode = typeof window === "undefined" ? "line" : localStorage.getItem(MODE_KEY);
    const rawOn = typeof window === "undefined" ? null : localStorage.getItem(COMPARE_ON_KEY);
    return {
      mode: parseTrendVizMode(rawMode),
      compareOffset: parseCompareOffset(
        typeof window === "undefined" ? null : localStorage.getItem(COMPARE_KEY),
        grain,
      ),
      // Stored overlay flag wins. A legacy MODE_KEY of "compare" turns the overlay on.
      compareOn: rawOn != null ? parseCompareEnabled(rawOn) : parseCompareEnabled(rawMode),
    };
  } catch {
    return fallback;
  }
}

function writePrefs(next: TrendPrefs) {
  prefsMemory = next;
  try {
    localStorage.setItem(MODE_KEY, next.mode);
    localStorage.setItem(COMPARE_KEY, next.compareOffset);
    localStorage.setItem(COMPARE_ON_KEY, next.compareOn ? "1" : "0");
  } catch {
    /* ignore quota / private mode */
  }
  notifyPrefs();
}

function useRejectionTrendPrefs(grain: Grain) {
  const [, bump] = useState(0);

  useEffect(() => {
    const onChange = () => bump((n) => n + 1);
    prefsListeners.add(onChange);
    if (!prefsMemory) {
      prefsMemory = readPrefs(grain);
      notifyPrefs();
    }
    return () => {
      prefsListeners.delete(onChange);
    };
  }, [grain]);

  const allowed = offsetsForGrain(grain);
  const mode = prefsMemory?.mode ?? "line";
  const compareOffset = parseCompareOffset(prefsMemory?.compareOffset, grain);
  const compareOn = prefsMemory?.compareOn ?? false;

  const setMode = (next: TrendVizMode) => {
    writePrefs({ mode: next, compareOffset, compareOn });
  };
  const setCompareOffset = (next: CompareOffset) => {
    writePrefs({ mode, compareOffset: next, compareOn });
  };
  const setCompareOn = (next: boolean) => {
    writePrefs({ mode, compareOffset, compareOn: next });
  };

  return { mode, compareOffset, compareOn, setMode, setCompareOffset, setCompareOn, allowed };
}

function formatPp(deltaRatio: number | null): string {
  if (deltaRatio == null) return "—";
  const pp = deltaRatio * 100;
  const sign = pp > 0 ? "+" : "";
  return `${sign}${pp.toFixed(2)} pp`;
}

function formatRelative(relative: number | null): string {
  if (relative == null) return "—";
  const text = formatRatioPercent(relative);
  if (!text) return "—";
  return relative > 0 ? `+${text}` : text;
}

export function TrendModeSwitcher({
  mode,
  onMode,
  compareOn,
  onCompareOn,
}: {
  mode: TrendVizMode;
  onMode: (mode: TrendVizMode) => void;
  compareOn: boolean;
  onCompareOn: (on: boolean) => void;
}) {
  return (
    <div
      onClick={(e) => e.stopPropagation()}
      style={{ display: "inline-flex", alignItems: "center", gap: 6, flexShrink: 0 }}
    >
      <div
        role="group"
        aria-label="Rejection trend visualization"
        style={{
          display: "inline-flex",
          border: "1px solid var(--border)",
          borderRadius: "var(--radius-sm, 4px)",
          overflow: "hidden",
        }}
      >
        {MODES.map((m, i) => {
          const on = mode === m.id;
          return (
            <button
              key={m.id}
              type="button"
              aria-pressed={on}
              onClick={() => onMode(m.id)}
              style={{
                fontFamily: "var(--font-sans)",
                fontSize: 11,
                fontWeight: on ? 600 : 500,
                padding: "3px 8px",
                border: "none",
                borderRight: i === MODES.length - 1 ? "none" : "1px solid var(--border)",
                background: on ? "var(--surface-3)" : "transparent",
                color: on ? "var(--text)" : "var(--text-3)",
                cursor: "pointer",
                lineHeight: 1.2,
              }}
            >
              {m.label}
            </button>
          );
        })}
      </div>
      <button
        type="button"
        aria-pressed={compareOn}
        aria-label={compareOn ? "Compare overlay on" : "Compare overlay off"}
        title={compareOn ? "Hide previous-period overlay" : "Show previous-period overlay"}
        onClick={() => onCompareOn(!compareOn)}
        style={{
          fontFamily: "var(--font-sans)",
          fontSize: 11,
          fontWeight: compareOn ? 600 : 500,
          padding: "3px 8px",
          borderRadius: "var(--radius-sm, 4px)",
          border: "1px solid",
          borderColor: compareOn ? "var(--text)" : "var(--border)",
          background: compareOn ? "var(--surface-3)" : "transparent",
          color: compareOn ? "var(--text)" : "var(--text-3)",
          cursor: "pointer",
          lineHeight: 1.2,
        }}
      >
        Compare
      </button>
    </div>
  );
}

export function RejectionTrendView({
  events,
  scope,
  points,
  target,
  grainLabel,
  registry,
  height = 180,
  variant = "card",
}: {
  events: Event[];
  scope: Scope;
  points: SeriesPoint[];
  target: number;
  grainLabel: string;
  registry: Registry;
  height?: number;
  variant?: "card" | "detail";
}) {
  const { mode, compareOffset, compareOn, setMode, setCompareOffset, setCompareOn, allowed } =
    useRejectionTrendPrefs(scope.grain);

  const overlayData = useMemo(() => {
    if (!compareOn || !events.length || points.length === 0) return [];
    return [
      {
        offset: compareOffset,
        label: COMPARE_LABELS[compareOffset],
        points: overlaySeries(events, scope, points, compareOffset, registry),
      },
    ];
  }, [compareOn, events, scope, points, registry, compareOffset]);

  const comparison: PeriodComparison | null = useMemo(() => {
    if (!compareOn || !events.length) return null;
    return windowComparison(events, scope, compareOffset, registry);
  }, [compareOn, events, scope, compareOffset, registry]);

  return (
    <div
      aria-label={`${grainLabel} rejection trend`}
      style={{
        flex: 1,
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        height: "100%",
        minWidth: 0,
        minHeight: height,
      }}
    >
      {variant === "detail" && (
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 8,
            marginBottom: 8,
          }}
        >
          <TrendModeSwitcher mode={mode} onMode={setMode} compareOn={compareOn} onCompareOn={setCompareOn} />
          <span className="mono" style={{ fontSize: "var(--text-xs)", color: "var(--text-3)" }}>
            Target ({formatRatioPercent(target, 0) ?? "—"}) & Mean
          </span>
        </div>
      )}

      {compareOn && (
        <div
          onClick={(e) => e.stopPropagation()}
          style={{ display: "flex", flexWrap: "wrap", gap: 4, marginBottom: 6 }}
        >
          {allowed.map((offset) => {
            const on = compareOffset === offset;
            return (
              <button
                key={offset}
                type="button"
                aria-pressed={on}
                title={COMPARE_LABELS[offset]}
                onClick={() => setCompareOffset(offset)}
                style={chipStyle(on, OVERLAY_COLORS[offset])}
              >
                {COMPARE_SHORT[offset]}
              </button>
            );
          })}
        </div>
      )}

      <div style={{ flex: 1, minHeight: height, display: "flex", flexDirection: "column", justifyContent: "center" }}>
        <RejectionTrendChart
          mode={mode}
          points={points}
          overlays={overlayData}
          target={target}
          height={height}
        />
      </div>

      <TrendLegend overlays={overlayData} comparison={comparison} compareOffset={compareOffset} />
    </div>
  );
}

export function RejectionTrendCard({
  events,
  scope,
  points,
  target,
  grainLabel,
  registry,
  onOpenFullTrend,
}: {
  events: Event[];
  scope: Scope;
  points: SeriesPoint[];
  target: number;
  grainLabel: string;
  registry: Registry;
  onOpenFullTrend: () => void;
}) {
  const { mode, compareOn, setMode, setCompareOn } = useRejectionTrendPrefs(scope.grain);

  return (
    <Card
      title="Rejection Trend"
      sub={`Target (${formatRatioPercent(target, 0) ?? "—"}) & Mean`}
      extra={
        <TrendModeSwitcher
          mode={mode}
          onMode={setMode}
          compareOn={compareOn}
          onCompareOn={setCompareOn}
        />
      }
      onClick={onOpenFullTrend}
    >
      <div
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          height: "100%",
          minWidth: 0,
        }}
      >
        <RejectionTrendView
          events={events}
          scope={scope}
          points={points}
          target={target}
          grainLabel={grainLabel}
          registry={registry}
          height={180}
          variant="card"
        />
        <div style={{ marginTop: "var(--space-2)", display: "flex" }}>
          <a
            href="#"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onOpenFullTrend();
            }}
            style={{
              fontSize: "var(--text-sm)",
              fontWeight: 600,
              color: "var(--text-2)",
              textDecoration: "none",
            }}
          >
            View full trend →
          </a>
        </div>
      </div>
    </Card>
  );
}

function chipStyle(on: boolean, color: string): CSSProperties {
  return {
    fontFamily: "var(--font-mono)",
    fontSize: 10,
    fontWeight: 600,
    padding: "2px 6px",
    borderRadius: 3,
    border: `1px solid ${on ? color : "var(--border)"}`,
    background: on ? `color-mix(in srgb, ${color} 18%, var(--surface))` : "transparent",
    color: on ? color : "var(--text-3)",
    cursor: "pointer",
    lineHeight: 1.2,
  };
}

function TrendLegend({
  overlays,
  comparison,
  compareOffset,
}: {
  overlays: { offset: CompareOffset; label: string }[];
  comparison: PeriodComparison | null;
  compareOffset: CompareOffset;
}) {
  return (
    <div style={{ marginTop: 6, display: "flex", flexDirection: "column", gap: 6 }} onClick={(e) => e.stopPropagation()}>
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: "8px 12px",
          fontSize: 10.5,
          color: "var(--text-3)",
          fontFamily: "var(--font-sans)",
        }}
      >
        <LegendSwatch color="var(--viz-1)" label="Current" solid />
        {overlays.map((o) => (
          <LegendSwatch
            key={o.offset}
            color={OVERLAY_COLORS[o.offset]}
            label={o.label}
            solid={false}
          />
        ))}
        <LegendSwatch color="var(--critical)" label="Target" dashed />
        <LegendSwatch color="var(--text-3)" label="Mean" dashed />
      </div>
      {comparison && <CompareSummary comparison={comparison} compareOffset={compareOffset} />}
    </div>
  );
}

function LegendSwatch({
  color,
  label,
  solid,
  dashed,
}: {
  color: string;
  label: string;
  solid?: boolean;
  dashed?: boolean;
}) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
      <span
        aria-hidden
        style={{
          width: dashed ? 12 : 8,
          height: dashed ? 0 : 8,
          borderRadius: solid ? 2 : 0,
          background: dashed ? "transparent" : color,
          borderTop: dashed ? `1.5px dashed ${color}` : solid ? "none" : `1.5px dashed ${color}`,
          boxSizing: "border-box",
        }}
      />
      {label}
    </span>
  );
}

function CompareSummary({
  comparison: cmp,
  compareOffset,
}: {
  comparison: PeriodComparison;
  compareOffset: CompareOffset;
}) {
  const tone =
    cmp.improved === true
      ? "var(--positive)"
      : cmp.deltaRatio != null && cmp.deltaRatio !== 0
        ? "var(--critical)"
        : "var(--text-3)";
  const changeLabel =
    cmp.improved === true ? "Improved" : cmp.deltaRatio != null && cmp.deltaRatio !== 0 ? "Higher rejection" : "No change";

  if (!cmp.previousAvailable) {
    return (
      <div className="small" style={{ color: "var(--text-3)", fontSize: 11 }}>
        No {COMPARE_LABELS[compareOffset].toLowerCase()} production recorded for this range.
      </div>
    );
  }

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
        gap: 6,
        fontSize: 11,
      }}
    >
      <SummaryCell label="Current" value={pct(cmp.currentRate ?? Number.NaN)} hint={`${num(cmp.currentRejected)} / ${num(cmp.currentChecked)}`} />
      <SummaryCell
        label={COMPARE_LABELS[compareOffset]}
        value={pct(cmp.previousRate ?? Number.NaN)}
        hint={`${num(cmp.previousRejected)} / ${num(cmp.previousChecked)}`}
      />
      <SummaryCell label="Change" value={formatPp(cmp.deltaRatio)} hint={formatRelative(cmp.relativeChange)} color={tone} />
      <SummaryCell label="Vs previous" value={changeLabel} color={tone} />
    </div>
  );
}

function SummaryCell({
  label,
  value,
  hint,
  color,
}: {
  label: string;
  value: string;
  hint?: string;
  color?: string;
}) {
  return (
    <div style={{ minWidth: 0 }}>
      <div style={{ fontSize: 9.5, color: "var(--text-3)", fontWeight: 600, letterSpacing: "0.02em" }}>{label}</div>
      <div
        className="mono"
        style={{ fontSize: 12.5, fontWeight: 600, color: color ?? "var(--text)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}
      >
        {value}
      </div>
      {hint && (
        <div className="mono" style={{ fontSize: 10, color: "var(--text-3)" }}>
          {hint}
        </div>
      )}
    </div>
  );
}
