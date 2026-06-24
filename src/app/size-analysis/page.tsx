"use client";

import { useEffect, useState, useMemo } from "react";
import AppShell from "@/components/app/AppShell";
import FloatingDetailModal, { type SourceRow } from "@/components/FloatingDetailModal";
import { useTweaks } from "@/components/editorial/TweaksContext";
import { 
  Card, 
  LineChart, 
  BarsH, 
  Empty,
  pct,
  Heatmap
} from "@/components/app/widgets";
import type { Event } from "@/lib/store/types";
import { DISPOSAFE_REGISTRY } from "@/lib/registry/disposafe";
import {
  bySize,
  sizeTrend,
  periodsIn,
  periodKey,
  periodLabel,
  resolveScope,
  scopeEvents,
  type Scope,
  byDefect
} from "@/lib/analytics";

const STAGE_LABELS: Record<string, string> = {
  visual: "Visual Inspection", "eye-punching": "Eye Punching", balloon: "Balloon Testing",
  "valve-integrity": "Valve Integrity", final: "Final Inspection",
};

function toSourceRows(events: Event[], filter: { stageId?: string; defectCode?: string; size?: string; types?: string[] } = {}): SourceRow[] {
  const out: SourceRow[] = [];
  for (const e of events as any[]) {
    if (filter.types && !filter.types.includes(e.eventType)) continue;
    if (filter.stageId && e.stageId !== filter.stageId) continue;
    if (filter.size && e.size !== filter.size) continue;
    if (filter.defectCode && e.defectCodeRaw !== filter.defectCode && e.defectCode !== filter.defectCode) continue;
    const prov = e.provenance ?? {};
    out.push({
      date: e.occurredOn?.start ?? "—",
      stage: STAGE_LABELS[e.stageId] ?? e.stageId ?? "—",
      size: e.size ?? null,
      type: e.eventType + (e.disposition ? `·${e.disposition}` : "") + (e.defectCodeRaw ? ` ${e.defectCodeRaw}` : ""),
      qty: e.quantity ?? e.statedValue ?? "—",
      file: prov.file ?? "Manual Entry",
      sheet: prov.sheet,
      cell: prov.cells?.[0] ?? "ENTRY",
    });
  }
  return out.sort((a, b) => b.date.localeCompare(a.date));
}

export default function SizeAnalysisPage() {
  const { t } = useTweaks();
  const [events, setEvents] = useState<Event[] | null>(null);
  const [selectedSize, setSelectedSize] = useState("Fr16");
  const [modalOpen, setModalOpen] = useState(false);
  const [modalTitle, setModalTitle] = useState("");
  const [modalInsight, setModalInsight] = useState<string | string[]>([]);
  const [modalContent, setModalContent] = useState<React.ReactNode>(null);
  const [modalSourceRows, setModalSourceRows] = useState<SourceRow[] | undefined>(undefined);
  const [modalPrimaryValue, setModalPrimaryValue] = useState<string | undefined>(undefined);
  const [rawSheets, setRawSheets] = useState<any[] | undefined>(undefined);

  const openModal = (
    title: string,
    insight: string | string[],
    content: React.ReactNode,
    source?: { rows: SourceRow[]; value: string }
  ) => {
    setModalTitle(title);
    setModalInsight(insight);
    setModalContent(content);
    setModalSourceRows(source?.rows);
    setModalPrimaryValue(source?.value);
    setModalOpen(true);
  };

  useEffect(() => {
    fetch("/api/events")
      .then((r) => r.json())
      .then((b) => setEvents(b.events ?? []))
      .catch(() => setEvents([]));

    // Load stashed raw sheets if any are available in sessionStorage
    try {
      let activeId = sessionStorage.getItem("rais_active_session_id");
      if (!activeId) {
        for (let i = 0; i < sessionStorage.length; i++) {
          const key = sessionStorage.key(i);
          if (key && key.startsWith("rais_raw_")) {
            activeId = key.substring("rais_raw_".length);
            break;
          }
        }
      }
      if (activeId) {
        const stored = sessionStorage.getItem(`rais_raw_${activeId}`);
        if (stored) setRawSheets(JSON.parse(stored));
      }
    } catch { /* ignore */ }
  }, []);

  const scope: Scope = useMemo(
    () => resolveScope(events ?? [], t),
    [events, t.grain, t.datePreset, t.dateFrom, t.dateTo, t.stageView],
  );

  const srcRows = (filter: Parameters<typeof toSourceRows>[1] = {}): SourceRow[] =>
    events ? toSourceRows(scopeEvents(events, scope), filter) : [];

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

    // Compute Size x Defect Heatmap matrix
    const rejEvents = scopeEvents(events, scope).filter(
      (e) => e.eventType === "rejection" && (e as any).size
    );
    const defects = byDefect(events, scope);
    const topDefects = defects.slice(0, 8);
    const heatRows = orderedSizes.map((s) => s.size);
    const heatCols = topDefects.map((d) => d.label);

    const getDefectLabel = (code: string | null, raw: string) => {
      if (!code) return raw;
      return DISPOSAFE_REGISTRY.defects.find((d) => d.defectCode === code)?.label ?? code;
    };

    const heatMatrix = heatRows.map((size) => {
      return heatCols.map((defectLabelStr) => {
        const matchedEvents = rejEvents.filter((e) => {
          if ((e as any).size !== size) return false;
          const label = getDefectLabel((e as any).defectCode, (e as any).defectCodeRaw);
          return label === defectLabelStr;
        });
        return matchedEvents.reduce((sum, e) => sum + ((e as any).quantity || 0), 0);
      });
    });

    return {
      sizes: orderedSizes,
      sizeTrend: szTrend,
      heatRows,
      heatCols,
      heatMatrix,
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

          const hasLeft = m.sizes.length > 0;
          const hasRight = m.sizeTrend.length > 0;
          const gridTemplate = hasLeft && hasRight ? "minmax(0, 1.2fr) minmax(0, 1.8fr)" : "minmax(0, 1fr)";

          return (
            <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
              <div style={{ display: "grid", gridTemplateColumns: gridTemplate, gap: 20 }}>
                {hasLeft && (
                  <Card title={`Size-wise Rejection (YTD) (${grainLabel})`} onClick={() => openModal(`Size-wise Rejection (YTD) (${grainLabel})`, ytdModalInsight, <div style={{ minHeight: 240, display: "flex", flexDirection: "column", justifyContent: "center" }}><BarsH rows={m.sizes.map((s) => ({ label: s.size, value: s.rejRate * 100 }))} fmt={(n) => `${n.toFixed(1)}%`} /></div>, { rows: srcRows({ types: ["inspection", "rejection"] }).filter(r => r.size), value: m.sizes.length ? `${(Math.max(...m.sizes.map(s => s.rejRate)) * 100).toFixed(1)}%` : "—" })}>
                    <BarsH rows={m.sizes.map((s) => ({ label: s.size, value: s.rejRate * 100 }))} fmt={(n) => `${n.toFixed(1)}%`} />
                  </Card>
                )}

                {hasRight && (
                  <div style={{ display: "flex", flexDirection: "column", gap: 20, minWidth: 0 }}>
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

                    <Card title={`Size-wise Rejection Trend (${selectedSize}) (${grainLabel})`} onClick={() => openModal(`Size-wise Rejection Trend (${selectedSize}) (${grainLabel})`, trendModalInsight, <div style={{ minHeight: 240, display: "flex", flexDirection: "column", justifyContent: "center" }}><LineChart points={m.sizeTrend} fmt={pct} /></div>, { rows: srcRows({ types: ["production", "inspection"], size: selectedSize }), value: m.sizeTrend.length ? pct(m.sizeTrend[m.sizeTrend.length - 1].value) : "—" })}>
                      <LineChart points={m.sizeTrend} fmt={pct} />
                    </Card>
                  </div>
                )}
              </div>

              {hasLeft && m.heatMatrix && m.heatMatrix.length > 0 && (
                <Card title="Size × Defect Correlation Heatmap" sub="rejected quantity by size vs defect category">
                  <Heatmap 
                    rows={m.heatRows} 
                    cols={m.heatCols} 
                    matrix={m.heatMatrix} 
                    fmt={(n) => Math.round(n).toLocaleString("en-IN")} 
                  />
                </Card>
              )}
            </div>
          );
        })()}
      </div>

      <FloatingDetailModal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        title={modalTitle}
        insight={modalInsight}
        sourceRows={modalSourceRows}
        primaryValue={modalPrimaryValue}
        rawSheets={rawSheets}
      >
        {modalContent}
      </FloatingDetailModal>
    </AppShell>
  );
}
