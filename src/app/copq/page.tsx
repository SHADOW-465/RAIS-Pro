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
  resolveScope,
  type Scope,
  copqTrend
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

  const scope: Scope = useMemo(
    () => resolveScope(events ?? [], t),
    [events, t.grain, t.datePreset, t.dateFrom, t.dateTo, t.stageView],
  );

  const m = useMemo(() => {
    if (!events || events.length === 0) return null;

    const allPeriods = periodsIn(events, t.grain);
    const latestPeriod = allPeriods[allPeriods.length - 1];

    const trendScope: Scope = scope; // carries the stage filter into the trends

    const copqRes = copq(events, scope);
    const savings = savingsOpportunity(events, scope);
    const cTrend = copqTrend(events, trendScope);

    // Dynamic Period-over-Period Delta
    let copqDiff = "vs Prior Period";
    if (cTrend.length >= 2) {
      const lastVal = cTrend[cTrend.length - 1].value;
      const prevVal = cTrend[cTrend.length - 2].value;
      if (prevVal > 0) {
        const diff = ((lastVal - prevVal) / prevVal) * 100;
        const dir = diff >= 0 ? "↑" : "↓";
        copqDiff = `vs ${cTrend[cTrend.length - 2].label}: ${dir} ${Math.abs(diff).toFixed(1)}%`;
      }
    }

    return {
      copq: copqRes?.value ?? 0,
      savings: savings ?? 0,
      copqTrend: cTrend,
      copqDiff,
      latestPeriodLabel: latestPeriod ? periodLabel(latestPeriod) : ""
    };
  }, [events, scope, t.grain]);

  const grainLabel = t.grain === "day" ? "Daily" : t.grain === "week" ? "Weekly" : t.grain === "month" ? "Monthly" : "Yearly";

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
              <Card title={`${grainLabel} COPQ Impact`} onClick={() => openModal(`${grainLabel} COPQ Impact`, `COPQ reaches ${rupee(m.copq)} this period. ${m.copqDiff}. Material waste and tooling downtime are major drivers.`, <div style={{ display: "flex", justifyContent: "center", width: "100%" }}><GaugeChart value={m.copq / 100000} label={rupee(m.copq)} subtext={m.copqDiff} /></div>)}>
                <GaugeChart value={m.copq / 100000} label={rupee(m.copq)} subtext={m.copqDiff} />
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

            <Card title={`COPQ Trend (${grainLabel})`} onClick={() => openModal(`COPQ Trend (${grainLabel})`, `Cost of poor quality trends across historical periods.`, <div style={{ minHeight: 240, display: "flex", flexDirection: "column", justifyContent: "center" }}><LineChart points={m.copqTrend} fmt={rupee} /></div>)}>
              <LineChart points={m.copqTrend} fmt={rupee} />
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
