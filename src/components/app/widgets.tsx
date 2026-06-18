"use client";

import type { SeriesPoint, StageRow, DefectRow, StageTrendPoint } from "@/lib/analytics";
import Icon from "@/components/editorial/Icon";

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

export function LineChart({ points, target, fmt }: { points: SeriesPoint[]; target?: number; fmt: (n: number) => string }) {
  if (!points || points.length === 0) {
    return <Empty label="No trend points available for the selected range." />;
  }
  const W = 640, H = 200, pad = 34;
  const v = points.map((p) => p.value); 
  const max = Math.max(...v, target ?? 0, 1e-6);
  const x = (i: number) => pad + (i / Math.max(points.length - 1, 1)) * (W - pad * 2);
  const y = (val: number) => H - pad - (val / (max || 1)) * (H - pad * 2);
  
  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: "auto" }}>
      {/* Grid Lines */}
      {[0, 0.25, 0.5, 0.75, 1].map((p, i) => (
        <line key={i} x1={pad} y1={pad + (H - pad * 2) * p} x2={W - pad} y2={pad + (H - pad * 2) * p} stroke="var(--border)" strokeWidth={0.5} />
      ))}
      <line x1={pad} y1={H - pad} x2={W - pad} y2={H - pad} stroke="var(--border-strong)" strokeWidth={1} />
      
      {/* Target Line */}
      {target != null && (
        <g>
          <line x1={pad} y1={y(target)} x2={W - pad} y2={y(target)} stroke="var(--critical)" strokeDasharray="5,4" strokeWidth={1.2} />
          <text x={W - pad - 6} y={y(target) - 6} fontSize={8.5} fill="var(--critical)" fontWeight={700} textAnchor="end">
            TARGET ({(target * 100).toFixed(0)}%)
          </text>
        </g>
      )}
      
      {/* Trend Area */}
      {points.length > 1 && (
        <path d={`M ${x(0)} ${H - pad} ` + points.map((p, i) => `L ${x(i)} ${y(p.value)}`).join(" ") + ` L ${x(points.length - 1)} ${H - pad} Z`} fill="var(--accent-weak)" opacity={0.3} />
      )}
      
      {/* Line & Nodes */}
      {points.length > 1 && (
        <polyline points={points.map((p, i) => `${x(i)},${y(p.value)}`).join(" ")} fill="none" stroke="var(--accent)" strokeWidth={2.2} />
      )}
      
      {points.map((p, i) => {
        const showLabel = points.length <= 10 || i === 0 || i === points.length - 1 || i % Math.ceil(points.length / 8) === 0;
        const showValue = points.length <= 15 || i === points.length - 1;
        return (
          <g key={i}>
            <circle cx={x(i)} cy={y(p.value)} r={points.length > 25 ? 2.5 : 4} fill="var(--surface)" stroke="var(--accent)" strokeWidth={points.length > 25 ? 1 : 2} />
            {showLabel && (
              <text x={x(i)} y={H - pad + 14} fontSize={9} textAnchor="middle" fill="var(--text-3)" fontFamily="var(--font-sans)">
                {p.label.length > 8 ? p.label.substring(0, 7) + "…" : p.label}
              </text>
            )}
            {showValue && (
              <text x={x(i)} y={y(p.value) - 8} fontSize={9} textAnchor="middle" fill="var(--text-2)" fontFamily="var(--font-mono)" fontWeight={600}>{fmt(p.value)}</text>
            )}
          </g>
        );
      })}
    </svg>
  );
}

const SERIES_COLORS = ["#2563EB", "#0D9488", "#D97706", "#DC2626", "#7C3AED", "#65A30D"];

export function MultiLine({ data, stages }: { data: StageTrendPoint[]; stages: { stageId: string; label: string }[] }) {
  if (!data || data.length === 0) {
    return <Empty label="No trend data available for the selected range." />;
  }
  const W = 640, H = 200, pad = 34;
  let max = 1e-6; 
  for (const d of data) {
    for (const s of stages) {
      max = Math.max(max, d.perStage[s.stageId] ?? 0);
    }
  }
  const x = (i: number) => pad + (i / Math.max(data.length - 1, 1)) * (W - pad * 2);
  const y = (val: number) => H - pad - (val / (max || 1)) * (H - pad * 2);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: "auto" }}>
      {/* Grid Lines */}
      {[0, 0.25, 0.5, 0.75, 1].map((p, i) => (
        <line key={i} x1={pad} y1={pad + (H - pad * 2) * p} x2={W - pad} y2={pad + (H - pad * 2) * p} stroke="var(--border)" strokeWidth={0.5} />
      ))}
      <line x1={pad} y1={H - pad} x2={W - pad} y2={H - pad} stroke="var(--border-strong)" strokeWidth={1} />
      
      {stages.map((s, si) => (
        <polyline key={s.stageId} fill="none" stroke={SERIES_COLORS[si % SERIES_COLORS.length]} strokeWidth={1.8}
          points={data.map((d, i) => `${x(i)},${y(d.perStage[s.stageId] ?? 0)}`).join(" ")} />
      ))}

      {data.map((d, i) => {
        const showLabel = data.length <= 10 || i === 0 || i === data.length - 1 || i % Math.ceil(data.length / 8) === 0;
        return showLabel ? (
          <text key={i} x={x(i)} y={H - pad + 14} fontSize={9} textAnchor="middle" fill="var(--text-3)" fontFamily="var(--font-sans)">
            {d.label.length > 8 ? d.label.substring(0, 7) + "…" : d.label}
          </text>
        ) : null;
      })}

      {/* Legend */}
      {stages.map((s, si) => (
        <g key={s.stageId} transform={`translate(${pad + si * 100}, 12)`}>
          <circle cx={0} cy={-2} r={4} fill={SERIES_COLORS[si % SERIES_COLORS.length]} />
          <text x={8} y={2} fontSize={8.5} fill="var(--text-2)" fontWeight={600}>{s.label.split(" ")[0].toUpperCase()}</text>
        </g>
      ))}
    </svg>
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
export const pct = (n: number) => `${(n * 100).toFixed(2)}%`;
export const rupee = (n: number) => `₹ ${(n / 100000).toFixed(2)} Lakhs`;
export const num = (n: number) => n.toLocaleString("en-IN");
