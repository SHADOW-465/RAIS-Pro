// Dashboard cockpit (mockup 1) — rendered in the app shell, reading the ledger
// via /api/events + the analytics engine. Dashboard-first; no upload here.
"use client";

import { useEffect, useMemo, useState } from "react";
import AppShell from "@/components/app/AppShell";
import { Card, Kpi, Empty, LineChart, MultiLine, BarsH, DefectParetoTable, ProcessFlow, pct } from "@/components/app/widgets";
import type { Event } from "@/lib/store/types";
import { DISPOSAFE_REGISTRY } from "@/lib/registry/disposafe";
import {
  rejectionRate, totalRejected, totalChecked, fpy, byStage, trend, stageTrend, weeklyTrend,
  byDefect, defectTrend, bySize, type Scope,
} from "@/lib/analytics";

export default function Dashboard() {
  const [events, setEvents] = useState<Event[] | null>(null);

  useEffect(() => {
    fetch("/api/events").then((r) => r.json()).then((b) => setEvents(b.events ?? [])).catch(() => setEvents([]));
  }, []);

  const scope: Scope = useMemo(() => {
    if (!events?.length) return { grain: "month" };
    const d = events.map((e) => e.occurredOn.start).sort();
    return { grain: "month", dateFrom: d[0], dateTo: d[d.length - 1] };
  }, [events]);

  const trust = useMemo(() => {
    if (!events?.length) return null;
    return (events.reduce((a, e) => a + (e.confidence?.score ?? 0), 0) / events.length) * 100;
  }, [events]);

  const m = useMemo(() => {
    if (!events) return null;
    const stages = byStage(events, scope);
    const defects = byDefect(events, scope);
    const tr = trend(events, scope, "rejectionRate");
    return {
      rate: rejectionRate(events, scope).value, rejected: totalRejected(events, scope).value,
      checked: totalChecked(events, scope).value, fpy: fpy(events, scope).value,
      stages, defects, tr, stageTrend: stageTrend(events, scope),
      defectTrend: defectTrend(events, scope, 5), sizes: bySize(events, scope),
      weekly: weeklyTrend(events, scope),
    };
  }, [events, scope]);

  // deterministic executive summary (no LLM yet; computed from metrics)
  const exec = useMemo(() => {
    if (!m || m.checked === 0) return [];
    const worst = [...m.stages].sort((a, b) => b.contributionPct - a.contributionPct)[0];
    const out = [`Overall rejection rate is ${pct(m.rate)} across ${m.checked.toLocaleString()} checked.`];
    if (worst) out.push(`${worst.label} contributes ${worst.contributionPct.toFixed(1)}% of all rejections.`);
    if (m.defects.length) out.push(`Top defect: ${m.defects[0].label} (${m.defects[0].pct.toFixed(1)}%).`);
    if (m.tr.length >= 2) { const d = m.tr[m.tr.length - 1].value - m.tr[0].value; out.push(`Trend ${d <= 0 ? "improved" : "worsened"} ${Math.abs(d * 100).toFixed(2)}pp over the period.`); }
    return out;
  }, [m]);

  const anomalies = m ? m.tr.filter((p) => p.value > 0.1).length : 0;
  const status: "good" | "watch" | "at-risk" = !m ? "good" : m.rate > 0.1 ? "at-risk" : m.rate > 0.05 ? "watch" : "good";

  return (
    <AppShell active="dashboard" trustScore={trust} statusCounts={{ anomalies, alerts: anomalies }}>
      {events === null && <div className="muted" style={{ padding: 80, textAlign: "center" }}>Loading the ledger…</div>}
      {events !== null && events.length === 0 && (
        <Empty label="No rejection data yet — go to Data Entry or Staging & Review (left) to bring data in. The cockpit fills in automatically." />
      )}

      {m && events && events.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {/* intelligence row */}
          <div style={{ display: "grid", gridTemplateColumns: "1.3fr 1.3fr 1fr 1fr", gap: 16 }}>
            <Card title="Executive Summary">
              <ul style={{ margin: 0, paddingLeft: 16, fontSize: 13, lineHeight: 1.7 }}>{exec.map((b, i) => <li key={i}>{b}</li>)}</ul>
            </Card>
            <Card title="Recommended Actions">
              <ol style={{ margin: 0, paddingLeft: 18, fontSize: 13, lineHeight: 1.7 }}>
                {[...m.stages].sort((a, b) => b.rejRate - a.rejRate).slice(0, 3).map((s) => (
                  <li key={s.stageId}>Investigate {s.label} — {pct(s.rejRate)} rejection.</li>
                ))}
              </ol>
            </Card>
            <LockedCard title="Monthly COPQ Impact" note="Enter cost in Settings to unlock ₹ impact" />
            <Card title="Quality Status">
              <div style={{ fontFamily: "var(--font-display)", fontSize: 22, fontWeight: 800, color: status === "at-risk" ? "var(--status-bad)" : status === "watch" ? "var(--status-warn)" : "var(--status-good)" }}>
                {status === "at-risk" ? "At Risk" : status === "watch" ? "Watch" : "Healthy"}
              </div>
              <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>{status === "at-risk" ? "Rejection above 10%." : status === "watch" ? "Rejection 5–10%." : "Rejection within target."}</div>
            </Card>
          </div>

          {/* KPI strip */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 16 }}>
            <Kpi primary label="Rejection Rate" value={pct(m.rate)} tone={status === "at-risk" ? "bad" : status === "watch" ? "warn" : "good"} spark={m.tr} />
            <Kpi label="Total Rejections" value={m.rejected.toLocaleString()} sub={`${m.checked.toLocaleString()} checked`} />
            <Kpi label="First Pass Yield" value={pct(m.fpy)} tone="good" />
            <Kpi label="Stages Tracked" value={String(m.stages.length)} sub="rejection stages" />
          </div>

          {/* trend row */}
          <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 16 }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              <Card title="Rejection Trend (Monthly)" sub="target 10%">{m.tr.length ? <LineChart points={m.tr} target={0.1} fmt={pct} /> : <Empty label="No periods" />}</Card>
              <Card title="Stage-wise Rejection Trend (Monthly)">{m.stageTrend.length ? <MultiLine data={m.stageTrend} stages={DISPOSAFE_REGISTRY.stages.filter((s) => m.stages.some((r) => r.stageId === s.stageId))} /> : <Empty label="No data" />}</Card>
            </div>
            <Card title="Process Flow Overview">{m.stages.length ? <ProcessFlow rows={m.stages} /> : <Empty label="No stage data" />}</Card>
          </div>

          {/* analysis row */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1.1fr 1.1fr", gap: 16 }}>
            <Card title="Stage-wise Rejection (YTD)">{m.stages.length ? <BarsH rows={[...m.stages].sort((a, b) => b.contributionPct - a.contributionPct).map((s) => ({ label: s.label, value: s.contributionPct }))} fmt={(n) => `${n.toFixed(1)}%`} /> : <Empty label="No data" />}</Card>
            <Card title="Defect Pareto (All Stages)">{m.defects.length ? <DefectParetoTable rows={m.defects} /> : <Empty label="No per-defect data — ingest the Visual reason-matrix / size-wise files to populate this." />}</Card>
            <Card title="Defect Trend (Top 5)">{m.defectTrend.length ? <MultiLine data={m.defectTrend.map((d) => ({ period: d.period, label: d.label, perStage: d.perDefect }))} stages={m.defects.slice(0, 5).map((d) => ({ stageId: d.label, label: d.label }))} /> : <Empty label="No per-defect data" />}</Card>
          </div>

          {/* size + cadence row */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16 }}>
            <Card title="Size-wise Rejection (YTD)">{m.sizes.length ? <BarsH rows={m.sizes.map((s) => ({ label: s.size, value: s.rejRate * 100 }))} fmt={(n) => `${n.toFixed(1)}%`} /> : <Empty label="No size-tagged data — enable in size-wise ingestion." />}</Card>
            <Card title="Weekly Rejection Trend">{m.weekly.length ? <LineChart points={m.weekly} fmt={pct} /> : <Empty label="No weekly data in range" />}</Card>
            <LockedCard title="COPQ Trend (Monthly)" note="Cost not configured" />
          </div>
        </div>
      )}
    </AppShell>
  );
}

function LockedCard({ title, note }: { title: string; note: string }) {
  return (
    <div style={{ border: "1px dashed var(--border)", borderRadius: 12, background: "var(--surface)", padding: 16, opacity: 0.7 }}>
      <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>{title} <span className="muted" style={{ fontSize: 10, fontWeight: 500 }}>· locked</span></div>
      <div className="muted" style={{ fontSize: 12 }}>{note}</div>
    </div>
  );
}
