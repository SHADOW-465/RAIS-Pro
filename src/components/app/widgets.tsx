"use client";

import { useState } from "react";
import type { SeriesPoint, StageRow, DefectRow, StageTrendPoint } from "@/lib/analytics";
import Icon from "@/components/editorial/Icon";

/** Shared hover tooltip card used by every time-series chart. Positioned over the
 *  chart container at the hovered point; flips below when the point sits high. */
function ChartTip({
  leftPct, topPct, below, title, rows,
}: {
  leftPct: number;
  topPct: number;
  below: boolean;
  title: string;
  rows: { label: string; value: string; color?: string }[];
}) {
  const clampedLeft = Math.max(6, Math.min(94, leftPct));
  return (
    <div
      style={{
        position: "absolute",
        left: `${clampedLeft}%`,
        top: `${topPct}%`,
        transform: below ? "translate(-50%, 12px)" : "translate(-50%, calc(-100% - 12px))",
        background: "var(--surface)",
        border: "1px solid var(--border-strong)",
        borderRadius: "var(--radius-sm)",
        boxShadow: "0 6px 20px rgba(0,0,0,0.18)",
        padding: "8px 10px",
        pointerEvents: "none",
        zIndex: 30,
        minWidth: 130,
        whiteSpace: "nowrap",
      }}
    >
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

/** Nearest data index under the pointer, in a viewBox-width-W chart. */
function hoverIndexFromEvent(e: React.MouseEvent<SVGSVGElement>, W: number, padX: number, n: number): number {
  const r = e.currentTarget.getBoundingClientRect();
  const relX = ((e.clientX - r.left) / Math.max(r.width, 1)) * W;
  const idx = Math.round(((relX - padX) / Math.max(W - padX * 2, 1)) * (n - 1));
  return Math.max(0, Math.min(n - 1, idx));
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
        cursor: onClick ? "pointer" : "default"
      }}
    >
      {title && (
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 12 }}>
          <span style={{ fontSize: 13, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--text-3)" }}>{title}</span>
          {sub && <span className="muted" style={{ fontSize: 11 }}>{sub}</span>}
        </div>
      )}
      <div style={{ flex: 1 }}>{children}</div>
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
        cursor: onClick ? "pointer" : "default"
      }}
    >
      <div>
        <div className="muted" style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.06em", fontWeight: 600 }}>{label}</div>
        <div style={{ 
          fontFamily: "var(--font-mono)", 
          fontSize: primary ? 28 : 22, 
          fontWeight: 800, 
          color, 
          margin: "8px 0 2px" 
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

export function LineChart({ points, target, fmt, mean, color = "var(--accent)" }: { points: SeriesPoint[]; target?: number; fmt: (n: number) => string; mean?: boolean; color?: string }) {
  const [hover, setHover] = useState<number | null>(null);
  const W = 660, H = 230, padX = 40, padY = 26;
  const v = points.map((p) => p.value);
  const max = Math.max(...v, target ?? 0, 1e-6);
  const avg = v.length ? v.reduce((a, b) => a + b, 0) / v.length : 0;
  const x = (i: number) => padX + (i / Math.max(points.length - 1, 1)) * (W - padX * 2);
  const y = (val: number) => H - padY - (val / (max || 1)) * (H - padY * 2);
  const step = Math.max(1, Math.ceil(points.length / 12)); // ~12 x-labels max, kept horizontal

  return (
    <div style={{ position: "relative", width: "100%" }} onMouseLeave={() => setHover(null)}>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: "auto", display: "block" }}
        onMouseMove={(e) => setHover(hoverIndexFromEvent(e, W, padX, points.length))}>
        {/* Grid + y-axis value labels */}
        {[0, 0.25, 0.5, 0.75, 1].map((p, i) => (
          <line key={i} x1={padX} y1={padY + (H - padY * 2) * p} x2={W - padX} y2={padY + (H - padY * 2) * p} stroke="var(--border)" strokeWidth={0.5} />
        ))}
        {[0, 0.5, 1].map((p, i) => (
          <text key={`yl${i}`} x={padX - 6} y={padY + (H - padY * 2) * p + 3} fontSize={8.5} textAnchor="end" fill="var(--text-3)" fontFamily="var(--font-mono)">{fmt(max * (1 - p))}</text>
        ))}
        <line x1={padX} y1={H - padY} x2={W - padX} y2={H - padY} stroke="var(--border-strong)" strokeWidth={1} />

        {/* Target line */}
        {target != null && (
          <g>
            <line x1={padX} y1={y(target)} x2={W - padX} y2={y(target)} stroke="var(--critical)" strokeDasharray="5,4" strokeWidth={1.2} />
            <text x={W - padX - 4} y={y(target) - 5} fontSize={8} fill="var(--critical)" fontWeight={700} textAnchor="end">TARGET {fmt(target)}</text>
          </g>
        )}
        {/* Mean line */}
        {mean && (
          <g>
            <line x1={padX} y1={y(avg)} x2={W - padX} y2={y(avg)} stroke="#C8421C" strokeDasharray="6,3" strokeWidth={1.4} />
            <text x={padX + 4} y={y(avg) - 5} fontSize={8} fill="#C8421C" fontWeight={700}>MEAN {fmt(avg)}</text>
          </g>
        )}

        {/* Area + line */}
        {points.length > 1 && (
          <path d={`M ${x(0)} ${H - padY} ` + points.map((p, i) => `L ${x(i)} ${y(p.value)}`).join(" ") + ` L ${x(points.length - 1)} ${H - padY} Z`} fill="var(--accent-weak)" opacity={0.25} />
        )}
        <polyline points={points.map((p, i) => `${x(i)},${y(p.value)}`).join(" ")} fill="none" stroke={color} strokeWidth={2} />

        {/* Hover guide */}
        {hover != null && <line x1={x(hover)} y1={padY} x2={x(hover)} y2={H - padY} stroke="var(--text-3)" strokeWidth={1} strokeDasharray="3,3" />}

        {/* Nodes (enlarge on hover) */}
        {points.map((p, i) => (
          <circle key={i} cx={x(i)} cy={y(p.value)} r={hover === i ? 5 : 3} fill={hover === i ? color : "var(--surface)"} stroke={color} strokeWidth={2} />
        ))}

        {/* X-axis labels — thinned so dates stay horizontal and don't overlap */}
        {points.map((p, i) => ((i % step === 0 || i === points.length - 1) ? (
          <text key={`xl${i}`} x={x(i)} y={H - padY + 14} fontSize={8.5} textAnchor="middle" fill="var(--text-3)" fontFamily="var(--font-sans)">{p.label}</text>
        ) : null))}
      </svg>
      {hover != null && (
        <ChartTip
          leftPct={(x(hover) / W) * 100}
          topPct={(y(points[hover].value) / H) * 100}
          below={y(points[hover].value) < H * 0.32}
          title={points[hover].label}
          rows={[{ label: "Value", value: fmt(points[hover].value), color }]}
        />
      )}
    </div>
  );
}

const SERIES_COLORS = ["#2563EB", "#0D9488", "#D97706", "#DC2626", "#7C3AED", "#65A30D"];

export function MultiLine({ data, stages, fmt }: { data: StageTrendPoint[]; stages: { stageId: string; label: string }[]; fmt?: (n: number) => string }) {
  const [hover, setHover] = useState<number | null>(null);
  // Smart default: rates (≤1) render as %, counts render as integers.
  const fmtVal = fmt ?? ((n: number) => (n <= 1 ? `${(n * 100).toFixed(2)}%` : Math.round(n).toLocaleString("en-IN")));
  const W = 660, H = 230, padX = 40, padY = 34;
  let max = 1e-6;
  for (const d of data) for (const s of stages) max = Math.max(max, d.perStage[s.stageId] ?? 0);
  const x = (i: number) => padX + (i / Math.max(data.length - 1, 1)) * (W - padX * 2);
  const y = (val: number) => H - padY - (val / (max || 1)) * (H - padY * 2);
  const step = Math.max(1, Math.ceil(data.length / 12));
  const color = (si: number) => SERIES_COLORS[si % SERIES_COLORS.length];

  return (
    <div style={{ position: "relative", width: "100%" }} onMouseLeave={() => setHover(null)}>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: "auto", display: "block" }}
        onMouseMove={(e) => setHover(hoverIndexFromEvent(e, W, padX, data.length))}>
        {[0, 0.25, 0.5, 0.75, 1].map((p, i) => (
          <line key={i} x1={padX} y1={padY + (H - padY * 2) * p} x2={W - padX} y2={padY + (H - padY * 2) * p} stroke="var(--border)" strokeWidth={0.5} />
        ))}
        {[0, 0.5, 1].map((p, i) => (
          <text key={`yl${i}`} x={padX - 6} y={padY + (H - padY * 2) * p + 3} fontSize={8.5} textAnchor="end" fill="var(--text-3)" fontFamily="var(--font-mono)">{fmtVal(max * (1 - p))}</text>
        ))}
        <line x1={padX} y1={H - padY} x2={W - padX} y2={H - padY} stroke="var(--border-strong)" strokeWidth={1} />

        {hover != null && <line x1={x(hover)} y1={padY} x2={x(hover)} y2={H - padY} stroke="var(--text-3)" strokeWidth={1} strokeDasharray="3,3" />}

        {stages.map((s, si) => (
          <polyline key={s.stageId} fill="none" stroke={color(si)} strokeWidth={1.8}
            points={data.map((d, i) => `${x(i)},${y(d.perStage[s.stageId] ?? 0)}`).join(" ")} />
        ))}
        {hover != null && stages.map((s, si) => (
          <circle key={`h${s.stageId}`} cx={x(hover)} cy={y(data[hover].perStage[s.stageId] ?? 0)} r={3.5} fill={color(si)} stroke="var(--surface)" strokeWidth={1.5} />
        ))}

        {data.map((d, i) => ((i % step === 0 || i === data.length - 1) ? (
          <text key={`xl${i}`} x={x(i)} y={H - padY + 14} fontSize={8.5} textAnchor="middle" fill="var(--text-3)" fontFamily="var(--font-sans)">{d.label}</text>
        ) : null))}

        {/* Legend */}
        {stages.map((s, si) => (
          <g key={`lg${s.stageId}`} transform={`translate(${padX + (si % 5) * 110}, ${12 + Math.floor(si / 5) * 12})`}>
            <circle cx={0} cy={-2} r={4} fill={color(si)} />
            <text x={8} y={2} fontSize={8.5} fill="var(--text-2)" fontWeight={600}>{s.label.split(" ")[0].toUpperCase()}</text>
          </g>
        ))}
      </svg>
      {hover != null && (
        <ChartTip
          leftPct={(x(hover) / W) * 100}
          topPct={(y(Math.max(...stages.map((s) => data[hover].perStage[s.stageId] ?? 0))) / H) * 100}
          below={false}
          title={data[hover].label}
          rows={[...stages]
            .map((s, si) => ({ label: s.label.split(" ")[0], value: fmtVal(data[hover].perStage[s.stageId] ?? 0), color: color(si), raw: data[hover].perStage[s.stageId] ?? 0 }))
            .sort((a, b) => b.raw - a.raw)
            .map(({ label, value, color }) => ({ label, value, color }))}
        />
      )}
    </div>
  );
}

export function BarsH({ rows, fmt }: { rows: { label: string; value: number; sub?: string }[]; fmt: (n: number) => string }) {
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
export const pct = (n: number) => `${(n * 100).toFixed(2)}%`;
export const rupee = (n: number) => `₹ ${(n / 100000).toFixed(2)} Lakhs`;
export const num = (n: number) => n.toLocaleString("en-IN");
