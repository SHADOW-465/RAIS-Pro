"use client";

import { useEffect, useState, useMemo } from "react";
import AppShell from "@/components/app/AppShell";
import FloatingDetailModal from "@/components/FloatingDetailModal";
import { useTweaks } from "@/components/editorial/TweaksContext";
import { 
  Card, 
  MultiLine, 
  DefectParetoTable
} from "@/components/app/widgets";
import type { Event } from "@/lib/store/types";
import {
  byDefect,
  defectTrend,
  periodsIn,
  periodKey,
  periodLabel,
  type Scope
} from "@/lib/analytics";

export default function DefectAnalysisPage() {
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

    const defects = byDefect(events, snapshotScope);
    const dt = defectTrend(events, trendScope, 5);

    return {
      defects,
      defectTrend: dt,
      latestPeriodLabel: latestPeriod ? periodLabel(latestPeriod) : ""
    };
  }, [events, scope, t.grain]);

  return (
    <AppShell active="defect" dateRange={m?.latestPeriodLabel}>
      <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
        <div>
          <h1 style={{ fontFamily: "var(--font-display)", fontSize: 28, fontWeight: 800, margin: "0 0 4px", color: "var(--text)" }}>
            Defect Analysis
          </h1>
          <p className="muted" style={{ fontSize: 14, margin: 0 }}>
            Analyze defect distribution using Six Sigma Pareto categorization and historical reason codes.
          </p>
        </div>

        {events === null && (
          <div style={{ padding: 48, textAlign: "center", color: "var(--text-3)", fontFamily: "var(--font-mono)" }}>
            Aggregating defect logs...
          </div>
        )}

        {m && (
          <div style={{ display: "grid", gridTemplateColumns: "1.2fr 1.8fr", gap: 20 }}>
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
