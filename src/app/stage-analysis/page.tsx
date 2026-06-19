"use client";

import { useEffect, useState, useMemo } from "react";
import AppShell from "@/components/app/AppShell";
import FloatingDetailModal from "@/components/FloatingDetailModal";
import { useTweaks } from "@/components/editorial/TweaksContext";
import { 
  Card, 
  LineChart, 
  MultiLine, 
  BarsH, 
  ProcessFlow,
  pct
} from "@/components/app/widgets";
import type { Event } from "@/lib/store/types";
import { DISPOSAFE_REGISTRY } from "@/lib/registry/disposafe";
import {
  rejectionRate,
  byStage,
  trend,
  stageTrend,
  periodsIn,
  periodKey,
  periodLabel,
  type Scope,
  getTargetRejectionRate
} from "@/lib/analytics";

export default function StageAnalysisPage() {
  const { t } = useTweaks();
  const [events, setEvents] = useState<Event[] | null>(null);
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
    const stages = byStage(events, scope);
    const order = ["visual", "eye-punching", "balloon", "valve-integrity", "final"];
    const orderedStages = [...stages].sort((a, b) => order.indexOf(a.stageId) - order.indexOf(b.stageId));
    const tr = trend(events, trendScope, "rejectionRate");
    const st = stageTrend(events, trendScope);

    return {
      rate,
      stages: orderedStages,
      tr,
      stageTrend: st,
      latestPeriodLabel: latestPeriod ? periodLabel(latestPeriod) : ""
    };
  }, [events, scope, t.grain]);

  return (
    <AppShell active="stage" dateRange={m?.latestPeriodLabel}>
      <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
        <div>
          <h1 style={{ fontFamily: "var(--font-display)", fontSize: 28, fontWeight: 800, margin: "0 0 4px", color: "var(--text)" }}>
            Stage Analysis
          </h1>
          <p className="muted" style={{ fontSize: 14, margin: 0 }}>
            Inspect quality thresholds, bottleneck gates, and rejection ratios across all five manufacturing stages.
          </p>
        </div>

        {events === null && (
          <div style={{ padding: 48, textAlign: "center", color: "var(--text-3)", fontFamily: "var(--font-mono)" }}>
            Aggregating stage quality events...
          </div>
        )}

        {m && (() => {
          const grainLabel = t.grain === "day" ? "Daily" : t.grain === "week" ? "Weekly" : t.grain === "month" ? "Monthly" : "Yearly";
          return (
            <div style={{ display: "grid", gridTemplateColumns: "1.8fr 1.2fr", gap: 20 }}>
              <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
                <Card title={`Stage-wise Rejection Trend (${grainLabel})`} onClick={() => openModal(`Stage-wise Rejection Trend (${grainLabel})`, "Visual Inspection continues to drive the highest defect volume, followed by Valve Integrity and Balloon Inspection.", <div style={{ minHeight: 240, display: "flex", flexDirection: "column", justifyContent: "center" }}><MultiLine data={m.stageTrend} stages={DISPOSAFE_REGISTRY.stages} /></div>)}>
                  <MultiLine data={m.stageTrend} stages={DISPOSAFE_REGISTRY.stages} />
                </Card>

                <Card title={`Overall Rejection Trend (${grainLabel})`} onClick={() => openModal(`Overall Rejection Trend (${grainLabel})`, `Overall ${grainLabel.toLowerCase()} rejection trend lines compared to the target limit of ${(targetRej * 100).toFixed(0)}%.`, <div style={{ minHeight: 240, display: "flex", flexDirection: "column", justifyContent: "center" }}><LineChart points={m.tr} target={targetRej} fmt={pct} /></div>)}>
                  <LineChart points={m.tr} target={targetRej} fmt={pct} />
                </Card>
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
                <Card title="Process Flow Quality Gates" onClick={() => openModal("Process Flow Quality Gates", "catheter manufacturing process flow highlights Balloon Sealing and Valve Integrity as crucial quality checkpoints.", <div style={{ minHeight: 240, display: "flex", flexDirection: "column", justifyContent: "center" }}><ProcessFlow rows={m.stages} /></div>)}>
                  <ProcessFlow rows={m.stages} />
                </Card>

                <Card title="Stage Contribution (YTD)" onClick={() => openModal("Stage Contribution (YTD)", "Visual Inspection represents the single largest quality loss stage, contributing over half of all shopfloor rejects.", <div style={{ minHeight: 240, display: "flex", flexDirection: "column", justifyContent: "center" }}><BarsH rows={m.stages.map((s) => ({ label: s.label, value: s.contributionPct }))} fmt={(n) => `${n.toFixed(1)}%`} /></div>)}>
                  <BarsH rows={m.stages.map((s) => ({ label: s.label, value: s.contributionPct }))} fmt={(n) => `${n.toFixed(1)}%`} />
                </Card>
              </div>
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
