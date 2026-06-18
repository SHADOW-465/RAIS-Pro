"use client";

import { useEffect, useState, useMemo } from "react";
import AppShell from "@/components/app/AppShell";
import FloatingDetailModal from "@/components/FloatingDetailModal";
import { useTweaks } from "@/components/editorial/TweaksContext";
import { 
  Card, 
  LineChart, 
  BarsH, 
  pct
} from "@/components/app/widgets";
import type { Event } from "@/lib/store/types";
import {
  bySize,
  sizeTrend,
  periodsIn,
  periodKey,
  periodLabel,
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

    const sizes = bySize(events, snapshotScope);
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

  return (
    <AppShell active="size" dateRange={m?.latestPeriodLabel}>
      <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
        <div>
          <h1 style={{ fontFamily: "var(--font-display)", fontSize: 28, fontWeight: 800, margin: "0 0 4px", color: "var(--text)" }}>
            Size Analysis
          </h1>
          <p className="muted" style={{ fontSize: 14, margin: 0 }}>
            Inspect quality variation and rejection patterns across catheter sizes Fr10 through Fr18.
          </p>
        </div>

        {events === null && (
          <div style={{ padding: 48, textAlign: "center", color: "var(--text-3)", fontFamily: "var(--font-mono)" }}>
            Aggregating size quality records...
          </div>
        )}

        {m && (
          <div style={{ display: "grid", gridTemplateColumns: "1.2fr 1.8fr", gap: 20 }}>
            <Card title="Size-wise Rejection (YTD)" onClick={() => openModal("Size-wise Rejection (YTD)", "Fr16 and Fr18 sizes represent the highest quality losses, suggesting larger diameter catheters undergo higher stress.", <div style={{ minHeight: 240, display: "flex", flexDirection: "column", justifyContent: "center" }}><BarsH rows={m.sizes.map((s) => ({ label: s.size, value: s.rejRate * 100 }))} fmt={(n) => `${n.toFixed(1)}%`} /></div>)}>
              <BarsH rows={m.sizes.map((s) => ({ label: s.size, value: s.rejRate * 100 }))} fmt={(n) => `${n.toFixed(1)}%`} />
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
                  <option value="Fr10">Fr10 Catheter</option>
                  <option value="Fr12">Fr12 Catheter</option>
                  <option value="Fr14">Fr14 Catheter</option>
                  <option value="Fr16">Fr16 Catheter</option>
                  <option value="Fr18">Fr18 Catheter</option>
                </select>
              </div>

              <Card title={`Size-wise Rejection Trend (${selectedSize})`} onClick={() => openModal(`Size-wise Rejection Trend (${selectedSize})`, `${selectedSize} quality levels show minor fluctuations across periods. Ensure material batch consistency.`, <div style={{ minHeight: 240, display: "flex", flexDirection: "column", justifyContent: "center" }}><LineChart points={m.sizeTrend} fmt={pct} /></div>)}>
                <LineChart points={m.sizeTrend} fmt={pct} />
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
