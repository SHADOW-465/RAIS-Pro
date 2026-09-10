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
  LineChart,
  BarsH,
  num,
  pct,
  seriesColor,
} from "@/components/app/widgets";
import ParetoChart from "@/components/ParetoChart";
import { calculatePareto } from "@/lib/analytics/pareto";
import {
  byDefect,
  defectTrend,
  orderDefectsByCatalog,
  trend,
  periodsIn,
  periodLabel,
  resolveScope,
  scopeEvents,
  type Scope,
  useApplyInvestigationFromUrl,
  toSourceRows,
  STAGE_LABELS,
  getTargetRejectionRate,
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
  const [rawSheets, setRawSheets] = useState<any[] | undefined>(undefined);
  const [targetRej, setTargetRej] = useState(0.10);

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
    setModalMetricKind(source?.metricKind ?? "pareto");
    setModalOpen(true);
  };

  useEffect(() => {
    setTargetRej(getTargetRejectionRate());
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
    const ordered = orderDefectsByCatalog(defects, activeRegistry);
    const dt = defectTrend(events, scope, Math.max(ordered.length, 1), activeRegistry);
    const overall = trend(events, scope, "rejectionRate", activeRegistry);

    return {
      defects,
      ordered,
      defectTrend: dt,
      overall,
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

          const chartDefects = m.ordered.filter((d) => d.rejected > 0);
          const colorByDefect: Record<string, string> = {};
          chartDefects.forEach((d, i) => {
            colorByDefect[d.label] = seriesColor(i);
          });
          const trendStages = chartDefects.map((d) => ({ stageId: d.label, label: d.label }));
          const trendData = m.defectTrend.map((p) => ({
            period: p.period,
            label: p.label,
            perStage: p.perDefect,
          }));
          const totalRejected = m.defects.reduce((s, d) => s + d.rejected, 0);

          const donutData = chartDefects.map((d) => ({
            label: d.label,
            value: d.rejected,
            color: colorByDefect[d.label],
          }));
          const heatRows = chartDefects.slice(0, 8).map((d) => d.label);
          const heatCols = m.defectTrend.map((p) => p.label);
          const heatMatrix = heatRows.map((rl) => m.defectTrend.map((p) => p.perDefect[rl] ?? 0));

          const hasLeft = m.overall.length > 0 || m.defectTrend.length > 0;
          const hasRight = m.defects.length > 0;
          const gridTemplate = hasLeft && hasRight ? "minmax(0, 1.8fr) minmax(0, 1.2fr)" : "minmax(0, 1fr)";

          return (
            <div style={{ display: "grid", gridTemplateColumns: gridTemplate, gap: 20 }}>
              {hasLeft && (
                <div style={{ display: "flex", flexDirection: "column", gap: 20, minWidth: 0 }}>
                  {m.overall.length > 0 && (
                    <Card
                      title={`Overall Rejection Trend (${grainLabel})${stageSuffix}`}
                      onClick={() =>
                        openModal(
                          `Overall Rejection Trend (${grainLabel})${stageSuffix}`,
                          `Cumulative ${grainLabel.toLowerCase()} rejection across every defect, against the ${(targetRej * 100).toFixed(0)}% target.`,
                          <div style={{ minHeight: 240, display: "flex", flexDirection: "column", justifyContent: "center" }}>
                            <LineChart points={m.overall} target={targetRej} fmt={pct} />
                          </div>,
                          { rows: srcRows({ types: ["production", "inspection"] }), value: pct(m.overall[m.overall.length - 1]?.value ?? 0), metricKind: "rejection_rate" },
                        )
                      }
                    >
                      <LineChart points={m.overall} target={targetRej} fmt={pct} />
                    </Card>
                  )}

                  {m.defectTrend.length > 0 && chartDefects.length > 0 && (
                    <Card
                      title={`All Defects Trend (${grainLabel})${stageSuffix}`}
                      onClick={() =>
                        openModal(
                          `All Defects Trend (${grainLabel})${stageSuffix}`,
                          "Each colour is one defect in plant-catalog order. The same colours are used on the pie and on the per-defect charts below.",
                          <div style={{ minHeight: 240, display: "flex", flexDirection: "column", justifyContent: "center" }}>
                            <MultiLine data={trendData} stages={trendStages} colorByStageId={colorByDefect} />
                          </div>,
                          { rows: srcRows({ types: ["rejection"] }), value: num(totalRejected) },
                        )
                      }
                    >
                      <MultiLine data={trendData} stages={trendStages} colorByStageId={colorByDefect} />
                    </Card>
                  )}

                  {m.defectTrend.length > 0 && chartDefects.length > 0 && (
                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
                        gap: 16,
                      }}
                    >
                      {chartDefects.map((d) => {
                        const points = m.defectTrend.map((p) => ({
                          period: p.period,
                          label: p.label,
                          value: p.perDefect[d.label] ?? 0,
                        }));
                        const color = colorByDefect[d.label];
                        return (
                          <Card
                            key={d.defectCode ?? d.label}
                            title={d.label}
                            onClick={() =>
                              openModal(
                                `${d.label} · ${grainLabel}`,
                                `${d.label} rejected qty over time. Colour matches the all-defects chart and the pie.`,
                                <div style={{ minHeight: 220, display: "flex", flexDirection: "column", justifyContent: "center" }}>
                                  <LineChart points={points} fmt={num} color={color} stage={d.label} />
                                </div>,
                                { rows: srcRows({ types: ["rejection"], defectCode: d.defectCode ?? undefined }), value: num(d.rejected) },
                              )
                            }
                          >
                            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                              <span style={{ width: 10, height: 10, borderRadius: 2, background: color, flexShrink: 0 }} />
                              <span style={{ fontSize: 12, color: "var(--text-2)" }}>
                                {num(d.rejected)} rejected · {d.pct.toFixed(1)}% of defects
                              </span>
                            </div>
                            <LineChart points={points} fmt={num} color={color} stage={d.label} height={220} />
                          </Card>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              {hasRight && (
                <div style={{ display: "flex", flexDirection: "column", gap: 20, minWidth: 0 }}>
                  <Card
                    title={`Defect Pareto (${grainLabel})${stageSuffix}`}
                    onClick={() =>
                      openModal(
                        `Defect Pareto (${grainLabel})${stageSuffix}`,
                        paretoText,
                        <div style={{ minHeight: 240, display: "flex", flexDirection: "column", justifyContent: "center" }}>
                          <ParetoChart analysis={chartData} />
                        </div>,
                        { rows: srcRows({ types: ["rejection"] }), value: num(totalRejected) },
                      )
                    }
                  >
                    <ParetoChart analysis={chartData} showTable={false} />
                  </Card>

                  <Card
                    title={`Defect Contribution${stageSuffix}`}
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
                        { rows: srcRows({ types: ["rejection"] }), value: num(totalRejected) },
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

                  <Card title={`Defect Share${stageSuffix}`}>
                    <Donut data={donutData} />
                  </Card>

                  {heatRows.length > 0 && heatCols.length > 0 && (
                    <Card
                      title={`Defect Hotspots (${grainLabel})${stageSuffix}`}
                      sub="rejected qty by defect × period"
                      onClick={() =>
                        openModal(
                          `Defect Hotspots (${grainLabel})${stageSuffix}`,
                          "Distribution of rejected quantities across defect categories and production periods.",
                          <div style={{ minHeight: 320, display: "flex", flexDirection: "column", justifyContent: "center" }}>
                            <Heatmap rows={heatRows} cols={heatCols} matrix={heatMatrix} fmt={(n) => Math.round(n).toLocaleString("en-IN")} />
                          </div>,
                          { rows: srcRows({ types: ["rejection"] }), value: num(totalRejected) },
                        )
                      }
                    >
                      <Heatmap rows={heatRows} cols={heatCols} matrix={heatMatrix} fmt={(n) => Math.round(n).toLocaleString("en-IN")} />
                    </Card>
                  )}
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
      >
        {modalContent}
      </FloatingDetailModal>
    </AppShell>
  );
}
