import { useId, useState } from "react";

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
  const w = Math.max(600, values.length * 16);
  const h = height;
  const padL = 40, padR = 16, padT = 16, padB = 30;
  const innerW = w - padL - padR;
  const innerH = h - padT - padB;
  const min = Math.min(...values, target ?? Infinity) * 0.94;
  const max = Math.max(...values, target ?? -Infinity) * 1.06;
  const xs = (i: number) => padL + (i * innerW) / Math.max(1, values.length - 1);
  const ys = (v: number) => padT + innerH - ((v - min) / Math.max(0.0001, max - min)) * innerH;
  const path = buildBezierPath(values, xs, ys);
  const areaPath =
    path + ` L ${xs(values.length - 1)} ${padT + innerH} L ${xs(0)} ${padT + innerH} Z`;
  const style = chartStyle();
  const lastIdx = values.length - 1;
  const gradId = useId().replace(/:/g, "");

  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);

  const pointDistance = innerW / Math.max(1, values.length - 1);
  const labelStep = Math.max(1, Math.ceil(75 / pointDistance));

  return (
    <div style={{ overflowX: "auto", width: "100%" }}>
      <svg
        viewBox={`0 0 ${w} ${h}`}
        width="100%"
        preserveAspectRatio="none"
        style={{ overflow: "visible", minWidth: `${w}px`, display: "block" }}
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
          x2={w - padR}
          y1={padT + innerH * p}
          y2={padT + innerH * p}
          stroke="var(--border)"
          strokeWidth="1"
        />
      ))}
      <line
        x1={padL}
        x2={w - padR}
        y1={padT + innerH}
        y2={padT + innerH}
        stroke="var(--border-strong)"
        strokeWidth="1.5"
      />
      {showTarget && target !== undefined && (
        <g>
          <line
            x1={padL}
            x2={w - padR}
            y1={ys(target)}
            y2={ys(target)}
            stroke="var(--text-3)"
            strokeWidth="1"
            strokeDasharray="4 4"
            opacity="0.55"
          />
          <text
            x={w - padR}
            y={ys(target) - 6}
            fontSize="10"
            textAnchor="end"
            fontFamily="var(--font-mono)"
            fill="var(--text-3)"
          >
            target {target.toFixed(2)}
          </text>
        </g>
      )}
      {style === "filled" && <path d={areaPath} fill={`url(#${gradId})`} />}
      <path
        d={path}
        fill="none"
        stroke={style === "minimal" ? "var(--text)" : "var(--viz-1)"}
        strokeWidth={style === "minimal" ? 1.5 : 2.25}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {values.map((v, i) => {
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
            onMouseEnter={() => setHoveredIdx(i)}
            onMouseLeave={() => setHoveredIdx(null)}
            style={{ cursor: "pointer", transition: "r 0.15s ease" }}
          />
        );
      })}
      {hoveredIdx === null && (
        <text
          x={xs(lastIdx) + 10}
          y={ys(values[lastIdx]) - 10}
          fontSize="13"
          fontFamily="var(--font-mono)"
          fontWeight="800"
          fill="var(--viz-1)"
        >
          {values[lastIdx].toFixed(2)}%
        </text>
      )}
      {hoveredIdx !== null && (
        <g pointerEvents="none">
          <rect
            x={xs(hoveredIdx) - 60}
            y={ys(values[hoveredIdx]) - 54}
            width={120}
            height={44}
            rx={6}
            fill="var(--surface)"
            stroke="var(--border-strong)"
            strokeWidth="1"
          />
          <text
            x={xs(hoveredIdx)}
            y={ys(values[hoveredIdx]) - 38}
            fontSize="10"
            fontWeight="700"
            textAnchor="middle"
            fill="var(--text-2)"
            fontFamily="var(--font-sans)"
            letterSpacing="0.04em"
          >
            {cycles[hoveredIdx].toUpperCase()}
          </text>
          <text
            x={xs(hoveredIdx)}
            y={ys(values[hoveredIdx]) - 22}
            fontSize="13"
            textAnchor="middle"
            fill="var(--viz-1)"
            fontFamily="var(--font-mono)"
            fontWeight="800"
          >
            {values[hoveredIdx].toFixed(2)}%
          </text>
          <line
            x1={xs(hoveredIdx)}
            x2={xs(hoveredIdx)}
            y1={ys(values[hoveredIdx]) - 10}
            y2={ys(values[hoveredIdx])}
            stroke="var(--viz-1)"
            strokeWidth="1"
            strokeDasharray="2 2"
          />
        </g>
      )}
      {cycles.map((c, i) => {
        if (i % labelStep !== 0) return null;
        return (
          <text
            key={`${c}-${i}`}
            x={xs(i)}
            y={h - 8}
            fontSize="11"
            textAnchor="middle"
            fontFamily="var(--font-sans)"
            fill="var(--text-3)"
            letterSpacing="0.1em"
          >
            {c.toUpperCase()}
          </text>
        );
      })}
    </svg>
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
  const w = 600;
  const padL = 36, padR = 16, padT = 24, padB = subLabelFn ? 48 : 36;
  const innerW = w - padL - padR;
  const innerH = height - padT - padB;
  const max = Math.max(...data.map((d) => d[valueKey] as number), target ?? 0) * 1.15;
  const bandW = innerW / Math.max(1, data.length);
  const barW = Math.min(bandW * 0.55, 80);
  const style = chartStyle();

  const baseId = useId().replace(/:/g, "");

  // Find the index of the worst performer (highest valueKey, since rates and defect counts are "higher is worse")
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
    <svg viewBox={`0 0 ${w} ${height}`} width="100%" preserveAspectRatio="none" style={{ overflow: "visible" }}>
      <line x1={padL} x2={w - padR} y1={padT + innerH} y2={padT + innerH} stroke="var(--border-strong)" strokeWidth="1.5" />
      {target !== null && target !== undefined && (
        <g>
          <line
            x1={padL}
            x2={w - padR}
            y1={padT + innerH - (target / max) * innerH}
            y2={padT + innerH - (target / max) * innerH}
            stroke="var(--border-strong)"
            strokeWidth="1"
            strokeDasharray="4 4"
            opacity="0.55"
          />
          <text
            x={w - padR}
            y={padT + innerH - (target / max) * innerH - 4}
            fontSize="10"
            textAnchor="end"
            fontFamily="var(--font-mono)"
            fill="var(--text-3)"
          >
            target {target}{suffix}
          </text>
        </g>
      )}
      {data.map((d, i) => {
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
            />
            {isWorst && (
              <text
                x={x + barW / 2}
                y={y - 24}
                fontSize="9"
                fontWeight="700"
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
              fontSize="14"
              fontWeight="800"
              textAnchor="middle"
              fontFamily="var(--font-mono)"
              fill={isWorst ? "var(--critical)" : "var(--text)"}
            >
              {typeof v === "number" ? v.toFixed(2) : v}
              {suffix}
            </text>
            <text
              x={padL + i * bandW + bandW / 2}
              y={padT + innerH + 18}
              fontSize="11"
              textAnchor="middle"
              fontFamily="var(--font-sans)"
              fill="var(--text-2)"
              fontWeight="500"
              letterSpacing="0.04em"
            >
              {d[labelKey]}
            </text>
            {subLabelFn && (
              <text
                x={padL + i * bandW + bandW / 2}
                y={padT + innerH + 32}
                fontSize="10"
                textAnchor="middle"
                fontFamily="var(--font-mono)"
                fill="var(--text-3)"
              >
                {subLabelFn(d)}
              </text>
            )}
          </g>
        );
      })}
    </svg>
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
  const keys = Object.keys(data);
  if (keys.length === 0) return null;
  const allVals = keys.flatMap((k) => data[k].filter((v): v is number => v !== null));
  const len = data[keys[0]].length;
  const w = Math.max(600, len * 16);
  const padL = 32, padR = 16, padT = 12, padB = 26;
  const innerW = w - padL - padR;
  const innerH = height - padT - padB;
  const min = Math.min(...allVals) * 0.95;
  const max = Math.max(...allVals) * 1.05;
  const xs = (i: number) => padL + (i * innerW) / Math.max(1, len - 1);
  const ys = (v: number) => padT + innerH - ((v - min) / Math.max(0.0001, max - min)) * innerH;

  const colors = ["var(--viz-1)", "var(--viz-2)"];

  return (
    <div style={{ overflowX: "auto", width: "100%" }}>
      <svg
        viewBox={`0 0 ${w} ${height}`}
        width="100%"
        preserveAspectRatio="none"
        style={{ overflow: "visible", minWidth: `${w}px`, display: "block" }}
      >
      <line x1={padL} x2={w - padR} y1={padT + innerH} y2={padT + innerH} stroke="var(--border-strong)" strokeWidth="1.5" />
      {keys.map((k, ki) => {
        const vals = data[k];
        const segments: string[] = [];
        let currentGroup: Array<{ v: number; i: number }> = [];
        
        vals.forEach((v, i) => {
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
            currentGroup.push({ v, i });
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
            {vals.map((v, i) =>
              v !== null ? (
                <circle
                  key={i}
                  cx={xs(i)}
                  cy={ys(v)}
                  r="3"
                  fill={colors[ki % colors.length]}
                  stroke="var(--surface)"
                  strokeWidth="1.5"
                />
              ) : null,
            )}
          </g>
        );
      })}
      <g transform={`translate(${padL}, ${height - 4})`}>
        {keys.map((k, i) => (
          <g key={k} transform={`translate(${i * 110}, 0)`}>
            <rect x="0" y="-9" width="14" height="3" fill={colors[i % colors.length]} />
            <text x="20" y="0" fontSize="10" fontFamily="var(--font-sans)" fill="var(--text-3)" letterSpacing="0.08em">
              {k.toUpperCase()}
            </text>
          </g>
        ))}
      </g>
    </svg>
    </div>
  );
}
