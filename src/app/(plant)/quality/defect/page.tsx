"use client";

import { useEffect, useState, useMemo } from "react";
import AppShell from "@/components/app/AppShell";
import PageLoader from "@/components/app/PageLoader";
import { useEvents } from "@/components/app/EventsContext";
import { useRegistry } from "@/components/app/RegistryContext";
import { EMPTY_REGISTRY } from "@/core/ontology/empty-registry";
import FloatingDetailModal, { type SourceRow, type SourceMetricKind } from "@/components/FloatingDetailModal";
import { useTweaks } from "@/components/editorial/TweaksContext";
import { QualityHeader, SegmentedControl, DrillLinks } from "@/components/app/QualityParts";
import { formatDelta } from "@/components/ui/shared-logic";
import {
  Card,
  ScopeBasis,
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
import DefectRemedyShowcase from "@/components/DefectRemedyShowcase";
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
  const [modalInitialShowSource, setModalInitialShowSource] = useState(false);
  const [modalDefaultSourceTab, setModalDefaultSourceTab] = useState<"batches" | "history">("batches");
  const [modalRankedDefects, setModalRankedDefects] = useState<{ code: string; label: string }[]>([]);
  const [rawSheets, setRawSheets] = useState<any[] | undefined>(undefined);
  const [targetRej, setTargetRej] = useState(0.10);
  const [defectMetric, setDefectMetric] = useState<"qty" | "rate">("qty");

  const openModal = (
    title: string,
    insight: string | string[],
    content: React.ReactNode,
    source?: {
      rows: SourceRow[];
      value: string;
      metricKind?: SourceMetricKind;
      rankedDefects?: { code: string; label: string }[];
    },
    options?: { initialShowSource?: boolean; defaultSourceTab?: "batches" | "history" }
  ) => {
    setModalTitle(title);
    setModalInsight(insight);
    setModalContent(content);
    setModalSourceRows(source?.rows);
    setModalPrimaryValue(source?.value);
    setModalMetricKind(source?.metricKind ?? "pareto");
    setModalRankedDefects(source?.rankedDefects ?? []);
    setModalInitialShowSource(options?.initialShowSource ?? false);
    setModalDefaultSourceTab(options?.defaultSourceTab ?? "batches");
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
          <p className="muted" style={{ fontSize: 14, margin: 0 }}>
            Analyze defect distribution using Six Sigma Pareto categorization and historical reason codes.
            Scope a single gate via the View switcher in the top bar.
          </p>
          <ScopeBasis />
        </div>

        {isLoading && (
          <PageLoader message="Aggregating defect logs..." minHeight="40vh" />
        )}

        {!isLoading && (!events || events.length === 0) && (
          <div style={{ padding: "48px 24px", textAlign: "center", background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--radius-lg)" }}>
            <div style={{ fontFamily: "var(--font-display)", fontSize: 18, fontWeight: 600, marginBottom: 8, color: "var(--text)" }}>
              No Data Available
            </div>
            <p className="muted" style={{ fontSize: 13, margin: "0 0 16px" }}>
              Please upload monthly inspection workbooks in Staging &amp; Review to populate these metrics.
            </p>
            <a
              href="/excel/import"
              style={{
                display: "inline-block", textDecoration: "none", fontFamily: "var(--font-sans)", fontWeight: 600, fontSize: 12.5,
                color: "var(--on-accent)", background: "var(--accent)", border: "none",
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
          const rankedDefects = m.defects.slice(0, 3).map((d) => ({
            code: d.defectCode || d.label,
            label: d.label,
          }));

          const donutData = chartDefects.map((d) => ({
            label: d.label,
            value: d.rejected,
            color: colorByDefect[d.label],
          }));
          const heatRows = chartDefects.slice(0, 10).map((d) => d.label);
          const heatCols = m.defectTrend.map((p) => p.label);
          const heatMatrix = heatRows.map((rl) => m.defectTrend.map((p) => p.perDefect[rl] ?? 0));

          const openDefect = (
            d: (typeof chartDefects)[number],
            points: React.ComponentProps<typeof LineChart>["points"],
            color: string,
            insightDesc: string,
            isRate: boolean,
            fmtFn: (n: number) => string,
            tab: "batches" | "history",
          ) =>
            openModal(
              `${d.label} · ${grainLabel}`,
              insightDesc,
              <div style={{ minHeight: 220, display: "flex", flexDirection: "column", justifyContent: "center" }}>
                <LineChart points={points} fmt={fmtFn} color={color} stage={d.label} metric={isRate ? "Defect Share" : "Rejected"} />
              </div>,
              { rows: srcRows({ types: ["rejection"], defectCode: d.defectCode ?? undefined }), value: isRate ? `${d.pct.toFixed(1)}%` : num(d.rejected), rankedDefects: [{ code: d.defectCode || d.label, label: d.label }] },
              { initialShowSource: true, defaultSourceTab: tab },
            );
          const top = chartDefects.reduce<(typeof chartDefects)[number] | null>((w, d) => (!w || d.rejected > w.rejected ? d : w), null);
          const lastTwo = top ? m.defectTrend.slice(-2) : [];
          const topDelta = top && lastTwo.length === 2
            ? formatDelta(lastTwo[1].perDefect[top.label] ?? 0, lastTwo[0].perDefect[top.label] ?? 0, { unit: "%" })
            : null;
          const topPoints = top
            ? m.defectTrend.map((p) => {
                const count = p.perDefect[top.label] ?? 0;
                const tot = Object.values(p.perDefect).reduce((a, b) => a + b, 0);
                return { period: p.period, label: p.label, value: count, rejected: count, checked: tot, noProduction: tot === 0 };
              })
            : [];

          return (
            <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
              <QualityHeader
                tiles={[
                  { label: "Top defect", word: true, value: top ? top.label : "—", status: top ? "warning" : "neutral",
                    hint: top ? `${num(top.rejected)} rejected` : "No defects in scope" },
                  { label: "Share of rejections", value: top ? `${top.pct.toFixed(1)}%` : "—", status: "neutral",
                    hint: `${num(totalRejected)} rejected in total` },
                  { label: "Change vs last period", value: topDelta ? topDelta.text : "—", status: "neutral",
                    hint: top ? `${top.label}, last two ${grainLabel.toLowerCase()} periods` : "Needs two periods" },
                ]}
                actionLabel="See batches"
                onAction={top ? () => openDefect(top, topPoints, colorByDefect[top.label], `${top.label} rejected qty over time. Colour matches the all-defects chart and the pie.`, false, num, "batches") : undefined}
              />
              {/* Top Tier: Macro Trends & Pareto Quality Loss (Stacked Vertically: 1st Trend, 2nd Pareto) */}
              <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
                {m.overall.length > 0 && (
                  <Card
                    title={`Overall Defect Trend (${grainLabel})${stageSuffix}`}
                    sub={`Cumulative defect trajectory across all codes vs ${(targetRej * 100).toFixed(0)}% target`}
                    onClick={() =>
                      openModal(
                        `Overall Rejection Trend (${grainLabel})${stageSuffix}`,
                        `Cumulative ${grainLabel.toLowerCase()} rejection across every defect, against the ${(targetRej * 100).toFixed(0)}% target.`,
                        <div style={{ minHeight: 240, display: "flex", flexDirection: "column", justifyContent: "center" }}>
                          <LineChart points={m.overall} target={targetRej} fmt={pct} />
                        </div>,
                        { rows: srcRows({ types: ["production", "inspection"] }), value: pct(m.overall[m.overall.length - 1]?.value ?? 0), metricKind: "rejection_rate" }
                      )
                    }
                  >
                    <LineChart points={m.overall} target={targetRej} fmt={pct} height={240} />
                  </Card>
                )}

                <Card
                  title={`Defect Pareto Analysis (${grainLabel})${stageSuffix}`}
                  sub="80/20 Rule: Prioritizing vital few quality failure modes"
                  onClick={() =>
                    openModal(
                      `Defect Pareto (${grainLabel})${stageSuffix}`,
                      paretoText,
                      <div style={{ minHeight: 240, display: "flex", flexDirection: "column", justifyContent: "center" }}>
                        <ParetoChart analysis={chartData} />
                      </div>,
                      { rows: srcRows({ types: ["rejection"] }), value: num(totalRejected), rankedDefects }
                    )
                  }
                >
                  <ParetoChart analysis={chartData} showTable={false} />
                  <DefectRemedyShowcase ranked={rankedDefects} compact />
                </Card>
              </div>

              {/* Multi-Defect Comparative Line Chart */}
              {m.defectTrend.length > 0 && chartDefects.length > 0 && (
                <Card
                  title={`Multi-Defect Comparative Trend (${grainLabel})${stageSuffix}`}
                  sub="Comparative volume trajectory across all defect codes"
                  onClick={() =>
                    openModal(
                      `All Defects Trend (${grainLabel})${stageSuffix}`,
                      "Each colour is one defect in plant-catalog order. The same colours are used on the pie and on the per-defect charts below.",
                      <div style={{ minHeight: 240, display: "flex", flexDirection: "column", justifyContent: "center" }}>
                        <MultiLine data={trendData} stages={trendStages} colorByStageId={colorByDefect} />
                      </div>,
                      { rows: srcRows({ types: ["rejection"] }), value: num(totalRejected) }
                    )
                  }
                >
                  <MultiLine data={trendData} stages={trendStages} colorByStageId={colorByDefect} height={240} />
                </Card>
              )}

              {/* Middle Tier: Defect-by-Defect Grid */}
              {m.defectTrend.length > 0 && chartDefects.length > 0 && (
                <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
                    <div>
                      <h2 style={{ fontSize: 16, fontWeight: 600, margin: "0 0 2px", color: "var(--text)" }}>
                        Defect Mode Breakdown ({chartDefects.length} Active Defects)
                      </h2>
                      <span className="muted" style={{ fontSize: 12, fontFamily: "var(--font-mono)" }}>
                        {defectMetric === "qty" ? "Historical defect volume trends" : "Relative defect share (% of rejections) trends"}
                      </span>
                    </div>

                    <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                      <SegmentedControl
                        label="Defect metric"
                        value={defectMetric}
                        onChange={setDefectMetric}
                        options={[{ id: "qty", label: "Count" }, { id: "rate", label: "Share %" }]}
                      />
                    </div>
                  </div>

                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 420px), 1fr))",
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
                              { rows: srcRows({ types: ["rejection"], defectCode: d.defectCode ?? undefined }), value: isRate ? `${d.pct.toFixed(1)}%` : num(d.rejected), rankedDefects: [{ code: d.defectCode || d.label, label: d.label }] },
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
                              <DrillLinks
                                name={d.label}
                                onBatches={() => openDefect(d, points, color, insightDesc, isRate, fmtFn, "batches")}
                                onHistory={() => openDefect(d, points, color, insightDesc, isRate, fmtFn, "history")}
                              />
                              <span style={{ fontSize: 11, fontFamily: "var(--font-mono)", color: "var(--text-3)", background: "var(--surface-2)", padding: "2px 6px", borderRadius: 3 }}>
                                #{di + 1}
                              </span>
                            </div>
                          </div>
                          <LineChart
                            points={points}
                            fmt={fmtFn}
                            color={color}
                            stage={d.label}
                            metric={isRate ? "Defect Share" : "Rejected"}
                            height={220}
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
                    <h2 style={{ fontSize: 16, fontWeight: 600, margin: 0, color: "var(--text)" }}>
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
                  <h2 style={{ fontSize: 16, fontWeight: 600, margin: 0, color: "var(--text)" }}>
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
        sourceRows={modalSourceRows}
        metricKind={modalMetricKind}
        primaryValue={modalPrimaryValue}
        rawSheets={rawSheets}
        initialShowSource={modalInitialShowSource}
        defaultSourceTab={modalDefaultSourceTab}
        rankedDefects={modalRankedDefects}
      >
        {modalContent}
      </FloatingDetailModal>
    </AppShell>
  );
}
