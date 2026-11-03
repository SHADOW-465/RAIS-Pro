"use client";

import { useEffect, useState, useMemo } from "react";
import AppShell from "@/components/app/AppShell";
import PageLoader from "@/components/app/PageLoader";
import { useEvents } from "@/components/app/EventsContext";
import { usePlantTotals } from "@/lib/client/use-plant-totals";
import { headlineFigures, overlayStageRows, restoreTrend } from "@/lib/analytics/overlay-totals";
import { useRegistry } from "@/components/app/RegistryContext";
import FloatingDetailModal, { type SourceRow, type SourceMetricKind } from "@/components/FloatingDetailModal";
import { useTweaks } from "@/components/editorial/TweaksContext";
import { QualityHeader, SegmentedControl, DrillLinks } from "@/components/app/QualityParts";
import { formatDelta } from "@/components/ui/shared-logic";
import { 
  Card,
  ScopeBasis,
  LineChart,
  MultiLine,
  BarsH,
  Donut,
  pct,
  num,
  seriesColor,
} from "@/components/app/widgets";
import { EMPTY_REGISTRY } from "@/core/ontology/empty-registry";
import { sortStageIds } from "@/core/ontology/plant-catalog";
import {
  rejectionRate,
  byStage,
  trend,
  stageTrend,
  periodsIn,
  periodKey,
  periodLabel,
  resolveScope,
  scopeEvents,
  type Scope,
  getTargetRejectionRate,
  useApplyInvestigationFromUrl,
  toSourceRows,
  STAGE_LABELS,
  lotScopeLabel,
} from "@/lib/analytics";

export default function StageAnalysisPage() {
  const { t } = useTweaks();
  // Mid-path: apply ?grain&from&to&stage from dashboard funnel / attention rail.
  useApplyInvestigationFromUrl();
  const { events: contextEvents, isLoading } = useEvents();
  const serverTotals = usePlantTotals().data;
  const { registry, policy } = useRegistry();
  const activeRegistry = registry || EMPTY_REGISTRY;
  const events = contextEvents ? (contextEvents as any[]) : null;
  const [targetRej, setTargetRej] = useState(0.10);
  const [modalOpen, setModalOpen] = useState(false);
  const [modalTitle, setModalTitle] = useState("");
  const [modalInsight, setModalInsight] = useState<string | string[]>([]);
  const [modalContent, setModalContent] = useState<React.ReactNode>(null);
  const [modalSourceRows, setModalSourceRows] = useState<SourceRow[] | undefined>(undefined);
  const [modalPrimaryValue, setModalPrimaryValue] = useState<string | undefined>(undefined);
  const [modalMetricKind, setModalMetricKind] = useState<SourceMetricKind>("rejection_rate");
  const [modalInitialShowSource, setModalInitialShowSource] = useState(false);
  const [modalDefaultSourceTab, setModalDefaultSourceTab] = useState<"batches" | "history">("batches");
  const [shareView, setShareView] = useState<"share" | "contribution">("share");

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
    setModalMetricKind(source?.metricKind ?? "rejection_rate");
    setModalInitialShowSource(options?.initialShowSource ?? false);
    setModalDefaultSourceTab(options?.defaultSourceTab ?? "batches");
    setModalOpen(true);
  };

  useEffect(() => {
    setTargetRej(getTargetRejectionRate());

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

    const rate = rejectionRate(events, scope, activeRegistry).value;
    const stages = byStage(events, scope, activeRegistry);
    const stageRank = new Map(sortStageIds(stages.map((s) => s.stageId)).map((id, i) => [id, i]));
    const orderedStages = [...stages].sort(
      (a, b) => (stageRank.get(a.stageId) ?? 99) - (stageRank.get(b.stageId) ?? 99),
    );
    const tr = trend(events, scope, "rejectionRate", activeRegistry);
    const st = stageTrend(events, scope, activeRegistry);

    const local = {
      rate,
      stages: orderedStages,
      tr,
      stageTrend: st,
      latestPeriodLabel: latestPeriod ? periodLabel(latestPeriod) : ""
    };
    if (!serverTotals) return local;
    return {
      ...local,
      rate: headlineFigures(serverTotals.headlines).rate,
      stages: overlayStageRows(local.stages, serverTotals.stages),
      tr: restoreTrend(serverTotals.rejectionTrend),
      stageTrend: serverTotals.stageTrend,
    };
  }, [events, scope, t.grain, activeRegistry, serverTotals]);

  return (
    <AppShell active="stage" dateRange={m?.latestPeriodLabel}>
      <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
        <div>
          <p className="muted" style={{ fontSize: 14, margin: 0 }}>
            Inspect quality thresholds, bottleneck gates, and rejection ratios
            {t.stageView !== "cumulative" ? ` · focused on ${STAGE_LABELS[t.stageView] ?? t.stageView}` : " across manufacturing stages"}
            {t.dateFrom && t.dateTo ? ` · ${t.dateFrom} → ${t.dateTo}` : ""}.
          </p>
          <ScopeBasis />
        </div>

        {isLoading && (
          <PageLoader message="Aggregating stage quality events..." minHeight="40vh" />
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
          const grainLabel = t.grain === "day" ? "Daily" : t.grain === "week" ? "Weekly" : t.grain === "month" ? "Monthly" : "Yearly";
          const chartStages = m.stages.filter((s) => s.checked > 0 || s.rejected > 0);
          const colorByStageId: Record<string, string> = {};
          chartStages.forEach((s, i) => {
            colorByStageId[s.stageId] = seriesColor(i);
          });

          const openStage = (s: (typeof chartStages)[number], points: React.ComponentProps<typeof LineChart>["points"], color: string, tab: "batches" | "history") =>
            openModal(
              `${s.label} · ${grainLabel}`,
              `${s.label} rejection over time. Colour matches the all-stages chart and the pie.`,
              <div style={{ minHeight: 220, display: "flex", flexDirection: "column", justifyContent: "center" }}>
                <LineChart points={points} target={targetRej} fmt={pct} color={color} stage={s.label} />
              </div>,
              { rows: srcRows({ types: ["production", "inspection"], stageId: s.stageId }), value: pct(s.rejRate) },
              { initialShowSource: true, defaultSourceTab: tab },
            );
          const stagePoints = (s: (typeof chartStages)[number]) =>
            m.stageTrend.map((p) => ({
              period: p.period, label: p.label, value: p.perStage[s.stageId] ?? 0,
              rejected: p.counts?.[s.stageId]?.rejected, checked: p.counts?.[s.stageId]?.checked,
            }));
          const worst = chartStages.reduce<(typeof chartStages)[number] | null>(
            (w, s) => (s.checked > 0 && (!w || s.rejRate > w.rejRate) ? s : w), null);
          const lastTwo = worst ? m.stageTrend.slice(-2) : [];
          const worstDelta = worst && lastTwo.length === 2
            ? formatDelta((lastTwo[1].perStage[worst.stageId] ?? 0) * 100, (lastTwo[0].perStage[worst.stageId] ?? 0) * 100)
            : null;
          const worstTone = worst ? (worst.rejRate > targetRej ? "critical" : "warning") : "neutral";

          return (
            <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
              <QualityHeader
                tiles={[
                  { label: "Worst stage", word: true, value: worst ? worst.label : "—", status: worstTone,
                    hint: worst ? `${num(worst.rejected)} rejected of ${num(worst.checked)}` : "No inspected stage in scope" },
                  { label: "Its rejection rate", value: worst ? pct(worst.rejRate) : "—", status: worstTone,
                    hint: `target ${pct(targetRej)}` },
                  { label: "Change vs last period", value: worstDelta ? worstDelta.text : "—", status: "neutral",
                    hint: worst ? `${worst.label}, last two ${grainLabel.toLowerCase()} periods` : "Needs two periods" },
                ]}
                actionLabel="See batches"
                onAction={worst ? () => openStage(worst, stagePoints(worst), colorByStageId[worst.stageId], "batches") : undefined}
              />
              {/* Top Tier: Macro Trends (Overall line + Multi-stage line) */}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(480px, 1fr))", gap: 20 }}>
                {m.tr.length > 0 && (
                  <Card
                    title={`Overall Rejection Trend (${grainLabel})`}
                    sub={`Cumulative rejection across all plant stages vs ${(targetRej * 100).toFixed(0)}% target`}
                    onClick={() =>
                      openModal(
                        `Overall Rejection Trend (${grainLabel})`,
                        `Cumulative ${grainLabel.toLowerCase()} rejection across every stage on the line, against the ${(targetRej * 100).toFixed(0)}% target.`,
                        <div style={{ minHeight: 240, display: "flex", flexDirection: "column", justifyContent: "center" }}>
                          <LineChart points={m.tr} target={targetRej} fmt={pct} />
                        </div>,
                        { rows: srcRows({ types: ["production", "inspection"] }), value: pct(m.rate) }
                      )
                    }
                  >
                    <LineChart points={m.tr} target={targetRej} fmt={pct} height={230} />
                  </Card>
                )}

                {m.stageTrend.length > 0 && chartStages.length > 0 && (
                  <Card
                    title={`Multi-Stage Rejection Comparative (${grainLabel})`}
                    sub="Comparative trend overlay across all manufacturing stations"
                    onClick={() =>
                      openModal(
                        `All Stages Rejection Trend (${grainLabel})`,
                        "Each colour is one station in process order. The same colours are used on the pie and on the per-stage charts below.",
                        <div style={{ minHeight: 240, display: "flex", flexDirection: "column", justifyContent: "center" }}>
                          <MultiLine data={m.stageTrend} stages={chartStages} colorByStageId={colorByStageId} />
                        </div>,
                        { rows: srcRows({ types: ["production", "inspection"] }), value: pct(m.rate) }
                      )
                    }
                  >
                    <MultiLine data={m.stageTrend} stages={chartStages} colorByStageId={colorByStageId} height={230} />
                  </Card>
                )}
              </div>

              {/* Middle Tier: Station-by-Station Grid */}
              {m.stageTrend.length > 0 && chartStages.length > 0 && (
                <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
                    <div>
                      <h2 style={{ fontSize: 16, fontWeight: 600, margin: 0, color: "var(--text)" }}>
                        Station Gate Breakdown ({chartStages.length} Active Stations)
                      </h2>
                      <span className="muted" style={{ fontSize: 12, fontFamily: "var(--font-mono)" }}>
                        Independent station defect curves vs control limits
                      </span>
                    </div>

                  </div>

                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 420px), 1fr))",
                      gap: 16,
                    }}
                  >
                    {chartStages.map((s, si) => {
                      const points = stagePoints(s);
                      const color = colorByStageId[s.stageId];

                      return (
                        <Card
                          key={s.stageId}
                          title={s.label}
                          onClick={() =>
                            openModal(
                              `${s.label} · ${grainLabel}`,
                              `${s.label} rejection over time. Colour matches the all-stages chart and the pie.`,
                              <div style={{ minHeight: 220, display: "flex", flexDirection: "column", justifyContent: "center" }}>
                                <LineChart points={points} target={targetRej} fmt={pct} color={color} stage={s.label} />
                              </div>,
                              { rows: srcRows({ types: ["production", "inspection"], stageId: s.stageId }), value: pct(s.rejRate) },
                              { initialShowSource: true, defaultSourceTab: "batches" }
                            )
                          }
                        >
                          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 8 }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                              <span style={{ width: 10, height: 10, borderRadius: 2, background: color, flexShrink: 0 }} />
                              <span style={{ fontSize: 12, color: "var(--text-2)" }}>
                                {pct(s.rejRate)} · {s.rejected.toLocaleString("en-IN")} rejected of {s.checked.toLocaleString("en-IN")}
                              </span>
                            </div>
                            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                              <DrillLinks
                                name={s.label}
                                onBatches={() => openStage(s, points, color, "batches")}
                                onHistory={() => openStage(s, points, color, "history")}
                              />
                              <span style={{ fontSize: 11, fontFamily: "var(--font-mono)", color: "var(--text-3)", background: "var(--surface-2)", padding: "2px 6px", borderRadius: 3 }}>
                                Gate #{si + 1}
                              </span>
                            </div>
                          </div>
                          <LineChart points={points} target={targetRej} fmt={pct} color={color} stage={s.label} height={220} />
                        </Card>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Bottom Tier: Quality Loss Distribution & Process Diagnostics (3 Columns) */}
              {m.stages.length > 0 && (
                <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                  <h2 style={{ fontSize: 16, fontWeight: 600, margin: 0, color: "var(--text)" }}>
                    Quality Loss &amp; Process Pipeline Distribution
                  </h2>

                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 20 }}>
                    <Card
                      title={shareView === "share" ? "Rejection Share by Stage" : "Stage Contribution"}
                      sub={shareView === "share" ? "Relative volume contribution per gate" : lotScopeLabel(t, STAGE_LABELS)}
                      extra={<SegmentedControl label="Chart" value={shareView} onChange={setShareView} options={[{ id: "share", label: "Share" }, { id: "contribution", label: "Contribution" }]} />}
                    >
                      {shareView === "share" ? (
                        <Donut
                          data={chartStages.map((s) => ({
                            label: s.label,
                            value: s.rejected,
                            color: colorByStageId[s.stageId],
                          }))}
                          size={170}
                        />
                      ) : (
                        <BarsH
                          rows={m.stages.map((s) => ({
                            label: s.label,
                            value: s.contributionPct,
                            sub: `${s.rejected.toLocaleString("en-IN")} rejected of ${s.checked.toLocaleString("en-IN")}`,
                          }))}
                          fmt={(n) => `${n.toFixed(1)}%`}
                        />
                      )}
                    </Card>
                  </div>
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
        initialShowSource={modalInitialShowSource}
        defaultSourceTab={modalDefaultSourceTab}
      >
        {modalContent}
      </FloatingDetailModal>
    </AppShell>
  );
}
