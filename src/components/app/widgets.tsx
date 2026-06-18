"use client";

// Shared cockpit widgets/charts (inline SVG, tokens only). One set, reused by
// every screen — no bespoke charts elsewhere.

import type { SeriesPoint, StageRow, DefectRow, StageTrendPoint } from "@/lib/analytics";

export function Card({ title, sub, children, span }: { title?: string; sub?: string; children: React.ReactNode; span?: number }) {
  return (
    <div style={{ gridColumn: span ? `span ${span}` : undefined, border: "1px solid var(--border)", borderRadius: 12, background: "var(--surface)", padding: 16 }}>
      {title && <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 12 }}>
        <span style={{ fontSize: 13, fontWeight: 700 }}>{title}</span>
        {sub && <span className="muted" style={{ fontSize: 11 }}>{sub}</span>}
      </div>}
      {children}
    </div>
  );
}

export function Empty({ label }: { label: string }) {
  return <div className="muted" style={{ padding: "28px 8px", fontSize: 12, textAlign: "center" }}>{label}</div>;
}

export function Kpi({ label, value, sub, tone, primary, spark }: { label: string; value: string; sub?: string; tone?: "good" | "warn" | "bad"; primary?: boolean; spark?: SeriesPoint[] }) {
  const color = tone === "bad" ? "var(--status-bad)" : tone === "warn" ? "var(--status-warn)" : tone === "good" ? "var(--status-good)" : "var(--text)";
  return (
    <div style={{ border: "1px solid var(--border)", borderTop: primary ? "3px solid var(--accent)" : undefined, borderRadius: 12, background: "var(--surface)", padding: 16 }}>
      <div className="muted" style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.06em", fontWeight: 600 }}>{label}</div>
      <div style={{ fontFamily: "var(--font-mono)", fontSize: primary ? 30 : 24, fontWeight: 700, color, margin: "6px 0 2px" }}>{value}</div>
      {sub && <div className="muted" style={{ fontSize: 11, fontFamily: "var(--font-mono)" }}>{sub}</div>}
      {spark && spark.length > 1 && <div style={{ marginTop: 8 }}><Spark points={spark} /></div>}
    </div>
  );
}

export function Spark({ points }: { points: SeriesPoint[] }) {
  const v = points.map((p) => p.value); const max = Math.max(...v, 1e-6), min = Math.min(...v, 0);
  const W = 120, H = 26;
  const d = points.map((p, i) => `${(i / (points.length - 1)) * W},${H - ((p.value - min) / (max - min || 1)) * H}`).join(" ");
  return <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`}><polyline points={d} fill="none" stroke="var(--accent)" strokeWidth={1.5} /></svg>;
}

export function LineChart({ points, target, fmt }: { points: SeriesPoint[]; target?: number; fmt: (n: number) => string }) {
  const W = 640, H = 220, pad = 34;
  const v = points.map((p) => p.value); const max = Math.max(...v, target ?? 0, 1e-6);
  const x = (i: number) => pad + (i / Math.max(points.length - 1, 1)) * (W - pad * 2);
  const y = (val: number) => H - pad - (val / (max || 1)) * (H - pad * 2);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: "auto" }}>
      <line x1={pad} y1={H - pad} x2={W - pad} y2={H - pad} stroke="var(--border)" />
      {target != null && <line x1={pad} y1={y(target)} x2={W - pad} y2={y(target)} stroke="var(--status-bad)" strokeDasharray="5,4" strokeWidth={1} />}
      <polyline points={points.map((p, i) => `${x(i)},${y(p.value)}`).join(" ")} fill="none" stroke="var(--accent)" strokeWidth={2} />
      {points.map((p, i) => (
        <g key={i}>
          <circle cx={x(i)} cy={y(p.value)} r={3} fill="var(--accent)" />
          <text x={x(i)} y={H - pad + 14} fontSize={9} textAnchor="middle" fill="var(--text-3)" fontFamily="var(--font-mono)">{p.label}</text>
          <text x={x(i)} y={y(p.value) - 8} fontSize={9} textAnchor="middle" fill="var(--text-2)" fontFamily="var(--font-mono)">{fmt(p.value)}</text>
        </g>
      ))}
    </svg>
  );
}

const SERIES_COLORS = ["#3b9eff", "#1ec8a5", "#f5a524", "#ef4d56", "#a78bfa", "#f97316"];
export function MultiLine({ data, stages }: { data: StageTrendPoint[]; stages: { stageId: string; label: string }[] }) {
  const W = 640, H = 230, pad = 34;
  let max = 1e-6; for (const d of data) for (const s of stages) max = Math.max(max, d.perStage[s.stageId] ?? 0);
  const x = (i: number) => pad + (i / Math.max(data.length - 1, 1)) * (W - pad * 2);
  const y = (val: number) => H - pad - (val / max) * (H - pad * 2);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: "auto" }}>
      <line x1={pad} y1={H - pad} x2={W - pad} y2={H - pad} stroke="var(--border)" />
      {stages.map((s, si) => (
        <polyline key={s.stageId} fill="none" stroke={SERIES_COLORS[si % SERIES_COLORS.length]} strokeWidth={1.8}
          points={data.map((d, i) => `${x(i)},${y(d.perStage[s.stageId] ?? 0)}`).join(" ")} />
      ))}
      {data.map((d, i) => <text key={i} x={x(i)} y={H - pad + 14} fontSize={9} textAnchor="middle" fill="var(--text-3)" fontFamily="var(--font-mono)">{d.label}</text>)}
      {stages.map((s, si) => (
        <g key={s.stageId} transform={`translate(${pad + si * 110}, 12)`}>
          <rect width={9} height={9} fill={SERIES_COLORS[si % SERIES_COLORS.length]} rx={2} />
          <text x={13} y={8} fontSize={9} fill="var(--text-2)">{s.label}</text>
        </g>
      ))}
    </svg>
  );
}

export function BarsH({ rows, fmt }: { rows: { label: string; value: number; sub?: string }[]; fmt: (n: number) => string }) {
  const max = Math.max(...rows.map((r) => r.value), 1e-6);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
      {rows.map((r) => (
        <div key={r.label}>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 3 }}>
            <span style={{ color: "var(--text)" }}>{r.label}{r.sub ? <span className="muted"> · {r.sub}</span> : null}</span>
            <span style={{ fontFamily: "var(--font-mono)", color: "var(--text-2)" }}>{fmt(r.value)}</span>
          </div>
          <div style={{ height: 8, background: "var(--surface-2)", borderRadius: 4, overflow: "hidden" }}>
            <div style={{ width: `${(r.value / max) * 100}%`, height: "100%", background: "var(--accent)" }} />
          </div>
        </div>
      ))}
    </div>
  );
}

export function DefectParetoTable({ rows }: { rows: DefectRow[] }) {
  return (
    <table style={{ width: "100%", fontSize: 12, borderCollapse: "collapse" }}>
      <thead><tr style={{ color: "var(--text-3)", textAlign: "left" }}>
        <th style={cth}>Defect</th><th style={{ ...cth, textAlign: "right" }}>Rejections</th><th style={{ ...cth, textAlign: "right" }}>%</th><th style={{ ...cth, textAlign: "right" }}>Cum %</th>
      </tr></thead>
      <tbody>{rows.map((r) => (
        <tr key={r.label} style={{ borderTop: "1px solid var(--border)" }}>
          <td style={ctd}>{r.label}</td>
          <td style={{ ...ctd, textAlign: "right", fontFamily: "var(--font-mono)" }}>{r.rejected.toLocaleString()}</td>
          <td style={{ ...ctd, textAlign: "right", fontFamily: "var(--font-mono)" }}>{r.pct.toFixed(1)}</td>
          <td style={{ ...ctd, textAlign: "right", fontFamily: "var(--font-mono)", color: "var(--text-2)" }}>{r.cumPct.toFixed(1)}</td>
        </tr>))}</tbody>
    </table>
  );
}

export function ProcessFlow({ rows }: { rows: StageRow[] }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {rows.map((r, i) => (
        <div key={r.stageId}>
          <div style={{ border: "1px solid var(--border)", borderRadius: 9, padding: "10px 12px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div>
              <div style={{ fontWeight: 700, fontSize: 13 }}>{r.label}</div>
              <div className="muted" style={{ fontSize: 11, fontFamily: "var(--font-mono)" }}>Checked {r.checked.toLocaleString()} · Rej {r.rejected.toLocaleString()} · Yield {(r.yield * 100).toFixed(1)}%</div>
            </div>
            <span style={{ fontFamily: "var(--font-mono)", fontWeight: 700, color: r.rejRate > 0.1 ? "var(--status-bad)" : r.rejRate > 0.05 ? "var(--status-warn)" : "var(--accent)" }}>{(r.rejRate * 100).toFixed(1)}%</span>
          </div>
          {i < rows.length - 1 && <div style={{ textAlign: "center", color: "var(--text-3)", fontSize: 11 }}>↓</div>}
        </div>
      ))}
    </div>
  );
}

const cth: React.CSSProperties = { padding: "4px 6px", fontWeight: 600, fontSize: 10, textTransform: "uppercase", letterSpacing: "0.05em" };
const ctd: React.CSSProperties = { padding: "6px 6px", color: "var(--text)" };
export const pct = (n: number) => `${(n * 100).toFixed(2)}%`;
