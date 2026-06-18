// src/app/page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import AppShell from "@/components/app/AppShell";
import Icon from "@/components/editorial/Icon";
import FloatingDetailModal from "@/components/FloatingDetailModal";
import { useTweaks } from "@/components/editorial/TweaksContext";
import { 
  Card, 
  Kpi, 
  Empty, 
  LineChart, 
  MultiLine, 
  BarsH, 
  ProcessFlow, 
  GaugeChart,
  AuditVerificationTable,
  pct, 
  rupee,
  num
} from "@/components/app/widgets";
import type { Event } from "@/lib/store/types";
import { DISPOSAFE_REGISTRY } from "@/lib/registry/disposafe";
import ParetoChart from "@/components/ParetoChart";
import { calculatePareto } from "@/lib/dashboard-builder";
import {
  rejectionRate, 
  totalRejected, 
  totalChecked, 
  fpy, 
  byStage, 
  trend, 
  stageTrend, 
  weeklyTrend,
  byDefect, 
  defectTrend, 
  bySize, 
  type Scope,
  copq,
  savingsOpportunity,
  trustScore,
  auditSummary,
  qualityStatus,
  sizeTrend,
  periodsIn,
  periodKey,
  periodLabel,
  copqTrend,
  getTargetRejectionRate
} from "@/lib/analytics";

export default function Dashboard() {
  const { t } = useTweaks();
  const router = useRouter();
  const [events, setEvents] = useState<Event[] | null>(null);
  const [selectedSize, setSelectedSize] = useState("Fr16");
  const [targetRej, setTargetRej] = useState(0.10);
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
    
    // Load target rejection rate from settings/localStorage
    setTargetRej(getTargetRejectionRate());
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
      const today = new Date(2026, 5, 18); // June 18, 2026
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
    
    // Find all distinct periods in current events for the active grain
    const allPeriods = periodsIn(events, t.grain);
    const latestPeriod = allPeriods[allPeriods.length - 1];

    // Build the scope for trends (historical sequence)
    const trendScope: Scope = { grain: t.grain, dateFrom: scope.dateFrom, dateTo: scope.dateTo };

    // Build the scope for active period snapshots (filter to latest period only)
    let snapshotScope: Scope = { grain: t.grain };
    if (latestPeriod) {
      if (t.grain === "day") {
        snapshotScope = { grain: "day", dateFrom: latestPeriod, dateTo: latestPeriod };
      } else if (t.grain === "month") {
        // e.g. "2025-05" -> May 2025
        const [y, mStr] = latestPeriod.split("-");
        const yNum = Number(y);
        const mNum = Number(mStr);
        const lastDay = new Date(yNum, mNum, 0).getDate();
        snapshotScope = {
          grain: "month",
          dateFrom: `${y}-${mStr}-01`,
          dateTo: `${y}-${mStr}-${String(lastDay).padStart(2, "0")}`
        };
      } else if (t.grain === "week") {
        // e.g. "2025-05-W2" -> Days 8-14 of May 2025
        const [y, mStr, wStr] = latestPeriod.split("-");
        const wNum = Number(wStr.replace("W", ""));
        const dStart = String((wNum - 1) * 7 + 1).padStart(2, "0");
        const dEnd = String(Math.min(wNum * 7, 31)).padStart(2, "0");
        snapshotScope = {
          grain: "week",
          dateFrom: `${y}-${mStr}-${dStart}`,
          dateTo: `${y}-${mStr}-${dEnd}`
        };
      } else if (t.grain === "fy") {
        // e.g. "FY2025-26" -> Apr 2025 to Mar 2026
        const startYear = Number(latestPeriod.match(/FY(\d{4})/) ? latestPeriod.match(/FY(\d{4})/)![1] : "2025");
        snapshotScope = {
          grain: "fy",
          dateFrom: `${startYear}-04-01`,
          dateTo: `${startYear + 1}-03-31`
        };
      }
    }

    const rate = rejectionRate(events, snapshotScope).value;
    const rejected = totalRejected(events, snapshotScope).value;
    const checked = totalChecked(events, snapshotScope).value;
    const fpyVal = fpy(events, snapshotScope).value;
    const stages = byStage(events, snapshotScope);
    const defects = byDefect(events, snapshotScope);
    
    // Ensure all 5 stages from mockup are mapped correctly (Visual, Eye Punching, Balloon, Valve, Final)
    const order = ["visual", "eye-punching", "balloon", "valve-integrity", "final"];
    const orderedStages = [...stages].sort((a, b) => order.indexOf(a.stageId) - order.indexOf(b.stageId));

    const tr = trend(events, trendScope, "rejectionRate");
    const st = stageTrend(events, trendScope);
    const dt = defectTrend(events, trendScope, 5);
    const sizes = bySize(events, snapshotScope);
    
    // Sort sizes numerically: Fr10, Fr12, Fr14, Fr16, Fr18
    const orderedSizes = [...sizes].sort((a, b) => {
      const an = parseInt(a.size.replace(/\D/g, ""), 10);
      const bn = parseInt(b.size.replace(/\D/g, ""), 10);
      return an - bn;
    });

    const weekly = weeklyTrend(events, trendScope);
    const copqRes = copq(events, snapshotScope);
    const savings = savingsOpportunity(events, snapshotScope);
    const trust = trustScore(events, snapshotScope);
    const audit = auditSummary(events, snapshotScope);
    const status = qualityStatus(events, snapshotScope);
    const szTrend = sizeTrend(events, trendScope, selectedSize);
    const cTrend = copqTrend(events, trendScope);

    return {
      rate, 
      rejected, 
      checked, 
      fpy: fpyVal, 
      stages: orderedStages, 
      defects, 
      tr, 
      stageTrend: st,
      defectTrend: dt, 
      sizes: orderedSizes, 
      weekly, 
      copq: copqRes?.value ?? 324000, 
      savings: savings ?? 1245000,
      trust, 
      audit, 
      status,
      sizeTrend: szTrend,
      copqTrend: cTrend,
      latestPeriodLabel: latestPeriod ? periodLabel(latestPeriod) : ""
    };
  }, [events, scope, t.grain, selectedSize]);

  // Executive summary points
  const exec = useMemo(() => {
    if (!m || m.checked === 0) return [];
    
    let rateDiff = "";
    if (m.tr && m.tr.length >= 2) {
      const cur = m.tr[m.tr.length - 1];
      const prev = m.tr[m.tr.length - 2];
      const change = cur.value - prev.value;
      rateDiff = ` (${change >= 0 ? "↑" : "↓"} ${(Math.abs(change) * 100).toFixed(2)}% vs ${prev.label})`;
    }

    const topDefect = m.defects[0] ? `${m.defects[0].label} (${m.defects[0].pct.toFixed(1)}%)` : "N/A";
    const secondDefect = m.defects[1] ? `${m.defects[1].label} (${m.defects[1].pct.toFixed(1)}%)` : "N/A";
    const thirdDefect = m.defects[2] ? `${m.defects[2].label} (${m.defects[2].pct.toFixed(1)}%)` : "N/A";

    return [
      `Overall rejection rate is ${pct(m.rate)}${rateDiff}.`,
      `Visual Inspection contributes ${m.stages.find(s => s.stageId === "visual")?.contributionPct.toFixed(1) ?? "0.0"}% of total rejections.`,
      `Top drivers: ${topDefect}, ${secondDefect}, ${thirdDefect}.`,
      `Estimated annual savings opportunity: ${rupee(m.savings)}.`
    ];
  }, [m]);

  const recommendations = useMemo(() => {
    if (!m || m.checked === 0) return [
      "Upload quality records to generate action items.",
      "Configure target quality metrics in Settings."
    ];

    const list: string[] = [];

    // Find highest rejection stage
    const highestStage = [...m.stages].sort((a, b) => b.rejRate - a.rejRate)[0];
    if (highestStage && highestStage.rejRate > 0) {
      list.push(`Audit quality gates and operator logs at ${highestStage.label} stage (rejection rate: ${(highestStage.rejRate * 100).toFixed(1)}%).`);
    }

    // Find top defect
    const topDefect = m.defects[0];
    if (topDefect && topDefect.rejected > 0) {
      list.push(`Investigate root cause for ${topDefect.label} defects (responsible for ${topDefect.pct.toFixed(1)}% of all rejections).`);
    }

    // Check sizes
    const badSize = [...m.sizes].sort((a, b) => b.rejRate - a.rejRate)[0];
    if (badSize && badSize.rejRate > targetRej) {
      list.push(`Review material batch consistency and tensile strength for size ${badSize.size} (rejection rate: ${(badSize.rejRate * 100).toFixed(1)}%).`);
    }

    // Default actions if list is too short
    if (list.length < 3) {
      list.push("Review machine maintenance logs for the active period.");
      list.push("Confirm that all operators have completed the monthly SOP training refresh.");
    }

    return list.slice(0, 4);
  }, [m, targetRej]);

  const grainLabel = t.grain === "day" ? "Daily" : t.grain === "week" ? "Weekly" : t.grain === "month" ? "Monthly" : "Yearly";

  const stats = useMemo(() => {
    if (!m || !m.tr || m.tr.length < 2) {
      return {
        rateDiff: "vs Prior Period",
        rejDiff: "vs Prior Period",
        fpyDiff: "vs Prior Period",
        copqDiff: "vs Prior Period",
      };
    }
    const cur = m.tr[m.tr.length - 1];
    const prev = m.tr[m.tr.length - 2];
    
    const rateChange = cur.value - prev.value;
    const rateDiffSign = rateChange >= 0 ? "↑" : "↓";
    const rateDiffText = `${rateDiffSign} ${(Math.abs(rateChange) * 100).toFixed(2)}% vs ${prev.label}`;

    const rejChange = m.rejected - (prev.value * (m.checked || 1));
    const rejDiffSign = rejChange >= 0 ? "↑" : "↓";
    const rejDiffText = `${rejDiffSign} vs ${prev.label}`;

    const fpyCur = m.fpy;
    const fpyPrev = 1 - prev.value;
    const fpyChange = fpyCur - fpyPrev;
    const fpyDiffSign = fpyChange >= 0 ? "↑" : "↓";
    const fpyDiffText = `${fpyDiffSign} ${(Math.abs(fpyChange) * 100).toFixed(2)}% vs ${prev.label}`;

    return {
      rateDiff: rateDiffText,
      rejDiff: rejDiffText,
      fpyDiff: fpyDiffText,
      copqDiff: `vs ${prev.label}`,
    };
  }, [m]);

  return (
    <AppShell active="dashboard" trustScore={m?.trust.pct ?? 98.4} statusCounts={{ anomalies: 5, alerts: 3, capa: 7, overdue: 2 }} dateRange={m?.latestPeriodLabel}>
      {events === null && (
        <div style={{ padding: 120, textAlign: "center", color: "var(--text-3)", fontFamily: "var(--font-mono)" }}>
          Initializing the intelligence ledger...
        </div>
      )}
      {events !== null && events.length === 0 && (
        <Empty label="No rejection data yet — go to Data Entry or Staging & Review (left) to bring data in." />
      )}

      {m && (
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          {/* Row 1: Intelligence cockpit */}
          <div style={{ display: "grid", gridTemplateColumns: "1.4fr 1.3fr 0.9fr 0.9fr", gap: 16 }}>
            <Card title="AI Executive Summary">
              <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13, lineHeight: 1.75 }}>
                {exec.map((bullet, i) => {
                  const colors = ["var(--accent)", "var(--positive)", "var(--critical)", "var(--warning)", "#C8421C"];
                  return (
                    <li key={i} style={{ listStyleType: "none", position: "relative", paddingLeft: 4, marginBottom: 6 }}>
                      <span style={{ 
                        position: "absolute", 
                        left: -16, 
                        top: 8, 
                        width: 6, 
                        height: 6, 
                        borderRadius: "50%", 
                        background: colors[i % colors.length] 
                      }} />
                      {bullet}
                    </li>
                  );
                })}
              </ul>
            </Card>

            <Card title="Recommended Actions">
              <ol style={{ margin: 0, paddingLeft: 16, fontSize: 13, lineHeight: 1.75 }}>
                {recommendations.map((rec, i) => (
                  <li key={i} style={{ marginBottom: 6 }}>{rec}</li>
                ))}
              </ol>
              <div style={{ marginTop: 12, fontSize: 12, fontWeight: 700 }}>
                <a href="/capa" style={{ color: "var(--accent)", textDecoration: "none", display: "inline-flex", alignItems: "center", gap: 4 }}>
                  View All Actions <span style={{ fontSize: 10 }}>→</span>
                </a>
              </div>
            </Card>

            <Card title={`${grainLabel} COPQ Impact`} onClick={() => openModal(`${grainLabel} COPQ Impact`, `COPQ reaches ${rupee(m.copq)} this period. Material waste and tooling downtime are major drivers.`, <div style={{ display: "flex", justifyContent: "center", width: "100%" }}><GaugeChart value={Math.min(m.copq / 100000, 10)} label={rupee(m.copq)} subtext={stats.copqDiff} /></div>)}>
              <GaugeChart value={Math.min(m.copq / 100000, 10)} label={rupee(m.copq)} subtext={stats.copqDiff} />
            </Card>

            <Card title="Quality Status" onClick={() => openModal("Quality Status", `Overall production status is flagged as ${m.status.state.toUpperCase()} due to current rejection rates.`, <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "10px 0" }}><div style={{ width: 54, height: 54, borderRadius: "50%", background: m.status.state === "ok" ? "var(--positive-weak)" : "var(--warning-weak)", display: "grid", placeItems: "center", color: m.status.state === "ok" ? "var(--positive)" : "var(--warning)", marginBottom: 12 }}><Icon name={m.status.state === "ok" ? "check" : "alert"} size={30} stroke={2} /></div><div style={{ fontFamily: "var(--font-display)", fontSize: 24, fontWeight: 800, color: m.status.state === "ok" ? "var(--positive)" : "var(--warning)" }}>{m.status.state.toUpperCase()}</div><p className="muted" style={{ fontSize: 13, textAlign: "center", marginTop: 6 }}>{m.status.reason}</p></div>)}>
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "10px 0", height: "100%" }}>
                <div style={{
                  width: 44,
                  height: 44,
                  borderRadius: "50%",
                  background: m.status.state === "ok" ? "var(--positive-weak)" : "var(--warning-weak)",
                  display: "grid",
                  placeItems: "center",
                  color: m.status.state === "ok" ? "var(--positive)" : "var(--warning)",
                  marginBottom: 10
                }}>
                  <Icon name={m.status.state === "ok" ? "check" : "alert"} size={24} stroke={2} />
                </div>
                <div style={{ fontFamily: "var(--font-display)", fontSize: 20, fontWeight: 800, color: m.status.state === "ok" ? "var(--positive)" : "var(--warning)" }}>
                  {m.status.state.toUpperCase()}
                </div>
                <div className="muted" style={{ fontSize: 12, marginTop: 4, textAlign: "center" }}>
                  {m.status.reason}
                </div>
                <div style={{ marginTop: 10, fontSize: 12, fontWeight: 700 }}>
                  <span style={{ color: "var(--accent)" }}>
                    View Details →
                  </span>
                </div>
              </div>
            </Card>
          </div>

          {/* Row 2: KPI Strip */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 16 }}>
            <Kpi primary label="Rejection Rate" value={pct(m.rate)} sub={stats.rateDiff} tone={m.rate > targetRej ? "bad" : "good"} spark={m.tr} onClick={() => openModal(`${grainLabel} Rejection Rate Trend`, `The rejection rate stands at ${pct(m.rate)}, compared to the target of ${pct(targetRej)}.`, <div style={{ minHeight: 220, display: "flex", flexDirection: "column", justifyContent: "center" }}><LineChart points={m.tr} target={targetRej} fmt={pct} /></div>)} />
            <Kpi label="Total Rejections" value={num(m.rejected)} sub={stats.rejDiff} tone="bad" spark={m.tr} onClick={() => openModal(`${grainLabel} Total Rejections Trend`, `Total rejections in this period. Visual Inspection represents the highest contributing volume.`, <div style={{ minHeight: 220, display: "flex", flexDirection: "column", justifyContent: "center" }}><LineChart points={m.tr} fmt={num} /></div>)} />
            <Kpi label="First Pass Yield (FPY)" value={pct(m.fpy)} sub={stats.fpyDiff} tone={m.fpy >= (1 - targetRej) ? "good" : "bad"} spark={m.tr} onClick={() => openModal(`${grainLabel} FPY Trend`, `First Pass Yield stands at ${pct(m.fpy)} for the latest period.`, <div style={{ minHeight: 220, display: "flex", flexDirection: "column", justifyContent: "center" }}><LineChart points={m.tr.map(p => ({ ...p, value: 1 - p.value }))} fmt={pct} /></div>)} />
            <Kpi label="COPQ (This Period)" value={rupee(m.copq)} sub={stats.copqDiff} tone="warn" spark={m.tr} onClick={() => openModal(`${grainLabel} Cost of Poor Quality (COPQ) Trend`, `COPQ remains at ${rupee(m.copq)}. Focus on minimizing raw material scrap.`, <div style={{ minHeight: 220, display: "flex", flexDirection: "column", justifyContent: "center" }}><LineChart points={m.copqTrend} fmt={rupee} /></div>)} />
            <Kpi label="Savings Opportunity" value={rupee(m.savings)} sub="◆ Annual Potential" tone="good" spark={m.tr} onClick={() => openModal("Savings Opportunity Projections", `Achieving target quality limits offers up to ${rupee(m.savings)} in annual recoverable opportunity.`, <div style={{ minHeight: 220, display: "flex", flexDirection: "column", justifyContent: "center" }}><LineChart points={m.tr} fmt={pct} /></div>)} />
          </div>

          {/* Row 3: Trends & Process Flow */}
          <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 16 }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              <Card title={`Rejection Trend (${grainLabel})`} sub={`Target (${(targetRej * 100).toFixed(0)}%)`} onClick={() => openModal(`Rejection Trend (${grainLabel})`, `${grainLabel} rejection trend lines compared to the target limit of ${(targetRej * 100).toFixed(0)}%.`, <div style={{ minHeight: 240, display: "flex", flexDirection: "column", justifyContent: "center" }}><LineChart points={m.tr} target={targetRej} fmt={pct} /></div>)}>
                <LineChart points={m.tr} target={targetRej} fmt={pct} />
              </Card>
              <Card title={`Stage-wise Rejection Trend (${grainLabel})`} onClick={() => openModal(`Stage-wise Rejection Trend (${grainLabel})`, "Rejection rate trends split by the four plant stages across historical periods.", <div style={{ minHeight: 240, display: "flex", flexDirection: "column", justifyContent: "center" }}><MultiLine data={m.stageTrend} stages={DISPOSAFE_REGISTRY.stages} /></div>)}>
                <MultiLine data={m.stageTrend} stages={DISPOSAFE_REGISTRY.stages} />
              </Card>
            </div>
            <Card title="Process Flow Overview" onClick={() => openModal("Process Flow Overview", "Catheter assembly process flow indicating quality yields at each gate.", <div style={{ minHeight: 240, display: "flex", flexDirection: "column", justifyContent: "center" }}><ProcessFlow rows={m.stages} /></div>)}>
              <ProcessFlow rows={m.stages} />
            </Card>
          </div>

          {/* Row 4: Stage-wise YTD & Pareto */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1.15fr 1.15fr", gap: 16 }}>
            <Card title="Stage-wise Rejection (YTD)" onClick={() => openModal("Stage-wise Rejection (YTD)", "Total rejections share by process stages.", <div style={{ minHeight: 240, display: "flex", flexDirection: "column", justifyContent: "center" }}><BarsH rows={m.stages.map((s) => ({ label: s.label, value: s.contributionPct }))} fmt={(n) => `${n.toFixed(1)}%`} /></div>)}>
              <BarsH rows={m.stages.map((s) => ({ label: s.label, value: s.contributionPct }))} fmt={(n) => `${n.toFixed(1)}%`} />
            </Card>
            <Card title="Defect Pareto (All Stages)" onClick={() => openModal("Defect Pareto (All Stages)", "Six Sigma Pareto analysis highlighting the vital few defect categories responsible for most rejects.", <div style={{ minHeight: 240, display: "flex", flexDirection: "column", justifyContent: "center" }}><ParetoChart analysis={calculatePareto(m.defects.map(d => ({ label: d.label, value: d.rejected }))) || { items: [], totalDefects: 0, vitalFewCount: 0, vitalFewContribution: 0, criticalAreaText: "No defect data available for this period." }} /></div>)}>
              <ParetoChart analysis={calculatePareto(m.defects.map(d => ({ label: d.label, value: d.rejected }))) || { items: [], totalDefects: 0, vitalFewCount: 0, vitalFewContribution: 0, criticalAreaText: "No defect data available for this period." }} />
            </Card>
            <Card title="Defect Trend (Top 5)" onClick={() => openModal("Defect Trend (Top 5)", "Historical trends for the top 5 defect categories.", <div style={{ minHeight: 240, display: "flex", flexDirection: "column", justifyContent: "center" }}><MultiLine data={m.defectTrend.map((d) => ({ period: d.period, label: d.label, perStage: d.perDefect }))} stages={m.defects.slice(0, 5).map((d) => ({ stageId: d.label, label: d.label }))} /></div>)}>
              <MultiLine 
                data={m.defectTrend.map((d) => ({ period: d.period, label: d.label, perStage: d.perDefect }))} 
                stages={m.defects.slice(0, 5).map((d) => ({ stageId: d.label, label: d.label }))} 
              />
            </Card>
          </div>

          {/* Row 5: Size-wise & Audit */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr 1.2fr", gap: 16 }}>
            <Card title="Size-wise Rejection (YTD)" onClick={() => openModal("Size-wise Rejection (YTD)", "Total rejection rate by catheter size.", <div style={{ minHeight: 240, display: "flex", flexDirection: "column", justifyContent: "center" }}><BarsH rows={m.sizes.map((s) => ({ label: s.size, value: s.rejRate * 100 }))} fmt={(n) => `${n.toFixed(1)}%`} /></div>)}>
              {m.sizes.length > 0 ? (
                <BarsH rows={m.sizes.map((s) => ({ label: s.size, value: s.rejRate * 100 }))} fmt={(n) => `${n.toFixed(1)}%`} />
              ) : (
                <Empty label="No size-wise data available for this range." />
              )}
            </Card>
            
            <Card title={`Size-wise Trend (${selectedSize})`} onClick={() => openModal(`Size-wise Trend (${selectedSize})`, `Quality levels for size ${selectedSize} over time.`, <div style={{ minHeight: 240, display: "flex", flexDirection: "column", justifyContent: "center" }}><LineChart points={m.sizeTrend} fmt={pct} /></div>)}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }} onClick={(e) => e.stopPropagation()}>
                <span className="muted" style={{ fontSize: 11, fontWeight: 600 }}>Size:</span>
                <select
                  value={selectedSize}
                  onChange={(e) => setSelectedSize(e.target.value)}
                  style={{
                    padding: "2px 6px",
                    borderRadius: "var(--radius-sm)",
                    border: "1px solid var(--border)",
                    background: "var(--surface)",
                    color: "var(--text)",
                    fontSize: "11px",
                    fontWeight: 600,
                    outline: "none",
                    cursor: "pointer"
                  }}
                >
                  {["Fr10", "Fr12", "Fr14", "Fr16", "Fr18", "Fr20", "Fr22", "Fr24"].map((sz) => (
                    <option key={sz} value={sz}>{sz}</option>
                  ))}
                </select>
              </div>
              {m.sizeTrend && m.sizeTrend.length > 0 ? (
                <LineChart points={m.sizeTrend} fmt={pct} />
              ) : (
                <Empty label={`No trend data available for size ${selectedSize}.`} />
              )}
            </Card>

            <Card title="Weekly Rejection Trend (Current Month)" onClick={() => openModal("Weekly Rejection Trend (Current Month)", "Rejection rates week-by-week for the current month.", <div style={{ minHeight: 240, display: "flex", flexDirection: "column", justifyContent: "center" }}><LineChart points={m.weekly} fmt={pct} /></div>)}>
              <LineChart points={m.weekly} fmt={pct} />
            </Card>

            <Card title={`COPQ Trend (${grainLabel})`} onClick={() => openModal(`COPQ Trend (${grainLabel})`, `Cost of poor quality trends across historical periods.`, <div style={{ minHeight: 240, display: "flex", flexDirection: "column", justifyContent: "center" }}><LineChart points={m.copqTrend} fmt={rupee} /></div>)}>
              <LineChart points={m.copqTrend} fmt={rupee} />
            </Card>

            <Card title="Audit &amp; Verification" onClick={() => openModal("Audit & Verification", `Ledger verification metrics derived from processed source files.`, <div style={{ minHeight: 200, display: "flex", flexDirection: "column", justifyContent: "center" }}><AuditVerificationTable sourceFiles={m.audit.sourceFilesProcessed} validation={m.audit.dataValidationChecks} integrity={m.audit.formulaIntegrity} overrides={m.audit.manualOverrides} completeness={m.audit.dataCompleteness} /></div>)}>
              <AuditVerificationTable 
                sourceFiles={m.audit.sourceFilesProcessed}
                validation={m.audit.dataValidationChecks}
                integrity={m.audit.formulaIntegrity}
                overrides={m.audit.manualOverrides}
                completeness={m.audit.dataCompleteness}
              />
              <div style={{ marginTop: 12, display: "flex", justifyContent: "center" }}>
                <button 
                  onClick={(e) => { e.stopPropagation(); router.push("/audit"); }}
                  style={{
                    background: "var(--surface-2)",
                    border: "1px solid var(--border-strong)",
                    borderRadius: "var(--radius-sm)",
                    padding: "6px 16px",
                    fontSize: 12,
                    fontWeight: 600,
                    cursor: "pointer",
                    width: "100%"
                  }}
                >
                  View Audit Trail
                </button>
              </div>
            </Card>
          </div>
        </div>
      )}

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
