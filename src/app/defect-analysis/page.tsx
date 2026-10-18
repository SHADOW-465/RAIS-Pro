"use client";

import { useEffect, useState, useMemo } from "react";
import AppShell from "@/components/app/AppShell";
import PageLoader from "@/components/app/PageLoader";
import { useEvents } from "@/components/app/EventsContext";
import { useRegistry } from "@/components/app/RegistryContext";
import { EMPTY_REGISTRY } from "@/core/ontology/empty-registry";
import FloatingDetailModal, { type SourceRow, type SourceMetricKind } from "@/components/FloatingDetailModal";
import { useTweaks } from "@/components/editorial/TweaksContext";
import {
  Card,
  MultiLine,
  Donut,
  Heatmap,
  num
} from "@/components/app/widgets";
import ParetoChart from "@/components/ParetoChart";
import { calculatePareto } from "@/lib/analytics/pareto";
import {
  byDefect,
  defectTrend,
  periodsIn,
  periodKey,
  periodLabel,
  resolveScope,
  scopeEvents,
  type Scope,
  useApplyInvestigationFromUrl,
  toSourceRows,
  STAGE_LABELS,
} from "@/lib/analytics";

export default function DefectAnalysisPage() {
  const { t } = useTweaks();
  useApplyInvestigationFromUrl();
  const { events: contextEvents, isLoading } = useEvents();
  const { registry, policy } = useRegistry();
  const activeRegistry = registry || EMPTY_REGISTRY;
  const events = contextEvents ? (contextEvents as any[]) : null;

  const [modalOpen, setModalOpen] = useState(false);
  const [modalTitle, setModalTitle] = useState("");
  const [modalInsight, setModalInsight] = useState<string | string[]>([]);
  const [modalContent, setModalContent] = useState<React.ReactNode>(null);
  const [modalSourceRows, setModalSourceRows] = useState<SourceRow[] | undefined>(undefined);
  const [modalPrimaryValue, setModalPrimaryValue] = useState<string | undefined>(undefined);
  const [modalMetricKind, setModalMetricKind] = useState<SourceMetricKind>("pareto");
  const [modalInitialShowSource, setModalInitialShowSource] = useState(false);
  const [modalDefaultSourceTab, setModalDefaultSourceTab] = useState<"batches" | "history">("batches");
  const [rawSheets, setRawSheets] = useState<any[] | undefined>(undefined);
<<<<<<< Updated upstream
=======
  const [targetRej, setTargetRej] = useState(0.10);
  const [defectMetric, setDefectMetric] = useState<"qty" | "rate">("qty");
  const [layoutTemplate, setLayoutTemplate] = useState<"2-wide" | "1-full" | "3-grid" | "4-compact">(() => {
    if (typeof window !== "undefined") {
      try {
        const saved = localStorage.getItem("rais_defect_grid_layout");
        if (saved === "2-wide" || saved === "1-full" || saved === "3-grid" || saved === "4-compact") {
          return saved;
        }
      } catch {}
    }
    return "2-wide"; // Default to 2-wide expanded timeline layout
  });

  useEffect(() => {
    try {
      localStorage.setItem("rais_defect_grid_layout", layoutTemplate);
    } catch {}
  }, [layoutTemplate]);
>>>>>>> Stashed changes

  const openModal = (
    title: string,
    insight: string | string[],
    content: React.ReactNode,
    source?: { rows: SourceRow[]; value: string; metricKind?: SourceMetricKind },
    options?: { initialShowSource?: boolean; defaultSourceTab?: "batches" | "history" }
  ) => {
    setModalTitle(title);
    setModalInsight(insight);
    setModalContent(content);
    setModalSourceRows(source?.rows);
    setModalPrimaryValue(source?.value);
    setModalMetricKind(source?.metricKind ?? "pareto");
    setModalInitialShowSource(options?.initialShowSource ?? false);
    setModalDefaultSourceTab(options?.defaultSourceTab ?? "batches");
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

  // Stage scope comes solely from the topbar View switcher (t.stageView).
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

    const defects = byDefect(events, scope, activeRegistry);
    const trend = defectTrend(events, scope, 5, activeRegistry);

    return {
      defects,
      defectTrend: trend,
      latestPeriodLabel: latestPeriod ? periodLabel(latestPeriod) : ""
    };
  }, [events, scope, t.grain, activeRegistry]);

  const grainLabel = t.grain === "day" ? "Daily" : t.grain === "week" ? "Weekly" : t.grain === "month" ? "Monthly" : "Yearly";

  return (
    <AppShell active="defect" dateRange={m?.latestPeriodLabel}>
      <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
        <div>
          <h1 style={{ fontFamily: "var(--font-display)", fontSize: 28, fontWeight: 800, margin: "0 0 4px", color: "var(--text)" }}>
            Defect Analysis
          </h1>
          <p className="muted" style={{ fontSize: 14, margin: 0 }}>
            Analyze defect distribution using Six Sigma Pareto categorization and historical reason codes.
            Scope a single gate via the View switcher in the top bar.
          </p>
        </div>

        {isLoading && (
          <PageLoader message="Aggregating defect logs..." minHeight="40vh" />
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
          const stageSuffix =
            !t.stageView || t.stageView === "cumulative"
              ? ""
              : ` — ${STAGE_LABELS[t.stageView] ?? t.stageView}`;
          if (m.defects.length === 0) {
            return (
              <div style={{ padding: "40px 24px", textAlign: "center", background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--radius-lg)", color: "var(--text-2)", fontSize: 13 }}>
                No defect records for {!t.stageView || t.stageView === "cumulative" ? "any gate" : (STAGE_LABELS[t.stageView] ?? t.stageView)} in the selected period — widen the date range or change View in the top bar.
              </div>
            );
          }
          const paretoAnalysis = calculatePareto(m.defects.map(d => ({ label: d.label, value: d.rejected })));
          const paretoText = paretoAnalysis ? paretoAnalysis.criticalAreaText : "Pareto analysis of defect categories.";
          const chartData = paretoAnalysis || { items: [], totalDefects: 0, vitalFewCount: 0, vitalFewContribution: 0, criticalAreaText: "No defect data available for this period." };
          
          const hasLeft = m.defects.length > 0;
          const hasRight = m.defects.length > 0 && m.defectTrend.length > 0;
          const gridTemplate = hasLeft && hasRight ? "minmax(0, 1.2fr) minmax(0, 1.8fr)" : "minmax(0, 1fr)";

          // Donut (top-7 + Other) + Heatmap (top-8 defects × period).
          const top = m.defects.slice(0, 7);
          const otherQty = m.defects.slice(7).reduce((s, d) => s + d.rejected, 0);
          const donutData = [...top.map((d) => ({ label: d.label, value: d.rejected })), ...(otherQty > 0 ? [{ label: "Other", value: otherQty }] : [])];
          const heatRows = m.defects.slice(0, 8).map((d) => d.label);
          const heatCols = m.defectTrend.map((p) => p.label);
          const heatMatrix = heatRows.map((rl) => m.defectTrend.map((p) => p.perDefect[rl] ?? 0));

          return (
            <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
            <div style={{ display: "grid", gridTemplateColumns: gridTemplate, gap: 20 }}>
              {hasLeft && (
                <Card title={`Defect Pareto (${grainLabel})${stageSuffix}`} onClick={() => openModal(`Defect Pareto (${grainLabel})${stageSuffix}`, paretoText, <div style={{ minHeight: 240, display: "flex", flexDirection: "column", justifyContent: "center" }}><ParetoChart analysis={chartData} /></div>, { rows: srcRows({ types: ["rejection"] }), value: num(m.defects.reduce((s, d) => s + d.rejected, 0)) })}>
                  <ParetoChart analysis={chartData} showTable={false} />
                </Card>
              )}

              {hasRight && (
                <Card title={`Defect Trend (Top 5) (${grainLabel})${stageSuffix}`} onClick={() => openModal(`Defect Trend (Top 5) (${grainLabel})${stageSuffix}`, `Historical trends for the top 5 defect categories showing performance changes across periods.`, <div style={{ minHeight: 240, display: "flex", flexDirection: "column", justifyContent: "center" }}><MultiLine data={m.defectTrend.map((d) => ({ period: d.period, label: d.label, perStage: d.perDefect }))} stages={m.defects.slice(0, 5).map((d) => ({ stageId: d.label, label: d.label }))} /></div>, { rows: srcRows({ types: ["rejection"] }), value: num(m.defects.reduce((s, d) => s + d.rejected, 0)) })}>
                  <MultiLine 
                    data={m.defectTrend.map((d) => ({ period: d.period, label: d.label, perStage: d.perDefect }))} 
                    stages={m.defects.slice(0, 5).map((d) => ({ stageId: d.label, label: d.label }))} 
                  />
                </Card>
              )}
<<<<<<< Updated upstream
            </div>
            {hasLeft && (
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1.6fr", gap: 20, alignItems: "start" }}>
                <Card title={`Defect Share${stageSuffix}`} onClick={() => openModal(`Defect Share${stageSuffix}`, "Relative percentage contribution of each defect category to total rejections.", <div style={{ minHeight: 240, display: "flex", flexDirection: "column", justifyContent: "center" }}><Donut data={donutData} /></div>, { rows: srcRows({ types: ["rejection"] }), value: num(donutData.reduce((s, d) => s + d.value, 0)) })}>
                  <Donut data={donutData} />
                </Card>
                <Card title={`Defect Hotspots (${grainLabel})${stageSuffix}`} sub="rejected qty by defect × period" onClick={() => openModal(`Defect Hotspots (${grainLabel})${stageSuffix}`, "Distribution of rejected quantities across defect categories and production periods.", <div style={{ minHeight: 320, display: "flex", flexDirection: "column", justifyContent: "center" }}><Heatmap rows={heatRows} cols={heatCols} matrix={heatMatrix} fmt={(n) => Math.round(n).toLocaleString("en-IN")} /></div>, { rows: srcRows({ types: ["rejection"] }), value: num(m.defects.reduce((s, d) => s + d.rejected, 0)) })}>
                  <Heatmap rows={heatRows} cols={heatCols} matrix={heatMatrix} fmt={(n) => Math.round(n).toLocaleString("en-IN")} />
                </Card>
=======

              {/* Middle Tier: Defect-by-Defect Grid */}
              {m.defectTrend.length > 0 && chartDefects.length > 0 && (
                <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
                    <div>
                      <h2 style={{ fontSize: 16, fontWeight: 700, margin: "0 0 2px", color: "var(--text)" }}>
                        Defect Mode Breakdown ({chartDefects.length} Active Defects)
                      </h2>
                      <span className="muted" style={{ fontSize: 12, fontFamily: "var(--font-mono)" }}>
                        {defectMetric === "qty" ? "Historical defect volume trends" : "Relative defect share (% of rejections) trends"}
                      </span>
                    </div>

                    <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                      {/* Size Orientation Layout Option */}
                      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <span style={{ fontSize: 10.5, fontFamily: "var(--font-mono)", color: "var(--text-3)", fontWeight: 700, letterSpacing: "0.04em" }}>
                          LAYOUT:
                        </span>
                        <div
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            background: "var(--surface)",
                            border: "1px solid var(--border)",
                            borderRadius: "var(--radius-sm)",
                            padding: 2,
                            gap: 2,
                          }}
                        >
                          <button
                            type="button"
                            onClick={() => setLayoutTemplate("2-wide")}
                            title="2-Wide — 2 graphs side-by-side with full horizontal timeline vision"
                            style={{
                              padding: "3px 9px",
                              borderRadius: "var(--radius-sm)",
                              border: "none",
                              background: layoutTemplate === "2-wide" ? "var(--surface-2)" : "transparent",
                              color: layoutTemplate === "2-wide" ? "var(--accent)" : "var(--text-3)",
                              fontFamily: "var(--font-mono)",
                              fontSize: 10,
                              fontWeight: 700,
                              letterSpacing: "0.03em",
                              cursor: "pointer",
                              display: "inline-flex",
                              alignItems: "center",
                              gap: 4,
                              transition: "all 0.15s ease",
                            }}
                          >
                            <span>▥</span>
                            <span>2-WIDE</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => setLayoutTemplate("1-full")}
                            title="1-Full — 1 panoramic full-width graph per row with complete timeline vision"
                            style={{
                              padding: "3px 9px",
                              borderRadius: "var(--radius-sm)",
                              border: "none",
                              background: layoutTemplate === "1-full" ? "var(--surface-2)" : "transparent",
                              color: layoutTemplate === "1-full" ? "var(--accent)" : "var(--text-3)",
                              fontFamily: "var(--font-mono)",
                              fontSize: 10,
                              fontWeight: 700,
                              letterSpacing: "0.03em",
                              cursor: "pointer",
                              display: "inline-flex",
                              alignItems: "center",
                              gap: 4,
                              transition: "all 0.15s ease",
                            }}
                          >
                            <span>▤</span>
                            <span>1-FULL</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => setLayoutTemplate("3-grid")}
                            title="3-Grid — 3 graphs per row balanced layout"
                            style={{
                              padding: "3px 9px",
                              borderRadius: "var(--radius-sm)",
                              border: "none",
                              background: layoutTemplate === "3-grid" ? "var(--surface-2)" : "transparent",
                              color: layoutTemplate === "3-grid" ? "var(--accent)" : "var(--text-3)",
                              fontFamily: "var(--font-mono)",
                              fontSize: 10,
                              fontWeight: 700,
                              letterSpacing: "0.03em",
                              cursor: "pointer",
                              display: "inline-flex",
                              alignItems: "center",
                              gap: 4,
                              transition: "all 0.15s ease",
                            }}
                          >
                            <span>▦</span>
                            <span>3-GRID</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => setLayoutTemplate("4-compact")}
                            title="4-Dense — 4 graphs per row compact view (8 per screen)"
                            style={{
                              padding: "3px 9px",
                              borderRadius: "var(--radius-sm)",
                              border: "none",
                              background: layoutTemplate === "4-compact" ? "var(--surface-2)" : "transparent",
                              color: layoutTemplate === "4-compact" ? "var(--accent)" : "var(--text-3)",
                              fontFamily: "var(--font-mono)",
                              fontSize: 10,
                              fontWeight: 700,
                              letterSpacing: "0.03em",
                              cursor: "pointer",
                              display: "inline-flex",
                              alignItems: "center",
                              gap: 4,
                              transition: "all 0.15s ease",
                            }}
                          >
                            <span>⊞</span>
                            <span>4-DENSE</span>
                          </button>
                        </div>
                      </div>

                      {/* Metric Toggle: Volume (Qty) vs Defect Share (%) */}
                      <div
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          background: "var(--surface)",
                          border: "1px solid var(--border)",
                          borderRadius: "var(--radius-sm)",
                          padding: 2,
                          gap: 2,
                        }}
                      >
                        <button
                          type="button"
                          onClick={() => setDefectMetric("qty")}
                          style={{
                            padding: "3px 10px",
                            borderRadius: "var(--radius-sm)",
                            border: "none",
                            background: defectMetric === "qty" ? "var(--surface-2)" : "transparent",
                            color: defectMetric === "qty" ? "var(--accent)" : "var(--text-3)",
                            fontFamily: "var(--font-mono)",
                            fontSize: 10,
                            fontWeight: 700,
                            letterSpacing: "0.03em",
                            cursor: "pointer",
                            transition: "all 0.15s ease",
                          }}
                        >
                          COUNT (QTY)
                        </button>
                        <button
                          type="button"
                          onClick={() => setDefectMetric("rate")}
                          style={{
                            padding: "3px 10px",
                            borderRadius: "var(--radius-sm)",
                            border: "none",
                            background: defectMetric === "rate" ? "var(--surface-2)" : "transparent",
                            color: defectMetric === "rate" ? "var(--accent)" : "var(--text-3)",
                            fontFamily: "var(--font-mono)",
                            fontSize: 10,
                            fontWeight: 700,
                            letterSpacing: "0.03em",
                            cursor: "pointer",
                            transition: "all 0.15s ease",
                          }}
                        >
                          RATE (%)
                        </button>
                      </div>
                    </div>
                  </div>

                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns:
                        layoutTemplate === "1-full"
                          ? "1fr"
                          : layoutTemplate === "2-wide"
                            ? "repeat(auto-fit, minmax(min(100%, 540px), 1fr))"
                            : layoutTemplate === "3-grid"
                              ? "repeat(auto-fit, minmax(min(100%, 380px), 1fr))"
                              : "repeat(auto-fill, minmax(320px, 1fr))",
                      gap: 16,
                    }}
                  >
                    {chartDefects.map((d, di) => {
                      const isRate = defectMetric === "rate";
                      const points = m.defectTrend.map((p) => {
                        const count = p.perDefect[d.label] ?? 0;
                        const totalInPeriod = Object.values(p.perDefect).reduce((a, b) => a + b, 0);
                        if (!isRate) {
                          return {
                            period: p.period,
                            label: p.label,
                            value: count,
                            rejected: count,
                            checked: totalInPeriod,
                            noProduction: totalInPeriod === 0,
                          };
                        }
                        const rate = totalInPeriod > 0 ? count / totalInPeriod : 0;
                        return {
                          period: p.period,
                          label: p.label,
                          value: rate,
                          rejected: count,
                          checked: totalInPeriod,
                          noProduction: totalInPeriod === 0,
                        };
                      });
                      const color = colorByDefect[d.label];
                      const fmtFn = isRate ? pct : num;
                      const insightDesc = isRate
                        ? `${d.label} defect share (% of all rejections) over time. Colour matches the all-defects chart and the pie.`
                        : `${d.label} rejected qty over time. Colour matches the all-defects chart and the pie.`;

                      const chartHeight =
                        layoutTemplate === "1-full"
                          ? 260
                          : layoutTemplate === "2-wide"
                            ? 240
                            : layoutTemplate === "3-grid"
                              ? 220
                              : 200;
                      const isChartCompact = layoutTemplate === "4-compact";

                      return (
                        <Card
                          key={d.defectCode ?? d.label}
                          title={d.label}
                          onClick={() =>
                            openModal(
                              `${d.label} · ${grainLabel}`,
                              insightDesc,
                              <div style={{ minHeight: 220, display: "flex", flexDirection: "column", justifyContent: "center" }}>
                                <LineChart points={points} fmt={fmtFn} color={color} stage={d.label} metric={isRate ? "Defect Share" : "Rejected"} />
                              </div>,
                              { rows: srcRows({ types: ["rejection"], defectCode: d.defectCode ?? undefined }), value: isRate ? `${d.pct.toFixed(1)}%` : num(d.rejected) },
                              { initialShowSource: true, defaultSourceTab: "batches" }
                            )
                          }
                        >
                          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 8 }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                              <span style={{ width: 10, height: 10, borderRadius: 2, background: color, flexShrink: 0 }} />
                              <span style={{ fontSize: 12, color: "var(--text-2)", fontWeight: 500 }}>
                                {num(d.rejected)} rejected · {d.pct.toFixed(1)}% of defects
                              </span>
                            </div>
                            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                              <button
                                type="button"
                                title={`Show batch IDs affected by ${d.label}`}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  openModal(
                                    `${d.label} · ${grainLabel}`,
                                    insightDesc,
                                    <div style={{ minHeight: 220, display: "flex", flexDirection: "column", justifyContent: "center" }}>
                                      <LineChart points={points} fmt={fmtFn} color={color} stage={d.label} metric={isRate ? "Defect Share" : "Rejected"} />
                                    </div>,
                                    { rows: srcRows({ types: ["rejection"], defectCode: d.defectCode ?? undefined }), value: isRate ? `${d.pct.toFixed(1)}%` : num(d.rejected) },
                                    { initialShowSource: true, defaultSourceTab: "batches" }
                                  );
                                }}
                                style={{
                                  padding: "2px 7px",
                                  borderRadius: 4,
                                  border: "1px solid var(--border)",
                                  background: "var(--surface-2)",
                                  color: "var(--text-2)",
                                  fontSize: 10.5,
                                  fontWeight: 600,
                                  cursor: "pointer",
                                  fontFamily: "var(--font-mono)",
                                  display: "inline-flex",
                                  alignItems: "center",
                                  gap: 3,
                                  transition: "all 0.15s ease",
                                }}
                                onMouseEnter={(e) => {
                                  e.currentTarget.style.color = "var(--accent)";
                                  e.currentTarget.style.borderColor = "var(--accent)";
                                }}
                                onMouseLeave={(e) => {
                                  e.currentTarget.style.color = "var(--text-2)";
                                  e.currentTarget.style.borderColor = "var(--border)";
                                }}
                              >
                                🏷️ Batches
                              </button>
                              <button
                                type="button"
                                title={`View Data Entry History ledger for ${d.label}`}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  openModal(
                                    `${d.label} · ${grainLabel}`,
                                    insightDesc,
                                    <div style={{ minHeight: 220, display: "flex", flexDirection: "column", justifyContent: "center" }}>
                                      <LineChart points={points} fmt={fmtFn} color={color} stage={d.label} metric={isRate ? "Defect Share" : "Rejected"} />
                                    </div>,
                                    { rows: srcRows({ types: ["rejection"], defectCode: d.defectCode ?? undefined }), value: isRate ? `${d.pct.toFixed(1)}%` : num(d.rejected) },
                                    { initialShowSource: true, defaultSourceTab: "history" }
                                  );
                                }}
                                style={{
                                  padding: "2px 7px",
                                  borderRadius: 4,
                                  border: "1px solid var(--border)",
                                  background: "var(--surface-2)",
                                  color: "var(--text-2)",
                                  fontSize: 10.5,
                                  fontWeight: 600,
                                  cursor: "pointer",
                                  fontFamily: "var(--font-mono)",
                                  display: "inline-flex",
                                  alignItems: "center",
                                  gap: 3,
                                  transition: "all 0.15s ease",
                                }}
                                onMouseEnter={(e) => {
                                  e.currentTarget.style.color = "var(--accent)";
                                  e.currentTarget.style.borderColor = "var(--accent)";
                                }}
                                onMouseLeave={(e) => {
                                  e.currentTarget.style.color = "var(--text-2)";
                                  e.currentTarget.style.borderColor = "var(--border)";
                                }}
                              >
                                📋 History
                              </button>
                              {layoutTemplate !== "4-compact" && (
                                <span style={{
                                  fontSize: 10.5,
                                  fontFamily: "var(--font-mono)",
                                  color: "var(--text-3)",
                                  background: "var(--surface-2)",
                                  padding: "2px 6px",
                                  borderRadius: 3,
                                }}>
                                  #{di + 1}
                                </span>
                              )}
                            </div>
                          </div>
                          <LineChart
                            points={points}
                            fmt={fmtFn}
                            color={color}
                            stage={d.label}
                            metric={isRate ? "Defect Share" : "Rejected"}
                            height={chartHeight}
                            compact={isChartCompact}
                          />
                        </Card>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Bottom Tier: Longitudinal Hotspots & Defect Mode Composition */}
              <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
                {/* Full-width Spatiotemporal Defect Hotspot Matrix */}
                {heatRows.length > 0 && heatCols.length > 0 && (
                  <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                    <h2 style={{ fontSize: 16, fontWeight: 700, margin: 0, color: "var(--text)" }}>
                      Longitudinal Defect Hotspots
                    </h2>
                    <Card
                      title={`Defect Hotspots (${grainLabel})${stageSuffix}`}
                      sub="Rejected qty by defect mode × production timeline"
                      onClick={() =>
                        openModal(
                          `Defect Hotspots (${grainLabel})${stageSuffix}`,
                          "Distribution of rejected quantities across defect categories and production periods.",
                          <div style={{ minHeight: 320, display: "flex", flexDirection: "column", justifyContent: "center" }}>
                            <Heatmap rows={heatRows} cols={heatCols} matrix={heatMatrix} fmt={(n) => Math.round(n).toLocaleString("en-IN")} />
                          </div>,
                          { rows: srcRows({ types: ["rejection"] }), value: num(totalRejected) }
                        )
                      }
                    >
                      <Heatmap rows={heatRows} cols={heatCols} matrix={heatMatrix} fmt={(n) => Math.round(n).toLocaleString("en-IN")} />
                    </Card>
                  </div>
                )}

                {/* Defect Mode Share & Contribution (2 Balanced Columns) */}
                <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                  <h2 style={{ fontSize: 16, fontWeight: 700, margin: 0, color: "var(--text)" }}>
                    Defect Mode Share &amp; Contribution
                  </h2>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(420px, 1fr))", gap: 20 }}>
                    <Card title={`Defect Share (${grainLabel})${stageSuffix}`} sub="Proportional distribution of all rejected units">
                      <Donut data={donutData} size={170} />
                    </Card>

                    <Card
                      title={`Defect Contribution${stageSuffix}`}
                      sub="Share of rejected units by defect code"
                      onClick={() =>
                        openModal(
                          `Defect Contribution${stageSuffix}`,
                          "Share of rejected units by defect, in plant-catalog order.",
                          <div style={{ minHeight: 240, display: "flex", flexDirection: "column", justifyContent: "center" }}>
                            <BarsH
                              rows={chartDefects.map((d) => ({
                                label: d.label,
                                value: d.pct,
                                sub: `${d.rejected.toLocaleString("en-IN")} rejected`,
                              }))}
                              fmt={(n) => `${n.toFixed(1)}%`}
                            />
                          </div>,
                          { rows: srcRows({ types: ["rejection"] }), value: num(totalRejected) }
                        )
                      }
                    >
                      <BarsH
                        rows={chartDefects.map((d) => ({
                          label: d.label,
                          value: d.pct,
                          sub: `${d.rejected.toLocaleString("en-IN")} rejected`,
                        }))}
                        fmt={(n) => `${n.toFixed(1)}%`}
                      />
                    </Card>
                  </div>
                </div>
>>>>>>> Stashed changes
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
        primaryValue={modalPrimaryValue}
        rawSheets={rawSheets}
        initialShowSource={modalInitialShowSource}
        defaultSourceTab={modalDefaultSourceTab}
      >
        {modalContent}
      </FloatingDetailModal>
    </AppShell>
  );
}
