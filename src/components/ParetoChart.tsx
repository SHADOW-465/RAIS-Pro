// src/components/ParetoChart.tsx
"use client";

import { useState } from "react";
import type { ParetoAnalysis } from "@/types/metrics";

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
const H = 380;
const PAD = { top: 24, right: 52, bottom: 78, left: 56 };
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
  const [hover, setHover] = useState<number | null>(null);
  const items = analysis.items.slice(0, maxItems);
  if (items.length === 0) return null;

  const maxValue = Math.max(...items.map((it) => it.value)) * 1.15 || 1;
  const band = PLOT_W / items.length;
  const barW = Math.min(band * 0.58, 64);

  const xCenter = (i: number) => PAD.left + band * (i + 0.5);
  const yValue = (v: number) => PAD.top + PLOT_H * (1 - v / maxValue);
  const yCum = (c: number) => PAD.top + PLOT_H * (1 - c / 100);

  const linePts = items.map((it, i) => ({ x: xCenter(i), y: yCum(it.cumulative) }));
  const y80 = yCum(80);

  // Left-axis ticks (defect count) — 5 even gridlines.
  const valueTicks = [0, 0.25, 0.5, 0.75, 1].map((f) => Math.round((maxValue / 1.15) * f));
  const cumTicks = [0, 20, 40, 60, 80, 100];

  return (
    <div style={{ position: "relative", width: "100%" }}>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ display: "block", overflow: "visible" }}>
        {/* horizontal gridlines + right-axis (%) labels */}
        {cumTicks.map((c) => (
          <g key={`grid-${c}`}>
            <line
              x1={PAD.left}
              x2={W - PAD.right}
              y1={yCum(c)}
              y2={yCum(c)}
              stroke="var(--border)"
              strokeWidth={1}
              strokeDasharray={c === 0 ? undefined : "2 4"}
              opacity={c === 0 ? 1 : 0.5}
            />
            <text
              x={W - PAD.right + 8}
              y={yCum(c) + 3}
              fontSize={10}
              fill="var(--text-3)"
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
            x={PAD.left - 8}
            y={yValue(v) + 3}
            fontSize={10}
            textAnchor="end"
            fill="var(--text-3)"
            className="num"
          >
            {v}
          </text>
        ))}

        {/* 80% Pareto cut-off */}
        <line
          x1={PAD.left}
          x2={W - PAD.right}
          y1={y80}
          y2={y80}
          stroke="var(--warning)"
          strokeWidth={1.5}
          strokeDasharray="6 4"
        />
        <text x={PAD.left + 4} y={y80 - 6} fontSize={10} fontWeight={700} fill="var(--warning)">
          80% PARETO CUT-OFF
        </text>

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
                opacity={hover === null || active ? 1 : 0.55}
                rx={2}
                onMouseEnter={() => setHover(i)}
                onMouseLeave={() => setHover(null)}
                style={{ transition: "opacity 0.15s ease" }}
              />
              <text
                x={xCenter(i)}
                y={y - 6}
                fontSize={9}
                fontWeight={700}
                textAnchor="middle"
                fill={it.isVitalFew ? "var(--accent)" : "var(--text-2)"}
                opacity={hover === null || active ? 1 : 0.55}
              >
                {it.contribution.toFixed(1)}%
              </text>
            </g>
          );
        })}

        {/* cumulative curve */}
        <path d={smoothPath(linePts)} fill="none" stroke="var(--text)" strokeWidth={2} />
        {linePts.map((p, i) => (
          <circle
            key={`pt-${i}`}
            cx={p.x}
            cy={p.y}
            r={hover === i ? 5 : 3.5}
            fill="var(--surface)"
            stroke="var(--text)"
            strokeWidth={2}
            onMouseEnter={() => setHover(i)}
            onMouseLeave={() => setHover(null)}
            style={{ cursor: "pointer" }}
          />
        ))}

        {/* x-axis labels (rotated) */}
        {items.map((it, i) => (
          <text
            key={`lbl-${i}`}
            x={xCenter(i)}
            y={PAD.top + PLOT_H + 14}
            fontSize={10}
            fill={it.isVitalFew ? "var(--accent)" : "var(--text-2)"}
            fontWeight={it.isVitalFew ? 700 : 500}
            textAnchor="end"
            transform={`rotate(-40 ${xCenter(i)} ${PAD.top + PLOT_H + 14})`}
          >
            {it.label.length > 16 ? it.label.slice(0, 15) + "…" : it.label}
          </text>
        ))}
      </svg>

      {/* tooltip */}
      {hover !== null && items[hover] && (
        <div
          style={{
            position: "absolute",
            left: `${(xCenter(hover) / W) * 100}%`,
            top: `${(yValue(items[hover].value) / H) * 100}%`,
            transform: "translate(-50%, calc(-100% - 10px))",
            pointerEvents: "none",
            background: "var(--text)",
            color: "var(--surface)",
            padding: "8px 10px",
            borderRadius: "var(--radius-sm)",
            fontSize: 11,
            lineHeight: 1.5,
            whiteSpace: "nowrap",
            boxShadow: "0 4px 16px rgba(0,0,0,0.18)",
            zIndex: 5,
          }}
        >
          <div style={{ fontWeight: 700, marginBottom: 2 }}>
            #{items[hover].rank} · {items[hover].label}
          </div>
          <div className="num">Count: {Math.round(items[hover].value)}</div>
          <div className="num">Share: {items[hover].contribution.toFixed(1)}%</div>
          <div className="num">Cumulative: {items[hover].cumulative.toFixed(1)}%</div>
        </div>
      )}

      {/* axis legend */}
      <div
        style={{
          display: "flex",
          gap: 18,
          marginTop: 8,
          fontSize: 11,
          color: "var(--text-2)",
          flexWrap: "wrap",
        }}
      >
        <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
          <span style={{ width: 10, height: 10, background: "var(--accent)", borderRadius: 2 }} />
          Vital few (≤80%)
        </span>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
          <span style={{ width: 10, height: 10, background: "var(--border-strong)", borderRadius: 2 }} />
          Useful many
        </span>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
          <span style={{ width: 16, height: 2, background: "var(--text)" }} />
          Cumulative %
        </span>
      </div>

      {showTable && (
        <div style={{ marginTop: 24, overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, textAlign: "left", border: "1px solid var(--border)" }}>
            <thead>
              <tr style={{ background: "var(--surface-2)", borderBottom: "2px solid var(--border-strong)" }}>
                <th style={{ padding: "8px 12px", fontFamily: "var(--font-display)", fontWeight: 700 }}>Rank</th>
                <th style={{ padding: "8px 12px", fontFamily: "var(--font-display)", fontWeight: 700 }}>Defect Category</th>
                <th style={{ padding: "8px 12px", textAlign: "right", fontFamily: "var(--font-display)", fontWeight: 700 }}>Count</th>
                <th style={{ padding: "8px 12px", textAlign: "right", fontFamily: "var(--font-display)", fontWeight: 700 }}>Contribution %</th>
                <th style={{ padding: "8px 12px", textAlign: "right", fontFamily: "var(--font-display)", fontWeight: 700 }}>Cumulative %</th>
                <th style={{ padding: "8px 12px", textAlign: "center", fontFamily: "var(--font-display)", fontWeight: 700 }}>Classification</th>
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
                      fontWeight: 700, 
                      textTransform: "uppercase",
                      background: it.isVitalFew ? "var(--accent-weak)" : "var(--border-strong)",
                      color: it.isVitalFew ? "var(--accent)" : "var(--text-3)"
                    }}>
                      {it.isVitalFew ? "Vital Few" : "Useful Many"}
                    </span>
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
