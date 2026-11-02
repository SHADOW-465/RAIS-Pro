"use client";

import { useId, useMemo, useState } from "react";
import type { SeriesPoint } from "@/lib/analytics";
import type { CompareOffset } from "@/lib/analytics/trend-compare";
import {
  ChartTip,
  Empty,
  LineChart,
  num,
  pct,
  type ChartOverlay,
} from "@/components/app/widgets";
import {
  getBaseSpacing,
  hoverIndexFromPixels,
  niceYMax,
  shouldShowLabel,
  useContainerWidth,
} from "@/lib/chart-utils";
import { useTweaks } from "@/components/editorial/TweaksContext";

export const OVERLAY_COLORS: Record<CompareOffset, string> = {
  "prev-day": "var(--viz-8)",
  "prev-week": "var(--viz-2)",
  "prev-month": "var(--viz-3)",
  "prev-year": "var(--viz-5)",
};

export const OFFSET_CHIP: Record<CompareOffset, string> = {
  "prev-day": "−1d",
  "prev-week": "−1w",
  "prev-month": "−1m",
  "prev-year": "−1y",
};

export const COMPARE_SHORT: Record<CompareOffset, string> = {
  "prev-day": "DoD",
  "prev-week": "WoW",
  "prev-month": "MoM",
  "prev-year": "YoY",
};

export type TrendChartMode = "line" | "bar";

export type TrendOverlaySeries = {
  offset: CompareOffset;
  label: string;
  points: SeriesPoint[];
};

export function overlayToChart(overlays: TrendOverlaySeries[]): ChartOverlay[] {
  return overlays.map((o) => ({
    id: o.offset,
    label: o.label,
    points: o.points,
    color: OVERLAY_COLORS[o.offset],
  }));
}

export function RejectionTrendChart({
  mode,
  points,
  overlays,
  target,
  height = 180,
}: {
  mode: TrendChartMode;
  points: SeriesPoint[];
  overlays: TrendOverlaySeries[];
  target?: number;
  height?: number;
}) {
  if (mode === "line") {
    return (
      <LineChart
        points={points}
        overlays={overlayToChart(overlays)}
        target={target}
        fmt={pct}
        mean
        height={height}
        metric="Rejection rate"
      />
    );
  }
  return (
    <TrendBarChart
      points={points}
      overlays={overlayToChart(overlays)}
      target={target}
      height={height}
    />
  );
}

function TrendBarChart({
  points,
  overlays,
  target,
  height,
}: {
  points: SeriesPoint[];
  overlays: ChartOverlay[];
  target?: number;
  height: number;
}) {
  const hatchId = useId().replace(/:/g, "");
  const [hover, setHover] = useState<number | null>(null);
  const { t } = useTweaks();
  const { ref: containerRef, width: containerWidth } = useContainerWidth(660);

  const series = useMemo(
    () => [{ id: "current", label: "Current", points, color: "var(--viz-1)" }, ...overlays],
    [points, overlays],
  );

  if (!points || points.length === 0) {
    return <Empty label="No trend points available for the selected range." />;
  }

  const allVals = series.flatMap((s) =>
    s.points.filter((p) => !p.noProduction && Number.isFinite(p.value)).map((p) => p.value),
  );
  const dataMax = Math.max(0, ...allVals);
  const max = dataMax === 0 ? 0.05 : niceYMax(dataMax);
  const liveCurrent = points.filter((p) => !p.noProduction && Number.isFinite(p.value)).map((p) => p.value);
  const avg = liveCurrent.length ? liveCurrent.reduce((a, b) => a + b, 0) / liveCurrent.length : 0;

  const isCompact = containerWidth > 0 && containerWidth < 520;
  const padBottom = 56;
  const H = height;
  const padX = 48;
  const padTop = isCompact ? 28 : 22;
  const plotH = H - padTop - padBottom;
  const axisY = H - padBottom;
  const numPoints = points.length;
  const seriesCount = Math.max(1, series.length);
  const baseSpacing = Math.max(getBaseSpacing(numPoints), 12 * seriesCount + 16);
  const totalNeededWidth = baseSpacing * Math.max(numPoints - 1, 1) + padX * 2;
  const isScrollable = totalNeededWidth > containerWidth;
  const canvasWidth = isScrollable ? totalNeededWidth : containerWidth;
  const spacing = isScrollable
    ? baseSpacing
    : (containerWidth - padX * 2) / Math.max(numPoints - 1, 1);

  const x = (i: number) => padX + i * spacing;
  const y = (val: number) => axisY - (Math.min(Math.max(val, 0), max) / (max || 1)) * plotH;

  const groupW = Math.min(spacing * 0.72, 18 * seriesCount);
  const barW = Math.max(3, (groupW - Math.max(0, seriesCount - 1)) / seriesCount);

  const handleMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    setHover(hoverIndexFromPixels(e.clientX, rect.left, padX, spacing, points.length));
  };

  return (
    <div
      ref={containerRef}
      style={{ position: "relative", width: "100%", minWidth: 0 }}
      onMouseLeave={() => setHover(null)}
    >
      <div
        style={{
          width: "100%",
          overflowX: "auto",
          position: "relative",
          scrollbarWidth: "thin",
        }}
      >
        <svg
          width={canvasWidth}
          height={H}
          viewBox={`0 0 ${canvasWidth} ${H}`}
          style={{ display: "block", overflow: "visible" }}
          onMouseMove={handleMouseMove}
          role="img"
          aria-label="Rejection rate bar chart"
        >
          <defs>
            {overlays.map((o) => (
              <pattern
                key={o.id}
                id={`${hatchId}-${o.id}`}
                patternUnits="userSpaceOnUse"
                width="4"
                height="4"
              >
                <path d="M0,4 L4,0" stroke={o.color} strokeWidth="0.9" />
              </pattern>
            ))}
          </defs>

          {[0, 0.25, 0.5, 0.75, 1].map((p, i) => (
            <line
              key={i}
              x1={padX}
              y1={padTop + plotH * p}
              x2={canvasWidth - padX}
              y2={padTop + plotH * p}
              stroke="var(--border)"
              strokeWidth={0.5}
            />
          ))}
          {[0, 0.25, 0.5, 0.75, 1].map((p, i) => (
            <text
              key={`yl${i}`}
              x={padX - 8}
              y={padTop + plotH * p + 4}
              fontSize={11}
              fontWeight={600}
              textAnchor="end"
              fill="var(--text-2)"
              fontFamily="var(--font-mono)"
            >
              {pct(max * (1 - p))}
            </text>
          ))}
          <line
            x1={padX}
            y1={axisY}
            x2={canvasWidth - padX}
            y2={axisY}
            stroke="var(--border-strong)"
            strokeWidth={1}
          />

          {target != null && target <= max && (
            <g>
              <line
                x1={padX}
                y1={y(target)}
                x2={canvasWidth - padX}
                y2={y(target)}
                stroke="var(--critical)"
                strokeDasharray="5,4"
                strokeWidth={1.2}
              />
              <text
                x={canvasWidth - padX - 4}
                y={y(target) - 6}
                fontSize={11}
                fill="var(--critical)"
                fontWeight={600}
                textAnchor="end"
              >
                TARGET {pct(target)}
              </text>
            </g>
          )}
          {liveCurrent.length > 0 && (
            <g>
              <line
                x1={padX}
                y1={y(avg)}
                x2={canvasWidth - padX}
                y2={y(avg)}
                stroke="var(--text-3)"
                strokeDasharray="6,3"
                strokeWidth={1.4}
              />
              <text x={padX + 6} y={y(avg) - 6} fontSize={11} fill="var(--text-3)" fontWeight={600}>
                MEAN {pct(avg)}
              </text>
            </g>
          )}

          {points.map((_, i) => {
            const gx = x(i) - groupW / 2;
            return series.map((s, si) => {
              const p = s.points[i];
              if (!p || p.noProduction || !Number.isFinite(p.value)) return null;
              const bh = Math.max(0, axisY - y(p.value));
              const bx = gx + si * (barW + 1);
              const isHistory = s.id !== "current";
              return (
                <rect
                  key={`${s.id}-${i}`}
                  x={bx}
                  y={y(p.value)}
                  width={barW}
                  height={bh}
                  fill={isHistory ? `url(#${hatchId}-${s.id})` : s.color}
                  stroke={s.color}
                  strokeWidth={isHistory ? 1 : 0}
                  opacity={hover === i ? 1 : isHistory ? 0.85 : 0.92}
                  rx={1}
                />
              );
            });
          })}

          {hover != null && (
            <line
              x1={x(hover)}
              y1={padTop}
              x2={x(hover)}
              y2={axisY}
              stroke="var(--text-3)"
              strokeWidth={1}
              strokeDasharray="3,3"
            />
          )}

          {points.map((p, i) => {
            const show = shouldShowLabel(p.label, i, points.map((pt) => pt.label), spacing, t.grain);
            if (!show) return null;
            return (
              <text
                key={`xl${i}`}
                x={x(i)}
                y={axisY + 12}
                fontSize={10.5}
                fontWeight={500}
                textAnchor="end"
                fill="var(--text-2)"
                fontFamily="var(--font-sans)"
                transform={`rotate(-45 ${x(i)} ${axisY + 12})`}
              >
                {p.label}
              </text>
            );
          })}
        </svg>
      </div>

      {hover != null && points[hover] && (
        <ChartTip
          leftPx={x(hover)}
          topPx={
            Number.isFinite(points[hover].value) && !points[hover].noProduction
              ? y(points[hover].value)
              : axisY - 12
          }
          below={
            Number.isFinite(points[hover].value) && !points[hover].noProduction
              ? y(points[hover].value) < H * 0.32
              : false
          }
          title={points[hover].label}
          rows={series.flatMap((s) => {
            const p = s.points[hover];
            if (!p) return [];
            if (p.noProduction || !Number.isFinite(p.value)) {
              return [{ label: s.label, value: "No production recorded", color: s.color }];
            }
            return [
              {
                label: s.label,
                value: `${pct(p.value)} · ${num(p.rejected ?? 0)} / ${num(p.checked ?? 0)}`,
                color: s.color,
              },
            ];
          })}
        />
      )}
    </div>
  );
}
