// src/app/page.tsx — Dashboard cockpit (dashboard-first; no upload UI here).
// Reads the canonical ledger via /api/events and the analytics engine.
// Ingestion lives at /staging + /data-entry, reached from the header — never a gate.
"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Icon from "@/components/editorial/Icon";
import type { Event } from "@/lib/store/types";
import {
  rejectionRate, totalRejected, totalChecked, fpy, byStage, trend,
  byDefect, type Scope, type SeriesPoint, type StageRow, type DefectRow,
} from "@/lib/analytics";

export default function Home() {
  const router = useRouter();
  const [events, setEvents] = useState<Event[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/events")
      .then((r) => r.json())
      .then((b) => setEvents(b.events ?? []))
      .catch((e) => { setError(e?.message ?? "Failed to load"); setEvents([]); });
  }, []);

  // Scope = full range present in the ledger, monthly grain.
  const scope: Scope = useMemo(() => {
    if (!events?.length) return { grain: "month" };
    const dates = events.map((e) => e.occurredOn.start).sort();
    return { grain: "month", dateFrom: dates[0], dateTo: dates[dates.length - 1] };
  }, [events]);

  const m = useMemo(() => {
    if (!events) return null;
    return {
      rate: rejectionRate(events, scope).value,
      rejected: totalRejected(events, scope).value,
      checked: totalChecked(events, scope).value,
      fpy: fpy(events, scope).value,
      stages: byStage(events, scope),
      trend: trend(events, scope, "rejectionRate"),
      defects: byDefect(events, scope),
    };
  }, [events, scope]);

  return (
    <div style={{ minHeight: "100vh", background: "var(--bg)", color: "var(--text)" }}>
      <Header onIngest={() => router.push("/ingest")} onEntry={() => router.push("/data-entry")} />

      <div className="shell" style={{ paddingTop: 28, paddingBottom: 80, maxWidth: 1280, margin: "0 auto" }}>
        {events === null && <Loading />}
        {events !== null && events.length === 0 && <EmptyCockpit onIngest={() => router.push("/ingest")} error={error} />}

        {m && events && events.length > 0 && (
          <>
            {/* KPI strip */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 16, marginBottom: 20 }}>
              <Kpi primary label="Rejection Rate" value={pct(m.rate)} tone={m.rate > 0.1 ? "bad" : m.rate > 0.05 ? "warn" : "good"} spark={m.trend} />
              <Kpi label="Total Rejections" value={m.rejected.toLocaleString()} sub={`${m.checked.toLocaleString()} checked`} />
              <Kpi label="First Pass Yield" value={pct(m.fpy)} tone="good" />
              <Kpi label="Stages Tracked" value={String(m.stages.length)} sub="rejection inspection stages" />
            </div>

            {/* Trend + stage breakdown */}
            <div style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr", gap: 16, marginBottom: 20 }}>
              <Card title="Rejection Trend (Monthly)">
                {m.trend.length ? <LineChart points={m.trend} fmt={pct} /> : <Empty label="No periods in range" />}
              </Card>
              <Card title="Stage-wise Rejection">
                {m.stages.length ? <StageBars rows={m.stages} /> : <Empty label="No stage data" />}
              </Card>
            </div>

            {/* Defect Pareto */}
            <Card title="Defect Pareto (All Stages)">
              {m.defects.length ? <DefectTable rows={m.defects} /> :
                <Empty label="No defect-level data yet — ingest the per-defect (Visual reason matrix / size-wise) files to populate this." />}
            </Card>
          </>
        )}
      </div>
    </div>
  );
}

/* ── header (ingestion reachable, not a gate) ────────────────────────────── */
function Header({ onIngest, onEntry }: { onIngest: () => void; onEntry: () => void }) {
  return (
    <div style={{ borderBottom: "1px solid var(--border)", padding: "14px 28px", display: "flex", alignItems: "center", justifyContent: "space-between", position: "sticky", top: 0, background: "var(--bg)", zIndex: 10 }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
        <span style={{ fontFamily: "var(--font-display)", fontWeight: 800, fontSize: 20, letterSpacing: "-0.02em" }}>MO!D</span>
        <span className="muted" style={{ fontSize: 12 }}>Rejection Intelligence Cockpit</span>
      </div>
      <div style={{ display: "flex", gap: 10 }}>
        <button onClick={onEntry} style={ghostBtn}>Data Entry</button>
        <button onClick={onIngest} style={primaryBtn}><Icon name="upload" size={14} /> Ingest data</button>
      </div>
    </div>
  );
}

const primaryBtn: React.CSSProperties = { background: "var(--accent)", color: "#fff", border: "none", borderRadius: 9, padding: "9px 16px", fontSize: 13, fontWeight: 600, cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 6 };
const ghostBtn: React.CSSProperties = { background: "transparent", color: "var(--text-2)", border: "1px solid var(--border)", borderRadius: 9, padding: "9px 16px", fontSize: 13, cursor: "pointer" };

/* ── states ──────────────────────────────────────────────────────────────── */
function Loading() {
  return <div style={{ textAlign: "center", padding: "120px 0" }} className="muted">Loading the ledger…</div>;
}
function EmptyCockpit({ onIngest, error }: { onIngest: () => void; error: string | null }) {
  return (
    <div style={{ textAlign: "center", padding: "100px 20px" }}>
      <div style={{ fontFamily: "var(--font-display)", fontSize: 28, fontWeight: 800, marginBottom: 8 }}>No rejection data yet</div>
      <p className="muted" style={{ maxWidth: 520, margin: "0 auto 24px", fontSize: 14, lineHeight: 1.6 }}>
        The cockpit fills in the moment you bring in data. {error ? `(${error})` : ""}
      </p>
      <button onClick={onIngest} style={primaryBtn}><Icon name="upload" size={14} /> Ingest rejection data</button>
    </div>
  );
}
function Empty({ label }: { label: string }) {
  return <div className="muted" style={{ padding: "32px 8px", fontSize: 13, textAlign: "center" }}>{label}</div>;
}

/* ── cards / kpis ────────────────────────────────────────────────────────── */
function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ border: "1px solid var(--border)", borderRadius: 12, background: "var(--surface)", padding: 16 }}>
      <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 12, color: "var(--text)" }}>{title}</div>
      {children}
    </div>
  );
}
function Kpi({ label, value, sub, tone, primary, spark }: { label: string; value: string; sub?: string; tone?: "good" | "warn" | "bad"; primary?: boolean; spark?: SeriesPoint[] }) {
  const color = tone === "bad" ? "var(--status-bad)" : tone === "warn" ? "var(--status-warn)" : tone === "good" ? "var(--status-good)" : "var(--text)";
  return (
    <div style={{ border: "1px solid var(--border)", borderTop: primary ? "3px solid var(--accent)" : "1px solid var(--border)", borderRadius: 12, background: "var(--surface)", padding: 16 }}>
      <div className="muted" style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.06em", fontWeight: 600 }}>{label}</div>
      <div style={{ fontFamily: "var(--font-mono)", fontSize: primary ? 30 : 24, fontWeight: 700, color, margin: "6px 0 2px" }}>{value}</div>
      {sub && <div className="muted" style={{ fontSize: 11, fontFamily: "var(--font-mono)" }}>{sub}</div>}
      {spark && spark.length > 1 && <div style={{ marginTop: 8 }}><Spark points={spark} /></div>}
    </div>
  );
}

/* ── inline SVG charts (placeholder until plan 06 shared lib) ─────────────── */
function Spark({ points }: { points: SeriesPoint[] }) {
  const vals = points.map((p) => p.value);
  const max = Math.max(...vals, 0.0001), min = Math.min(...vals, 0);
  const W = 120, H = 28;
  const d = points.map((p, i) => `${(i / (points.length - 1)) * W},${H - ((p.value - min) / (max - min || 1)) * H}`).join(" ");
  return <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`}><polyline points={d} fill="none" stroke="var(--accent)" strokeWidth={1.5} /></svg>;
}
function LineChart({ points, fmt }: { points: SeriesPoint[]; fmt: (n: number) => string }) {
  const W = 640, H = 200, pad = 32;
  const vals = points.map((p) => p.value);
  const max = Math.max(...vals, 0.0001), min = 0;
  const x = (i: number) => pad + (i / Math.max(points.length - 1, 1)) * (W - pad * 2);
  const y = (v: number) => H - pad - ((v - min) / (max - min || 1)) * (H - pad * 2);
  const line = points.map((p, i) => `${x(i)},${y(p.value)}`).join(" ");
  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: "auto" }}>
      <line x1={pad} y1={H - pad} x2={W - pad} y2={H - pad} stroke="var(--border)" />
      <polyline points={line} fill="none" stroke="var(--accent)" strokeWidth={2} />
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
function StageBars({ rows }: { rows: StageRow[] }) {
  const max = Math.max(...rows.map((r) => r.rejRate), 0.0001);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {rows.map((r) => (
        <div key={r.stageId}>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 3 }}>
            <span style={{ color: "var(--text)" }}>{r.label}</span>
            <span style={{ fontFamily: "var(--font-mono)", color: "var(--text-2)" }}>{pct(r.rejRate)}</span>
          </div>
          <div style={{ height: 8, background: "var(--surface-2)", borderRadius: 4, overflow: "hidden" }}>
            <div style={{ width: `${(r.rejRate / max) * 100}%`, height: "100%", background: "var(--accent)" }} />
          </div>
        </div>
      ))}
    </div>
  );
}
function DefectTable({ rows }: { rows: DefectRow[] }) {
  return (
    <table style={{ width: "100%", fontSize: 12, borderCollapse: "collapse" }}>
      <thead>
        <tr style={{ color: "var(--text-3)", textAlign: "left" }}>
          <th style={th}>Defect</th><th style={{ ...th, textAlign: "right" }}>Rejections</th><th style={{ ...th, textAlign: "right" }}>%</th><th style={{ ...th, textAlign: "right" }}>Cum %</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.label} style={{ borderTop: "1px solid var(--border)" }}>
            <td style={td}>{r.label}</td>
            <td style={{ ...td, textAlign: "right", fontFamily: "var(--font-mono)" }}>{r.rejected.toLocaleString()}</td>
            <td style={{ ...td, textAlign: "right", fontFamily: "var(--font-mono)" }}>{r.pct.toFixed(1)}</td>
            <td style={{ ...td, textAlign: "right", fontFamily: "var(--font-mono)", color: "var(--text-2)" }}>{r.cumPct.toFixed(1)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
const th: React.CSSProperties = { padding: "4px 6px", fontWeight: 600, fontSize: 10, textTransform: "uppercase", letterSpacing: "0.05em" };
const td: React.CSSProperties = { padding: "6px 6px", color: "var(--text)" };

function pct(n: number): string { return `${(n * 100).toFixed(2)}%`; }
