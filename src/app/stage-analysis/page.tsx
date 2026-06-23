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
  type Scope
} from "@/lib/analytics";

export default function StageAnalysisPage() {
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

  const scope = useMemo(() => {
    if (!events?.length) return { grain: t.grain };
    const d = events.map((e) => e.occurredOn.start).sort();
    return { grain: t.grain, dateFrom: d[0], dateTo: d[d.length - 1] };
  }, [events, t.grain]);

  const m = useMemo(() => {
    if (!events || events.length === 0) return null;

    const allPeriods = periodsIn(events, t.grain);
    const latestPeriod = allPeriods[allPeriods.length - 1];

    const trendScope: Scope = { grain: t.grain, dateFrom: scope.dateFrom, dateTo: scope.dateTo };

    let snapshotScope: Scope = { grain: t.grain };
    if (latestPeriod) {
      if (t.grain === "day") {
        snapshotScope = { grain: "day", dateFrom: latestPeriod, dateTo: latestPeriod };
      } else if (t.grain === "month") {
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
        const startYear = Number(latestPeriod.match(/FY(\d{4})/) ? latestPeriod.match(/FY(\d{4})/)![1] : "2025");
        snapshotScope = {
          grain: "fy",
          dateFrom: `${startYear}-04-01`,
          dateTo: `${startYear + 1}-03-31`
        };
      }
    }

    const rate = rejectionRate(events, snapshotScope).value;
    // Respect the selected timeframe (grain): show the stages that have data in
    // the active period. When the period has no data for a stage, it correctly
    // shows nothing — pick a period that has data (e.g. December for the
    // rejection-analysis stations) to see them.
    const stages = byStage(events, snapshotScope);
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

        {m && (
          <div style={{ display: "grid", gridTemplateColumns: "1.8fr 1.2fr", gap: 20 }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
              <Card title="Stage-wise Rejection Trend (Monthly)" onClick={() => openModal("Stage-wise Rejection Trend (Monthly)", "Visual Inspection continues to drive the highest defect volume, followed by Valve Integrity and Balloon Inspection.", <div style={{ minHeight: 240, display: "flex", flexDirection: "column", justifyContent: "center" }}><MultiLine data={m.stageTrend} stages={DISPOSAFE_REGISTRY.stages} /></div>)}>
                <MultiLine data={m.stageTrend} stages={DISPOSAFE_REGISTRY.stages} />
              </Card>

              <Card title="Overall Rejection Trend (Monthly)" onClick={() => openModal("Overall Rejection Trend (Monthly)", "Overall monthly rejection trend lines indicate stable performance under the 10% target limit.", <div style={{ minHeight: 240, display: "flex", flexDirection: "column", justifyContent: "center" }}><LineChart points={m.tr} target={0.10} fmt={pct} /></div>)}>
                <LineChart points={m.tr} target={0.10} fmt={pct} />
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
        )}
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
