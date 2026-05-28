"use client";

/**
 * Inline SVG editorial charts. Each chart respects the body[data-chart-style]
 * tweak: "filled" | "outline" | "minimal". Colors come from CSS variables so
 * they live-update with the accent tweak.
 */

function buildLinePath(values: number[], xs: (i: number) => number, ys: (v: number) => number) {
  return values.map((v, i) => `${i === 0 ? "M" : "L"} ${xs(i)} ${ys(v)}`).join(" ");
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
  const w = 600;
  const h = height;
  const padL = 40, padR = 16, padT = 16, padB = 30;
  const innerW = w - padL - padR;
  const innerH = h - padT - padB;
  const min = Math.min(...values, target ?? Infinity) * 0.94;
  const max = Math.max(...values, target ?? -Infinity) * 1.06;
  const xs = (i: number) => padL + (i * innerW) / Math.max(1, values.length - 1);
  const ys = (v: number) => padT + innerH - ((v - min) / Math.max(0.0001, max - min)) * innerH;
  const path = buildLinePath(values, xs, ys);
  const areaPath =
    path + ` L ${xs(values.length - 1)} ${padT + innerH} L ${xs(0)} ${padT + innerH} Z`;
  const style = chartStyle();
  const lastIdx = values.length - 1;

  return (
    <svg
      viewBox={`0 0 ${w} ${h}`}
      width="100%"
      preserveAspectRatio="none"
      style={{ overflow: "visible" }}
    >
      {[0, 0.25, 0.5, 0.75, 1].map((p, i) => (
        <line
          key={i}
          x1={padL}
          x2={w - padR}
          y1={padT + innerH * p}
          y2={padT + innerH * p}
          stroke="var(--hairline)"
          strokeWidth="1"
        />
      ))}
      <line
        x1={padL}
        x2={w - padR}
        y1={padT + innerH}
        y2={padT + innerH}
        stroke="var(--ink)"
        strokeWidth="1.5"
      />
      {showTarget && target !== undefined && (
        <g>
          <line
            x1={padL}
            x2={w - padR}
            y1={ys(target)}
            y2={ys(target)}
            stroke="var(--ink)"
            strokeWidth="1"
            strokeDasharray="4 4"
            opacity="0.55"
          />
          <text
            x={w - padR}
            y={ys(target) - 6}
            fontSize="10"
            textAnchor="end"
            fontFamily="var(--mono)"
            fill="var(--ink)"
          >
            target {target.toFixed(2)}
          </text>
        </g>
      )}
      {style === "filled" && <path d={areaPath} fill="var(--accent)" opacity="0.10" />}
      <path
        d={path}
        fill="none"
        stroke={style === "minimal" ? "var(--ink)" : "var(--accent)"}
        strokeWidth={style === "minimal" ? 1.5 : 2.25}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {values.map((v, i) => {
        const r = i === lastIdx ? 5 : style === "minimal" ? 0 : 3;
        const isAccent = i === lastIdx || i === accentIdx;
        return (
          <circle
            key={i}
            cx={xs(i)}
            cy={ys(v)}
            r={r}
            fill={isAccent ? "var(--accent)" : "var(--paper-soft)"}
            stroke={isAccent ? "var(--accent)" : "var(--ink)"}
            strokeWidth="1.5"
          />
        );
      })}
      <text
        x={xs(lastIdx) + 10}
        y={ys(values[lastIdx]) - 10}
        fontSize="13"
        fontFamily="var(--mono)"
        fontWeight="600"
        fill="var(--accent)"
      >
        {values[lastIdx].toFixed(2)}
      </text>
      {cycles.map((c, i) => (
        <text
          key={`${c}-${i}`}
          x={xs(i)}
          y={h - 8}
          fontSize="11"
          textAnchor="middle"
          fontFamily="var(--sans)"
          fill="var(--muted)"
          letterSpacing="0.1em"
        >
          {c.toUpperCase()}
        </text>
      ))}
    </svg>
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

  return (
    <svg viewBox={`0 0 ${w} ${height}`} width="100%" preserveAspectRatio="none" style={{ overflow: "visible" }}>
      {data.map((d, i) => {
        const v = d[valueKey] as number;
        const bw = (v / max) * barW;
        const y = padT + i * rowH;
        const cy = y + rowH / 2;
        const isTop = accentTop && i === 0;
        const fill = isTop ? "var(--accent)" : style === "minimal" ? "transparent" : "var(--ink)";
        const stroke = isTop ? "var(--accent)" : "var(--ink)";

        return (
          <g key={i}>
            <text
              x={labelW}
              y={cy + 4}
              fontSize="13"
              textAnchor="end"
              fontFamily="var(--sans)"
              fontWeight={isTop ? 600 : 500}
              fill="var(--ink)"
            >
              {d[labelKey]}
            </text>
            <rect
              x={barX}
              y={cy - rowH * 0.32}
              width={Math.max(0, bw)}
              height={rowH * 0.64}
              fill={style === "outline" ? "transparent" : fill}
              stroke={style === "outline" ? stroke : "none"}
              strokeWidth="1.5"
            />
            <text
              x={barX + bw + 8}
              y={cy + 4}
              fontSize="12"
              fontFamily="var(--mono)"
              fontWeight="600"
              fill="var(--ink)"
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
  accentIdx = 0,
  subLabelFn,
}: {
  data: Array<Record<string, any>>;
  labelKey: string;
  valueKey: string;
  suffix?: string;
  height?: number;
  target?: number | null;
  accentIdx?: number;
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

  return (
    <svg viewBox={`0 0 ${w} ${height}`} width="100%" preserveAspectRatio="none" style={{ overflow: "visible" }}>
      <line x1={padL} x2={w - padR} y1={padT + innerH} y2={padT + innerH} stroke="var(--ink)" strokeWidth="1.5" />
      {target !== null && target !== undefined && (
        <g>
          <line
            x1={padL}
            x2={w - padR}
            y1={padT + innerH - (target / max) * innerH}
            y2={padT + innerH - (target / max) * innerH}
            stroke="var(--ink)"
            strokeWidth="1"
            strokeDasharray="4 4"
            opacity="0.55"
          />
          <text
            x={w - padR}
            y={padT + innerH - (target / max) * innerH - 4}
            fontSize="10"
            textAnchor="end"
            fontFamily="var(--mono)"
            fill="var(--ink)"
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
        const isAccent = i === accentIdx;
        const fill = isAccent ? "var(--accent)" : style === "minimal" ? "transparent" : "var(--ink)";
        return (
          <g key={i}>
            <rect
              x={x}
              y={y}
              width={barW}
              height={Math.max(0, bh)}
              fill={style === "outline" ? "transparent" : fill}
              stroke={style === "outline" ? (isAccent ? "var(--accent)" : "var(--ink)") : "none"}
              strokeWidth="1.5"
            />
            <text
              x={x + barW / 2}
              y={y - 8}
              fontSize="14"
              fontWeight="600"
              textAnchor="middle"
              fontFamily="var(--mono)"
              fill="var(--ink)"
            >
              {typeof v === "number" ? v.toFixed(2) : v}
              {suffix}
            </text>
            <text
              x={padL + i * bandW + bandW / 2}
              y={padT + innerH + 18}
              fontSize="11"
              textAnchor="middle"
              fontFamily="var(--sans)"
              fill="var(--ink)"
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
                fontFamily="var(--mono)"
                fill="var(--muted)"
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

  function sliceColor(i: number) {
    if (i === 0) return "var(--accent)";
    const palette = ["#1F1D18", "#3F3D34", "#615C50", "#85806F", "#A8A28F", "#C9C0A6"];
    return palette[(i - 1) % palette.length];
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
        const fill = style === "outline" ? "transparent" : sliceColor(i);
        cursor += angle;
        return (
          <path
            key={`${d[labelKey]}-${i}`}
            d={path}
            fill={fill}
            stroke={sliceColor(i)}
            strokeWidth="1"
          />
        );
      })}
      <text
        x={cx}
        y={cy - 4}
        fontSize="11"
        textAnchor="middle"
        fontFamily="var(--sans)"
        fill="var(--muted)"
        letterSpacing="0.12em"
      >
        {centerLabel}
      </text>
      <text
        x={cx}
        y={cy + 16}
        fontSize="26"
        fontWeight="700"
        textAnchor="middle"
        fontFamily="var(--serif)"
        fill="var(--ink)"
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
  if (!values || values.length < 2) return null;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const xs = (i: number) => (i * width) / (values.length - 1);
  const ys = (v: number) => height - 2 - ((v - min) / Math.max(0.0001, max - min || 1)) * (height - 4);
  const d = buildLinePath(values, xs, ys);
  const isBad = trend.includes("bad");
  const color = isBad ? "var(--accent)" : "var(--positive)";
  return (
    <svg viewBox={`0 0 ${width} ${height}`} width={width} height={height} style={{ overflow: "visible" }}>
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
  const w = 600, padL = 32, padR = 16, padT = 12, padB = 26;
  const innerW = w - padL - padR;
  const innerH = height - padT - padB;
  const min = Math.min(...allVals) * 0.95;
  const max = Math.max(...allVals) * 1.05;
  const xs = (i: number) => padL + (i * innerW) / Math.max(1, len - 1);
  const ys = (v: number) => padT + innerH - ((v - min) / Math.max(0.0001, max - min)) * innerH;

  const colors = ["var(--accent)", "var(--ink)"];

  return (
    <svg viewBox={`0 0 ${w} ${height}`} width="100%" style={{ overflow: "visible" }}>
      <line x1={padL} x2={w - padR} y1={padT + innerH} y2={padT + innerH} stroke="var(--ink)" strokeWidth="1.5" />
      {keys.map((k, ki) => {
        const vals = data[k];
        const segments: string[] = [];
        let current = "";
        vals.forEach((v, i) => {
          if (v === null) {
            if (current) segments.push(current);
            current = "";
          } else {
            current += `${current === "" ? "M" : "L"} ${xs(i)} ${ys(v)} `;
          }
        });
        if (current) segments.push(current);
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
                  stroke="var(--paper-soft)"
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
            <text x="20" y="0" fontSize="10" fontFamily="var(--sans)" fill="var(--muted)" letterSpacing="0.08em">
              {k.toUpperCase()}
            </text>
          </g>
        ))}
      </g>
    </svg>
  );
}
