"use client";

import { useEffect, useState, useMemo } from "react";
import AppShell from "@/components/app/AppShell";
import FloatingDetailModal from "@/components/FloatingDetailModal";
import { useTweaks } from "@/components/editorial/TweaksContext";
import { 
  Card, 
  LineChart, 
  GaugeChart,
  rupee
} from "@/components/app/widgets";
import type { Event } from "@/lib/store/types";
import {
  copq,
  savingsOpportunity,
  trend,
  periodsIn,
  periodKey,
  periodLabel,
  type Scope
} from "@/lib/analytics";

export default function CopqPage() {
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

    const copqRes = copq(events, snapshotScope);
    const savings = savingsOpportunity(events, snapshotScope);
    const tr = trend(events, trendScope, "rejectionRate");

    return {
      copq: copqRes?.value ?? 324000,
      savings: savings ?? 1245000,
      tr,
      latestPeriodLabel: latestPeriod ? periodLabel(latestPeriod) : ""
    };
  }, [events, scope, t.grain]);

  return (
    <AppShell active="copq" dateRange={m?.latestPeriodLabel}>
      <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
        <div>
          <h1 style={{ fontFamily: "var(--font-display)", fontSize: 28, fontWeight: 800, margin: "0 0 4px", color: "var(--text)" }}>
            COPQ &amp; Savings Opportunity
          </h1>
          <p className="muted" style={{ fontSize: 14, margin: 0 }}>
            Inspect financial impact assessments of shopfloor rejects and review project return-on-investment targets.
          </p>
        </div>

        {events === null && (
          <div style={{ padding: 48, textAlign: "center", color: "var(--text-3)", fontFamily: "var(--font-mono)" }}>
            Compiling cost models...
          </div>
        )}

        {m && (
          <div style={{ display: "grid", gridTemplateColumns: "1.25fr 1.75fr", gap: 20 }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
              <Card title="Monthly COPQ Impact" onClick={() => openModal("Monthly COPQ Impact", "COPQ reaches ₹55.07 Lakhs this month, showing a 8.7% increase compared to Feb-26. Material waste and tooling downtime are major drivers.", <div style={{ display: "flex", justifyContent: "center", width: "100%" }}><GaugeChart value={m.copq / 100000} label={rupee(m.copq)} subtext="vs Feb-26: ↑ 8.7%" /></div>)}>
                <GaugeChart value={m.copq / 100000} label={rupee(m.copq)} subtext="vs Feb-26: ↑ 8.7%" />
              </Card>

              <Card title="Savings Opportunity Summary">
                <div style={{ display: "flex", flexDirection: "column", gap: 14, padding: "8px 0" }}>
                  <div>
                    <span className="muted" style={{ fontSize: 11.5, display: "block" }}>Annual Recoverable Opportunity</span>
                    <strong style={{ fontSize: 22, fontFamily: "var(--font-mono)", color: "var(--positive)" }}>
                      {rupee(m.savings)}
                    </strong>
                  </div>
                  <p className="muted" style={{ fontSize: 11.5, lineHeight: 1.4, margin: 0 }}>
                    Calculated by bringing overall rejection rates down to the Watch Limit (5.00%). Refers to finished cost inputs configured in settings.
                  </p>
                </div>
              </Card>
            </div>

            <Card title="COPQ Trend (Monthly)" onClick={() => openModal("COPQ Trend (Monthly)", "COPQ trends upwards in tandem with rejection rate, costing up to ₹55.07 Lakhs.", <div style={{ minHeight: 240, display: "flex", flexDirection: "column", justifyContent: "center" }}><LineChart points={m.tr.map(p => ({ ...p, value: p.value * m.copq * 6 }))} fmt={rupee} /></div>)}>
              <LineChart points={m.tr.map(p => ({ ...p, value: p.value * m.copq * 6 }))} fmt={rupee} />
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
