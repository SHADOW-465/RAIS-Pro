// src/components/ParetoChart.tsx
"use client";

import { useState, useRef } from "react";
import type { ParetoAnalysis } from "@/lib/analytics/pareto";
import { ZoomButton } from "@/components/app/widgets";
import { isRemedyComplete, lookupRemedy, resolveRemedyKey, useRemedyBook } from "@/lib/remedy-store";
import {
  useContainerWidth,
  getBaseSpacing,
  hoverIndexFromPixels,
  shouldShowLabel
} from "@/lib/chart-utils";

// High-fidelity dual-axis Pareto chart, hand-rendered as inline SVG to match the
// editorial design system (no Chart.js). Bars use the LEFT axis (defect count);
// the cumulative line uses the RIGHT axis (0–100%). Vital-few bars are flagged
// in the accent/critical color; the useful-many sit in a neutral fill. A dashed
// 80% line marks the Pareto cut-off.

interface ParetoChartProps {
  analysis: ParetoAnalysis;
  /** Limit the number of categories plotted (long tails get noisy). */
  maxItems?: number;
  showTable?: boolean;
}

const W = 820;
const H = 400;
const PAD = { top: 44, right: 58, bottom: 82, left: 60 };
const PLOT_W = W - PAD.left - PAD.right;
const PLOT_H = H - PAD.top - PAD.bottom;

/** Catmull-Rom → cubic-Bézier smoothing for the cumulative curve. */
function smoothPath(pts: { x: number; y: number }[]): string {
  if (pts.length < 2) return pts.length === 1 ? `M ${pts[0].x} ${pts[0].y}` : "";
  let d = `M ${pts[0].x} ${pts[0].y}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] ?? pts[i];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[i + 2] ?? p2;
    const cp1x = p1.x + (p2.x - p0.x) / 6;
    const cp1y = p1.y + (p2.y - p0.y) / 6;
    const cp2x = p2.x - (p3.x - p1.x) / 6;
    const cp2y = p2.y - (p3.y - p1.y) / 6;
    d += ` C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${p2.x} ${p2.y}`;
  }
  return d;
}

export default function ParetoChart({ analysis, maxItems = 10, showTable = true }: ParetoChartProps) {
  const [zoom, setZoom] = useState(1.0);
  const [scrollLeft, setScrollLeft] = useState(0);
  const [hover, setHover] = useState<number | null>(null);
  const remedyBook = useRemedyBook();

  const { ref: containerRef, width: containerWidth } = useContainerWidth(820);
  const wrapperRef = useRef<HTMLDivElement>(null);

  const items = analysis.items.slice(0, maxItems);
  if (items.length === 0) return null;

  const numPoints = items.length;
  // Pareto charts need wider item spacing since they display bars
  const baseSpacing = Math.max(84, getBaseSpacing(numPoints) * 2.5);
  const currentSpacing = baseSpacing * zoom;
  const totalNeededWidth = currentSpacing * numPoints + PAD.left + PAD.right;
  const isScrollable = totalNeededWidth > containerWidth;
  const canvasWidth = isScrollable ? totalNeededWidth : containerWidth;

  const PLOT_W = canvasWidth - PAD.left - PAD.right;
  const band = isScrollable ? currentSpacing : PLOT_W / numPoints;
  const barW = Math.min(band * 0.55, 60);

  const xCenter = (i: number) => PAD.left + band * (i + 0.5);
  const maxValue = Math.max(...items.map((it) => it.value)) * 1.18 || 1;
  const yValue = (v: number) => PAD.top + PLOT_H * (1 - v / maxValue);
  const yCum = (c: number) => PAD.top + PLOT_H * (1 - c / 100);

  const linePts = items.map((it, i) => ({ x: xCenter(i), y: yCum(it.cumulative) }));
  const y80 = yCum(80);

  // Left-axis ticks (defect count) — 5 even gridlines.
  const valueTicks = [0, 0.25, 0.5, 0.75, 1].map((f) => Math.round((maxValue / 1.18) * f));
  const cumTicks = [0, 20, 40, 60, 80, 100];

  const handleWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    if (e.shiftKey && wrapperRef.current) {
      wrapperRef.current.scrollLeft += e.deltaY;
      e.preventDefault();
    }
  };

  return (
    <div ref={containerRef} style={{ position: "relative", width: "100%", minWidth: 0 }} onMouseLeave={() => setHover(null)}>
      {/* Zoom Controls */}
      <div style={{
        position: "absolute",
        right: 12,
        top: -12,
        zIndex: 40,
        display: "flex",
        gap: 4,
        background: "var(--surface)",
        border: "1px solid var(--border)",
        borderRadius: "var(--radius-sm)",
        padding: "2px",
        boxShadow: "0 2px 8px rgba(0,0,0,0.08)"
      }}>
        <ZoomButton onClick={(e) => { e.stopPropagation(); setZoom(z => Math.min(4.0, z * 1.3)); }} title="Zoom In">+</ZoomButton>
        <ZoomButton onClick={(e) => { e.stopPropagation(); setZoom(z => Math.max(0.25, z / 1.3)); }} title="Zoom Out">−</ZoomButton>
        <ZoomButton onClick={(e) => { e.stopPropagation(); setZoom(1.0); }} title="Fit Viewport">FIT</ZoomButton>
      </div>

      <div 
        ref={wrapperRef}
        onScroll={(e) => setScrollLeft(e.currentTarget.scrollLeft)}
        onWheel={handleWheel}
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
        >
          {/* horizontal gridlines + right-axis (%) labels */}
          {cumTicks.map((c) => (
            <g key={`grid-${c}`}>
              <line
                x1={PAD.left}
                x2={canvasWidth - PAD.right}
                y1={yCum(c)}
                y2={yCum(c)}
                stroke="var(--border)"
                strokeWidth={1}
                strokeDasharray={c === 0 ? undefined : "2 4"}
                opacity={c === 0 ? 1 : 0.45}
              />
              <text
                x={canvasWidth - PAD.right + 10}
                y={yCum(c) + 4}
                fontSize={12}
                fill={c === 80 ? "var(--warning)" : "var(--text-2)"}
                fontWeight={c === 80 ? 600 : 600}
                className="num"
              >
                {c}%
              </text>
            </g>
          ))}

          {/* left-axis (count) labels */}
          {valueTicks.map((v, i) => (
            <text
              key={`lv-${i}`}
              x={PAD.left - 10}
              y={yValue(v) + 4}
              fontSize={12}
              fontWeight={600}
              textAnchor="end"
              fill="var(--text-2)"
              className="num"
            >
              {v.toLocaleString()}
            </text>
          ))}

          {/* 80% Pareto cut-off Line and Badge */}
          <line
            x1={PAD.left}
            x2={canvasWidth - PAD.right}
            y1={y80}
            y2={y80}
            stroke="var(--warning)"
            strokeWidth={1.5}
            strokeDasharray="6 4"
          />
          <g>
            <rect
              x={PAD.left + 4}
              y={y80 - 18}
              width={140}
              height={16}
              rx={3}
              fill="color-mix(in srgb, var(--warning) 12%, var(--surface))"
            />
            <text
              x={PAD.left + 8}
              y={y80 - 6}
              fontSize={10.5}
              fontWeight={600}
              letterSpacing="0.03em"
              fill="var(--warning)"
            >
              80% PARETO CUT-OFF
            </text>
          </g>

          {/* bars */}
          {items.map((it, i) => {
            const x = xCenter(i) - barW / 2;
            const y = yValue(it.value);
            const active = hover === i;
            return (
              <g key={`bar-group-${i}`}>
                <rect
                  x={x}
                  y={y}
                  width={barW}
                  height={PAD.top + PLOT_H - y}
                  fill={it.isVitalFew ? "var(--accent)" : "var(--border-strong)"}
                  opacity={hover === null || active ? 1 : 0.5}
                  rx={3}
                  className="bar-grow"
                  onMouseEnter={() => setHover(i)}
                  onMouseLeave={() => setHover(null)}
                  style={{ transition: "all 0.15s ease", cursor: "pointer", animationDelay: `${i * 0.04}s` }}
                />
                <text
                  x={xCenter(i)}
                  y={y - 8}
                  fontSize={11.5}
                  fontWeight={600}
                  textAnchor="middle"
                  fill={it.isVitalFew ? "var(--accent)" : "var(--text-2)"}
                  opacity={hover === null || active ? 1 : 0.6}
                >
                  {it.contribution.toFixed(1)}%
                </text>
              </g>
            );
          })}

          {/* cumulative curve */}
          <path
            d={smoothPath(linePts)}
            fill="none"
            stroke="var(--ink)"
            strokeWidth={2.5}
            strokeLinecap="round"
            strokeLinejoin="round"
          />

          {/* interactive cumulative line points with projection markers */}
          {linePts.map((p, i) => {
            const it = items[i];
            const active = hover === i;
            return (
              <g key={`pt-group-${i}`}>
                {/* Active drop projection line */}
                {active && (
                  <>
                    <line
                      x1={p.x}
                      y1={p.y}
                      x2={p.x}
                      y2={PAD.top + PLOT_H}
                      stroke="var(--border-strong)"
                      strokeWidth={1.5}
                      strokeDasharray="3 3"
                    />
                    <line
                      x1={p.x}
                      y1={p.y}
                      x2={canvasWidth - PAD.right}
                      y2={p.y}
                      stroke="var(--ink)"
                      strokeWidth={1.2}
                      strokeDasharray="2 2"
                      opacity={0.65}
                    />
                  </>
                )}

                {/* Visible Point Circle */}
                <circle
                  cx={p.x}
                  cy={p.y}
                  r={active ? 6.5 : 4}
                  fill={it.isVitalFew ? "var(--accent)" : "var(--surface)"}
                  stroke={active ? "var(--ink)" : (it.isVitalFew ? "var(--accent)" : "var(--text-2)")}
                  strokeWidth={2}
                  style={{ cursor: "pointer", transition: "all 0.15s ease" }}
                  onMouseEnter={() => setHover(i)}
                  onMouseLeave={() => setHover(null)}
                />
              </g>
            );
          })}

          {/* x-axis labels (rotated) */}
          {items.map((it, i) => {
            const show = shouldShowLabel(it.label, i, items.map(pt => pt.label), band, "week");
            if (!show) return null;
            return (
              <text
                key={`lbl-${i}`}
                x={xCenter(i)}
                y={PAD.top + PLOT_H + 18}
                fontSize={12}
                fill={it.isVitalFew ? "var(--accent)" : "var(--text-2)"}
                fontWeight={it.isVitalFew ? 600 : 600}
                textAnchor="end"
                transform={`rotate(-35 ${xCenter(i)} ${PAD.top + PLOT_H + 18})`}
              >
                {it.label.length > 16 ? it.label.slice(0, 15) + "…" : it.label}
              </text>
            );
          })}
        </svg>

        {/* Fixed Inspection Detail Strip on Hover (Crystal clear explanation) */}
        <div
          style={{
            minHeight: 48,
            padding: "10px 16px",
            background: hover !== null && items[hover] ? "var(--surface-2)" : "var(--surface)",
            border: `1px solid ${hover !== null && items[hover] ? "var(--border-strong)" : "var(--border)"}`,
            borderRadius: "var(--radius-sm, 6px)",
            marginTop: 10,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            flexWrap: "wrap",
            gap: "10px 18px",
            transition: "all 0.15s ease",
          }}
        >
          {hover !== null && items[hover] ? (
            <>
              <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                <span
                  style={{
                    fontSize: 11,
                    fontWeight: 600,
                    padding: "2px 8px",
                    borderRadius: 4,
                    textTransform: "uppercase",
                    background: items[hover].isVitalFew ? "var(--accent-weak)" : "var(--surface-3)",
                    color: items[hover].isVitalFew ? "var(--accent)" : "var(--text-2)",
                    border: `1px solid ${items[hover].isVitalFew ? "color-mix(in srgb, var(--accent) 30%, transparent)" : "var(--border)"}`,
                  }}
                >
                  #{items[hover].rank} · {items[hover].isVitalFew ? "Vital Few" : "Useful Many"}
                </span>
                <span style={{ fontWeight: 600, fontSize: 14, color: "var(--text)" }}>
                  {items[hover].label}
                </span>
              </div>

              <div style={{ display: "flex", alignItems: "center", gap: 20, fontSize: 12.5, flexWrap: "wrap" }}>
                <div>
                  <span style={{ color: "var(--text-3)", marginRight: 5 }}>Individual Defect Count:</span>
                  <strong className="num" style={{ color: "var(--text)" }}>
                    {Math.round(items[hover].value).toLocaleString()}
                  </strong>
                </div>
                <div>
                  <span style={{ color: "var(--text-3)", marginRight: 5 }}>Share of Total:</span>
                  <strong className="num" style={{ color: "var(--accent)" }}>
                    {items[hover].contribution.toFixed(1)}%
                  </strong>
                </div>
                {(() => {
                  const rec = lookupRemedy(remedyBook, items[hover].label);
                  const ready = isRemedyComplete(rec);
                  return (
                    <div>
                      <span style={{ color: "var(--text-3)", marginRight: 5 }}>Remedy:</span>
                      <strong style={{ color: ready ? "var(--positive)" : "var(--warning)" }}>
                        {ready ? "Fed" : "Needs feed"}
                      </strong>
                    </div>
                  );
                })()}
                <div
                  style={{
                    padding: "3px 10px",
                    borderRadius: 4,
                    background: "var(--surface-3)",
                    border: "1px solid var(--border-strong)",
                  }}
                  title="Cumulative sum of this defect plus all higher-ranked defects before it"
                >
                  <span style={{ color: "var(--text-2)", marginRight: 6 }}>
                    Top {items[hover].rank} Defects Combined:
                  </span>
                  <strong className="num" style={{ color: "var(--ink)", fontSize: 13 }}>
                    {items[hover].cumulative.toFixed(1)}% of all scrap
                  </strong>
                </div>
              </div>
            </>
          ) : (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", width: "100%", fontSize: 12, color: "var(--text-3)" }}>
              <span>
                💡 <strong>Hover on any bar or point</strong> to see its individual count and running cumulative total.
              </span>
              <span>
                <strong>Cumulative %</strong> = Running total of rejections if you fix all defects up to that rank.
              </span>
            </div>
          )}
        </div>
      </div>

      {/* axis legend */}
      <div
        style={{
          display: "flex",
          gap: 18,
          marginTop: 10,
          fontSize: 11.5,
          color: "var(--text-2)",
          flexWrap: "wrap",
        }}
      >
        <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
          <span style={{ width: 10, height: 10, background: "var(--accent)", borderRadius: 2 }} />
          Vital few (≤80% of total rejections)
        </span>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
          <span style={{ width: 10, height: 10, background: "var(--border-strong)", borderRadius: 2 }} />
          Useful many (&gt;80% tail)
        </span>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
          <span style={{ width: 16, height: 2, background: "var(--ink)" }} />
          Cumulative Running Total (%)
        </span>
      </div>

      {showTable && (
        <div style={{ marginTop: 24, overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, textAlign: "left", border: "1px solid var(--border)" }}>
            <thead>
              <tr style={{ background: "var(--surface-2)", borderBottom: "2px solid var(--border-strong)" }}>
                <th style={{ padding: "8px 12px", fontFamily: "var(--font-display)", fontWeight: 600 }}>Rank</th>
                <th style={{ padding: "8px 12px", fontFamily: "var(--font-display)", fontWeight: 600 }}>Defect Category</th>
                <th style={{ padding: "8px 12px", textAlign: "right", fontFamily: "var(--font-display)", fontWeight: 600 }}>Count</th>
                <th style={{ padding: "8px 12px", textAlign: "right", fontFamily: "var(--font-display)", fontWeight: 600 }}>Contribution %</th>
                <th style={{ padding: "8px 12px", textAlign: "right", fontFamily: "var(--font-display)", fontWeight: 600 }}>Cumulative %</th>
                <th style={{ padding: "8px 12px", textAlign: "center", fontFamily: "var(--font-display)", fontWeight: 600 }}>Classification</th>
                <th style={{ padding: "8px 12px", textAlign: "center", fontFamily: "var(--font-display)", fontWeight: 600 }}>Feed</th>
              </tr>
            </thead>
            <tbody>
              {items.map((it, idx) => (
                <tr key={idx} style={{ borderBottom: "1px solid var(--border)", background: idx % 2 === 1 ? "var(--surface-2)" : "transparent" }}>
                  <td style={{ padding: "8px 12px", fontFamily: "var(--font-mono)" }}>#{it.rank}</td>
                  <td style={{ padding: "8px 12px", fontWeight: it.isVitalFew ? 600 : 400 }}>{it.label}</td>
                  <td style={{ padding: "8px 12px", textAlign: "right", fontFamily: "var(--font-mono)" }}>{Math.round(it.value)}</td>
                  <td style={{ padding: "8px 12px", textAlign: "right", fontFamily: "var(--font-mono)", color: it.isVitalFew ? "var(--accent)" : "var(--text-2)" }}>{it.contribution.toFixed(1)}%</td>
                  <td style={{ padding: "8px 12px", textAlign: "right", fontFamily: "var(--font-mono)" }}>{it.cumulative.toFixed(1)}%</td>
                  <td style={{ padding: "8px 12px", textAlign: "center" }}>
                    <span style={{ 
                      display: "inline-block", 
                      padding: "2px 6px", 
                      borderRadius: 4, 
                      fontSize: 10.5, 
                      fontWeight: 600, 
                      textTransform: "uppercase",
                      background: it.isVitalFew ? "var(--accent-weak)" : "var(--border-strong)",
                      color: it.isVitalFew ? "var(--accent)" : "var(--text-3)"
                    }}>
                      {it.isVitalFew ? "Vital Few" : "Useful Many"}
                    </span>
                  </td>
                  <td style={{ padding: "8px 12px", textAlign: "center" }}>
                    {(() => {
                      const rec = lookupRemedy(remedyBook, it.label);
                      const ready = isRemedyComplete(rec);
                      const code = resolveRemedyKey(it.label);
                      return (
                        <a
                          href={`/actions/remedies?code=${encodeURIComponent(code)}`}
                          onClick={(e) => e.stopPropagation()}
                          style={{
                            fontSize: 11,
                            fontWeight: 600,
                            color: ready ? "var(--positive)" : "var(--warning)",
                            textDecoration: "none",
                          }}
                        >
                          {ready ? "Fed" : "Needs feed"}
                        </a>
                      );
                    })()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
