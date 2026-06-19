"use client";

import { useEffect, useState, useMemo } from "react";
import AppShell from "@/components/app/AppShell";
import FloatingDetailModal from "@/components/FloatingDetailModal";
import { useTweaks } from "@/components/editorial/TweaksContext";
import { 
  Card, 
  LineChart,
  pct
} from "@/components/app/widgets";
import type { Event } from "@/lib/store/types";
import {
  rejectionRate,
  trend,
  periodsIn,
  periodKey,
  periodLabel,
  type Scope
} from "@/lib/analytics";

function XBarChart({ points, ucl, lcl, mean }: { points: any[]; ucl: number; lcl: number; mean: number }) {
  const W = 640, H = 220, pad = 34;
  const v = points.map((p) => p.value); 
  const max = Math.max(...v, ucl, 0.05);
  const x = (i: number) => pad + (i / Math.max(points.length - 1, 1)) * (W - pad * 2);
  const y = (val: number) => H - pad - (val / max) * (H - pad * 2);
  
  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: "auto" }}>
      {/* Grid Lines */}
      {[0, 0.25, 0.5, 0.75, 1].map((p, i) => (
        <line key={i} x1={pad} y1={pad + (H - pad * 2) * p} x2={W - pad} y2={pad + (H - pad * 2) * p} stroke="var(--border)" strokeWidth={0.5} />
      ))}
      <line x1={pad} y1={H - pad} x2={W - pad} y2={H - pad} stroke="var(--border-strong)" strokeWidth={1} />
      
      {/* LCL Line */}
      <line x1={pad} y1={y(lcl)} x2={W - pad} y2={y(lcl)} stroke="var(--positive)" strokeDasharray="3,3" strokeWidth={1.2} />
      <text x={pad + 6} y={y(lcl) - 4} fontSize={8} fill="var(--positive)" fontWeight={700}>LCL ({(lcl*100).toFixed(2)}%)</text>

      {/* Mean Line */}
      <line x1={pad} y1={y(mean)} x2={W - pad} y2={y(mean)} stroke="var(--warning)" strokeDasharray="5,4" strokeWidth={1.2} />
      <text x={pad + 6} y={y(mean) - 4} fontSize={8} fill="var(--warning)" fontWeight={700}>MEAN ({(mean*100).toFixed(2)}%)</text>

      {/* UCL Line */}
      <line x1={pad} y1={y(ucl)} x2={W - pad} y2={y(ucl)} stroke="var(--critical)" strokeDasharray="3,3" strokeWidth={1.2} />
      <text x={pad + 6} y={y(ucl) - 4} fontSize={8} fill="var(--critical)" fontWeight={700}>UCL ({(ucl*100).toFixed(2)}%)</text>
      
      {/* Trend Area */}
      {points.length > 1 && (
        <path d={`M ${x(0)} ${H - pad} ` + points.map((p, i) => `L ${x(i)} ${y(p.value)}`).join(" ") + ` L ${x(points.length - 1)} ${H - pad} Z`} fill="var(--accent-weak)" opacity={0.25} />
      )}
      
      {/* Line & Nodes */}
      <polyline points={points.map((p, i) => `${x(i)},${y(p.value)}`).join(" ")} fill="none" stroke="var(--accent)" strokeWidth={2} />
      
      {points.map((p, i) => {
        const isOut = p.value > ucl || p.value < lcl;
        return (
          <g key={i}>
            <circle cx={x(i)} cy={y(p.value)} r={4.5} fill={isOut ? "var(--critical)" : "var(--surface)"} stroke={isOut ? "var(--critical)" : "var(--accent)"} strokeWidth={2.5} />
            <text x={x(i)} y={H - pad + 14} fontSize={8.5} textAnchor="middle" fill="var(--text-3)" fontFamily="var(--font-sans)">{p.label}</text>
            <text x={x(i)} y={y(p.value) - 8} fontSize={8.5} textAnchor="middle" fill={isOut ? "var(--critical)" : "var(--text-2)"} fontFamily="var(--font-mono)" fontWeight={600}>{(p.value*100).toFixed(2)}%</text>
          </g>
        );
      })}
    </svg>
  );
}

export default function SpcPage() {
  const { t } = useTweaks();
  const [events, setEvents] = useState<Event[] | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [modalTitle, setModalTitle] = useState("");
  const [modalInsight, setModalInsight] = useState<string | string[]>([]);
  const [modalContent, setModalContent] = useState<React.ReactNode>(null);

  const openModal = (title: string, insight: string | string[], content: React.ReactNode) => {
    setModalTitle(title);
    setModalInsight(insight);
    setModalContent(content);
    setModalOpen(true);
  };

  useEffect(() => {
    fetch("/api/events")
      .then((r) => r.json())
      .then((b) => setEvents(b.events ?? []))
      .catch(() => setEvents([]));
  }, []);

  const scope: Scope = useMemo(() => {
    let from = t.dateFrom;
    let to = t.dateTo;
    
    if (t.datePreset === "all" || (!from && !to)) {
      if (events?.length) {
        const d = events.map((e) => e.occurredOn.start).sort();
        from = d[0];
        to = d[d.length - 1];
      }
    } else if (t.datePreset === "last-90-days") {
      const today = new Date(2026, 5, 18);
      const prior = new Date(today.getTime() - 90 * 24 * 60 * 60 * 1000);
      const pad = (n: number) => String(n).padStart(2, "0");
      from = `${prior.getFullYear()}-${pad(prior.getMonth() + 1)}-${pad(prior.getDate())}`;
      to = `${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}`;
    } else if (t.datePreset === "last-12-months") {
      const today = new Date(2026, 5, 18);
      const prior = new Date(today.getFullYear() - 1, today.getMonth(), today.getDate());
      const pad = (n: number) => String(n).padStart(2, "0");
      from = `${prior.getFullYear()}-${pad(prior.getMonth() + 1)}-${pad(prior.getDate())}`;
      to = `${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}`;
    } else if (t.datePreset === "this-fy") {
      from = "2026-04-01";
      to = "2027-03-31";
    }

    return { grain: t.grain, dateFrom: from || undefined, dateTo: to || undefined };
  }, [events, t.grain, t.datePreset, t.dateFrom, t.dateTo]);

  const m = useMemo(() => {
    if (!events || events.length === 0) return null;

    const allPeriods = periodsIn(events, t.grain);
    const latestPeriod = allPeriods[allPeriods.length - 1];

    const trendScope: Scope = { grain: t.grain, dateFrom: scope.dateFrom, dateTo: scope.dateTo };

    const rate = rejectionRate(events, scope).value;
    const tr = trend(events, trendScope, "rejectionRate");

    const checkedTrend = trend(events, trendScope, "totalChecked");
    const rejectedTrend = trend(events, trendScope, "totalRejected");

    let totalChecked = 0;
    let totalRejected = 0;
    let count = 0;
    for (let i = 0; i < checkedTrend.length; i++) {
      totalChecked += checkedTrend[i].value;
      totalRejected += rejectedTrend[i].value;
      count++;
    }

    const mean = totalChecked > 0 ? totalRejected / totalChecked : 0.0291;
    const avgN = count > 0 ? totalChecked / count : 1000;
    
    // Binomial p-chart standard deviation: sigma = sqrt( pbar * (1 - pbar) / nbar )
    const stdDev = avgN > 0 && mean > 0 && mean < 1
      ? Math.sqrt((mean * (1 - mean)) / avgN)
      : 0.005;

    const ucl = mean + 3 * stdDev;
    const lcl = Math.max(0, mean - 3 * stdDev);

    // Western Electric rules violations
    let r1 = 0;
    let r2 = 0;
    let r3 = 0;
    const values = tr.map((p) => p.value);

    // Rule 1: Outside UCL/LCL limits
    values.forEach((v) => {
      if (v > ucl || v < lcl) r1++;
    });

    // Rule 2: 9 points on one side of center line
    for (let i = 0; i <= values.length - 9; i++) {
      const win = values.slice(i, i + 9);
      if (win.every((v) => v > mean) || win.every((v) => v < mean)) r2++;
    }

    // Rule 3: 6 points steadily increasing or steadily decreasing
    for (let i = 0; i <= values.length - 6; i++) {
      const win = values.slice(i, i + 6);
      let inc = true;
      let dec = true;
      for (let j = 1; j < win.length; j++) {
        if (win[j] <= win[j - 1]) inc = false;
        if (win[j] >= win[j - 1]) dec = false;
      }
      if (inc || dec) r3++;
    }

    return {
      rate,
      tr,
      mean,
      ucl,
      lcl,
      r1,
      r2,
      r3,
      latestPeriodLabel: latestPeriod ? periodLabel(latestPeriod) : ""
    };
  }, [events, scope, t.grain]);

  return (
    <AppShell active="spc" dateRange={m?.latestPeriodLabel}>
      <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
        <div>
          <h1 style={{ fontFamily: "var(--font-display)", fontSize: 28, fontWeight: 800, margin: "0 0 4px", color: "var(--text)" }}>
            SPC &amp; Control Charts
          </h1>
          <p className="muted" style={{ fontSize: 14, margin: 0 }}>
            Monitor statistical process control limits (UCL, LCL) and track quality shift deviations.
          </p>
        </div>

        {events === null && (
          <div style={{ padding: 48, textAlign: "center", color: "var(--text-3)", fontFamily: "var(--font-mono)" }}>
            Running statistical analysis...
          </div>
        )}

        {m && (() => {
          const outOfControl = m.r1 > 0 || m.r2 > 0 || m.r3 > 0;
          const modalText = outOfControl
            ? `Process instability detected! Violations: Rule 1 (Outside UCL/LCL): ${m.r1}, Rule 2 (9 points same side of mean): ${m.r2}, Rule 3 (6 points trend): ${m.r3}. Immediate engineering audit recommended.`
            : `Process is in statistical control. UCL: ${(m.ucl * 100).toFixed(2)}%, Mean: ${(m.mean * 100).toFixed(2)}%, LCL: ${(m.lcl * 100).toFixed(2)}%.`;

          return (
            <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
              <div style={{ display: "grid", gridTemplateColumns: "2.2fr 0.8fr", gap: 20 }}>
                <Card title={`X-Bar Control Chart (${t.grain.toUpperCase()} Rejection Rate)`} onClick={() => openModal("Control Chart", modalText, <div style={{ minHeight: 240, display: "flex", flexDirection: "column", justifyContent: "center" }}><XBarChart points={m.tr} ucl={m.ucl} lcl={m.lcl} mean={m.mean} /></div>)}>
                  <XBarChart points={m.tr} ucl={m.ucl} lcl={m.lcl} mean={m.mean} />
                </Card>

                <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
                  <Card title="SPC Control Limits">
                    <div style={{ display: "flex", flexDirection: "column", gap: 12, padding: "10px 0" }}>
                      <div className="between">
                        <span className="muted" style={{ fontSize: 12 }}>Upper Control Limit (UCL)</span>
                        <strong className="num" style={{ color: "var(--critical)" }}>{(m.ucl * 100).toFixed(2)}%</strong>
                      </div>
                      <div className="between">
                        <span className="muted" style={{ fontSize: 12 }}>Center Line (Mean)</span>
                        <strong className="num" style={{ color: "var(--warning)" }}>{(m.mean * 100).toFixed(2)}%</strong>
                      </div>
                      <div className="between">
                        <span className="muted" style={{ fontSize: 12 }}>Lower Control Limit (LCL)</span>
                        <strong className="num" style={{ color: "var(--positive)" }}>{(m.lcl * 100).toFixed(2)}%</strong>
                      </div>
                    </div>
                  </Card>

                  <Card title="Western Electric Rules">
                    <div style={{ fontSize: 12, lineHeight: 1.5, display: "flex", flexDirection: "column", gap: 8 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <span style={{ width: 8, height: 8, borderRadius: "50%", background: m.r1 > 0 ? "var(--critical)" : "var(--positive)" }} />
                        <span>Rule 1: Outside 3-sigma ({m.r1} violated)</span>
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <span style={{ width: 8, height: 8, borderRadius: "50%", background: m.r2 > 0 ? "var(--warning)" : "var(--positive)" }} />
                        <span>Rule 2: 9 points on one side ({m.r2} violated)</span>
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <span style={{ width: 8, height: 8, borderRadius: "50%", background: m.r3 > 0 ? "var(--warning)" : "var(--positive)" }} />
                        <span>Rule 3: 6 points increasing/decreasing ({m.r3} violated)</span>
                      </div>
                    </div>
                  </Card>
                </div>
              </div>

              <Card title="SPC Interpretation & Recommended Actions">
                <div style={{ display: "flex", flexDirection: "column", gap: 12, fontSize: 13, lineHeight: 1.6 }}>
                  {outOfControl ? (
                    <>
                      <div style={{ borderLeft: "3px solid var(--critical)", paddingLeft: 12, background: "var(--accent-weak)", padding: 12, borderRadius: "var(--radius-sm)" }}>
                        <strong style={{ color: "var(--critical)", display: "block", marginBottom: 4 }}>⚠️ PROCESS OUT OF STATISTICAL CONTROL</strong>
                        Special-cause variation detected. The quality metrics oscillate heavily and show non-random patterns violating Western Electric control rules.
                      </div>
                      <ul style={{ margin: 0, paddingLeft: 20, display: "flex", flexDirection: "column", gap: 8 }}>
                        {m.r1 > 0 && (
                          <li>
                            <strong>Rule 1 Violation (Outside Limits):</strong> {m.r1} period(s) fell outside the 3-sigma limits (UCL/LCL). This suggests sudden shifts or extreme outliers in production quality. <em>Recommended Action:</em> Perform immediate machine calibration checks and material QC audits.
                          </li>
                        )}
                        {m.r2 > 0 && (
                          <li>
                            <strong>Rule 2 Violation (Process Shift):</strong> {m.r2} run(s) of 9 consecutive points on one side of the mean. This indicates a sustained process average shift. <em>Recommended Action:</em> Inspect batch tooling adjustments, operator consistency, or setup parameter shifts.
                          </li>
                        )}
                        {m.r3 > 0 && (
                          <li>
                            <strong>Rule 3 Violation (Trending Deviation):</strong> {m.r3} run(s) of 6 consecutive points steadily increasing or decreasing. This suggests gradual tool wear or calibration decay. <em>Recommended Action:</em> Schedule preventive maintenance and check guide pins/temperature controls.
                          </li>
                        )}
                      </ul>
                    </>
                  ) : (
                    <div style={{ borderLeft: "3px solid var(--positive)", paddingLeft: 12, background: "var(--positive-weak)", padding: 12, borderRadius: "var(--radius-sm)" }}>
                      <strong style={{ color: "var(--positive)", display: "block", marginBottom: 4 }}>✓ PROCESS IN STATISTICAL CONTROL</strong>
                      Rejection rates exhibit only common-cause (random) variation. All periods fall within the 3-sigma control limits and conform to normal distribution criteria. Continue standard monitoring.
                    </div>
                  )}
                </div>
              </Card>
            </div>
          );
        })()}
      </div>

      <FloatingDetailModal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        title={modalTitle}
        insight={modalInsight}
      >
        {modalContent}
      </FloatingDetailModal>
    </AppShell>
  );
}
