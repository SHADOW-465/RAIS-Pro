"use client";

import { useEffect, useState, useMemo } from "react";
import AppShell from "@/components/app/AppShell";
import FloatingDetailModal from "@/components/FloatingDetailModal";
import { useTweaks } from "@/components/editorial/TweaksContext";
import { 
  Card, 
  ProcessFlow
} from "@/components/app/widgets";
import type { Event } from "@/lib/store/types";
import {
  byStage,
  periodsIn,
  periodKey,
  periodLabel,
  type Scope
} from "@/lib/analytics";

export default function ProcessFlowPage() {
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

    const stages = byStage(events, snapshotScope);
    const order = ["visual", "eye-punching", "balloon", "valve-integrity", "final"];
    const orderedStages = [...stages].sort((a, b) => order.indexOf(a.stageId) - order.indexOf(b.stageId));

    return {
      stages: orderedStages,
      latestPeriodLabel: latestPeriod ? periodLabel(latestPeriod) : ""
    };
  }, [events, scope, t.grain]);

  return (
    <AppShell active="process-flow" dateRange={m?.latestPeriodLabel}>
      <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
        <div>
          <h1 style={{ fontFamily: "var(--font-display)", fontSize: 28, fontWeight: 800, margin: "0 0 4px", color: "var(--text)" }}>
            Process Flow Overview
          </h1>
          <p className="muted" style={{ fontSize: 14, margin: 0 }}>
            Inspect cumulative yield, checked volumes, and bottleneck stages across the catheter assembly line.
          </p>
        </div>

        {events === null && (
          <div style={{ padding: 48, textAlign: "center", color: "var(--text-3)", fontFamily: "var(--font-mono)" }}>
            Aggregating process pipeline metrics...
          </div>
        )}

        {m && (
          <div style={{ width: "100%" }}>
            <Card title="Production Process Flow" onClick={() => openModal("Process Flow", "The catheter assembly process flow indicates that Balloon Sealing and Valve Integrity are bottleneck quality gates.", <div style={{ minHeight: 240, display: "flex", flexDirection: "column", justifyContent: "center" }}><ProcessFlow rows={m.stages} /></div>)}>
              <ProcessFlow rows={m.stages} />
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
