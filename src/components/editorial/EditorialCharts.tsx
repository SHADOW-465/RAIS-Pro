import { useId, useState, useEffect, useRef } from "react";
import { ZoomButton } from "@/components/app/widgets";
import { useTweaks } from "@/components/editorial/TweaksContext";
import {
  useContainerWidth,
  getBaseSpacing,
  hoverIndexFromPixels,
  shouldShowLabel
} from "@/lib/chart-utils";

/**
 * Inline SVG editorial charts. Each chart respects the body[data-chart-style]
 * tweak: "filled" | "outline" | "minimal". Colors come from CSS variables so
 * they live-update with the accent tweak.
 */



function buildBezierPath(values: number[], xs: (i: number) => number, ys: (v: number) => number) {
  if (values.length === 0) return "";
  let path = `M ${xs(0)} ${ys(values[0])}`;
  for (let i = 0; i < values.length - 1; i++) {
    const x0 = xs(i);
    const y0 = ys(values[i]);
    const x1 = xs(i + 1);
    const y1 = ys(values[i + 1]);
    const cp1x = x0 + (x1 - x0) * 0.35;
    const cp1y = y0;
    const cp2x = x1 - (x1 - x0) * 0.35;
    const cp2y = y1;
    path += ` C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${x1} ${y1}`;
  }
  return path;
}

function chartStyle(): "filled" | "outline" | "minimal" {
  if (typeof document === "undefined") return "filled";
  return (document.body.getAttribute("data-chart-style") as any) || "filled";
}

// ── TrendLine ─────────────────────────────────────────────────────────────────
export function TrendLine({
  cycles,
  values,
  target,
  height = 220,
  showTarget = true,
  accentIdx = -1,
}: {
  cycles: string[];
  values: number[];
  target?: number;
  height?: number;
  showTarget?: boolean;
  accentIdx?: number;
}) {
  const [zoom, setZoom] = useState(1.0);
  const [scrollLeft, setScrollLeft] = useState(0);
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);

  const { t } = useTweaks();
  const { ref: containerRef, width: containerWidth } = useContainerWidth(600);
  const wrapperRef = useRef<HTMLDivElement>(null);

  const numPoints = values.length;
  if (numPoints === 0) return null;

  const h = height;
  const padL = 40, padR = 16, padT = 16, padB = 30;
  const innerH = h - padT - padB;

  const baseSpacing = getBaseSpacing(numPoints);
  const currentSpacing = baseSpacing * zoom;
  const totalNeededWidth = currentSpacing * Math.max(numPoints - 1, 1) + padL + padR;
  const isScrollable = totalNeededWidth > containerWidth;
  const canvasWidth = isScrollable ? totalNeededWidth : containerWidth;

  const spacing = isScrollable 
    ? currentSpacing 
    : (containerWidth - padL - padR) / Math.max(numPoints - 1, 1);

  const min = Math.min(...values, target ?? Infinity) * 0.94;
  const max = Math.max(...values, target ?? -Infinity) * 1.06;

  const xs = (i: number) => padL + i * spacing;
  const ys = (v: number) => padT + innerH - ((v - min) / Math.max(0.0001, max - min)) * innerH;

  const buffer = 10;
  const startIdx = isScrollable ? Math.max(0, Math.floor((scrollLeft - padL) / spacing) - buffer) : 0;
  const endIdx = isScrollable ? Math.min(numPoints - 1, Math.ceil((scrollLeft + containerWidth - padL) / spacing) + buffer) : numPoints - 1;

  const handleWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    if (e.shiftKey && wrapperRef.current) {
      wrapperRef.current.scrollLeft += e.deltaY;
      e.preventDefault();
    }
  };

  const handleMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const idx = hoverIndexFromPixels(e.clientX, rect.left, padL, spacing, numPoints);
    setHoveredIdx(idx);
  };

  const style = chartStyle();
  const lastIdx = numPoints - 1;
  const gradId = useId().replace(/:/g, "");

  const visibleValues = values.slice(startIdx, endIdx + 1);
  const pathD = visibleValues.length > 1
    ? buildBezierPath(visibleValues, (idx) => xs(startIdx + idx), ys)
    : "";
  const areaPath = pathD
    ? `${pathD} L ${xs(endIdx)} ${padT + innerH} L ${xs(startIdx)} ${padT + innerH} Z`
    : "";

  return (
    <div ref={containerRef} style={{ position: "relative", width: "100%", minWidth: 0 }} onMouseLeave={() => setHoveredIdx(null)}>
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
          height={h}
          viewBox={`0 0 ${canvasWidth} ${h}`}
          style={{ overflow: "visible", display: "block" }}
          onMouseMove={handleMouseMove}
        >
          <defs>
            <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--viz-1)" stopOpacity="0.25" />
              <stop offset="100%" stopColor="var(--viz-1)" stopOpacity="0.0" />
            </linearGradient>
          </defs>
          {[0, 0.25, 0.5, 0.75, 1].map((p, i) => (
            <line
              key={i}
              x1={padL}
              x2={canvasWidth - padR}
              y1={padT + innerH * p}
              y2={padT + innerH * p}
              stroke="var(--border)"
              strokeWidth="1"
            />
          ))}
          <line
            x1={padL}
            x2={canvasWidth - padR}
            y1={padT + innerH}
            y2={padT + innerH}
            stroke="var(--border-strong)"
            strokeWidth="1.5"
          />
          {showTarget && target !== undefined && (
            <g>
              <line
                x1={padL}
                x2={canvasWidth - padR}
                y1={ys(target)}
                y2={ys(target)}
                stroke="var(--text-3)"
                strokeWidth="1"
                strokeDasharray="4 4"
                opacity="0.55"
              />
              <text
                x={canvasWidth - padR}
                y={ys(target) - 6}
                fontSize="11"
                fontWeight="700"
                textAnchor="end"
                fontFamily="var(--font-mono)"
                fill="var(--text-3)"
              >
                target {target.toFixed(2)}
              </text>
            </g>
          )}

          {style === "filled" && areaPath && <path d={areaPath} fill={`url(#${gradId})`} />}
          
          {pathD && (
            <path
              d={pathD}
              fill="none"
              stroke={style === "minimal" ? "var(--text)" : "var(--viz-1)"}
              strokeWidth={style === "minimal" ? 1.5 : 2.25}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          )}

          {/* Hover Crosshairs */}
          {hoveredIdx !== null && (
            <g>
              <line x1={xs(hoveredIdx)} y1={padT} x2={xs(hoveredIdx)} y2={padT + innerH} stroke="var(--text-3)" strokeWidth={1} strokeDasharray="3,3" />
              <line x1={padL} y1={ys(values[hoveredIdx])} x2={canvasWidth - padR} y2={ys(values[hoveredIdx])} stroke="var(--text-3)" strokeWidth={1} strokeDasharray="3,3" />
            </g>
          )}

          {values.map((v, i) => {
            if (i < startIdx || i > endIdx) return null;
            const isHovered = hoveredIdx === i;
            const r = i === lastIdx ? 5.5 : style === "minimal" ? (isHovered ? 4.5 : 0) : (isHovered ? 5 : 3.5);
            const isAccent = i === lastIdx || i === accentIdx || isHovered;
            return (
              <circle
                key={i}
                cx={xs(i)}
                cy={ys(v)}
                r={r}
                fill={isAccent ? "var(--viz-1)" : "var(--surface)"}
                stroke={isAccent ? "var(--viz-1)" : "var(--border)"}
                strokeWidth="2"
                style={{ transition: "r 0.15s ease" }}
              />
            );
          })}
          {hoveredIdx === null && (
            <text
              x={xs(lastIdx) + 10}
              y={ys(values[lastIdx]) - 10}
              fontSize="14"
              fontFamily="var(--font-mono)"
              fontWeight="800"
              fill="var(--viz-1)"
            >
              {values[lastIdx].toFixed(2)}%
            </text>
          )}

          {cycles.map((c, i) => {
            if (i < startIdx || i > endIdx) return null;
            const show = shouldShowLabel(c, i, cycles, spacing, t.grain);
            if (!show) return null;
            return (
              <text
                key={`${c}-${i}`}
                x={xs(i)}
                y={h - 8}
                fontSize="12"
                fontWeight="600"
                textAnchor="middle"
                fontFamily="var(--font-sans)"
                fill="var(--text-2)"
                letterSpacing="0.1em"
              >
                {c.toUpperCase()}
              </text>
            );
          })}
        </svg>

        {hoveredIdx !== null && (
          <div
            style={{
              position: "absolute",
              left: xs(hoveredIdx),
              top: ys(values[hoveredIdx]) - 14,
              transform: "translate(-50%, -100%)",
              pointerEvents: "none",
              background: "var(--surface)",
              border: "1px solid var(--border-strong)",
              borderRadius: "var(--radius-sm)",
              boxShadow: "0 6px 20px rgba(0,0,0,0.18)",
              padding: "6px 8px",
              zIndex: 30,
              whiteSpace: "nowrap",
              fontSize: 11,
            }}
          >
            <div style={{ fontWeight: 700, color: "var(--text)", marginBottom: 2 }}>{cycles[hoveredIdx].toUpperCase()}</div>
            <div style={{ color: "var(--viz-1)", fontFamily: "var(--font-mono)", fontWeight: 800 }}>
              Value: {values[hoveredIdx].toFixed(2)}%
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── HorizontalBars ────────────────────────────────────────────────────────────
export function HorizontalBars({
  data,
  labelKey,
  valueKey,
  suffix = "",
  height = 260,
  accentTop = true,
}: {
  data: Array<Record<string, any>>;
  labelKey: string;
  valueKey: string;
  suffix?: string;
  height?: number;
  accentTop?: boolean;
}) {
  const w = 600, padT = 8, padB = 8, padR = 80;
  const rowH = (height - padT - padB) / Math.max(1, data.length);
  const max = Math.max(...data.map((d) => d[valueKey] as number), 1);
  const labelW = 140;
  const barX = labelW + 12;
  const barW = w - barX - padR;
  const style = chartStyle();
  const baseId = useId().replace(/:/g, "");

  return (
    <svg viewBox={`0 0 ${w} ${height}`} width="100%" preserveAspectRatio="none" style={{ overflow: "visible" }}>
      {data.map((d, i) => {
        const v = d[valueKey] as number;
        const bw = (v / max) * barW;
        const y = padT + i * rowH;
        const cy = y + rowH / 2;
        const isTop = accentTop && i === 0;
        const fill = `var(--viz-${(i % 8) + 1})`;
        const stroke = fill;
        const gradId = `${baseId}-grad-${i}`;

        return (
          <g key={i}>
            <defs>
              <linearGradient id={gradId} x1="0" y1="0" x2="1" y2="0">
                <stop offset="0%" stopColor={fill} stopOpacity="0.3" />
                <stop offset="100%" stopColor={fill} stopOpacity="0.95" />
              </linearGradient>
            </defs>
            <text
              x={labelW}
              y={cy + 4}
              fontSize="13"
              textAnchor="end"
              fontFamily="var(--font-sans)"
              fontWeight={isTop ? 700 : 500}
              fill="var(--text)"
            >
              {d[labelKey]}
            </text>
            <rect
              x={barX}
              y={cy - rowH * 0.32}
              width={Math.max(0, bw)}
              height={rowH * 0.64}
              rx="6"
              fill={style === "outline" ? "transparent" : `url(#${gradId})`}
              stroke={stroke}
              strokeWidth="1.2"
            />
            <text
              x={barX + bw + 8}
              y={cy + 4}
              fontSize="12"
              fontFamily="var(--font-mono)"
              fontWeight="700"
              fill="var(--text)"
            >
              {v}
              {suffix}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

// ── VerticalBars ──────────────────────────────────────────────────────────────
export function VerticalBars({
  data,
  labelKey,
  valueKey,
  suffix = "",
  height = 240,
  target = null,
  subLabelFn,
}: {
  data: Array<Record<string, any>>;
  labelKey: string;
  valueKey: string;
  suffix?: string;
  height?: number;
  target?: number | null;
  subLabelFn?: (d: Record<string, any>) => string;
}) {
  const [zoom, setZoom] = useState(1.0);
  const [scrollLeft, setScrollLeft] = useState(0);
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);

  const { t } = useTweaks();
  const { ref: containerRef, width: containerWidth } = useContainerWidth(600);
  const wrapperRef = useRef<HTMLDivElement>(null);

  const numPoints = data.length;
  if (numPoints === 0) return null;

  const padL = 36, padR = 16, padT = 24, padB = subLabelFn ? 48 : 36;
  const innerH = height - padT - padB;
  const max = Math.max(...data.map((d) => d[valueKey] as number), target ?? 0) * 1.15;

  const baseSpacing = Math.max(50, getBaseSpacing(numPoints) * 2.0);
  const currentSpacing = baseSpacing * zoom;
  const totalNeededWidth = currentSpacing * numPoints + padL + padR;
  const isScrollable = totalNeededWidth > containerWidth;
  const canvasWidth = isScrollable ? totalNeededWidth : containerWidth;

  const bandW = isScrollable 
    ? currentSpacing 
    : (containerWidth - padL - padR) / Math.max(1, numPoints);
  const barW = Math.min(bandW * 0.55, 80);

  const style = chartStyle();
  const baseId = useId().replace(/:/g, "");

  const buffer = 10;
  const startIdx = isScrollable ? Math.max(0, Math.floor((scrollLeft - padL) / bandW) - buffer) : 0;
  const endIdx = isScrollable ? Math.min(numPoints - 1, Math.ceil((scrollLeft + containerWidth - padL) / bandW) + buffer) : numPoints - 1;

  const handleWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    if (e.shiftKey && wrapperRef.current) {
      wrapperRef.current.scrollLeft += e.deltaY;
      e.preventDefault();
    }
  };

  const handleMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const idx = hoverIndexFromPixels(e.clientX, rect.left, padL, bandW, numPoints);
    setHoveredIdx(idx);
  };

  // Find the index of the worst performer
  let worstIdx = -1;
  let maxVal = -Infinity;
  data.forEach((d, idx) => {
    const val = d[valueKey] as number;
    if (typeof val === "number" && val > maxVal) {
      maxVal = val;
      worstIdx = idx;
    }
  });

  return (
    <div ref={containerRef} style={{ position: "relative", width: "100%", minWidth: 0 }} onMouseLeave={() => setHoveredIdx(null)}>
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
          height={height} 
          viewBox={`0 0 ${canvasWidth} ${height}`} 
          style={{ width: canvasWidth, height: height, display: "block" }}
          onMouseMove={handleMouseMove}
        >
          <line x1={padL} x2={canvasWidth - padR} y1={padT + innerH} y2={padT + innerH} stroke="var(--border-strong)" strokeWidth="1.5" />
          {target !== null && target !== undefined && (
            <g>
              <line
                x1={padL}
                x2={canvasWidth - padR}
                y1={padT + innerH - (target / max) * innerH}
                y2={padT + innerH - (target / max) * innerH}
                stroke="var(--border-strong)"
                strokeWidth="1"
                strokeDasharray="4 4"
                opacity="0.55"
              />
              <text
                x={canvasWidth - padR}
                y={padT + innerH - (target / max) * innerH - 4}
                fontSize="11"
                fontWeight="700"
                textAnchor="end"
                fontFamily="var(--font-mono)"
                fill="var(--text-3)"
              >
                target {target}{suffix}
              </text>
            </g>
          )}

          {/* Hover Crosshairs */}
          {hoveredIdx !== null && (
            <g>
              <line x1={padL + hoveredIdx * bandW + bandW / 2} y1={padT} x2={padL + hoveredIdx * bandW + bandW / 2} y2={padT + innerH} stroke="var(--text-3)" strokeWidth={1} strokeDasharray="3,3" />
              <line x1={padL} y1={padT + innerH - ((data[hoveredIdx][valueKey] as number) / max) * innerH} x2={canvasWidth - padR} y2={padT + innerH - ((data[hoveredIdx][valueKey] as number) / max) * innerH} stroke="var(--text-3)" strokeWidth={1} strokeDasharray="3,3" />
            </g>
          )}

          {data.map((d, i) => {
            if (i < startIdx || i > endIdx) return null;
            const v = d[valueKey] as number;
            const bh = (v / max) * innerH;
            const x = padL + i * bandW + bandW / 2 - barW / 2;
            const y = padT + innerH - bh;
            
            const isWorst = i === worstIdx;
            const fill = isWorst ? "var(--critical)" : "var(--viz-1)";
            const gradId = `${baseId}-vgrad-${i}`;
            return (
              <g key={i}>
                <defs>
                  <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={fill} stopOpacity="0.95" />
                    <stop offset="100%" stopColor={fill} stopOpacity="0.3" />
                  </linearGradient>
                </defs>
                <rect
                  x={x}
                  y={y}
                  width={barW}
                  height={Math.max(0, bh)}
                  rx="6"
                  fill={style === "outline" ? "transparent" : `url(#${gradId})`}
                  stroke={fill}
                  strokeWidth="1.2"
                  style={{ cursor: "pointer" }}
                />
                {isWorst && (
                  <text
                    x={x + barW / 2}
                    y={y - 24}
                    fontSize="11"
                    fontWeight="800"
                    textAnchor="middle"
                    fill="var(--critical)"
                    fontFamily="var(--font-sans)"
                    letterSpacing="0.05em"
                  >
                    ▲ WORST
                  </text>
                )}
                <text
                  x={x + barW / 2}
                  y={y - 8}
                  fontSize={v > 1000 ? "13" : "15"}
                  fontWeight="800"
                  textAnchor="middle"
                  fontFamily="var(--font-mono)"
                  fill={isWorst ? "var(--critical)" : "var(--text)"}
                >
                  {typeof v === "number" ? v.toFixed(2) : v}
                  {suffix}
                </text>
                
                {/* Thin out labels dynamically */}
                {shouldShowLabel(d[labelKey], i, data.map(pt => pt[labelKey]), bandW, t.grain) && (
                  <text
                    x={padL + i * bandW + bandW / 2}
                    y={padT + innerH + 18}
                    fontSize="12"
                    textAnchor="middle"
                    fontFamily="var(--font-sans)"
                    fill="var(--text-2)"
                    fontWeight="600"
                    letterSpacing="0.04em"
                  >
                    {d[labelKey]}
                  </text>
                )}
                {subLabelFn && shouldShowLabel(d[labelKey], i, data.map(pt => pt[labelKey]), bandW, t.grain) && (
                  <text
                    x={padL + i * bandW + bandW / 2}
                    y={padT + innerH + 32}
                    fontSize="11"
                    textAnchor="middle"
                    fontFamily="var(--font-mono)"
                    fill="var(--text-3)"
                    fontWeight="600"
                  >
                    {subLabelFn(d)}
                  </text>
                )}
              </g>
            );
          })}
        </svg>

        {hoveredIdx !== null && data[hoveredIdx] && (
          <div
            style={{
              position: "absolute",
              left: padL + hoveredIdx * bandW + bandW / 2,
              top: padT + innerH - ((data[hoveredIdx][valueKey] as number) / max) * innerH - 14,
              transform: "translate(-50%, -100%)",
              pointerEvents: "none",
              background: "var(--surface)",
              border: "1px solid var(--border-strong)",
              borderRadius: "var(--radius-sm)",
              boxShadow: "0 6px 20px rgba(0,0,0,0.18)",
              padding: "6px 8px",
              zIndex: 30,
              whiteSpace: "nowrap",
              fontSize: 11,
            }}
          >
            <div style={{ fontWeight: 700, color: "var(--text)", marginBottom: 2 }}>{data[hoveredIdx][labelKey]}</div>
            <div style={{ color: hoveredIdx === worstIdx ? "var(--critical)" : "var(--viz-1)", fontFamily: "var(--font-mono)", fontWeight: 800 }}>
              Value: {(data[hoveredIdx][valueKey] as number).toFixed(2)}{suffix}
            </div>
            {subLabelFn && (
              <div style={{ fontSize: 10, color: "var(--text-3)", marginTop: 2 }}>
                {subLabelFn(data[hoveredIdx])}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Donut ─────────────────────────────────────────────────────────────────────
export function Donut({
  data,
  valueKey,
  labelKey,
  size = 220,
  centerLabel = "TOTAL",
}: {
  data: Array<Record<string, any>>;
  valueKey: string;
  labelKey: string;
  size?: number;
  centerLabel?: string;
}) {
  const total = data.reduce((s, d) => s + (d[valueKey] as number), 0);
  const cx = size / 2;
  const cy = size / 2;
  const r = size / 2 - 12;
  const inner = r * 0.62;
  const style = chartStyle();

  function sliceColor(label: string, i: number) {
    const l = label.toLowerCase();
    if (l.includes("reject") || l.includes("defect") || l.includes("fail")) {
      return "var(--critical)";
    }
    if (l.includes("accept") || l.includes("pass") || l.includes("ok") || l.includes("good")) {
      return "var(--positive)";
    }
    if (l.includes("hold")) {
      return "var(--warning)";
    }
    return `var(--viz-${(i % 8) + 1})`;
  }

  let cursor = -Math.PI / 2;
  return (
    <svg viewBox={`0 0 ${size} ${size + 8}`} width="100%" style={{ overflow: "visible" }}>
      {data.map((d, i) => {
        const v = d[valueKey] as number;
        const angle = (v / Math.max(1, total)) * Math.PI * 2;
        const x1 = cx + Math.cos(cursor) * r;
        const y1 = cy + Math.sin(cursor) * r;
        const x2 = cx + Math.cos(cursor + angle) * r;
        const y2 = cy + Math.sin(cursor + angle) * r;
        const ix1 = cx + Math.cos(cursor + angle) * inner;
        const iy1 = cy + Math.sin(cursor + angle) * inner;
        const ix2 = cx + Math.cos(cursor) * inner;
        const iy2 = cy + Math.sin(cursor) * inner;
        const large = angle > Math.PI ? 1 : 0;
        const path = [
          `M ${x1} ${y1}`,
          `A ${r} ${r} 0 ${large} 1 ${x2} ${y2}`,
          `L ${ix1} ${iy1}`,
          `A ${inner} ${inner} 0 ${large} 0 ${ix2} ${iy2}`,
          "Z",
        ].join(" ");
        const label = d[labelKey] || "";
        const fill = style === "outline" ? "transparent" : sliceColor(label, i);
        cursor += angle;
        return (
          <path
            key={`${d[labelKey]}-${i}`}
            d={path}
            fill={fill}
            stroke={sliceColor(label, i)}
            strokeWidth="1"
          />
        );
      })}
      <text
        x={cx}
        y={cy - 4}
        fontSize="11"
        textAnchor="middle"
        fontFamily="var(--font-sans)"
        fill="var(--text-3)"
        letterSpacing="0.12em"
      >
        {centerLabel}
      </text>
      <text
        x={cx}
        y={cy + 16}
        fontSize="26"
        fontWeight="800"
        textAnchor="middle"
        fontFamily="var(--font-display)"
        fill="var(--text)"
      >
        {total}
      </text>
    </svg>
  );
}

// ── Sparkline ─────────────────────────────────────────────────────────────────
export function Sparkline({
  values,
  height = 36,
  width = 140,
  trend = "up-bad",
}: {
  values: number[];
  height?: number;
  width?: number;
  trend?: string;
}) {
  // Hooks must run unconditionally — call useId BEFORE any early return,
  // otherwise a sparkline whose history crosses the 2-point threshold between
  // renders changes its hook count and crashes (Rules of Hooks).
  const baseId = useId().replace(/:/g, "");
  if (!values || values.length < 2) return null;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const xs = (i: number) => (i * width) / (values.length - 1);
  const ys = (v: number) => height - 2 - ((v - min) / Math.max(0.0001, max - min || 1)) * (height - 4);
  const d = buildBezierPath(values, xs, ys);
  const isBad = trend.includes("bad");
  const color = isBad ? "var(--critical)" : "var(--positive)";
  const gradId = `${baseId}-spark-grad`;
  const areaPath = d + ` L ${xs(values.length - 1)} ${height} L ${xs(0)} ${height} Z`;

  return (
    <svg viewBox={`0 0 ${width} ${height}`} width={width} height={height} style={{ overflow: "visible" }}>
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.22" />
          <stop offset="100%" stopColor={color} stopOpacity="0.0" />
        </linearGradient>
      </defs>
      <path d={areaPath} fill={`url(#${gradId})`} />
      <path d={d} fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" />
      <circle cx={xs(values.length - 1)} cy={ys(values[values.length - 1])} r="2.5" fill={color} />
    </svg>
  );
}

// ── DualLine (for forecast/comparison slides) ─────────────────────────────────
export function DualLine({
  data,
  height = 200,
}: {
  data: Record<string, Array<number | null>>;
  height?: number;
}) {
  const [zoom, setZoom] = useState(1.0);
  const [scrollLeft, setScrollLeft] = useState(0);
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);

  const { t } = useTweaks();
  const { ref: containerRef, width: containerWidth } = useContainerWidth(600);
  const wrapperRef = useRef<HTMLDivElement>(null);

  const keys = Object.keys(data);
  if (keys.length === 0) return null;

  const allVals = keys.flatMap((k) => data[k].filter((v): v is number => v !== null));
  const len = data[keys[0]].length;
  const numPoints = len;

  const padL = 32, padR = 16, padT = 12, padB = 26;
  const innerH = height - padT - padB;
  const min = Math.min(...allVals) * 0.95;
  const max = Math.max(...allVals) * 1.05;

  const baseSpacing = getBaseSpacing(numPoints);
  const currentSpacing = baseSpacing * zoom;
  const totalNeededWidth = currentSpacing * Math.max(numPoints - 1, 1) + padL + padR;
  const isScrollable = totalNeededWidth > containerWidth;
  const canvasWidth = isScrollable ? totalNeededWidth : containerWidth;

  const spacing = isScrollable 
    ? currentSpacing 
    : (containerWidth - padL - padR) / Math.max(numPoints - 1, 1);

  const xs = (i: number) => padL + i * spacing;
  const ys = (v: number) => padT + innerH - ((v - min) / Math.max(0.0001, max - min)) * innerH;

  const buffer = 10;
  const startIdx = isScrollable ? Math.max(0, Math.floor((scrollLeft - padL) / spacing) - buffer) : 0;
  const endIdx = isScrollable ? Math.min(numPoints - 1, Math.ceil((scrollLeft + containerWidth - padL) / spacing) + buffer) : numPoints - 1;

  const colors = ["var(--viz-1)", "var(--viz-2)"];

  const handleWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    if (e.shiftKey && wrapperRef.current) {
      wrapperRef.current.scrollLeft += e.deltaY;
      e.preventDefault();
    }
  };

  const handleMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const idx = hoverIndexFromPixels(e.clientX, rect.left, padL, spacing, numPoints);
    setHoveredIdx(idx);
  };

  return (
    <div ref={containerRef} style={{ position: "relative", width: "100%", minWidth: 0 }} onMouseLeave={() => setHoveredIdx(null)}>
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
          height={height}
          viewBox={`0 0 ${canvasWidth} ${height}`}
          style={{ overflow: "visible", display: "block" }}
          onMouseMove={handleMouseMove}
        >
          <line x1={padL} x2={canvasWidth - padR} y1={padT + innerH} y2={padT + innerH} stroke="var(--border-strong)" strokeWidth="1.5" />
          
          {/* Hover Crosshairs */}
          {hoveredIdx !== null && (
            <g>
              <line x1={xs(hoveredIdx)} y1={padT} x2={xs(hoveredIdx)} y2={padT + innerH} stroke="var(--text-3)" strokeWidth={1} strokeDasharray="3,3" />
            </g>
          )}

          {keys.map((k, ki) => {
            const vals = data[k];
            const visibleVals = vals.slice(startIdx, endIdx + 1);
            const segments: string[] = [];
            let currentGroup: Array<{ v: number; i: number }> = [];
            
            visibleVals.forEach((v, i) => {
              const globalIdx = startIdx + i;
              if (v === null) {
                if (currentGroup.length > 0) {
                  segments.push(
                    buildBezierPath(
                      currentGroup.map((g) => g.v),
                      (idx) => xs(currentGroup[idx].i),
                      (val) => ys(val),
                    ),
                  );
                  currentGroup = [];
                }
              } else {
                currentGroup.push({ v, i: globalIdx });
              }
            });
            if (currentGroup.length > 0) {
              segments.push(
                buildBezierPath(
                  currentGroup.map((g) => g.v),
                  (idx) => xs(currentGroup[idx].i),
                  (val) => ys(val),
                ),
              );
            }
            
            const isForecast = k.toLowerCase().includes("forecast");
            return (
              <g key={k}>
                {segments.map((d, di) => (
                  <path
                    key={di}
                    d={d}
                    fill="none"
                    stroke={colors[ki % colors.length]}
                    strokeWidth="2.25"
                    strokeDasharray={isForecast ? "5 4" : "0"}
                    strokeLinecap="round"
                  />
                ))}
                {vals.map((v, i) => {
                  if (i < startIdx || i > endIdx) return null;
                  return v !== null ? (
                    <circle
                      key={i}
                      cx={xs(i)}
                      cy={ys(v)}
                      r="3"
                      fill={colors[ki % colors.length]}
                      stroke="var(--surface)"
                      strokeWidth="1.5"
                    />
                  ) : null;
                })}
              </g>
            );
          })}
          <g transform={`translate(${padL}, ${height - 4})`}>
            {keys.map((k, i) => (
              <g key={k} transform={`translate(${i * 110}, 0)`}>
                <rect x="0" y="-9" width="14" height="3" fill={colors[i % colors.length]} />
                <text x="20" y="0" fontSize="12" fontWeight="700" fontFamily="var(--font-sans)" fill="var(--text-2)" letterSpacing="0.08em">
                  {k.toUpperCase()}
                </text>
              </g>
            ))}
          </g>
        </svg>

        {hoveredIdx !== null && (
          <div
            style={{
              position: "absolute",
              left: xs(hoveredIdx),
              top: padT + 10,
              transform: "translateX(-50%)",
              pointerEvents: "none",
              background: "var(--surface)",
              border: "1px solid var(--border-strong)",
              borderRadius: "var(--radius-sm)",
              boxShadow: "0 6px 20px rgba(0,0,0,0.18)",
              padding: "6px 8px",
              zIndex: 30,
              whiteSpace: "nowrap",
              fontSize: 11,
            }}
          >
            <div style={{ fontWeight: 700, color: "var(--text)", marginBottom: 4 }}>Index: {hoveredIdx + 1}</div>
            {keys.map((k, ki) => {
              const val = data[k][hoveredIdx];
              if (val === null || val === undefined) return null;
              return (
                <div key={k} style={{ display: "flex", gap: 12, justifyContent: "space-between", fontSize: 11, lineHeight: 1.5 }}>
                  <span style={{ color: colors[ki % colors.length] }}>{k}:</span>
                  <span style={{ fontWeight: 700, color: "var(--text)" }}>{val.toFixed(2)}%</span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
