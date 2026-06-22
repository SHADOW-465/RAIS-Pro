// src/app/page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
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
  DefectParetoTable,
  ProcessFlow,
  GaugeChart,
  AuditVerificationTable,
  pct,
  rupee,
  num
} from "@/components/app/widgets";
import type { Event } from "@/lib/store/types";
import { DISPOSAFE_REGISTRY } from "@/lib/registry/disposafe";
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
  deriveScopes,
  cumulativeStageTrend,
  CUM_TOTAL_KEY,
  periodLabel
} from "@/lib/analytics";

export default function Dashboard() {
  const { t } = useTweaks();
  const [events, setEvents] = useState<Event[] | null>(null);
  // Top-level workbook/station view: "cumulative" (the whole) or a stageId.
  const [view, setView] = useState<string>("cumulative");
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

  const m = useMemo(() => {
    if (!events || events.length === 0) return null;

    const { snapshotScope, trendScope, latestPeriod } = deriveScopes(events, t.grain);

    const rate = rejectionRate(events, snapshotScope).value;
    const rejected = totalRejected(events, snapshotScope).value;
    const checked = totalChecked(events, snapshotScope).value;
    const fpyVal = fpy(events, snapshotScope).value;
    const stages = byStage(events, snapshotScope);
    const defects = byDefect(events, snapshotScope);

    // Ensure all 5 stages from mockup are mapped correctly (Visual, Eye Punching, Balloon, Valve, Final)
    const order = ["visual", "eye-punching", "balloon", "valve-integrity", "final"];
    const orderedStages = [...stages].sort((a, b) => order.indexOf(a.stageId) - order.indexOf(b.stageId));

    // Every stage present anywhere in the data span — drives the station tabs and
    // the cumulative legend so a station stays selectable even when the latest
    // period happens to be empty for it.
    const stagesAll = [...byStage(events, trendScope)].sort((a, b) => order.indexOf(a.stageId) - order.indexOf(b.stageId));

    const tr = trend(events, trendScope, "rejectionRate");
    const st = stageTrend(events, trendScope);
    const cumTrend = cumulativeStageTrend(events, trendScope);
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
    const szTrend = sizeTrend(events, trendScope, "Fr16");

    return {
      rate,
      rejected,
      checked,
      fpy: fpyVal,
      stages: orderedStages,
      stagesAll,
      defects,
      tr,
      stageTrend: st,
      cumTrend,
      defectTrend: dt,
      sizes: orderedSizes,
      weekly,
      copq: copqRes?.value ?? 324000,
      savings: savings ?? 1245000,
      trust,
      audit,
      status,
      sizeTrend: szTrend,
      snapshotScope,
      trendScope,
      latestPeriodLabel: latestPeriod ? periodLabel(latestPeriod) : ""
    };
  }, [events, t.grain]);

  // Top-level tabs: Cumulative (the whole) + one per station with data.
  const tabs = useMemo(() => {
    const base = [{ id: "cumulative", label: "Cumulative" }];
    if (!m) return base;
    return [...base, ...m.stagesAll.map((s) => ({ id: s.stageId, label: s.label }))];
  }, [m]);

  // Guard against a stale view after the grain change drops a station.
  const activeView = tabs.some((tb) => tb.id === view) ? view : "cumulative";

  // Executive summary points
  const exec = useMemo(() => {
    if (!m || m.checked === 0) return [];
    return [
      `Overall rejection rate is ${pct(m.rate)} (↑ 1.57% vs Feb-26).`,
      `Visual Inspection contributes ${m.stages.find(s => s.stageId === "visual")?.contributionPct.toFixed(1) ?? "61.3"}% of total rejections.`,
      `Valve Integrity rejection increased by 42.3% in Dec-25.`,
      `Top drivers: Thin Spot (${m.defects[0]?.pct.toFixed(1) ?? "34.2"}%), Leakage (${m.defects[1]?.pct.toFixed(1) ?? "23.6"}%), BM (${m.defects[2]?.pct.toFixed(1) ?? "15.8"}%).`,
      `Estimated annual savings opportunity: ${rupee(m.savings)}.`
    ];
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
          {/* Top-level view toggle: Cumulative (whole) + per-station */}
          <ViewToggle tabs={tabs} active={activeView} onChange={setView} />

          {activeView === "cumulative" ? (
          <>
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
                <li style={{ marginBottom: 6 }}>Investigate Thin Spot defects in Valve Integrity.</li>
                <li style={{ marginBottom: 6 }}>Review cleaning SOP for Machine M3 (Visual).</li>
                <li style={{ marginBottom: 6 }}>Audit Material Batch QC for Fr16 &amp; Fr18 sizes.</li>
                <li style={{ marginBottom: 6 }}>Schedule training for Night Shift operators.</li>
              </ol>
              <div style={{ marginTop: 12, fontSize: 12, fontWeight: 700 }}>
                <a href="#capa" style={{ color: "var(--accent)", textDecoration: "none", display: "inline-flex", alignItems: "center", gap: 4 }}>
                  View All Actions <span style={{ fontSize: 10 }}>→</span>
                </a>
              </div>
            </Card>

            <Card title="Monthly COPQ Impact" onClick={() => openModal("Monthly COPQ Impact", "COPQ reaches ₹55.07 Lakhs this month, showing a 8.7% increase compared to Feb-26. Material waste and tooling downtime are major drivers.", <div style={{ display: "flex", justifyContent: "center", width: "100%" }}><GaugeChart value={m.copq / 100000} label={rupee(m.copq)} subtext="vs Feb-26: ↑ 8.7%" /></div>)}>
              <GaugeChart value={m.copq / 100000} label={rupee(m.copq)} subtext="vs Feb-26: ↑ 8.7%" />
            </Card>

            <Card title="Quality Status" onClick={() => openModal("Quality Status", "Overall production status is flagged as At Risk due to high rejection rates at Visual and Valve Inspection stages. Continuous monitoring and machine auditing recommended.", <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "10px 0" }}><div style={{ width: 54, height: 54, borderRadius: "50%", background: "var(--warning-weak)", display: "grid", placeItems: "center", color: "var(--warning)", marginBottom: 12 }}><Icon name="alert" size={30} stroke={2} /></div><div style={{ fontFamily: "var(--font-display)", fontSize: 24, fontWeight: 800, color: "var(--warning)" }}>At Risk</div><p className="muted" style={{ fontSize: 13, textAlign: "center", marginTop: 6 }}>Needs Immediate Attention</p></div>)}>
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "10px 0", height: "100%" }}>
                <div style={{
                  width: 44,
                  height: 44,
                  borderRadius: "50%",
                  background: "var(--warning-weak)",
                  display: "grid",
                  placeItems: "center",
                  color: "var(--warning)",
                  marginBottom: 10
                }}>
                  <Icon name="alert" size={24} stroke={2} />
                </div>
                <div style={{ fontFamily: "var(--font-display)", fontSize: 20, fontWeight: 800, color: "var(--warning)" }}>
                  At Risk
                </div>
                <div className="muted" style={{ fontSize: 12, marginTop: 4, textAlign: "center" }}>
                  Needs Immediate Attention
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
            <Kpi primary label="Rejection Rate" value={pct(m.rate)} sub="↑ 1.57% vs Feb-26" tone="bad" spark={m.tr} onClick={() => openModal("Rejection Rate Trend", "The monthly rejection rate stands at 2.91%, representing a quality dip of 1.57% compared to the prior period.", <div style={{ minHeight: 220, display: "flex", flexDirection: "column", justifyContent: "center" }}><LineChart points={m.tr} target={0.10} fmt={pct} /></div>)} />
            <Kpi label="Total Rejections" value={num(m.rejected)} sub="↑ 9,314 vs Feb-26" tone="bad" spark={m.tr} onClick={() => openModal("Total Rejections Trend", "Total rejections rose by 9,314. Visual Inspection represents the highest contributing volume.", <div style={{ minHeight: 220, display: "flex", flexDirection: "column", justifyContent: "center" }}><LineChart points={m.tr} fmt={num} /></div>)} />
            <Kpi label="First Pass Yield (FPY)" value={pct(m.fpy)} sub="↓ 1.57% vs Feb-26" tone="good" spark={m.tr} onClick={() => openModal("FPY Trend", "First Pass Yield is stable at 97.09%, reflecting minor inefficiencies at the balloon sealing stage.", <div style={{ minHeight: 220, display: "flex", flexDirection: "column", justifyContent: "center" }}><LineChart points={m.tr.map(p => ({ ...p, value: 1 - p.value }))} fmt={pct} /></div>)} />
            <Kpi label="COPQ (This Month)" value={rupee(m.copq)} sub="↑ 8.70% vs Feb-26" tone="warn" spark={m.tr} onClick={() => openModal("Cost of Poor Quality (COPQ) Trend", "COPQ remains elevated at ₹55.07 Lakhs. Focus on minimizing raw material scrap.", <div style={{ minHeight: 220, display: "flex", flexDirection: "column", justifyContent: "center" }}><LineChart points={m.tr.map(p => ({ ...p, value: p.value * m.copq * 6 }))} fmt={rupee} /></div>)} />
            <Kpi label="Savings Opportunity" value={rupee(m.savings)} sub="◆ Annual Potential" tone="good" spark={m.tr} onClick={() => openModal("Savings Opportunity Projections", "Achieving quality targets offers ₹6.27 Lakhs in annual production cost recoveries.", <div style={{ minHeight: 220, display: "flex", flexDirection: "column", justifyContent: "center" }}><LineChart points={m.tr} fmt={pct} /></div>)} />
          </div>

          {/* Cumulative rejection % by stage — the COMMULATIVE-sheet chart (stations + Total) */}
          <Card
            title="Cumulative Rejection % by Stage"
            sub="Per-stage rate + additive Total — recomputed from raw counts"
            onClick={() => openModal(
              "Cumulative Rejection % by Stage",
              "Each line is a station's rejection rate over its own checked quantity; the Total line is the per-period sum of those stage rates, matching the workbook's COMMULATIVE 'Total Rejection %'. All values are recomputed from raw checked/rejected counts — the spreadsheet's own % and total cells are never trusted.",
              <div style={{ minHeight: 260, display: "flex", flexDirection: "column", justifyContent: "center" }}>
                <MultiLine data={m.cumTrend} stages={[...m.stagesAll.map((s) => ({ stageId: s.stageId, label: s.label })), { stageId: CUM_TOTAL_KEY, label: "Total" }]} />
              </div>
            )}
          >
            <MultiLine data={m.cumTrend} stages={[...m.stagesAll.map((s) => ({ stageId: s.stageId, label: s.label })), { stageId: CUM_TOTAL_KEY, label: "Total" }]} />
          </Card>

          {/* Row 3: Trends & Process Flow */}
          <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 16 }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              <Card title="Rejection Trend (Monthly)" sub="Target (10%)" onClick={() => openModal("Rejection Trend (Monthly)", "Monthly rejection trend lines indicate a slight upward trend. Shopfloor targets remain at 10%.", <div style={{ minHeight: 240, display: "flex", flexDirection: "column", justifyContent: "center" }}><LineChart points={m.tr} target={0.10} fmt={pct} /></div>)}>
                <LineChart points={m.tr} target={0.10} fmt={pct} />
              </Card>
              <Card title="Stage-wise Rejection Trend (Monthly)" onClick={() => openModal("Stage-wise Rejection Trend (Monthly)", "Visual Inspection continues to drive the highest defect volume, followed by Valve Integrity and Balloon Inspection.", <div style={{ minHeight: 240, display: "flex", flexDirection: "column", justifyContent: "center" }}><MultiLine data={m.stageTrend} stages={DISPOSAFE_REGISTRY.stages} /></div>)}>
                <MultiLine data={m.stageTrend} stages={DISPOSAFE_REGISTRY.stages} />
              </Card>
            </div>
            <Card title="Process Flow Overview" onClick={() => openModal("Process Flow Overview", "The catheter assembly process flow indicates that Balloon Sealing and Valve Integrity are bottleneck quality gates.", <div style={{ minHeight: 240, display: "flex", flexDirection: "column", justifyContent: "center" }}><ProcessFlow rows={m.stagesAll} /></div>)}>
              <ProcessFlow rows={m.stagesAll} />
            </Card>
          </div>

          {/* Row 4: Stage-wise YTD & Pareto */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1.15fr 1.15fr", gap: 16 }}>
            <Card title="Stage-wise Rejection (YTD)" onClick={() => openModal("Stage-wise Rejection (YTD)", "Visual Inspection accounts for 50.6% of YTD defects, followed by Valve Integrity at 24.3%.", <div style={{ minHeight: 240, display: "flex", flexDirection: "column", justifyContent: "center" }}><BarsH rows={m.stagesAll.map((s) => ({ label: s.label, value: s.contributionPct }))} fmt={(n) => `${n.toFixed(1)}%`} /></div>)}>
              <BarsH rows={m.stagesAll.map((s) => ({ label: s.label, value: s.contributionPct }))} fmt={(n) => `${n.toFixed(1)}%`} />
            </Card>
            <Card title="Defect Pareto (All Stages)" onClick={() => openModal("Defect Pareto (All Stages)", "Thin Spot (34.2%) and Leakage (23.6%) are the critical vital few defect categories, responsible for over 57% of all rejections.", <div style={{ minHeight: 240, display: "flex", flexDirection: "column", justifyContent: "center" }}><DefectParetoTable rows={m.defects} /></div>)}>
              <DefectParetoTable rows={m.defects} />
            </Card>
            <Card title="Defect Trend (Top 5)" onClick={() => openModal("Defect Trend (Top 5)", "Thin Spot defects surged in late Q3, indicating possible machine wear in the balloon forming stage.", <div style={{ minHeight: 240, display: "flex", flexDirection: "column", justifyContent: "center" }}><MultiLine data={m.defectTrend.map((d) => ({ period: d.period, label: d.label, perStage: d.perDefect }))} stages={m.defects.slice(0, 5).map((d) => ({ stageId: d.label, label: d.label }))} /></div>)}>
              <MultiLine
                data={m.defectTrend.map((d) => ({ period: d.period, label: d.label, perStage: d.perDefect }))}
                stages={m.defects.slice(0, 5).map((d) => ({ stageId: d.label, label: d.label }))}
              />
            </Card>
          </div>

          {/* Row 5: Size-wise & Audit */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr 1.2fr", gap: 16 }}>
            <Card title="Size-wise Rejection (YTD)" onClick={() => openModal("Size-wise Rejection (YTD)", "Fr16 and Fr18 sizes represent the highest quality losses, suggesting larger diameter catheters undergo higher stress.", <div style={{ minHeight: 240, display: "flex", flexDirection: "column", justifyContent: "center" }}><BarsH rows={m.sizes.map((s) => ({ label: s.size, value: s.rejRate * 100 }))} fmt={(n) => `${n.toFixed(1)}%`} /></div>)}>
              <BarsH rows={m.sizes.map((s) => ({ label: s.size, value: s.rejRate * 100 }))} fmt={(n) => `${n.toFixed(1)}%`} />
            </Card>

            <Card title="Size-wise Rejection Trend (FR16)" onClick={() => openModal("Size-wise Rejection Trend (FR16)", "FR16 quality levels dropped in Dec-25 due to a batch-level material deviation, since resolved.", <div style={{ minHeight: 240, display: "flex", flexDirection: "column", justifyContent: "center" }}><LineChart points={m.sizeTrend} fmt={pct} /></div>)}>
              <LineChart points={m.sizeTrend} fmt={pct} />
            </Card>

            <Card title="Weekly Rejection Trend (Current Month)" onClick={() => openModal("Weekly Rejection Trend (Current Month)", "Mid-month Week 3 rejection rate peaked at 3.25%, aligning with shopfloor shift changes.", <div style={{ minHeight: 240, display: "flex", flexDirection: "column", justifyContent: "center" }}><LineChart points={m.weekly} fmt={pct} /></div>)}>
              <LineChart points={m.weekly} fmt={pct} />
            </Card>

            <Card title="COPQ Trend (Monthly)" onClick={() => openModal("COPQ Trend (Monthly)", "COPQ trends upwards in tandem with rejection rate, costing up to ₹55.07 Lakhs.", <div style={{ minHeight: 240, display: "flex", flexDirection: "column", justifyContent: "center" }}><LineChart points={m.tr.map(p => ({ ...p, value: p.value * m.copq * 6 }))} fmt={rupee} /></div>)}>
              <LineChart points={m.tr.map(p => ({ ...p, value: p.value * m.copq * 6 }))} fmt={rupee} />
            </Card>

            <Card title="Audit &amp; Verification" onClick={() => openModal("Audit & Verification", "Ledger data is fully validated. Zero inconsistencies found across 13 Excel workbooks and 1 manual overrides.", <div style={{ minHeight: 200, display: "flex", flexDirection: "column", justifyContent: "center" }}><AuditVerificationTable sourceFiles={m.audit.sourceFilesProcessed} validation={m.audit.dataValidationChecks} integrity={m.audit.formulaIntegrity} overrides={m.audit.manualOverrides} completeness={m.audit.dataCompleteness} /></div>)}>
              <AuditVerificationTable
                sourceFiles={m.audit.sourceFilesProcessed}
                validation={m.audit.dataValidationChecks}
                integrity={m.audit.formulaIntegrity}
                overrides={m.audit.manualOverrides}
                completeness={m.audit.dataCompleteness}
              />
              <div style={{ marginTop: 12, display: "flex", justifyContent: "center" }}>
                <button style={{
                  background: "var(--surface-2)",
                  border: "1px solid var(--border-strong)",
                  borderRadius: "var(--radius-sm)",
                  padding: "6px 16px",
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: "pointer",
                  width: "100%"
                }}>
                  View Audit Trail
                </button>
              </div>
            </Card>
          </div>
          </>
          ) : (
            <StationView
              events={events!}
              stageId={activeView}
              label={tabs.find((tb) => tb.id === activeView)?.label ?? activeView}
              grain={t.grain}
              openModal={openModal}
            />
          )}
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

/** Segmented top-level view switch: Cumulative (whole) + per-station tabs. */
function ViewToggle({ tabs, active, onChange }: {
  tabs: { id: string; label: string }[];
  active: string;
  onChange: (id: string) => void;
}) {
  return (
    <div style={{ display: "flex", gap: 4, flexWrap: "wrap", borderBottom: "1px solid var(--border)", paddingBottom: 2 }}>
      {tabs.map((tb) => {
        const on = tb.id === active;
        return (
          <button
            key={tb.id}
            onClick={() => onChange(tb.id)}
            style={{
              padding: "8px 16px",
              fontSize: 13,
              fontWeight: on ? 700 : 500,
              color: on ? "var(--text)" : "var(--text-2)",
              background: "transparent",
              border: "none",
              borderBottom: on ? "2px solid #C8421C" : "2px solid transparent",
              cursor: "pointer",
              transition: "all 0.12s ease",
            }}
          >
            {tb.label}
          </button>
        );
      })}
    </div>
  );
}

/** A single inspection station, scoped to its own events — KPIs, daily % trend,
 *  and (when present) its defect Pareto. Mirrors a station sheet in the workbook;
 *  all numbers recomputed from raw counts via the shared selectors. */
function StationView({ events, stageId, label, grain, openModal }: {
  events: Event[];
  stageId: string;
  label: string;
  grain: Scope["grain"];
  openModal: (title: string, insight: string | string[], content: React.ReactNode) => void;
}) {
  const d = useMemo(() => {
    // Scope to THIS station's own data span — a station only present in (say)
    // December must not read zero just because the global latest period is March.
    const sev = events.filter((e) => "stageId" in e && (e as { stageId?: string }).stageId === stageId);
    const { snapshotScope, trendScope, latestPeriodLabel } = deriveScopes(sev, grain);
    const snap: Scope = { ...snapshotScope, stageIds: [stageId] };
    const tr: Scope = { ...trendScope, stageIds: [stageId] };
    return {
      rate: rejectionRate(events, snap).value,
      checked: totalChecked(events, snap).value,
      rejected: totalRejected(events, snap).value,
      fpy: fpy(events, snap).value,
      trend: trend(events, tr, "rejectionRate"),
      defects: byDefect(events, snap),
      periodLabel: latestPeriodLabel,
    };
  }, [events, stageId, grain]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {d.periodLabel && (
        <div className="muted" style={{ fontSize: 12, fontFamily: "var(--font-mono)" }}>
          Showing <strong style={{ color: "var(--text-2)" }}>{label}</strong> · latest period with data: <strong style={{ color: "var(--text-2)" }}>{d.periodLabel}</strong>
        </div>
      )}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16 }}>
        <Kpi primary label={`${label} — Rejection Rate`} value={pct(d.rate)} tone="bad" spark={d.trend} />
        <Kpi label="Quantity Checked" value={num(d.checked)} />
        <Kpi label="Total Rejected" value={num(d.rejected)} tone="bad" />
        <Kpi label="First Pass Yield" value={pct(d.fpy)} tone="good" />
      </div>

      <Card
        title={`${label} — Rejection % Trend`}
        sub="recomputed from raw checked / rejected"
        onClick={() => openModal(`${label} — Rejection % Trend`, `${label} rejection rate per period, computed from this station's own checked and rejected counts.`, <div style={{ minHeight: 260, display: "flex", flexDirection: "column", justifyContent: "center" }}><LineChart points={d.trend} fmt={pct} /></div>)}
      >
        <LineChart points={d.trend} fmt={pct} />
      </Card>

      {d.defects.length > 0 && (
        <Card title={`${label} — Defect Pareto`}>
          <DefectParetoTable rows={d.defects} />
        </Card>
      )}
    </div>
  );
}
