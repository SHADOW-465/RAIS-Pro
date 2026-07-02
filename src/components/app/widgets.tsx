"use client";

import { useState, useEffect, useRef } from "react";
import type { SeriesPoint, StageRow, DefectRow, StageTrendPoint } from "@/lib/analytics";
import Icon from "@/components/editorial/Icon";
import { useTweaks } from "@/components/editorial/TweaksContext";
import { 
  useContainerWidth, 
  getBaseSpacing, 
  hoverIndexFromPixels, 
  shouldShowLabel 
} from "@/lib/chart-utils";

/** Shared hover tooltip card used by every time-series chart. Positioned over the
 *  chart container at the hovered point; flips below when the point sits high. */
export function ChartTip({ leftPx, topPx, below, title, rows }: {
  leftPx: number; topPx: number; below: boolean; title: string;
  rows: { label: string; value: string; color?: string }[];
}) {
  return (
    <div style={{
      position: "absolute", left: leftPx, top: topPx,
      transform: below ? "translate(-50%, 12px)" : "translate(-50%, calc(-100% - 12px))",
      background: "var(--surface)", border: "1px solid var(--border-strong)", borderRadius: "var(--radius-sm)",
      boxShadow: "0 6px 20px rgba(0,0,0,0.18)", padding: "8px 10px", pointerEvents: "none",
      zIndex: 30, minWidth: 130, whiteSpace: "nowrap",
    }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text)", marginBottom: rows.length ? 5 : 0, fontFamily: "var(--font-sans)" }}>{title}</div>
      {rows.map((r, i) => (
        <div key={i} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 14, fontSize: 11.5, lineHeight: 1.7 }}>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 6, color: "var(--text-2)" }}>
            {r.color && <span style={{ width: 8, height: 8, borderRadius: 2, background: r.color, display: "inline-block" }} />}
            {r.label}
          </span>
          <span style={{ fontFamily: "var(--font-mono)", fontWeight: 700, color: "var(--text)" }}>{r.value}</span>
        </div>
      ))}
    </div>
  );
}

export function ZoomButton({ onClick, children, title }: { onClick: (e: any) => void; children: React.ReactNode; title: string }) {
  const [hovered, setHovered] = useState(false);
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      title={title}
      style={{
        width: 26,
        height: 22,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: children === "FIT" ? 9 : 12,
        fontWeight: 700,
        color: "var(--text-2)",
        background: hovered ? "var(--surface-2)" : "transparent",
        border: "none",
        borderRadius: 2,
        cursor: "pointer",
        transition: "all 0.12s ease",
      }}
    >
      {children}
    </button>
  );
}



export function Card({ title, sub, children, span, onClick }: { title?: string; sub?: string; children: React.ReactNode; span?: number; onClick?: () => void }) {
  return (
    <div 
      onClick={onClick}
      className={onClick ? "card-hover" : ""}
      style={{ 
        gridColumn: span ? `span ${span}` : undefined, 
        border: "1px solid var(--border)", 
        borderRadius: "var(--radius-md)", 
        background: "var(--surface)", 
        padding: "16px",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        cursor: onClick ? "pointer" : "default",
        minWidth: 0
      }}
    >
      {title && (
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 12 }}>
          <span style={{ fontSize: 13, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--text-3)" }}>{title}</span>
          {sub && <span className="muted" style={{ fontSize: 11 }}>{sub}</span>}
        </div>
      )}
      <div style={{ flex: 1, minWidth: 0 }}>{children}</div>
    </div>
  );
}

export function Empty({ label }: { label: string }) {
  return <div className="muted" style={{ padding: "28px 8px", fontSize: 12, textAlign: "center" }}>{label}</div>;
}

export function Kpi({ 
  label, 
  value, 
  sub, 
  tone, 
  primary, 
  spark,
  onClick
}: { 
  label: string; 
  value: string; 
  sub?: string; 
  tone?: "good" | "warn" | "bad"; 
  primary?: boolean; 
  spark?: SeriesPoint[];
  onClick?: () => void;
}) {
  const color = tone === "bad" ? "var(--critical)" : tone === "warn" ? "var(--warning)" : tone === "good" ? "var(--positive)" : "var(--text)";
  return (
    <div 
      onClick={onClick}
      className={onClick ? "card-hover" : ""}
      style={{ 
        border: "1px solid var(--border)", 
        borderTop: primary ? "3px solid #C8421C" : "1px solid var(--border)", 
        borderRadius: "var(--radius-md)", 
        background: "var(--surface)", 
        padding: "16px",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        cursor: onClick ? "pointer" : "default",
        minWidth: 0
      }}
    >
      <div>
        <div className="muted" style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.06em", fontWeight: 600 }}>{label}</div>
        <div style={{
          fontFamily: "var(--font-mono)",
          fontSize: primary ? 34 : 22,
          fontWeight: 800,
          color,
          margin: "8px 0 2px",
          letterSpacing: primary ? "-0.01em" : undefined,
        }}>{value}</div>
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginTop: 8 }}>
        {sub && (
          <div className="muted" style={{ 
            fontSize: 11.5, 
            fontFamily: "var(--font-mono)", 
            color: tone === "bad" ? "var(--critical)" : tone === "good" ? "var(--positive)" : "var(--text-3)",
            fontWeight: 600
          }}>
            {sub}
          </div>
        )}
        {spark && spark.length > 1 && (
          <div style={{ marginLeft: "auto" }}>
            <Spark points={spark} tone={tone} />
          </div>
        )}
      </div>
    </div>
  );
}

export function Spark({ points, tone }: { points: SeriesPoint[]; tone?: "good" | "warn" | "bad" }) {
  if (!points || points.length < 2) return null;
  const v = points.map((p) => p.value); 
  const max = Math.max(...v, 1e-6), min = Math.min(...v, 0);
  const W = 110, H = 24;
  const d = points.map((p, i) => `${(i / (points.length - 1)) * W},${H - ((p.value - min) / (max - min || 1)) * H}`).join(" ");
  const color = tone === "bad" ? "var(--critical)" : tone === "good" ? "var(--positive)" : "var(--accent)";
  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} style={{ overflow: "visible" }}>
      <polyline points={d} fill="none" stroke={color} strokeWidth={1.5} />
    </svg>
  );
}

export function GaugeChart({ value, label, subtext }: { value: number; label: string; subtext: string }) {
  const max = 10.0;
  const pct = Math.min(value / max, 1.0);
  const angle = pct * Math.PI - Math.PI; // -Math.PI to 0
  
  const cx = 100, cy = 100, r = 70;
  const needleX = cx + Math.cos(angle) * (r - 12);
  const needleY = cy + Math.sin(angle) * (r - 12);
  
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", padding: "10px 0" }}>
      <svg width="200" height="110" viewBox="0 0 200 110" style={{ overflow: "visible" }}>
        <defs>
          <linearGradient id="gauge-grad" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="var(--positive)" />
            <stop offset="50%" stopColor="var(--warning)" />
            <stop offset="100%" stopColor="var(--critical)" />
          </linearGradient>
        </defs>
        {/* bg track */}
        <path d="M 30 100 A 70 70 0 0 1 170 100" fill="none" stroke="var(--border)" strokeWidth="14" strokeLinecap="round" />
        {/* colored track */}
        <path d="M 30 100 A 70 70 0 0 1 170 100" fill="none" stroke="url(#gauge-grad)" strokeWidth="14" strokeLinecap="round" strokeDasharray="220" strokeDashoffset={220 - 220 * pct} />
        {/* needle */}
        <line x1={cx} y1={cy} x2={needleX} y2={needleY} stroke="var(--text)" strokeWidth="3" strokeLinecap="round" />
        <circle cx={cx} cy={cy} r="6" fill="var(--text)" />
      </svg>
      <div style={{ textAlign: "center", marginTop: 4 }}>
        <div style={{ fontFamily: "var(--font-mono)", fontSize: 20, fontWeight: 800 }}>{label}</div>
        <div style={{ fontSize: 11.5, color: "var(--positive)", fontWeight: 700, marginTop: 2 }}>{subtext}</div>
      </div>
    </div>
  );
}

export function LineChart({ 
  points, 
  target, 
  fmt, 
  mean, 
  color = "var(--accent)",
  stage,
  metric
}: { 
  points: SeriesPoint[]; 
  target?: number; 
  fmt: (n: number) => string; 
  mean?: boolean; 
  color?: string;
  stage?: string;
  metric?: string;
}) {
  const [zoom, setZoom] = useState(1.0);
  const [scrollLeft, setScrollLeft] = useState(0);
  const [hover, setHover] = useState<number | null>(null);
  
  const { t } = useTweaks();
  const { ref: containerRef, width: containerWidth } = useContainerWidth(660);
  const wrapperRef = useRef<HTMLDivElement>(null);

  if (!points || points.length === 0) {
    return <Empty label="No trend points available for the selected range." />;
  }

  const H = 280, padX = 42, padTop = 22, padBottom = 72;
  const plotH = H - padTop - padBottom;
  const axisY = H - padBottom;
  const v = points.map((p) => p.value);
  const max = Math.max(...v, target ?? 0, 1e-6);
  const avg = v.length ? v.reduce((a, b) => a + b, 0) / v.length : 0;

  const numPoints = points.length;
  const baseSpacing = getBaseSpacing(numPoints);
  const currentSpacing = baseSpacing * zoom;
  const totalNeededWidth = currentSpacing * Math.max(numPoints - 1, 1) + padX * 2;
  const isScrollable = totalNeededWidth > containerWidth;
  const canvasWidth = isScrollable ? totalNeededWidth : containerWidth;

  const spacing = isScrollable 
    ? currentSpacing 
    : (containerWidth - padX * 2) / Math.max(numPoints - 1, 1);

  const x = (i: number) => padX + i * spacing;
  const y = (val: number) => axisY - (val / (max || 1)) * plotH;

  const buffer = 10;
  const startIdx = isScrollable ? Math.max(0, Math.floor((scrollLeft - padX) / spacing) - buffer) : 0;
  const endIdx = isScrollable ? Math.min(numPoints - 1, Math.ceil((scrollLeft + containerWidth - padX) / spacing) + buffer) : numPoints - 1;

  const handleWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    if (e.shiftKey && wrapperRef.current) {
      wrapperRef.current.scrollLeft += e.deltaY;
      e.preventDefault();
    }
  };

  const handleMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const idx = hoverIndexFromPixels(e.clientX, rect.left, padX, spacing, points.length);
    setHover(idx);
  };

  const visiblePoints = points.slice(startIdx, endIdx + 1);
  const pathD = visiblePoints.length > 1
    ? `M ${x(startIdx)} ${y(points[startIdx].value)} ` + visiblePoints.map((p, idx) => `L ${x(startIdx + idx)} ${y(p.value)}`).join(" ")
    : "";
  const fillD = pathD ? `${pathD} L ${x(endIdx)} ${axisY} L ${x(startIdx)} ${axisY} Z` : "";

  // Resolve stage label for tooltip if not explicitly passed
  const viewLabels: Record<string, string> = {
    cumulative: "Cumulative (All Stages)",
    visual: "100% Visual Inspection",
    balloon: "Balloon Testing",
    "valve-integrity": "Valve Integrity",
    final: "Final Inspection",
  };
  const activeStage = stage || viewLabels[t.stageView] || t.stageView;
  const activeMetric = metric || "Value";

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
          onMouseMove={handleMouseMove}
        >
          {/* Horizontal gridlines */}
          {[0, 0.25, 0.5, 0.75, 1].map((p, i) => (
            <line key={i} x1={padX} y1={padTop + plotH * p} x2={canvasWidth - padX} y2={padTop + plotH * p} stroke="var(--border)" strokeWidth={0.5} />
          ))}
          {[0, 0.5, 1].map((p, i) => (
            <text key={`yl${i}`} x={padX - 8} y={padTop + plotH * p + 4} fontSize={11} fontWeight={600} textAnchor="end" fill="var(--text-2)" fontFamily="var(--font-mono)">{fmt(max * (1 - p))}</text>
          ))}
          <line x1={padX} y1={axisY} x2={canvasWidth - padX} y2={axisY} stroke="var(--border-strong)" strokeWidth={1} />

          {target != null && (
            <g>
              <line x1={padX} y1={y(target)} x2={canvasWidth - padX} y2={y(target)} stroke="var(--critical)" strokeDasharray="5,4" strokeWidth={1.2} />
              <text x={canvasWidth - padX - 4} y={y(target) - 6} fontSize={11} fill="var(--critical)" fontWeight={800} textAnchor="end">TARGET {fmt(target)}</text>
            </g>
          )}
          {mean && (
            <g>
              <line x1={padX} y1={y(avg)} x2={canvasWidth - padX} y2={y(avg)} stroke="#C8421C" strokeDasharray="6,3" strokeWidth={1.4} />
              <text x={padX + 6} y={y(avg) - 6} fontSize={11} fill="#C8421C" fontWeight={800}>MEAN {fmt(avg)}</text>
            </g>
          )}

          {fillD && <path d={fillD} fill="var(--accent-weak)" opacity={0.25} />}
          {pathD && <path d={pathD} fill="none" stroke={color} strokeWidth={2} />}

          {/* Hover Crosshairs */}
          {hover != null && (
            <g>
              <line x1={x(hover)} y1={padTop} x2={x(hover)} y2={axisY} stroke="var(--text-3)" strokeWidth={1} strokeDasharray="3,3" />
              <line x1={padX} y1={y(points[hover].value)} x2={canvasWidth - padX} y2={y(points[hover].value)} stroke="var(--text-3)" strokeWidth={1} strokeDasharray="3,3" />
            </g>
          )}

          {points.map((p, i) => {
            if (i < startIdx || i > endIdx) return null;
            return (
              <circle key={i} cx={x(i)} cy={y(p.value)} r={hover === i ? 5 : (points.length > 25 ? 2.5 : 3)} fill={hover === i ? color : "var(--surface)"} stroke={color} strokeWidth={2} />
            );
          })}

          {/* Vertical thinned rotated date labels */}
          {points.map((p, i) => {
            if (i < startIdx || i > endIdx) return null;
            const show = shouldShowLabel(p.label, i, points.map(pt => pt.label), spacing, t.grain);
            if (!show) return null;
            return (
              <text key={`xl${i}`} x={x(i)} y={axisY + 10} fontSize={11.5} fontWeight={600} textAnchor="end" fill="var(--text-2)" fontFamily="var(--font-sans)" transform={`rotate(-90 ${x(i)} ${axisY + 10})`}>{p.label}</text>
            );
          })}
        </svg>

        {hover != null && (
          <ChartTip 
            leftPx={x(hover)} 
            topPx={y(points[hover].value)} 
            below={y(points[hover].value) < H * 0.32} 
            title={points[hover].label} 
            rows={[
              { label: "Metric", value: activeMetric },
              { label: "Value", value: fmt(points[hover].value), color },
              ...(points[hover].rejected != null ? [{ label: "Rejected", value: num(points[hover].rejected!) }] : []),
              ...(points[hover].checked ? [{ label: "Checked", value: num(points[hover].checked!) }] : []),
              { label: "Stage", value: activeStage }
            ]} 
          />
        )}
      </div>
    </div>
  );
}

const SERIES_COLORS = ["#2563EB", "#0D9488", "#D97706", "#DC2626", "#7C3AED", "#65A30D"];

export function MultiLine({ 
  data, 
  stages, 
  fmt 
}: { 
  data: StageTrendPoint[]; 
  stages: { stageId: string; label: string }[]; 
  fmt?: (n: number) => string 
}) {
  const [zoom, setZoom] = useState(1.0);
  const [scrollLeft, setScrollLeft] = useState(0);
  const [hover, setHover] = useState<number | null>(null);

  const { t } = useTweaks();
  const { ref: containerRef, width: containerWidth } = useContainerWidth(660);
  const wrapperRef = useRef<HTMLDivElement>(null);

  if (!data || data.length === 0) {
    return <Empty label="No trend data available for the selected range." />;
  }

  // Smart default: rates (≤1) render as %, counts render as integers.
  const fmtVal = fmt ?? ((n: number) => (n <= 1 ? `${(n * 100).toFixed(2)}%` : Math.round(n).toLocaleString("en-IN")));
  const H = 296, padX = 42, padTop = 38, padBottom = 72;
  const plotH = H - padTop - padBottom;
  const axisY = H - padBottom;

  let max = 1e-6;
  for (const d of data) {
    for (const s of stages) {
      max = Math.max(max, d.perStage[s.stageId] ?? 0);
    }
  }

  const numPoints = data.length;
  const baseSpacing = getBaseSpacing(numPoints);
  const currentSpacing = baseSpacing * zoom;
  const totalNeededWidth = currentSpacing * Math.max(numPoints - 1, 1) + padX * 2;
  const isScrollable = totalNeededWidth > containerWidth;
  const canvasWidth = isScrollable ? totalNeededWidth : containerWidth;

  const spacing = isScrollable 
    ? currentSpacing 
    : (containerWidth - padX * 2) / Math.max(numPoints - 1, 1);

  const x = (i: number) => padX + i * spacing;
  const y = (val: number) => axisY - (val / (max || 1)) * plotH;
  const color = (si: number) => SERIES_COLORS[si % SERIES_COLORS.length];

  const buffer = 10;
  const startIdx = isScrollable ? Math.max(0, Math.floor((scrollLeft - padX) / spacing) - buffer) : 0;
  const endIdx = isScrollable ? Math.min(numPoints - 1, Math.ceil((scrollLeft + containerWidth - padX) / spacing) + buffer) : numPoints - 1;

  const handleWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    if (e.shiftKey && wrapperRef.current) {
      wrapperRef.current.scrollLeft += e.deltaY;
      e.preventDefault();
    }
  };

  const handleMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const idx = hoverIndexFromPixels(e.clientX, rect.left, padX, spacing, data.length);
    setHover(idx);
  };

  const maxValAtHover = hover != null 
    ? Math.max(...stages.map((s) => data[hover].perStage[s.stageId] ?? 0))
    : 0;

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
          style={{ width: canvasWidth, height: H, display: "block" }}
          onMouseMove={handleMouseMove}
        >
          {[0, 0.25, 0.5, 0.75, 1].map((p, i) => (
            <line key={i} x1={padX} y1={padTop + plotH * p} x2={canvasWidth - padX} y2={padTop + plotH * p} stroke="var(--border)" strokeWidth={0.5} />
          ))}
          {[0, 0.5, 1].map((p, i) => (
            <text key={`yl${i}`} x={padX - 8} y={padTop + plotH * p + 4} fontSize={11} fontWeight={600} textAnchor="end" fill="var(--text-2)" fontFamily="var(--font-mono)">{fmtVal(max * (1 - p))}</text>
          ))}
          <line x1={padX} y1={axisY} x2={canvasWidth - padX} y2={axisY} stroke="var(--border-strong)" strokeWidth={1} />

          {/* Hover Crosshairs */}
          {hover != null && (
            <g>
              <line x1={x(hover)} y1={padTop} x2={x(hover)} y2={axisY} stroke="var(--text-3)" strokeWidth={1} strokeDasharray="3,3" />
              <line x1={padX} y1={y(maxValAtHover)} x2={canvasWidth - padX} y2={y(maxValAtHover)} stroke="var(--text-3)" strokeWidth={1} strokeDasharray="3,3" />
            </g>
          )}

          {stages.map((s, si) => {
            const visibleData = data.slice(startIdx, endIdx + 1);
            const pathD = visibleData.length > 1
              ? `M ${x(startIdx)} ${y(data[startIdx].perStage[s.stageId] ?? 0)} ` + visibleData.map((d, idx) => `L ${x(startIdx + idx)} ${y(d.perStage[s.stageId] ?? 0)}`).join(" ")
              : "";
            return pathD ? (
              <path key={s.stageId} fill="none" stroke={color(si)} strokeWidth={1.8} d={pathD} />
            ) : null;
          })}

          {hover != null && stages.map((s, si) => (
            <circle key={`h${s.stageId}`} cx={x(hover)} cy={y(data[hover].perStage[s.stageId] ?? 0)} r={3.5} fill={color(si)} stroke="var(--surface)" strokeWidth={1.5} />
          ))}

          {/* Rotated thinned date labels */}
          {data.map((d, i) => {
            if (i < startIdx || i > endIdx) return null;
            const show = shouldShowLabel(d.label, i, data.map(pt => pt.label), spacing, t.grain);
            if (!show) return null;
            return (
              <text key={`xl${i}`} x={x(i)} y={axisY + 10} fontSize={11.5} fontWeight={600} textAnchor="end" fill="var(--text-2)" fontFamily="var(--font-sans)" transform={`rotate(-90 ${x(i)} ${axisY + 10})`}>{d.label}</text>
            );
          })}

          {/* Legend */}
          {stages.map((s, si) => (
            <g key={`lg${s.stageId}`} transform={`translate(${padX + (si % 5) * 110}, ${12 + Math.floor(si / 5) * 12})`}>
              <circle cx={0} cy={-2} r={4} fill={color(si)} />
              <text x={8} y={3} fontSize={11} fill="var(--text-2)" fontWeight={700}>{s.label.split(" ")[0].toUpperCase()}</text>
            </g>
          ))}
        </svg>

        {hover != null && (
          <ChartTip
            leftPx={x(hover)}
            topPx={y(maxValAtHover)}
            below={y(maxValAtHover) < H * 0.32}
            title={data[hover].label}
            rows={[...stages]
              .map((s, si) => {
                const c = data[hover].counts?.[s.stageId];
                const exact = c && c.checked > 0 ? ` · ${num(c.rejected)}/${num(c.checked)}` : "";
                return { label: s.label.split(" ")[0], value: fmtVal(data[hover].perStage[s.stageId] ?? 0) + exact, color: color(si), raw: data[hover].perStage[s.stageId] ?? 0 };
              })
              .sort((a, b) => b.raw - a.raw)
              .map(({ label, value, color }) => ({ label, value, color }))}
          />
        )}
      </div>
    </div>
  );
}


export function BarsH({ rows, fmt }: { rows: { label: string; value: number; sub?: string }[]; fmt: (n: number) => string }) {
  if (!rows || rows.length === 0) {
    return <Empty label="No distribution records available." />;
  }
  const max = Math.max(...rows.map((r) => r.value), 1e-6);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {rows.map((r, i) => (
        <div key={r.label}>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5, marginBottom: 4 }}>
            <span style={{ color: "var(--text)", fontWeight: 500 }}>
              {r.label}
              {r.sub ? <span className="muted" style={{ fontSize: 11 }}> · {r.sub}</span> : null}
            </span>
            <span style={{ fontFamily: "var(--font-mono)", fontWeight: 700, color: "var(--text-2)" }}>{fmt(r.value)}</span>
          </div>
          <div style={{ height: 8, background: "var(--surface-2)", borderRadius: 4, overflow: "hidden", border: "1px solid var(--border)" }}>
            <div style={{ 
              width: `${(r.value / max) * 100}%`, 
              height: "100%", 
              background: i === 0 ? "#C8421C" : "var(--accent)" 
            }} />
          </div>
        </div>
      ))}
    </div>
  );
}

export function DefectParetoTable({ rows }: { rows: DefectRow[] }) {
  return (
    <table style={{ width: "100%", fontSize: 12.5, borderCollapse: "collapse" }}>
      <thead>
        <tr style={{ color: "var(--text-3)", textAlign: "left" }}>
          <th style={cth}>Defect</th>
          <th style={{ ...cth, textAlign: "right" }}>Rejections</th>
          <th style={{ ...cth, textAlign: "right" }}>%</th>
          <th style={{ ...cth, textAlign: "right" }}>Cum %</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r, i) => (
          <tr key={r.label} style={{ borderTop: "1px solid var(--border)", background: i % 2 === 0 ? "var(--surface-2)" : "transparent" }}>
            <td style={{ ...ctd, fontWeight: 600 }}>{r.label}</td>
            <td style={{ ...ctd, textAlign: "right", fontFamily: "var(--font-mono)", fontWeight: 700 }}>{r.rejected.toLocaleString()}</td>
            <td style={{ ...ctd, textAlign: "right", fontFamily: "var(--font-mono)", color: "var(--text-2)" }}>{r.pct.toFixed(1)}%</td>
            <td style={{ ...ctd, textAlign: "right", fontFamily: "var(--font-mono)", color: r.cumPct > 80 ? "var(--critical)" : "var(--positive)", fontWeight: 700 }}>{r.cumPct.toFixed(1)}%</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function ProcessFlow({ rows }: { rows: StageRow[] }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {rows.map((r, i) => (
        <div key={r.stageId}>
          <div style={{ 
            border: "1px solid var(--border)", 
            borderRadius: "var(--radius-sm)", 
            padding: "10px 12px", 
            display: "flex", 
            justifyContent: "space-between", 
            alignItems: "center",
            background: "var(--surface)"
          }}>
            <div>
              <div style={{ fontWeight: 700, fontSize: 13, display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ width: 8, height: 8, borderRadius: "50%", background: r.rejRate > 0.05 ? "var(--critical)" : "var(--positive)" }} />
                {r.label}
              </div>
              <div className="muted" style={{ fontSize: 11, fontFamily: "var(--font-mono)", marginTop: 2 }}>
                Checked: {r.checked.toLocaleString()} | Rej: {r.rejected.toLocaleString()} | Yield: {(r.yield * 100).toFixed(1)}%
              </div>
            </div>
            <span style={{ 
              fontFamily: "var(--font-mono)", 
              fontWeight: 800, 
              fontSize: 13,
              color: r.rejRate > 0.05 ? "var(--critical)" : "var(--positive)",
              background: r.rejRate > 0.05 ? "var(--critical-weak)" : "var(--positive-weak)",
              padding: "2px 6px",
              borderRadius: 4
            }}>
              {(r.rejRate * 100).toFixed(1)}%
            </span>
          </div>
          {i < rows.length - 1 && (
            <div style={{ textAlign: "center", color: "var(--text-3)", fontSize: 12, margin: "2px 0" }}>
              ↓
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

export function AuditVerificationTable({ 
  sourceFiles,
  validation,
  integrity,
  overrides,
  completeness
}: { 
  sourceFiles: string;
  validation: number;
  integrity: number;
  overrides: number;
  completeness: number;
}) {
  const items = [
    { label: "Source Files Processed", value: sourceFiles, ok: true, warn: false },
    { label: "Data Validation Checks", value: `${validation}%`, ok: validation >= 95, warn: validation < 95 },
    { label: "Formula Integrity", value: `${integrity}%`, ok: integrity >= 95, warn: integrity < 95 },
    { label: "Manual Overrides", value: String(overrides), ok: overrides === 0, warn: overrides > 0 },
    { label: "Data Completeness", value: `${completeness}%`, ok: completeness >= 95, warn: completeness < 95 },
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <table style={{ width: "100%", fontSize: 12.5, borderCollapse: "collapse" }}>
        <tbody>
          {items.map((item, idx) => (
            <tr key={idx} style={{ borderBottom: "1px solid var(--border)" }}>
              <td style={{ padding: "8px 0", color: "var(--text-2)" }}>{item.label}</td>
              <td style={{ 
                padding: "8px 0", 
                textAlign: "right", 
                fontFamily: "var(--font-mono)", 
                fontWeight: 700,
                color: item.ok ? "var(--positive)" : item.warn ? "var(--warning)" : "var(--text)"
              }}>
                <div style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                  <span>{item.value}</span>
                  <div style={{
                    width: 14,
                    height: 14,
                    borderRadius: "50%",
                    background: item.ok ? "var(--positive-weak)" : "var(--warning-weak)",
                    display: "grid",
                    placeItems: "center",
                    color: item.ok ? "var(--positive)" : "var(--warning)"
                  }}>
                    <Icon name={item.ok ? "check" : "alert"} size={10} stroke={2.5} />
                  </div>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const cth: React.CSSProperties = { padding: "6px 8px", fontWeight: 700, fontSize: 11, textTransform: "uppercase", letterSpacing: "0.05em" };
const ctd: React.CSSProperties = { padding: "8px 8px", color: "var(--text)" };

/** Stage x Size rejection-rate heatmap — "where are problems concentrated".
 *  Cell background interpolates across the existing tone-weak CSS variables
 *  (positive-weak → warning-weak → critical-weak); text uses the matching
 *  strong tone. Honest empty-state when no size-tagged data exists (the
 *  Cumulative dataset's rejection-analysis sheets carry no size dimension). */
export function StageSizeHeatmap({ cells }: { cells: { stageId: string; stageLabel: string; size: string; rejRate: number; rejected: number }[] }) {
  if (cells.length === 0) {
    return <Empty label="No size-tagged data for this period — upload and publish a size-wise sheet (Visual or Valve Integrity) to populate stage x size concentration." />;
  }
  const stages = [...new Set(cells.map((c) => c.stageId))].map((id) => cells.find((c) => c.stageId === id)!.stageLabel);
  const stageIds = [...new Set(cells.map((c) => c.stageId))];
  const sizes = [...new Set(cells.map((c) => c.size))].sort();
  const maxRate = Math.max(...cells.map((c) => c.rejRate), 1e-6);

  const toneFor = (rate: number): { bg: string; fg: string } => {
    const t = rate / maxRate; // 0..1 relative to the worst cell this period
    if (t < 0.34) return { bg: "var(--positive-weak)", fg: "var(--positive)" };
    if (t < 0.67) return { bg: "var(--warning-weak)", fg: "var(--warning)" };
    return { bg: "var(--critical-weak)", fg: "var(--critical)" };
  };

  return (
    <div style={{ overflowX: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
        <thead>
          <tr>
            <th style={{ ...cth, textAlign: "left", color: "var(--text-3)" }}>Stage \ Size</th>
            {sizes.map((sz) => (
              <th key={sz} style={{ ...cth, textAlign: "center", color: "var(--text-3)" }}>{sz}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {stageIds.map((stageId, i) => (
            <tr key={stageId}>
              <td style={{ ...ctd, fontWeight: 700 }}>{stages[i]}</td>
              {sizes.map((sz) => {
                const cell = cells.find((c) => c.stageId === stageId && c.size === sz);
                if (!cell) {
                  return <td key={sz} style={{ ...ctd, textAlign: "center", color: "var(--text-3)" }}>—</td>;
                }
                const tone = toneFor(cell.rejRate);
                return (
                  <td key={sz} style={{ ...ctd, textAlign: "center", background: tone.bg, color: tone.fg, fontWeight: 700, fontFamily: "var(--font-mono)", borderRadius: "var(--radius-sm)" }}>
                    {(cell.rejRate * 100).toFixed(1)}%
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export const pct = (n: number) => `${(n * 100).toFixed(2)}%`;
export const rupee = (n: number) => `₹ ${(n / 100000).toFixed(2)} Lakhs`;
export const num = (n: number) => n.toLocaleString("en-IN");

/** Donut — composition share (e.g. rejections by stage or defect). Inline SVG arcs. */
export function Donut({ 
  data, 
  fmt,
  size = 160,
  fontSize = 12
}: { 
  data: { label: string; value: number; color?: string }[]; 
  fmt?: (n: number) => string;
  size?: number;
  fontSize?: number;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const total = data.reduce((s, d) => s + d.value, 0);
  if (!data.length || total <= 0) return <Empty label="No data for the selected range." />;
  const f = fmt ?? ((n: number) => Math.round(n).toLocaleString("en-IN"));
  const R = 62, C = 2 * Math.PI * R, cx = 80, cy = 80;
  const col = (i: number) => data[i].color ?? SERIES_COLORS[i % SERIES_COLORS.length];
  let acc = 0;
  return (
    <div style={{ position: "relative", display: "flex", gap: 24, alignItems: "center", justifyContent: "center", flexWrap: "wrap" }} onMouseLeave={() => setHover(null)}>
      <svg viewBox="0 0 160 160" style={{ width: size, height: size, flexShrink: 0 }}>
        <circle cx={cx} cy={cy} r={R} fill="none" stroke="var(--border)" strokeWidth={20} />
        {data.map((d, i) => {
          const frac = d.value / total, seg = frac * C, off = acc * C; acc += frac;
          return <circle key={i} cx={cx} cy={cy} r={R} fill="none" stroke={col(i)} strokeWidth={hover === i ? 24 : 20}
            strokeDasharray={`${seg} ${C - seg}`} strokeDashoffset={-off} transform={`rotate(-90 ${cx} ${cy})`}
            onMouseEnter={() => setHover(i)} style={{ transition: "stroke-width .1s" }} />;
        })}
        <text x={cx} y={cy - 3} textAnchor="middle" fontSize={10} fill="var(--text-3)">Total</text>
        <text x={cx} y={cy + 14} textAnchor="middle" fontSize={15} fontWeight={800} fontFamily="var(--font-mono)" fill="var(--text)">{f(total)}</text>
      </svg>
      <div style={{ display: "flex", flexDirection: "column", gap: 8, fontSize: fontSize }}>
        {data.map((d, i) => (
          <div key={i} onMouseEnter={() => setHover(i)} style={{ display: "flex", alignItems: "center", gap: 10, opacity: hover == null || hover === i ? 1 : 0.5 }}>
            <span style={{ width: fontSize - 3, height: fontSize - 3, borderRadius: 2, background: col(i), flexShrink: 0 }} />
            <span style={{ color: "var(--text-2)", minWidth: fontSize * 8 }}>{d.label}</span>
            <span style={{ fontFamily: "var(--font-mono)", fontWeight: 700, color: "var(--text)" }}>{f(d.value)}</span>
            <span style={{ fontFamily: "var(--font-mono)", color: "var(--text-2)" }}>({((d.value / total) * 100).toFixed(1)}%)</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Heatmap — rows × cols matrix, color intensity = value. Spots hotspots (defect×month). */
export function Heatmap({ rows, cols, matrix, fmt }: { rows: string[]; cols: string[]; matrix: number[][]; fmt?: (n: number) => string }) {
  const [hover, setHover] = useState<{ r: number; c: number } | null>(null);
  if (!rows.length || !cols.length) return <Empty label="No data for the selected range." />;
  const f = fmt ?? ((n: number) => (n <= 1 ? `${(n * 100).toFixed(2)}%` : Math.round(n).toLocaleString("en-IN")));
  let max = 1e-9;
  for (const row of matrix) for (const v of row) max = Math.max(max, v);
  const bg = (v: number) => `color-mix(in srgb, var(--accent) ${Math.round(Math.min(v / max, 1) * 82) + 4}%, var(--surface))`;
  return (
    <div style={{ position: "relative", overflowX: "auto" }} onMouseLeave={() => setHover(null)}>
      <table style={{ borderCollapse: "collapse", fontSize: 10 }}>
        <thead>
          <tr><th />{cols.map((c, ci) => (
            <th key={ci} style={{ padding: "2px 3px", color: "var(--text-3)", fontWeight: 600, height: 52, whiteSpace: "nowrap", writingMode: "vertical-rl", transform: "rotate(180deg)" }}>{c}</th>
          ))}</tr>
        </thead>
        <tbody>
          {rows.map((rl, ri) => (
            <tr key={ri}>
              <td style={{ padding: "2px 8px", color: "var(--text-2)", fontWeight: 600, whiteSpace: "nowrap", textAlign: "right" }}>{rl}</td>
              {cols.map((_, ci) => {
                const v = matrix[ri]?.[ci] ?? 0, on = hover?.r === ri && hover?.c === ci;
                return <td key={ci} title={`${rl} · ${cols[ci]}: ${f(v)}`} onMouseEnter={() => setHover({ r: ri, c: ci })}
                  style={{ width: 24, height: 22, background: bg(v), outline: on ? "2px solid var(--text)" : "1px solid var(--surface)" }} />;
              })}
            </tr>
          ))}
        </tbody>
      </table>
      {hover && (
        <div style={{ marginTop: 6, fontSize: 11, fontFamily: "var(--font-mono)", color: "var(--text-2)" }}>
          {rows[hover.r]} · {cols[hover.c]}: <strong style={{ color: "var(--text)" }}>{f(matrix[hover.r]?.[hover.c] ?? 0)}</strong>
        </div>
      )}
    </div>
  );
}

// Bolds numbers / lot / line references inside narrative text.
export function safeBolden(text: string): React.ReactNode {
  const regex = /([0-9]+(?:\.[0-9]+)?%?(?:\s*pt)?|LOT-[A-Z0-9-]+|Line-\d+|Line\s\d+)/g;
  const parts = text.split(regex);
  return (
    <>
      {parts.map((part, i) => {
        if (part.match(regex)) {
          return (
            <strong
              key={i}
              className="num"
              style={{
                fontWeight: 700,
                padding: "2px 4px",
                background: "var(--surface-3)",
                color: "var(--text)",
                borderRadius: "3px",
                border: "1px solid var(--border)",
                fontSize: "12px",
              }}
            >
              {part}
            </strong>
          );
        }
        return <span key={i}>{part}</span>;
      })}
    </>
  );
}
