"use client";

import { useEffect, useState, useMemo } from "react";
import AppShell from "@/components/app/AppShell";
import FloatingDetailModal from "@/components/FloatingDetailModal";
import { useTweaks } from "@/components/editorial/TweaksContext";
import { 
  Card, 
  LineChart, 
  BarsH, 
  Empty,
  pct
} from "@/components/app/widgets";
import type { Event } from "@/lib/store/types";
import {
  bySize,
  sizeTrend,
  periodsIn,
  periodKey,
  periodLabel,
  resolveScope,
  type Scope
} from "@/lib/analytics";

export default function SizeAnalysisPage() {
  const { t } = useTweaks();
  const [events, setEvents] = useState<Event[] | null>(null);
  const [selectedSize, setSelectedSize] = useState("Fr16");
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



    const sizes = bySize(events, scope);
    const orderedSizes = [...sizes].sort((a, b) => {
      const an = parseInt(a.size.replace(/\D/g, ""), 10);
      const bn = parseInt(b.size.replace(/\D/g, ""), 10);
      return an - bn;
    });

    const szTrend = sizeTrend(events, trendScope, selectedSize);

    return {
      sizes: orderedSizes,
      sizeTrend: szTrend,
      latestPeriodLabel: latestPeriod ? periodLabel(latestPeriod) : ""
    };
  }, [events, scope, selectedSize, t.grain]);

  // Synchronize selected size with the available sizes dataset
  useEffect(() => {
    if (m && m.sizes.length > 0 && !m.sizes.some(s => s.size === selectedSize)) {
      const worstSize = [...m.sizes].sort((a, b) => b.rejRate - a.rejRate)[0];
      setSelectedSize(worstSize ? worstSize.size : m.sizes[0].size);
    }
  }, [m, selectedSize]);

  const grainLabel = t.grain === "day" ? "Daily" : t.grain === "week" ? "Weekly" : t.grain === "month" ? "Monthly" : "Yearly";

  return (
    <AppShell active="size" dateRange={m?.latestPeriodLabel}>
      <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
        <div>
          <h1 style={{ fontFamily: "var(--font-display)", fontSize: 28, fontWeight: 800, margin: "0 0 4px", color: "var(--text)" }}>
            Size Analysis
          </h1>
          <p className="muted" style={{ fontSize: 14, margin: 0 }}>
            Inspect quality variation and rejection patterns across catheter sizes Fr10 through Fr24.
          </p>
        </div>

        {events === null && (
          <div style={{ padding: 48, textAlign: "center", color: "var(--text-3)", fontFamily: "var(--font-mono)" }}>
            Aggregating size quality records...
          </div>
        )}

        {m && (() => {
          const worstSize = m.sizes.length > 0 ? [...m.sizes].sort((a,b) => b.rejRate - a.rejRate)[0] : null;
          const ytdModalInsight = worstSize
            ? worstSize.rejRate > 0
              ? `Size ${worstSize.size} represents the highest quality loss with a rejection rate of ${(worstSize.rejRate * 100).toFixed(2)}%.`
              : "All catheter sizes operate within control parameters with 0.00% rejection rate."
            : "No size-wise data available for this range.";

          const trendModalInsight = m.sizeTrend.length > 0
            ? `Quality level trends for catheter size ${selectedSize} across historical periods.`
            : `No trend data available for size ${selectedSize}.`;

          return (
            <div style={{ display: "grid", gridTemplateColumns: "1.2fr 1.8fr", gap: 20 }}>
              <Card title={`Size-wise Rejection (YTD) (${grainLabel})`} onClick={() => openModal(`Size-wise Rejection (YTD) (${grainLabel})`, ytdModalInsight, <div style={{ minHeight: 240, display: "flex", flexDirection: "column", justifyContent: "center" }}><BarsH rows={m.sizes.map((s) => ({ label: s.size, value: s.rejRate * 100 }))} fmt={(n) => `${n.toFixed(1)}%`} /></div>)}>
                {m.sizes.length > 0 ? (
                  <BarsH rows={m.sizes.map((s) => ({ label: s.size, value: s.rejRate * 100 }))} fmt={(n) => `${n.toFixed(1)}%`} />
                ) : (
                  <Empty label="No size-wise YTD data available for the selected period." />
                )}
              </Card>

              <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <span className="muted" style={{ fontSize: 13, fontWeight: 600 }}>Filter Size Trend:</span>
                  <select
                    value={selectedSize}
                    onChange={(e) => setSelectedSize(e.target.value)}
                    style={{
                      padding: "6px 12px",
                      borderRadius: "var(--radius-sm)",
                      border: "1px solid var(--border-strong)",
                      background: "var(--surface)",
                      color: "var(--text)",
                      fontSize: "13px",
                      fontWeight: 600,
                      outline: "none",
                      cursor: "pointer"
                    }}
                  >
                    {(m.sizes.length > 0 ? m.sizes.map(s => s.size) : ["Fr10", "Fr12", "Fr14", "Fr16", "Fr18", "Fr20", "Fr22", "Fr24"]).map((sz) => (
                      <option key={sz} value={sz}>{sz} Catheter</option>
                    ))}
                  </select>
                </div>

                <Card title={`Size-wise Rejection Trend (${selectedSize}) (${grainLabel})`} onClick={() => openModal(`Size-wise Rejection Trend (${selectedSize}) (${grainLabel})`, trendModalInsight, <div style={{ minHeight: 240, display: "flex", flexDirection: "column", justifyContent: "center" }}><LineChart points={m.sizeTrend} fmt={pct} /></div>)}>
                  {m.sizeTrend.length > 0 ? (
                    <LineChart points={m.sizeTrend} fmt={pct} />
                  ) : (
                    <Empty label={`No trend data available for size ${selectedSize}.`} />
                  )}
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
