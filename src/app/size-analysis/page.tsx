"use client";

import { useEffect, useState, useMemo } from "react";
import Select from "@/components/ui/Select";
import AppShell from "@/components/app/AppShell";
import PageLoader from "@/components/app/PageLoader";
import { useEvents } from "@/components/app/EventsContext";
import { useRegistry } from "@/components/app/RegistryContext";
import FloatingDetailModal, { type SourceRow, type SourceMetricKind } from "@/components/FloatingDetailModal";
import { useTweaks } from "@/components/editorial/TweaksContext";
import {
  Card,
  LineChart,
  BarsH,
  Empty,
  pct,
  Heatmap,
  num,
  SizeColorLegend
} from "@/components/app/widgets";
import { sizeColorFor } from "@/lib/entry/size-color";
import { EMPTY_REGISTRY } from "@/core/ontology/empty-registry";
import {
  bySize,
  sizeTrend,
  periodsIn,
  periodKey,
  periodLabel,
  resolveScope,
  scopeEvents,
  type Scope,
  byDefect,
  useApplyInvestigationFromUrl,
  toSourceRows,
} from "@/lib/analytics";

export default function SizeAnalysisPage() {
  const { t } = useTweaks();
  const { events: contextEvents, isLoading } = useEvents();
  const { registry, policy } = useRegistry();
  const activeRegistry = registry || EMPTY_REGISTRY;
  const events = contextEvents ? (contextEvents as any[]) : null;
  const [selectedSize, setSelectedSize] = useState("Fr16");
  // Mid-path: carry size + period from attention rail / deep links.
  useApplyInvestigationFromUrl({
    onSize: (size) => setSelectedSize(size),
  });
  const [modalOpen, setModalOpen] = useState(false);
  const [modalTitle, setModalTitle] = useState("");
  const [modalInsight, setModalInsight] = useState<string | string[]>([]);
  const [modalContent, setModalContent] = useState<React.ReactNode>(null);
  const [modalSourceRows, setModalSourceRows] = useState<SourceRow[] | undefined>(undefined);
  const [modalPrimaryValue, setModalPrimaryValue] = useState<string | undefined>(undefined);
  const [modalMetricKind, setModalMetricKind] = useState<SourceMetricKind>("size");
  const [rawSheets, setRawSheets] = useState<any[] | undefined>(undefined);

  const openModal = (
    title: string,
    insight: string | string[],
    content: React.ReactNode,
    source?: { rows: SourceRow[]; value: string; metricKind?: SourceMetricKind }
  ) => {
    setModalTitle(title);
    setModalInsight(insight);
    setModalContent(content);
    setModalSourceRows(source?.rows);
    setModalPrimaryValue(source?.value);
    setModalMetricKind(source?.metricKind ?? "size");
    setModalOpen(true);
  };

  useEffect(() => {
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
    () => resolveScope(events ?? [], t, policy),
    [events, t, policy],
  );

  const srcRows = (filter: Parameters<typeof toSourceRows>[1] = {}): SourceRow[] =>
    events ? toSourceRows(scopeEvents(events, scope), filter) : [];

  const m = useMemo(() => {
    if (!events || events.length === 0) return null;

    const allPeriods = periodsIn(events, t.grain);
    const latestPeriod = allPeriods[allPeriods.length - 1];

    const sizes = bySize(events, scope);
    const trend = sizeTrend(events, scope, selectedSize);

    // Pivot sizes for Heatmap
    // rows = top defects, cols = sizes, matrix = 2D array
    const activeSizes = ["Fr10", "Fr12", "Fr14", "Fr16", "Fr18", "Fr20", "Fr22", "Fr24"];
    const defects = byDefect(events, scope, activeRegistry);
    const topDefectLabels = defects.slice(0, 8).map(d => d.label);

    const heatMatrix = topDefectLabels.map(def => {
      return activeSizes.map(sz => {
        // sum quantity of events in scope for this size and defect
        const matched = (scopeEvents(events, scope) as any[]).filter(
          e => e.eventType === "rejection" &&
               e.size === sz &&
               (e.defectCodeRaw === def || e.defectCode === def)
        );
        return matched.reduce((s, e: any) => s + (e.quantity ?? 0), 0);
      });
    });

    return {
      sizes,
      sizeTrend: trend,
      heatRows: topDefectLabels,
      heatCols: activeSizes,
      heatMatrix,
      latestPeriodLabel: latestPeriod ? periodLabel(latestPeriod) : ""
    };
  }, [events, scope, t.grain, selectedSize, activeRegistry]);

  // Synchronize selected size with the available sizes dataset
  useEffect(() => {
    if (m && m.sizes.length > 0 && !m.sizes.some(s => s.size === selectedSize)) {
      const worstSize = [...m.sizes].sort((a, b) => b.rejRate - a.rejRate)[0];
      setSelectedSize(worstSize ? worstSize.size : m.sizes[0].size);
    }
  }, [m, selectedSize]);

  const grainLabel = t.grain === "day" ? "Daily" : t.grain === "week" ? "Weekly" : t.grain === "month" ? "Monthly" : "Yearly";

  // Pure yellow/white read poorly as a thin line stroke, so the trend line
  // falls back to the house accent for those two; every other size color
  // reads fine at 1.8px.
  const selectedSizeColor = sizeColorFor(selectedSize);
  const trendColor =
    selectedSizeColor && selectedSizeColor.hex !== "#FFFF00" && selectedSizeColor.hex !== "#FFFFFF"
      ? selectedSizeColor.hex
      : undefined;

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

        {isLoading && (
          <PageLoader message="Aggregating size quality records..." minHeight="40vh" />
        )}

        {!isLoading && (!events || events.length === 0) && (
          <div style={{ padding: "48px 24px", textAlign: "center", background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--radius-lg)" }}>
            <div style={{ fontFamily: "var(--font-display)", fontSize: 18, fontWeight: 800, marginBottom: 8, color: "var(--text)" }}>
              No Data Available
            </div>
            <p className="muted" style={{ fontSize: 13, margin: "0 0 16px" }}>
              Please upload monthly inspection workbooks in Staging &amp; Review to populate these metrics.
            </p>
            <a
              href="/staging"
              style={{
                display: "inline-block", textDecoration: "none", fontFamily: "var(--font-sans)", fontWeight: 700, fontSize: 12.5,
                color: "var(--paper)", background: "var(--accent)", border: "none",
                padding: "8px 16px", borderRadius: "var(--radius-md)", cursor: "pointer"
              }}
            >
              Go to Staging &amp; Review →
            </a>
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

          return (
            <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
              {/* Reference: DS/ANX/05 size color code, so every colored size
                  below (rejection list, caliber picker, trend line, heatmap
                  columns) reads against its own legend instead of assumed
                  knowledge. */}
              <Card
                title="Size Color Code"
                sub="DS/ANX/05 — Dispofoley Latex Foley Balloon Capacity"
              >
                <SizeColorLegend sizes={m.heatCols} />
              </Card>

              {/* Top Tier: Size-wise YTD Loss & Interactive Trend Explorer (2 Equal Columns) */}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(480px, 1fr))", gap: 20 }}>
                {hasLeft && (
                  <Card
                    title={`Size-wise Rejection (YTD) (${grainLabel})`}
                    sub="Cumulative rejection loss across all catheter calibers (Fr10–Fr24)"
                    onClick={() =>
                      openModal(
                        `Size-wise Rejection (YTD) (${grainLabel})`,
                        ytdModalInsight,
                        <div style={{ minHeight: 240, display: "flex", flexDirection: "column", justifyContent: "center" }}>
                          <BarsH
                            rows={m.sizes.map((s) => ({
                              label: s.size,
                              value: s.rejRate * 100,
                              sub: `${s.rejected.toLocaleString("en-IN")} rejected of ${s.checked.toLocaleString("en-IN")}`,
                              color: sizeColorFor(s.size)?.hex,
                            }))}
                            fmt={(n) => `${n.toFixed(1)}%`}
                          />
                        </div>,
                        { rows: srcRows({ types: ["inspection", "rejection"] }).filter(r => r.size), value: m.sizes.length ? `${(Math.max(...m.sizes.map(s => s.rejRate)) * 100).toFixed(1)}%` : "—" }
                      )
                    }
                  >
                    <BarsH
                      rows={m.sizes.map((s) => ({
                        label: s.size,
                        value: s.rejRate * 100,
                        sub: `${s.rejected.toLocaleString("en-IN")} rejected of ${s.checked.toLocaleString("en-IN")}`,
                        color: sizeColorFor(s.size)?.hex,
                      }))}
                      fmt={(n) => `${n.toFixed(1)}%`}
                    />
                  </Card>
                )}

                {hasRight && (
                  <Card
                    title={`Size-wise Rejection Trend (${selectedSize}) (${grainLabel})`}
                    sub="Longitudinal defect rate for selected French gauge"
                    onClick={() =>
                      openModal(
                        `Size-wise Rejection Trend (${selectedSize}) (${grainLabel})`,
                        trendModalInsight,
                        <div style={{ minHeight: 240, display: "flex", flexDirection: "column", justifyContent: "center" }}>
                          <LineChart points={m.sizeTrend} fmt={pct} color={trendColor} />
                        </div>,
                        { rows: srcRows({ types: ["production", "inspection"], size: selectedSize }), value: m.sizeTrend.length ? pct(m.sizeTrend[m.sizeTrend.length - 1].value) : "—" }
                      )
                    }
                  >
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
                      <span className="muted" style={{ fontSize: 12, fontWeight: 600 }}>Select Caliber:</span>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        {selectedSizeColor && (
                          <span
                            aria-hidden="true"
                            title={`${selectedSize} — ${selectedSizeColor.name}`}
                            style={{
                              width: 10,
                              height: 10,
                              borderRadius: 3,
                              flexShrink: 0,
                              background: selectedSizeColor.hex,
                              boxShadow: selectedSizeColor.hex === "#FFFFFF" ? "inset 0 0 0 1px var(--border-strong)" : undefined,
                            }}
                          />
                        )}
                        <Select
                          value={selectedSize}
                          onChange={setSelectedSize}
                          options={(m.sizes.length > 0 ? m.sizes.map((s) => s.size) : ["Fr10", "Fr12", "Fr14", "Fr16", "Fr18", "Fr20", "Fr22", "Fr24"]).map((sz) => ({ value: sz, label: `${sz} Catheter` }))}
                          block={false}
                          mono
                          size="sm"
                          ariaLabel="Filter size trend"
                          style={{ minWidth: 150 }}
                        />
                      </div>
                    </div>
                    <LineChart points={m.sizeTrend} fmt={pct} height={230} color={trendColor} />
                  </Card>
                )}
              </div>

              {/* Bottom Tier: Full Width Heatmap Matrix */}
              {hasLeft && m.heatMatrix && m.heatMatrix.length > 0 && (
                <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                  <h2 style={{ fontSize: 16, fontWeight: 700, margin: 0, color: "var(--text)" }}>
                    Cross-Dimensional Size × Defect Mode Correlation Matrix
                  </h2>
                  <Card
                    title="Size × Defect Correlation Heatmap"
                    sub="Longitudinal distribution of rejected units across active size calibers and defect categories"
                    onClick={() =>
                      openModal(
                        "Size × Defect Correlation Heatmap",
                        "Correlation matrix mapping rejected quantities across different catheter sizes (Fr10–Fr24) against active defect modes.",
                        <div style={{ minHeight: 320, display: "flex", flexDirection: "column", justifyContent: "center" }}>
                          <Heatmap rows={m.heatRows} cols={m.heatCols} matrix={m.heatMatrix} fmt={(n) => Math.round(n).toLocaleString("en-IN")} colColor={(col) => sizeColorFor(col)?.hex} />
                        </div>,
                        { rows: srcRows({ types: ["inspection", "rejection"] }).filter(r => r.size), value: num(m.sizes.reduce((s, x) => s + x.rejected, 0)) }
                      )
                    }
                  >
                    <Heatmap
                      rows={m.heatRows}
                      cols={m.heatCols}
                      matrix={m.heatMatrix}
                      fmt={(n) => Math.round(n).toLocaleString("en-IN")}
                      colColor={(col) => sizeColorFor(col)?.hex}
                    />
                  </Card>
                </div>
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
        metricKind={modalMetricKind}
        periodGrain={t.grain === "week" ? "week" : t.grain === "day" ? "day" : "month"}
        primaryValue={modalPrimaryValue}
        rawSheets={rawSheets}
      >
        {modalContent}
      </FloatingDetailModal>
    </AppShell>
  );
}
